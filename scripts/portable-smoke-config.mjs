import net from 'node:net';

function reserveServer() {
  const server = net.createServer();
  const ready = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve(server.address().port);
    });
  });
  return { server, ready };
}

function closeServer(server) {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

export async function reservePortableSmokePorts() {
  const control = reserveServer();
  const gateway = reserveServer();
  try {
    const [controlPort, gatewayPort] = await Promise.all([control.ready, gateway.ready]);
    if (controlPort === gatewayPort || controlPort === 4319 || gatewayPort === 4318) throw new Error('Portable smoke ports are not isolated');
    return {
      controlPort,
      gatewayPort,
      controlUrl: `http://127.0.0.1:${controlPort}/health`,
      gatewayUrl: `http://127.0.0.1:${gatewayPort}/health`,
      environment: { CXRG_CONTROL_PORT: String(controlPort), CXRG_GATEWAY_PORT: String(gatewayPort) },
      release: async () => { await Promise.all([closeServer(control.server), closeServer(gateway.server)]); },
    };
  } catch (error) {
    await Promise.all([closeServer(control.server), closeServer(gateway.server)]).catch(() => {});
    throw error;
  }
}
