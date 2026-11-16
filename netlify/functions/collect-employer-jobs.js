// Netlify scheduled functions have a short execution limit; the collector runs
// as a background function. Reuse the site's existing server-only auth values.
const { json } = require('./lib/airtable');
exports.handler = async event => {
  let body; try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid invocation.' }); }
  if (!body.next_run) return json(405, { error: 'Scheduled invocation only.' });
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!password) return json(503, { error: 'Collector launch requires the existing site authentication configuration.' });
  const user = process.env.BASIC_AUTH_USER || 'waypoint';
  try {
    const response = await fetch('https://waypoint-hq.netlify.app/.netlify/functions/collect-employer-jobs-background', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { Authorization: 'Basic ' + Buffer.from(user + ':' + password).toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (response.status !== 202) throw new Error(`Collector launch failed (${response.status}).`);
    return json(202, { accepted: true });
  } catch (err) { return json(502, { error: err.message }); }
};
