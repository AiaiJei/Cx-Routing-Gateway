const endpoints = [
  [`control`, process.env.CXRG_CONTROL_URL || 'http://127.0.0.1:4319/health'],
  [`gateway`, process.env.CXRG_GATEWAY_URL || 'http://127.0.0.1:4318/health'],
];

let failed = false;
for (const [name, endpoint] of endpoints) {
  try {
    const response = await fetch(endpoint);
    const body = await response.json();
    const ok = response.ok && body.status === 'ok';
    console.log(JSON.stringify({ name, endpoint, ok, service: body.service }));
    if (!ok) failed = true;
  } catch (error) {
    console.error(JSON.stringify({ name, endpoint, ok: false, error: error.message }));
    failed = true;
  }
}
if (failed) process.exitCode = 1;
