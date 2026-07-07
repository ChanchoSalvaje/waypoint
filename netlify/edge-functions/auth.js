// netlify/edge-functions/auth.js
// ---------------------------------------------------------------------------
// Site-wide password gate (HTTP Basic Auth), enforced at the edge.
//
// This runs before every request (configured with path "/*" in netlify.toml),
// so the whole site — the page AND the /.netlify/functions/jobs data endpoint —
// is protected. Anyone without the correct username + password gets a 401 and
// never sees any content or data.
//
// Credentials are read from environment variables (set in Netlify, never in
// code and never committed):
//   BASIC_AUTH_USER      (optional; defaults to "waypoint")
//   BASIC_AUTH_PASSWORD  (required)
// ---------------------------------------------------------------------------

export default async (request, context) => {
  const USER = Netlify.env.get("BASIC_AUTH_USER") || "waypoint";
  const PASS = Netlify.env.get("BASIC_AUTH_PASSWORD");

  // Fail CLOSED: if no password is configured, never expose the site.
  if (!PASS) {
    return new Response("Site is not configured yet (missing password).", {
      status: 503,
    });
  }

  const auth = request.headers.get("authorization") || "";
  if (auth.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(auth.slice(6));
    } catch (_) {
      decoded = "";
    }
    const sep = decoded.indexOf(":");
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (user === USER && pass === PASS) {
        // Correct credentials — let the request continue to the real content.
        return context.next();
      }
    }
  }

  // Missing or wrong credentials — challenge the browser for a username/password.
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Waypoint - private", charset="UTF-8"',
    },
  });
};

export const config = { path: "/*" };
