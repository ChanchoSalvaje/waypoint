const { test } = require('node:test');
const assert = require('node:assert/strict');
const { handler } = require('../netlify/functions/lead-decision');
const { schema } = require('../netlify/functions/lib/airtable');
const { mapLead } = require('../netlify/functions/new-posts');

test('lead decisions persist independently of automated notes, and support close and undo', async t => {
  const id = 'rec00000000000001';
  const field = schema.leadFields["Tim's decision"];
  const state = schema.leadFields.State;
  const row = { id, fields: { [state]: 'New' } };
  const changes = [];
  const oldToken = process.env.AIRTABLE_TOKEN;
  process.env.AIRTABLE_TOKEN = 'test';
  t.after(() => { if (oldToken === undefined) delete process.env.AIRTABLE_TOKEN; else process.env.AIRTABLE_TOKEN = oldToken; });
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.ok(url.includes(schema.leads + '/' + id));
    if (options.method === 'PATCH') {
      const data = JSON.parse(options.body);
      assert.deepEqual(Object.keys(data.fields), [field]);
      changes.push(data.fields[field]);
      Object.assign(row.fields, data.fields);
    }
    return { ok: true, json: async () => row };
  });
  const choose = (decision, previous) => handler({ httpMethod: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision, previous }) });
  for (const [decision, previous] of [['Pursue',''], ['Pursue',''], ['Close','Pursue'], ['', 'Close']]) {
    assert.equal((await choose(decision, previous)).statusCode, 200);
    assert.equal(mapLead(row).decision, decision);
  }
  assert.equal((await choose('Pursue', 'Close')).statusCode, 409);
  row.fields[state] = 'Promoted';
  assert.equal((await choose('Close', '')).statusCode, 409);
  assert.deepEqual(changes, ['Pursue','Close',null]);
});
