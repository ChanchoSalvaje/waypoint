const { json } = require('./lib/airtable');
exports.handler = async event => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });
  if (!process.env.HUNTER_API_KEY || process.env.HUNTER_LOOKUP_ENABLED !== 'true') return json(503, { error: 'Hunter API lookup is not enabled. The Hunter website is available without connecting an API key.' });
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request.' }); }
  const { domain, firstName, lastName } = body;
  if (typeof domain !== 'string' || !/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain) || [firstName,lastName].some(n => typeof n !== 'string' || !n.trim() || n.length > 100 || /[\x00-\x1f]/.test(n))) return json(400, { error: 'Provide a company domain and the verified person’s first and last names.' });
  // One lookup, explicitly initiated by the user. No provider campaigns or sending API.
  const url = new URL('https://api.hunter.io/v2/email-finder');
  url.search = new URLSearchParams({ domain, first_name: firstName, last_name: lastName, api_key: process.env.HUNTER_API_KEY }).toString();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) return json(response.status, { error: `Hunter lookup failed (${response.status}). No message was sent.` });
    const { data } = await response.json();
    if (!data?.email) return json(200, { found: false, checkedAt: new Date().toISOString() });
    return json(200, { found: true, email: data.email, status: data.verification?.status || 'unknown', provenance: data.provenance || 'unknown', score: data.score ?? null, sources: (data.sources || []).map(s => ({ uri: s.uri, extracted_on: s.extracted_on, last_seen_on: s.last_seen_on })), checkedAt: new Date().toISOString(), caution: 'Deliverability is separate from identity and responsibility for hiring. Accept-all or inferred results are uncertain.' });
  } catch { return json(502, { error: 'Hunter did not complete the lookup. No message was sent.' }); }
};
