const textTypes = new Set(['text', 'input_text', 'output_text']);
const imageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function base64Source(mediaType, data, fail) {
  if (!imageTypes.has(mediaType) || typeof data !== 'string' || !data
    || data.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)
    || Buffer.from(data, 'base64').toString('base64') !== data) throw fail();
  return { type: 'base64', mediaType, data };
}

function imageSource(value, fail) {
  if (typeof value !== 'string' || !value || /\s/.test(value)) throw fail();
  if (value.startsWith('data:')) {
    const match = /^data:(image\/[a-z+.-]+);base64,(.*)$/.exec(value);
    if (!match) throw fail();
    return base64Source(match[1], match[2], fail);
  }
  let url;
  try { url = new URL(value); } catch { throw fail(); }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) throw fail();
  return { type: 'url', url: value };
}

function imageBlock(protocol, part, fail) {
  if (part.file_id !== undefined) throw fail();
  let source;
  let detail;
  if (protocol === 'Res' && part.type === 'input_image') {
    source = imageSource(part.image_url, fail);
    detail = part.detail;
  } else if (protocol === 'Chat' && part.type === 'image_url') {
    if (!part.image_url || typeof part.image_url !== 'object' || Array.isArray(part.image_url) || part.image_url.file_id !== undefined) throw fail();
    source = imageSource(part.image_url.url, fail);
    detail = part.image_url.detail;
  } else if (protocol === 'Mes' && part.type === 'image') {
    if (!part.source || typeof part.source !== 'object' || Array.isArray(part.source) || part.source.file_id !== undefined) throw fail();
    if (part.source.type === 'url') source = imageSource(part.source.url, fail);
    else if (part.source.type === 'base64') source = base64Source(part.source.media_type, part.source.data, fail);
    else throw fail();
  } else throw fail();
  if (detail !== undefined && !['auto', 'low', 'high'].includes(detail)) throw fail();
  return { type: 'image', source, ...(detail === undefined ? {} : { detail }) };
}

// Keep the old string contract for text-only content. Media uses ordered blocks.
export function normalizeContent(protocol, value, fail, { allowImages = true } = {}) {
  if (typeof value === 'string') return value;
  if (value === undefined || value === null) return '';
  if (!Array.isArray(value)) throw fail();
  const blocks = value.map(part => {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw fail();
    if (textTypes.has(part.type)) {
      if (typeof part.text !== 'string') throw fail();
      return { type: 'text', text: part.text };
    }
    if (!allowImages) throw fail();
    return imageBlock(protocol, part, fail);
  });
  return blocks.some(part => part.type === 'image') ? blocks : blocks.map(part => part.text).join('');
}

export function serializeContent(protocol, value, role = 'user') {
  if (!Array.isArray(value)) return value;
  return value.map(part => {
    if (part.type === 'text') return { type: protocol === 'Res' ? role === 'assistant' ? 'output_text' : 'input_text' : 'text', text: part.text };
    const source = part.source;
    const url = source.type === 'url' ? source.url : 'data:' + source.mediaType + ';base64,' + source.data;
    if (protocol === 'Res') return { type: 'input_image', image_url: url, ...(part.detail === undefined ? {} : { detail: part.detail }) };
    if (protocol === 'Chat') return { type: 'image_url', image_url: { url, ...(part.detail === undefined ? {} : { detail: part.detail }) } };
    return { type: 'image', source: source.type === 'url' ? { type: 'url', url: source.url } : { type: 'base64', media_type: source.mediaType, data: source.data } };
  });
}
