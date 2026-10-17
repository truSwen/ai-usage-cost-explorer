import { createLedger, Refused } from './metering.js';
import { runScenario, SCENARIOS } from './scenarios.js';
const ledger = createLedger({ now: () => '2026-01-01T00:00:00.000Z' });
const results = SCENARIOS.map(scenario => {
  try { return { scenario, status: 'accepted', ...runScenario(ledger, scenario) }; }
  catch (error) { if (!(error instanceof Refused)) throw error; return { scenario, status: 'refused', code: error.code }; }
});
console.log(JSON.stringify({ synthetic: true, results, ledger: ledger.snapshot() }, null, 2));
