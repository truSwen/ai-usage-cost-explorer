import { createHash } from 'node:crypto';

export const NOTICE = 'Synthetic usage and fictional prices only. Estimates are not vendor bills or real spending.';
export const BUCKETS = Object.freeze(['input', 'output', 'cacheRead', 'cacheWrite']);
export const PRICES = Object.freeze({
  'mock-sprout': Object.freeze({ input: '1.2', output: '6.4', cacheRead: '0.15', cacheWrite: '1.5' }),
  'mock-canyon': Object.freeze({ input: '3', output: '12', cacheRead: '0.3', cacheWrite: '3.75' })
});
export class Refused extends Error {
  constructor(code) { super(code); this.name = 'Refused'; this.code = code; }
}
function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) throw new Refused(code);
}
function label(value) {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value)) throw new Refused('INVALID_CONTEXT');
  return value;
}
function rate(value) {
  // USD per million tokens; at most six decimals. Never use binary floats for money.
  if (typeof value !== 'string' || !/^(0|[1-9]\d{0,3})(\.\d{1,6})?$/.test(value)) throw new Refused('INVALID_RATE');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (units > 1_000_000_000n) throw new Refused('INVALID_RATE'); // max fictional rate: 1000 USD / 1M
  return units;
}
export function usd(pico) {
  return `${pico / 1_000_000_000_000n}.${(pico % 1_000_000_000_000n).toString().padStart(12, '0')}`;
}
export function estimate(payload) {
  exactObject(payload, ['context', 'model', 'usage', 'rates'], 'INVALID_REQUEST');
  exactObject(payload.context, ['project', 'workflow', 'requestId'], 'INVALID_CONTEXT');
  const context = Object.fromEntries(['project', 'workflow', 'requestId'].map(k => [k, label(payload.context[k])]));
  if (typeof payload.model !== 'string' || !Object.hasOwn(PRICES, payload.model)) throw new Refused('UNKNOWN_MODEL');
  exactObject(payload.usage, BUCKETS, 'INVALID_USAGE');
  exactObject(payload.rates, BUCKETS, 'INVALID_RATE');
  const usage = {}, rates = {}, breakdown = {};
  let total = 0n;
  for (const bucket of BUCKETS) {
    const count = payload.usage[bucket];
    if (!Number.isSafeInteger(count) || count < 0 || count > 1_000_000_000) throw new Refused('INVALID_USAGE');
    const units = rate(payload.rates[bucket]);
    usage[bucket] = count;
    rates[bucket] = `${units / 1_000_000n}.${(units % 1_000_000n).toString().padStart(6, '0')}`;
    const pico = BigInt(count) * units; // count × rate / 10^12 USD
    breakdown[bucket] = usd(pico); total += pico;
  }
  return { context, model: payload.model, usage, rates, breakdown,
    costUsd: usd(total), costPicoUsd: total.toString() };
}
export function createLedger({ maxRecords = 1000, now = () => new Date().toISOString() } = {}) {
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 1000) throw new Refused('INVALID_CAPACITY');
  const records = new Map();
  return {
    record(payload) {
      const calculated = estimate(payload); // validate everything before mutating the ledger
      const canonical = JSON.stringify({ context: calculated.context, model: calculated.model, usage: calculated.usage, rates: calculated.rates });
      const fingerprint = createHash('sha256').update(canonical).digest('hex');
      const key = calculated.context.requestId; // globally unique within this one-process demo ledger
      const prior = records.get(key);
      if (prior) {
        if (prior.fingerprint !== fingerprint) throw new Refused('REQUEST_ID_CONFLICT');
        return { replayed: true, record: structuredClone(prior) };
      }
      if (records.size >= maxRecords) throw new Refused('LEDGER_FULL');
      const record = { schemaVersion: 1, synthetic: true, notice: NOTICE, ...calculated, fingerprint, recordedAt: now() };
      records.set(key, structuredClone(record));
      return { replayed: false, record: structuredClone(record) };
    },
    snapshot() {
      const rows = [...records.values()];
      return { synthetic: true, notice: NOTICE, recordCount: rows.length,
        totalCostUsd: usd(rows.reduce((total, row) => total + BigInt(row.costPicoUsd), 0n)), records: structuredClone(rows) };
    },
    reset() { records.clear(); }
  };
}
