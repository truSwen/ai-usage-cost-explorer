import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, createLedger } from '../metering.js';
import { fixture, runScenario } from '../scenarios.js';
const refuses = (run, code) => assert.throws(run, e => e.code === code);

test('exact four-bucket estimate and traceable rate snapshot', () => {
 const r = estimate(fixture()); assert.equal(r.costUsd, '0.002540000000');
 assert.deepEqual(r.breakdown, { input: '0.001200000000', output: '0.001280000000', cacheRead: '0.000060000000', cacheWrite: '0.000000000000' });
 assert.equal(r.rates.input, '1.200000');
});
test('one-token sub-cent precision is preserved', () => {
 const p=fixture(); p.usage={input:1,output:0,cacheRead:0,cacheWrite:0}; p.rates.input='0.000001';
 assert.equal(estimate(p).costUsd,'0.000000000001');
});
test('zero token usage costs exactly zero', () => { const p=fixture(); for(const k in p.usage)p.usage[k]=0; assert.equal(estimate(p).costUsd,'0.000000000000'); });
test('cache write uses its own fictional rate', () => {const p=fixture(); p.usage={input:0,output:0,cacheRead:0,cacheWrite:1000000}; assert.equal(estimate(p).costUsd,'1.500000000000');});
test('maximum allowed inputs remain exact', () => {const p=fixture(); for(const k in p.usage){p.usage[k]=1000000000;p.rates[k]='1000';} assert.equal(estimate(p).costUsd,'4000000.000000000000');});
for(const [label,edit,code] of [
 ['missing context',p=>{delete p.context},'INVALID_REQUEST'],
 ['missing workflow',p=>{delete p.context.workflow},'INVALID_CONTEXT'],
 ['empty project',p=>{p.context.project=''},'INVALID_CONTEXT'],
 ['arbitrary text context',p=>{p.context.project='somebody@example.invalid'},'INVALID_CONTEXT'],
 ['extra field',p=>{p.secret='anything'},'INVALID_REQUEST'],
 ['unknown model',p=>{p.model='__proto__'},'UNKNOWN_MODEL'],
 ['missing price',p=>{delete p.rates.output},'INVALID_RATE'],
 ['negative price',p=>{p.rates.input='-1'},'INVALID_RATE'],
 ['numeric rather than decimal-string price',p=>{p.rates.input=1.2},'INVALID_RATE'],
 ['exponential price',p=>{p.rates.input='1e2'},'INVALID_RATE'],
 ['excess decimal precision',p=>{p.rates.input='0.0000001'},'INVALID_RATE'],
 ['over-limit price',p=>{p.rates.input='1000.000001'},'INVALID_RATE'],
 ['negative tokens',p=>{p.usage.input=-1},'INVALID_USAGE'],
 ['fractional tokens',p=>{p.usage.output=1.5},'INVALID_USAGE'],
 ['non-finite tokens',p=>{p.usage.output=Infinity},'INVALID_USAGE'],
 ['wrong token type',p=>{p.usage.output='200'},'INVALID_USAGE'],
 ['over-limit tokens',p=>{p.usage.output=1000000001},'INVALID_USAGE'],
 ['missing bucket',p=>{delete p.usage.cacheRead},'INVALID_USAGE']
])test(`refuses ${label} without recording`,()=>{ const p=fixture(),l=createLedger();edit(p); refuses(()=>l.record(p),code);assert.equal(l.snapshot().recordCount,0); });
test('identical request replay returns original timestamp without double counting',()=>{
 const l=createLedger({now:()=> '2026-01-01T00:00:00.000Z'}); const a=l.record(fixture()),b=l.record(fixture());
 assert.equal(a.replayed,false); assert.equal(b.replayed,true); assert.deepEqual(a.record,b.record); assert.equal(l.snapshot().recordCount,1); assert.equal(l.snapshot().totalCostUsd,'0.002540000000');
});
test('equivalent decimal spelling is a replay',()=>{const l=createLedger();l.record(fixture());const p=fixture();p.rates.input='1.200000';assert.equal(l.record(p).replayed,true);});
for(const [label,edit] of [
 ['usage',p=>p.usage.output++],['rates',p=>p.rates.input='2'],['context',p=>p.context.project='different-demo'],['model',p=>p.model='mock-canyon']
])test(`same request ID with changed ${label} is refused`,()=>{const l=createLedger();l.record(fixture());const before=l.snapshot(),p=fixture();edit(p);refuses(()=>l.record(p),'REQUEST_ID_CONFLICT');assert.deepEqual(l.snapshot(),before);});
test('aggregate totals equal sum of unique records',()=>{const l=createLedger();l.record(fixture('one'));l.record(fixture('two'));assert.equal(l.snapshot().totalCostUsd,'0.005080000000');});
test('caller mutation cannot alter stored records',()=>{const l=createLedger();const p=fixture(),r=l.record(p);p.usage.input=0;r.record.costPicoUsd='0';const s=l.snapshot();s.records[0].context.project='changed';assert.equal(l.snapshot().totalCostUsd,'0.002540000000');assert.equal(l.snapshot().records[0].context.project,'fictional-studio');});
test('ledger capacity rejects new IDs but permits existing replay',()=>{const l=createLedger({maxRecords:1});l.record(fixture());refuses(()=>l.record(fixture('two')),'LEDGER_FULL');assert.equal(l.record(fixture()).replayed,true);});
test('reset clears only local simulation state',()=>{const l=createLedger();l.record(fixture());l.reset();assert.equal(l.snapshot().recordCount,0);assert.equal(l.snapshot().totalCostUsd,'0.000000000000');});
test('unknown scenario is rejected',()=>{assert.throws(()=>runScenario(createLedger(),'anything'),/UNKNOWN_SCENARIO/);});
