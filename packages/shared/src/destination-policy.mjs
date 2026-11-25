import dns from 'node:dns/promises';
import net from 'node:net';

function classifyAddress(raw) {
  // URL canonicalizes IPv6 (including mapped IPv4) before classification.
  let address = String(raw).toLowerCase();
  const family = net.isIP(address);
  if (!family) throw Object.assign(new Error('Invalid upstream DNS result'), { statusCode: 400 });
  if (family === 6) {
    address = new URL(`http://[${address}]`).hostname.slice(1, -1);
    const mapped = /^::ffff:([\da-f]+):([\da-f]+)$/.exec(address);
    if (mapped) {
      const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
      address = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
    }
  }
  if (net.isIP(address) === 4) {
    const [first, second] = address.split('.').map(Number);
    return {
      private: first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168) || (first === 100 && second >= 64 && second <= 127),
      blocked: first === 0 || first >= 224 || (first === 169 && second === 254),
    };
  }
  const first = parseInt(address.split(':')[0] || '0', 16);
  return {
    private: address === '::1' || (first & 0xfe00) === 0xfc00,
    blocked: address === '::' || address === 'fd00:ec2::254' || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00,
  };
}

export async function validateUpstreamDestination(raw, { trustedPrivateNetwork = false, approvedAddresses = [], lookup = dns.lookup } = {}) {
  const value = new URL(raw);
  if (!['http:', 'https:'].includes(value.protocol) || value.username || value.password || value.hash) throw Object.assign(new Error('Invalid upstream URL'), { statusCode: 400 });
  const host = value.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const records = await lookup(host, { all: true });
  const addresses = [...new Set(records.map(record => String(record.address).toLowerCase()))].sort();
  if (!addresses.length) throw Object.assign(new Error('Upstream host did not resolve'), { statusCode: 400 });
  const classes = addresses.map(classifyAddress);
  if (classes.some(item => item.blocked)) throw Object.assign(new Error('Upstream destination is not trusted'), { statusCode: 400 });
  const hasPrivate = classes.some(item => item.private);
  if (hasPrivate && classes.some(item => !item.private)) throw Object.assign(new Error('Mixed public and private upstream addresses are not trusted'), { statusCode: 400 });
  if (hasPrivate && !trustedPrivateNetwork) throw Object.assign(new Error('Private upstream requires explicit trust'), { statusCode: 400 });

  const approved = [...new Set(approvedAddresses.map(address => String(address).toLowerCase()))].sort();
  if (approved.length) {
    const priorClasses = approved.map(classifyAddress);
    // Public DNS is allowed to rotate. Private destinations retain explicit IP approval,
    // including when a domain switches between public and private address space.
    if (hasPrivate || priorClasses.some(item => item.private || item.blocked)) {
      if (addresses.length !== approved.length || addresses.some((address, index) => address !== approved[index])) {
        throw Object.assign(new Error('Upstream private DNS approval changed'), { code: 'destination_changed', statusCode: 502 });
      }
    }
  }
  return { value, addresses };
}
