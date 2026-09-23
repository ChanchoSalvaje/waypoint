/* ============================================================
   FIT READ — display-only layout for the Today card.

   The mine writes each Fit Read as one dense run-on sentence:
   a verdict, then a string of caveats and checks joined by "; ".
   This file lays that out at RENDER TIME as

     verdict            (first clause, full ink)
     o check            (a clause that asks to confirm something)
     • note             (any other caveat: comp, level, etc.)
     • FLAG: ...        (a clause that opens on a caps flag label)

   READ THIS FIRST: nothing here writes to Airtable, and the stored
   text is never rewritten. The only characters not shown verbatim
   are the "; " separators, which become the list structure. Every
   other character reaches the DOM. First-letter capitals on list
   items are CSS (::first-letter), not a change to the text.

   Scope: single-paragraph reads only. Anything with a line break,
   a markdown bullet, or bold markup is already structured by its
   author, so renderFitRead returns null and the caller keeps its
   existing markdown renderer.

   Loaded as a plain <script> in the browser (globals below) and
   require()'d by tests/fit-read.test.js under Node.
   ============================================================ */
(function (root) {
  "use strict";

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* A period that ends one of these is NOT a sentence end.
     "Sr. Director", "~ Est. $175K", "vs. client", "U.S. only". */
  var ABBR = /(?:\b(?:Sr|Jr|St|Inc|Co|Corp|Ltd|vs|etc|approx|Est|est|No|Mr|Ms|Dr|Mt|Ft|yrs|min|max)|\b[A-Z](?:\.[A-Z])*|\be\.g|\bi\.e)\.$/;

  /* Boundaries: "; " (consumed), or a sentence end followed by a capital,
     a digit or a currency sign (the period stays with its sentence). */
  var BOUNDARY = /;\s+|[.!?]\s+(?=[A-Z0-9$~"'(])/g;

  /* parseFitRead(text) -> null | [{ body, raw, sep }]
     raw   : the exact slice of the input this clause came from, including
             whatever separator and whitespace followed it. raw values
             joined in order reproduce the input exactly.
     body  : what is displayed (raw minus a trailing "; " and whitespace).
     sep   : ";" if a semicolon was consumed after this clause, else "". */
  function parseFitRead(text) {
    if (text == null) return null;
    var s = String(text);
    if (!s.trim()) return null;
    if (/\n/.test(s.trim()) || /^\s*[-*]\s/.test(s) || /\*\*/.test(s)) return null;

    var pieces = [], start = 0, m;
    BOUNDARY.lastIndex = 0;
    while ((m = BOUNDARY.exec(s)) !== null) {
      var isSemi = m[0].charAt(0) === ";";
      if (!isSemi && ABBR.test(s.slice(0, m.index + 1))) continue;
      var end = m.index + m[0].length;
      pieces.push({
        raw: s.slice(start, end),
        body: s.slice(start, isSemi ? m.index : m.index + 1),
        sep: isSemi ? ";" : ""
      });
      start = end;
    }
    if (start < s.length) pieces.push({ raw: s.slice(start), body: s.slice(start), sep: "" });

    // A clause that opens on a lower-case "if" qualifies the one before it
    // ("confirm remote; if on-site only, out of scope") — keep them together,
    // semicolon and all, rather than orphan the condition as its own bullet.
    var out = [];
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i];
      if (out.length && /^\s*if\b/.test(p.body)) {
        var prev = out[out.length - 1];
        prev.body = prev.raw + p.body;          // prev.raw still carries its "; "
        prev.raw = prev.raw + p.raw;
        prev.sep = p.sep;
        continue;
      }
      out.push({ raw: p.raw, body: p.body, sep: p.sep });
    }
    for (var j = 0; j < out.length; j++) out[j].body = out[j].body.trim();
    return out.filter(function (c) { return c.body.length; });
  }

  /* A caps flag label at the start of a clause: "LOCATION FLAG: ..." or
     a lower-case "flag: ...". Returned so it can be styled, not removed. */
  var FLAG_LABEL = /^((?:[A-Z][A-Z &\/-]{1,30}[A-Z]|flag)\s*:)\s*/;

  function kindOf(body) {
    if (FLAG_LABEL.test(body)) return "flag";
    if (/\bconfirm\b/i.test(body)) return "check";
    return "note";
  }

  function itemHtml(body) {
    var m = body.match(FLAG_LABEL);
    if (m) {
      return '<span class="fr-flag">' + esc(m[1]) + '</span> ' + esc(body.slice(m[0].length));
    }
    return esc(body);
  }

  /* renderFitRead(text) -> HTML string, or null when the read is already
     structured (multi-line / markdown) and the caller should render it
     the old way. */
  function renderFitRead(text) {
    var clauses = parseFitRead(text);
    if (!clauses || !clauses.length) return null;
    var html = '<div class="fr"><p class="fr-lead">' + esc(clauses[0].body) + '</p>';
    if (clauses.length > 1) {
      html += '<ul class="fr-list">';
      for (var i = 1; i < clauses.length; i++) {
        var k = kindOf(clauses[i].body);
        html += '<li class="fr-item fr-item--' + k + '">' + itemHtml(clauses[i].body) + '</li>';
      }
      html += '</ul>';
    }
    return html + '</div>';
  }

  var api = {
    parseFitRead: parseFitRead,
    renderFitRead: renderFitRead,
    _kindOf: kindOf
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  for (var k in api) if (api.hasOwnProperty(k)) root[k] = api[k];
})(typeof globalThis !== "undefined" ? globalThis : this);
