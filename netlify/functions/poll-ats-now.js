// poll-ats-now.js — manual "run the poller now" trigger.
// Verifies POLL_KEY, then kicks off the poll-ats-background function (which has a
// 15-minute budget) and returns immediately (202). Results land in the Watchlist +
// Opportunities tables and the poll-ats-background function logs — NOT in this
// response body (the poll runs for minutes; a sync HTTP function would time out).
//   GET /.netlify/functions/poll-ats-now?key=<POLL_KEY>
// Also sits behind the site's Basic-Auth edge gate, so a caller needs both.
// (A "Poll now" button in the Waypoint UI can call this later.)

exports.handler = async (event) => {
  const key = event.queryStringParameters?.key;
  if (!process.env.POLL_KEY || key !== process.env.POLL_KEY) {
    return { statusCode: 401, body: 'Unauthorized' };
  }
  // Fire the background worker through the site's own URL so it runs as an
  // independent background invocation (up to 15 min). We forward the site's
  // Basic-Auth header (server-side env only) so the edge gate lets the call in.
  const host = event.headers['x-forwarded-host'] || event.headers.host;
  const proto = event.headers['x-forwarded-proto'] || (host && host.startsWith('localhost') ? 'http' : 'https');
  const user = process.env.BASIC_AUTH_USER || 'waypoint';
  const auth = 'Basic ' + Buffer.from(`${user}:${process.env.BASIC_AUTH_PASSWORD || ''}`).toString('base64');
  try {
    const res = await fetch(`${proto}://${host}/.netlify/functions/poll-ats-background`, { headers: { Authorization: auth } });
    return {
      statusCode: 202,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        started: true,
        worker: res.status,
        note: 'ATS poll started in the background (up to 15 min). Watch the Watchlist "Last Polled"/"Poll Notes", any new Opportunities keepers, and the poll-ats-background function logs.',
      }),
    };
  } catch (e) {
    return { statusCode: 500, body: `Failed to start poll: ${e.message}` };
  }
};
