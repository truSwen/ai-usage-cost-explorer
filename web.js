import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createLedger, PRICES, Refused } from './metering.js';
import { runScenario, fixture, SCENARIOS } from './scenarios.js';
const assets = new Map([['/', ['index.html', 'text/html; charset=utf-8']], ['/app.js', ['app.js', 'text/javascript; charset=utf-8']], ['/style.css', ['style.css', 'text/css; charset=utf-8']]]);
export function createWebServer() {
  const ledger = createLedger();
  return http.createServer(async (req, res) => {
    const send = (code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" }); res.end(body); };
    const json = (code, obj) => send(code, 'application/json', JSON.stringify(obj));
    const host = `127.0.0.1:${req.socket.localPort}`;
    if (req.headers.host !== host || (req.headers.origin && req.headers.origin !== `http://${host}`) ||
        (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site']))) return json(403, { error: 'LOCAL_REQUESTS_ONLY' });
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET') {
      if (assets.has(path)) { const [file, type] = assets.get(path); return send(200, type, readFileSync(new URL(file, import.meta.url))); }
      if (path === '/api/config') return json(200, { synthetic: true, prices: PRICES, fixture: fixture(), scenarios: SCENARIOS });
      if (path === '/api/ledger') return json(200, ledger.snapshot());
      return json(404, { error: 'NOT_FOUND' });
    }
    if (req.method !== 'POST') return json(405, { error: 'METHOD_NOT_ALLOWED' });
    if (!['/api/record', '/api/scenario', '/api/reset'].includes(path)) return json(404, { error: 'NOT_FOUND' });
    if (req.headers['content-type'] !== 'application/json') return json(415, { error: 'JSON_REQUIRED' });
    let size = 0, chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) { json(413, { error: 'REQUEST_TOO_LARGE' }); req.resume(); return; }
        chunks.push(chunk);
      }
      let payload;
      try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return json(400, { error: 'INVALID_JSON' }); }
      if (path === '/api/reset') {
        if (!payload || Array.isArray(payload) || Object.keys(payload).length) return json(400, { error: 'INVALID_REQUEST' });
        ledger.reset(); return json(200, { reset: true, ledger: ledger.snapshot() });
      }
      if (path === '/api/scenario' && (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
          Object.keys(payload).length !== 1 || !SCENARIOS.includes(payload.scenario))) return json(400, { error: 'UNKNOWN_SCENARIO' });
      const result = path === '/api/scenario' ? runScenario(ledger, payload.scenario) : ledger.record(payload);
      return json(200, { ...result, ledger: ledger.snapshot() });
    } catch (error) {
      return json(error instanceof Refused ? 422 : 500, { error: error instanceof Refused ? error.code : 'INTERNAL_ERROR', ledger: ledger.snapshot() });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.DEMO_PORT || 8767);
  createWebServer().listen(port, '127.0.0.1', () => console.log(`Open http://127.0.0.1:${port}`));
}
