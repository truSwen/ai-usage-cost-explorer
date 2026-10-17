const $ = id => document.getElementById(id);
const buckets = ['input', 'output', 'cacheRead', 'cacheWrite'];
let config;
function renderLedger(ledger) {
  $('total').textContent = ledger.totalCostUsd;
  $('count').textContent = String(ledger.recordCount);
  const rows = $('rows'); rows.replaceChildren();
  for (const record of ledger.records) {
    const tr = document.createElement('tr');
    for (const text of [record.context.requestId, record.model, record.costUsd, 'Synthetic']) {
      const td = document.createElement('td'); td.textContent = text; tr.append(td);
    }
    rows.append(tr);
  }
  if (!ledger.recordCount) {
    const tr = document.createElement('tr'), td = document.createElement('td');
    td.colSpan = 4; td.textContent = 'No simulation recorded yet.'; tr.append(td); rows.append(tr);
  }
}
async function submit(path, payload) {
  const buttons = [...document.querySelectorAll('button')]; buttons.forEach(b => b.disabled = true);
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (data.ledger) renderLedger(data.ledger);
    $('json').textContent = JSON.stringify(data, null, 2);
    if (!response.ok) {
      $('status').textContent = `Refused: ${data.error}`;
      $('explanation').textContent = 'This submission added no record. Existing simulation records remain unchanged.';
      $('calculation').textContent = 'No estimate recorded for the refused submission.';
    } else if (data.reset) {
      $('status').textContent = 'Demo ledger reset'; $('explanation').textContent = 'The local synthetic records were cleared.';
      $('calculation').textContent = 'Ready for another simulation.';
    } else {
      $('status').textContent = data.replayed ? 'Replay: no duplicate record' : 'Simulation recorded';
      $('explanation').textContent = data.replayed ? 'Identical content and request ID. The original record is returned without increasing the total.' : 'Validated usage and fictional rate snapshot saved in the local memory ledger.';
      const r = data.record;
      $('calculation').textContent = buckets.map(k => `${k}: ${r.usage[k]} × ${r.rates[k]} / 1,000,000 = $${r.breakdown[k]}`).join('\n') + `\nEstimated total: $${r.costUsd}`;
    }
  } catch {
    $('status').textContent = 'Connection failed'; $('explanation').textContent = 'Check that the local demo server is running. Ledger totals may be stale; refresh before retrying.';
    $('calculation').textContent = 'No confirmed result.'; $('json').textContent = 'No response available.';
  } finally { buttons.forEach(b => b.disabled = false); }
}
$('run').addEventListener('click', () => submit('/api/scenario', { scenario: $('scenario').value }));
$('reset').addEventListener('click', () => submit('/api/reset', {}));
$('custom').addEventListener('submit', event => {
  event.preventDefault();
  const usage = {}, rates = {};
  for (const k of buckets) {
    const value = $(k).value;
    // Do not coerce blank, exponent or fractional text into a valid count.
    usage[k] = /^(0|[1-9]\d*)$/.test(value) ? Number(value) : null;
    rates[k] = $(`${k}Rate`).value;
  }
  submit('/api/record', { context: { project: 'fictional-studio', workflow: 'demo-classification', requestId: $('requestId').value }, model: $('model').value, usage, rates });
});
$('model').addEventListener('change', () => { for (const k of buckets) $(`${k}Rate`).value = config.prices[$('model').value][k]; });
async function init() {
  try { config = await (await fetch('/api/config')).json(); renderLedger(await (await fetch('/api/ledger')).json()); }
  catch { $('status').textContent = 'Connection failed'; }
}
init();
