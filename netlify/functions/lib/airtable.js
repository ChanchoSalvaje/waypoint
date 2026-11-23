const schema = require('./schema.json');
const { responseError } = require('./airtable-error');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(table, options = {}, fetcher = fetch) {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) throw new Error('Airtable server access is not configured.');
  const url = `https://api.airtable.com/v0/${schema.base}/${table}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers } });
    // Never retry an uncertain create: a lost/5xx response may follow a committed write.
    // A 429 can mean the monthly allowance is exhausted. Fast retries cannot fix
    // that, and a temporary throttle requires at least a 30-second pause.
    if (response.status >= 500 && attempt < 2 && (!options.method || options.method === 'GET')) { await wait(1000 * (attempt + 1)); continue; }
    if (!response.ok) throw await responseError(response);
    return response.json();
  }
}
async function list(table, params = {}, fetcher = fetch) {
  let records = [], offset;
  for (let page = 0; page < 100; page++) {
    const q = new URLSearchParams({ pageSize: '100', returnFieldsByFieldId: 'true', ...params });
    if (offset) q.set('offset', offset);
    const data = await request(`${table}?${q}`, {}, fetcher);
    if (!Array.isArray(data.records)) throw new Error('Incomplete Airtable response.');
    records.push(...data.records); offset = data.offset;
    if (!offset) return records;
    await wait(220);
  }
  throw new Error('Airtable pagination limit reached; refusing a partial read.');
}
async function write(table, records, method = 'POST', fetcher = fetch) {
  const result = [];
  for (let i = 0; i < records.length; i += 10) {
    const data = await request(table, { method, body: JSON.stringify({ records: records.slice(i, i + 10), typecast: false }) }, fetcher);
    if (!Array.isArray(data.records) || data.records.length !== Math.min(10, records.length - i) || data.records.some(r => !r.id)) throw new Error('Write response incomplete; reconcile before retrying.');
    result.push(...data.records); await wait(220);
  }
  return result;
}
function json(statusCode, body) { return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) }; }
module.exports = { schema, list, write, request, json };
