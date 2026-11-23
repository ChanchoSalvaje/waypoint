// Expose the kind of service limit without forwarding provider payloads or secrets.
function airtableError(status, detail = '') {
  const billing = status === 429 && /PUBLIC_API_BILLING_LIMIT_EXCEEDED|API billing plan limit exceeded|maximum number of requests allowed for this month/i.test(detail);
  const error = new Error(billing
    ? 'Airtable’s monthly API allowance has been used up. Tracker reads and updates are blocked until the allowance resets or the workspace plan changes. Refreshing will not resolve this.'
    : status === 429
      ? 'Airtable is temporarily limiting requests. Wait at least 30 seconds before refreshing.'
      : `Airtable request failed (${status}).`);
  error.statusCode = status;
  error.code = billing ? 'AIRTABLE_MONTHLY_LIMIT' : status === 429 ? 'AIRTABLE_RATE_LIMIT' : 'AIRTABLE_REQUEST_FAILED';
  return error;
}
async function responseError(response) {
  let detail = '';
  try { detail = await response.text(); } catch { /* Some transports have no readable body. */ }
  try {
    const body=JSON.parse(detail);
    if (['SUPABASE_REQUEST_FAILED','TRACKER_REQUEST_FAILED','TRACKER_NOT_CONFIGURED'].includes(body.code)) {
      return Object.assign(new Error('Could not confirm the private tracker request. Refresh before retrying a write.'),{statusCode:response.status,code:body.code});
    }
  } catch { /* Ordinary Airtable errors retain their existing diagnosis. */ }
  return airtableError(response.status, detail);
}
module.exports = { airtableError, responseError };
