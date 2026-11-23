const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { airtableError } = require('../netlify/functions/lib/airtable-error');
const { request } = require('../netlify/functions/lib/airtable');

function token(t) {
  const previous = process.env.AIRTABLE_TOKEN;
  process.env.AIRTABLE_TOKEN = 'synthetic-test-token';
  t.after(() => previous === undefined ? delete process.env.AIRTABLE_TOKEN : process.env.AIRTABLE_TOKEN = previous);
}
const quotaBody = JSON.stringify({error:{type:'PUBLIC_API_BILLING_LIMIT_EXCEEDED',message:'Allowance exhausted'}});
const blockedResponse = () => ({ok:false,status:429,text:async()=>quotaBody});

test('monthly quota and temporary throttling have different recovery instructions', () => {
  const quota = airtableError(429, quotaBody);
  assert.equal(quota.code, 'AIRTABLE_MONTHLY_LIMIT');
  assert.match(quota.message, /monthly API allowance/);
  assert.match(quota.message, /Refreshing will not resolve/);
  const throttle = airtableError(429, '{"error":{"type":"TOO_MANY_REQUESTS"}}');
  assert.equal(throttle.code, 'AIRTABLE_RATE_LIMIT');
  assert.match(throttle.message, /at least 30 seconds/);
  assert.equal(airtableError(403, quotaBody).code, 'AIRTABLE_REQUEST_FAILED');
});

test('shared Airtable client does not retry monthly or temporary 429s', async t => {
  token(t);
  for(const detail of [quotaBody, 'Too many requests']) {
    let calls = 0;
    await assert.rejects(request('fixture', {}, async () => {
      calls++;
      return {ok:false,status:429,text:async()=>detail};
    }), error => error.statusCode === 429);
    assert.equal(calls, 1);
  }
});

test('jobs and discoveries preserve the quota diagnosis without leaking provider payloads', async t => {
  token(t);
  t.mock.method(global, 'fetch', blockedResponse);
  for(const endpoint of ['jobs', 'new-posts', 'operations']) {
    const { handler } = require('../netlify/functions/'+endpoint);
    const response = await handler({});
    assert.equal(response.statusCode, 429);
    const body = JSON.parse(response.body);
    assert.equal(body.code, 'AIRTABLE_MONTHLY_LIMIT');
    assert.equal(body.detail, undefined);
  }
});

function feedReader(fetch) {
  const source = fs.readFileSync(require.resolve('../public/focus.js'), 'utf8');
  const start = source.indexOf('async function get(');
  const end = source.indexOf('async function load(', start);
  const context = vm.createContext({fetch});
  vm.runInContext(source.slice(start, end), context);
  return () => vm.runInContext('readFeeds()', context);
}

test('a monthly block stops subsequent browser feeds; unrelated failures do not', async () => {
  let calls = 0;
  const quota = airtableError(429, quotaBody);
  const readBlocked = feedReader(async () => {
    calls++;
    return {ok:false,status:429,json:async()=>({error:quota.message,code:quota.code})};
  });
  const results = await readBlocked();
  assert.equal(calls, 1);
  assert.equal(results.length, 4);
  assert.ok(results.every(result => result.reason.code === quota.code));
  let inFlight = 0, maximum = 0;
  calls = 0;
  const readPartial = feedReader(async () => {
    const first = ++calls === 1;
    maximum = Math.max(maximum, ++inFlight);
    await Promise.resolve();
    inFlight--;
    return {ok:!first,status:first?503:200,json:async()=>first?{error:'Unavailable'}:{jobs:[]}};
  });
  const partial = await readPartial();
  assert.equal(calls, 4);
  assert.equal(maximum, 1);
  assert.equal(partial[0].status, 'rejected');
  assert.ok(partial.slice(1).every(result => result.status === 'fulfilled'));
});
