const { request, schema, json } = require('./lib/airtable');

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });
  if (!/^application\/json\b/i.test(event.headers?.['content-type'] || event.headers?.['Content-Type'] || '')) {
    return json(415, { error: 'A JSON decision is required.' });
  }
  let input;
  try { input = JSON.parse(event.body); } catch { return json(400, { error: 'Invalid request.' }); }
  if (!input || !/^rec[A-Za-z0-9]{14}$/.test(input.id) || !['Pursue', 'Close', ''].includes(input.decision)) {
    return json(400, { error: 'Invalid lead or decision.' });
  }
  const path = schema.leads + '/' + input.id;
  const fields = schema.leadFields;
  try {
    const current = await request(path + '?returnFieldsByFieldId=true');
    if (!['New', 'Ignored'].includes(current.fields[fields.State])) {
      return json(409, { error: 'This lead has already been processed. Refresh to see its current record.' });
    }
    const field = fields["Tim's decision"];
    const existing = current.fields[field] || '';
    if (existing !== input.decision) {
      if (existing !== input.previous) return json(409, { error: 'The decision changed. Refresh before choosing again.' });
      const result = await request(path, {
        method: 'PATCH',
        body: JSON.stringify({ fields: { [field]: input.decision || null }, returnFieldsByFieldId: true })
      });
      if (result.id !== input.id || (result.fields[field] || '') !== input.decision) {
        return json(502, { error: 'Could not confirm the saved decision. Refresh before trying again.' });
      }
    }
    return json(200, { ok: true, decision: input.decision });
  } catch {
    return json(502, { error: 'Could not confirm the decision. Refresh to check its current state.' });
  }
};
