import { PRICES } from './metering.js';
export function fixture(id = 'demo-request-001') {
  return { context: { project: 'fictional-studio', workflow: 'demo-classification', requestId: id }, model: 'mock-sprout',
    usage: { input: 1000, output: 200, cacheRead: 400, cacheWrite: 0 }, rates: { ...PRICES['mock-sprout'] } };
}
export const SCENARIOS = Object.freeze(['standard', 'cached', 'missing', 'unknown', 'replay', 'conflict']);
export function runScenario(ledger, name) {
  if (!SCENARIOS.includes(name)) throw new Error('UNKNOWN_SCENARIO');
  const p = fixture();
  switch (name) {
    case 'cached': p.context.requestId = 'demo-request-002'; p.usage = { input: 200, output: 200, cacheRead: 1200, cacheWrite: 0 }; break;
    case 'missing': delete p.context.workflow; break;
    case 'unknown': p.model = 'unlisted-fictional-model'; break;
    case 'replay': ledger.record(p); break;
    case 'conflict': ledger.record(p); p.usage.output = 201; break;
  }
  return ledger.record(p);
}
