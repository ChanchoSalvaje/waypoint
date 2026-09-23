/* ============================================================
   NOTES TIMELINE — display-only parser + renderer for the
   Activity Log (Airtable "Notes", field fldXN9uz1ZcIFtsKm).

   READ THIS FIRST: nothing in this file writes to Airtable. It
   takes the stored Notes string and turns it into a timeline at
   RENDER TIME only. The stored text is never modified, reordered,
   re-cased or trimmed. Entries are emitted in stored order, which
   is already oldest-first because every writer appends.

   Guarantees:
   - No content is ever dropped. Every character of the input ends
     up inside some entry's `raw`, and every entry is rendered.
   - If an entry cannot be parsed confidently, `ok` is false and the
     renderer falls back to plain text with line breaks preserved.
   - Labels are re-cased for DISPLAY ONLY ("SENT" -> "Sent"). Body
     sentences are never re-cased; an all-caps body sentence keeps
     its characters and just gets a quieter style.

   Loaded as a plain <script> in the browser (globals below) and
   require()'d by tests/notes-timeline.test.js under Node.
   ============================================================ */
(function (root) {
  "use strict";

  /* ---------- date marker ----------------------------------------------
     A new entry starts where a date marker sits at one of:
       - the very start of the Notes value
       - the start of a line
       - immediately after a " | " separator
     A date anywhere else (e.g. "Row is Applied (2026-08-30)") is body
     text and must NOT split the entry. Four stored shapes are handled:
       [2026-08-30]           bracketed, no colon
       [2026-08-31]:          bracketed, colon           (most common)
       [2026-07-23 16:12 MST] bracketed, with a time
       [2026-09-15, later]    bracketed, with a qualifier
       2026-09-04 11:39 MST:  bare, from the "Add dated note" box
       2026-09-04:            bare date
       6/25:                  short M/D (rendered literally - never
                              year-inferred, per Tim's call)
     -------------------------------------------------------------------- */
  var MARKER = new RegExp(
    "(^|\\n|\\s\\|\\s)" +                                  // 1: boundary
    "(?:" +
      "\\[(\\d{4}-\\d{2}-\\d{2})([^\\]]{0,24})\\]\\s*:?" + // 2,3: bracketed + qualifier
      "|" +
      "(\\d{4}-\\d{2}-\\d{2})" +                           // 4: bare ISO
        "(?:\\s+(\\d{1,2}:\\d{2})\\s*([A-Z]{2,4})?)?" +    // 5,6: time, zone
        "(?:\\s*\\(approx\\))?\\s*:" +
      "|" +
      "(\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?)\\s*:" +       // 7: short M/D
    ")\\s*",
    "g"
  );

  var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* "2026-08-30" -> "Aug 30, 2026". Parsed by hand, NOT via new Date(iso),
     which would read the string as UTC and can shift the day backwards. */
  function displayIso(iso) {
    var p = iso.split("-");
    var m = parseInt(p[1], 10);
    if (!(m >= 1 && m <= 12)) return iso;
    return MONTHS[m - 1] + " " + parseInt(p[2], 10) + ", " + p[0];
  }

  /* ---------- labels ----------------------------------------------------
     A label is an unbroken ALL-CAPS run (2-40 chars, at least two capital
     letters) immediately followed by a colon, sitting at the start of the
     entry, the start of a line, or just after a sentence end.

     The "unbroken" part is what keeps
       "NEW MATERIAL CAPTURED HERE FOR THE FIRST TIME, all of it Tim's,
        none previously in any document:"
     from being mistaken for a label - the caps run stops at the comma, so
     it stays an ordinary body sentence. Mid-sentence caps used for emphasis
     ("...(1) PRODUCT OWNER of a platform...") have no colon and are
     likewise left alone.
     -------------------------------------------------------------------- */
  var LABEL = new RegExp(
    "(^|\\n|(?<=[.!?]\\s))" +                       // 1: boundary
    "([A-Z][A-Z0-9 &'\\-/]{1,39})" +                // 2: the caps run
    "(\\s*\\([^)]{0,30}\\))?" +                     // 3: optional (qualifier)
    "\\s*:\\s*",
    "g"
  );

  /* Tokens that must stay upper-case when a label is re-cased. Derived from
     the real corpus - "JD" is the only true acronym that appears as a label
     today; the rest are here so future labels don't read as "Ats" / "Pmo". */
  var ACRONYMS = {
    JD:1, ATS:1, PMO:1, CSM:1, AI:1, ML:1, US:1, HQ:1, LTI:1, PTO:1, ROI:1,
    CPX:1, CEO:1, CTO:1, CIO:1, VP:1, PM:1, QA:1, HR:1, UX:1, API:1, SPA:1,
    URL:1, OCI:1, ARC:1, JIRA:1, SLA:1, KPI:1, RFP:1, NDA:1, EDS:1
  };

  /* "CONFIDENTIALITY CHECK" -> "Confidentiality check". Keeps the label's
     own words, only changes their case. Acronyms and any token carrying a
     digit (e.g. "INCIDENT 2026-09-16") are preserved as stored. */
  function sentenceCaseLabel(s) {
    var words = s.split(/(\s+|\/)/);
    var seenWord = false;
    return words.map(function (w) {
      if (/^(\s+|\/)$/.test(w) || w === "") return w;
      var bare = w.replace(/[^A-Za-z0-9]/g, "");
      if (ACRONYMS[bare.toUpperCase()] || /\d/.test(w)) { seenWord = true; return w; }
      var lower = w.toLowerCase();
      if (!seenWord) { seenWord = true; return w.charAt(0).toUpperCase() + lower.slice(1); }
      return lower;
    }).join("");
  }

  /* ---------- sentence split ------------------------------------------- */
  /* First sentence of an entry, used as its headline. Avoids splitting on
     the dots inside "U.S.", "v8.15", "§6.5/§6.11", "26005532/AI-Business". */
  function firstSentenceOf(text) {
    var re = /[.!?](?=\s+[A-Z0-9(\u2018\u2019"'])|[.!?]$/g, m;
    while ((m = re.exec(text)) !== null) {
      var end = m.index + 1;
      var before = text.slice(Math.max(0, m.index - 4), m.index);
      if (/\b[A-Za-z]$/.test(before) && /\b[A-Z]\.[A-Z]?$/.test(text.slice(0, end))) continue;
      if (/\d$/.test(before)) continue;             // "v8.15", "89.7%"
      return text.slice(0, end);
    }
    return text;
  }

  function squash(s) { return s.replace(/\s+/g, " ").trim(); }

  /* Headlines are NOT character-truncated. Measured across the real base the
     first sentence runs 51 chars at the median and 132 at p90, which sits
     inside the 70ch column in one or two lines. Cutting them would either
     lose words or force the full sentence to be repeated in the body, which
     read as duplication. The whole sentence is shown. */

  /* ---------- section split --------------------------------------------- */
  function splitSections(body) {
    var sections = [], last = 0, m, pending = null;
    LABEL.lastIndex = 0;
    while ((m = LABEL.exec(body)) !== null) {
      var caps = m[2];
      if ((caps.match(/[A-Z]/g) || []).length < 2) continue;   // need 2+ capitals
      if (/\s$/.test(caps)) continue;                          // caps must touch the colon
      var labelStart = m.index + m[1].length;
      var chunk = body.slice(last, labelStart);
      if (pending) { pending.text = chunk.trim(); sections.push(pending); }
      else if (chunk.trim()) { sections.push({ label: null, text: chunk.trim() }); }
      pending = {
        label: sentenceCaseLabel(caps.trim()) + (m[3] ? " " + m[3].trim() : ""),
        labelRaw: caps.trim(),
        text: ""
      };
      last = LABEL.lastIndex;
    }
    var tail = body.slice(last);
    if (pending) { pending.text = tail.trim(); sections.push(pending); }
    else if (tail.trim()) { sections.push({ label: null, text: tail.trim() }); }
    return sections;
  }

  /* ---------- the parser ------------------------------------------------
     parseNotes(notesString) -> Array of entries:
       { date, dateIso, dateQual, time, headline, headlineTruncated,
         sections: [{label, text}], raw, ok }
     `date` is the display chip ("Aug 30, 2026", or "6/25" verbatim for
     short dates, or null for an undated preamble). `ok:false` means the
     renderer must fall back to plain text.
     -------------------------------------------------------------------- */
  function parseNotes(notes) {
    var text = (notes == null ? "" : String(notes)).replace(/\r\n?/g, "\n");
    if (!text.trim()) return [];

    // 1. Locate every entry boundary.
    var cuts = [], m;
    MARKER.lastIndex = 0;
    while ((m = MARKER.exec(text)) !== null) {
      cuts.push({
        sepStart: m.index,                      // where the PREVIOUS entry ends
        sliceStart: m.index + m[1].length,      // where THIS entry's raw begins
        bodyStart: MARKER.lastIndex,            //   (separator excluded from both)
        iso: m[2] || m[4] || null,
        qual: (m[3] || "").trim(),
        time: m[5] ? (m[5] + (m[6] ? " " + m[6] : "")) : null,
        short: m[7] || null
      });
      if (MARKER.lastIndex === m.index) MARKER.lastIndex++;  // never loop forever
    }

    var entries = [];

    // 2. Anything before the first marker is an undated preamble (295 rows
    //    in the base open with "Source: ..."). It is content, so it becomes
    //    its own dateless entry rather than being dropped.
    var firstCut = cuts.length ? cuts[0].sepStart : text.length;
    var preamble = text.slice(0, firstCut);
    if (preamble.trim()) entries.push(buildEntry(null, preamble, preamble));

    // 3. One entry per marker, running to the next marker.
    for (var i = 0; i < cuts.length; i++) {
      var c = cuts[i];
      var end = (i + 1 < cuts.length) ? cuts[i + 1].sepStart : text.length;
      var raw = text.slice(c.sliceStart, end);
      var body = text.slice(c.bodyStart, end);
      entries.push(buildEntry(c, body, raw));
    }
    return entries;
  }

  function buildEntry(cut, body, raw) {
    var e = {
      date: null, dateIso: null, dateQual: "", time: null,
      leadLabel: null, headline: "",
      sections: [], raw: raw, ok: true
    };

    if (cut) {
      if (cut.iso) {
        e.dateIso = cut.iso;
        e.date = displayIso(cut.iso);
        // A bracket qualifier is either a time ("16:12 MST") or a note (", later").
        var q = cut.qual.replace(/^[,\s]+/, "");
        if (/^\d{1,2}:\d{2}/.test(q)) e.time = q; else e.dateQual = q;
        if (cut.time) e.time = cut.time;
      } else if (cut.short) {
        e.date = cut.short;          // rendered verbatim - no year inference
      }
    }

    var trimmed = body.replace(/^\s+/, "").replace(/\s+$/, "");
    if (!trimmed) { e.ok = !!e.date; e.headline = ""; return e; }

    // CONFIDENCE GATE. We only claim to have understood an entry's shape when
    // a real date marker told us where it starts. Without one (an undated
    // "Source: ..." preamble, or a whole Notes value with no dates at all) we
    // do NOT guess at headlines and labels - the entry is handed to the
    // renderer as plain text with its line breaks preserved. Nothing is lost
    // either way; this only decides how much structure we assert.
    if (!e.date) { e.ok = false; e.headline = ""; e.sections = []; return e; }

    var sections = splitSections(trimmed);
    if (!sections.length) { e.headline = squash(trimmed); return e; }

    // The headline is the entry's first sentence, taken from whatever comes
    // first - a leading unlabelled chunk, or the opening labelled section.
    var first = sections[0];

    // When the entry OPENS on a label (57 entries in the base do, e.g.
    // "[2026-09-13] COUNCIL READ: pursue, Track B..."), that label is the
    // entry's lead. It is promoted next to the date chip instead of being
    // printed underneath the sentence it introduces, which read backwards.
    if (first.label) { e.leadLabel = first.label; e.leadLabelRaw = first.labelRaw; }

    var sentence = firstSentenceOf(first.text);
    e.headline = squash(sentence);

    var rest = first.text.slice(sentence.length).replace(/^\s+/, "");
    if (rest) sections[0] = { label: null, text: rest };
    else sections.shift();

    e.sections = sections;
    return e;
  }

  /* ============================================================
     RENDERING
     Everything is escaped FIRST; the only HTML that reaches the DOM
     is the markup added below.
     ============================================================ */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* Monospace the things worth spotting at a glance: filenames, requisition
     ids and Airtable record ids. Applied to ALREADY-ESCAPED text. */
  var MONO_PATTERNS = [
    /\b[A-Za-z0-9][A-Za-z0-9_\-.]*\.(?:docx|doc|pdf|md|txt|xlsx|csv|pptx|png|jpg)\b/g,
    /\brec[A-Za-z0-9]{14}\b/g,
    /\b(?:R|REQ[ -]?)\d{4,8}\b/g,
    /\bfld[A-Za-z0-9]{14}\b/g,
    /\btbl[A-Za-z0-9]{14}\b/g
  ];
  function monoize(escaped) {
    var out = escaped;
    for (var i = 0; i < MONO_PATTERNS.length; i++) {
      out = out.replace(MONO_PATTERNS[i], function (mm) {
        return '<span class="tl-mono">' + mm + "</span>";
      });
    }
    return out;
  }

  /* An all-caps SENTENCE (not a label, not an acronym) keeps its characters
     exactly as stored and is merely styled quieter, per the brief. */
  function softenShouts(escaped) {
    // The trailing (?![a-z]) stops the run ending mid-word: without it
    // "BUILD/BUY/ADAPT STORY CAPTURED (Tim-stated..." matched through the
    // "(T" of "Tim" and split the word in half.
    return escaped.replace(/[A-Z][A-Z0-9 ,'\u2019\-\/&()]{24,}[A-Z0-9)](?![a-z])/g, function (mm) {
      if (!/[A-Z]{2,}\s+[A-Z]{2,}/.test(mm)) return mm;
      return '<span class="tl-shout">' + mm + "</span>";
    });
  }

  function inlineText(s) { return softenShouts(monoize(esc(s))); }

  /* Paragraphs, preserving stored line breaks. */
  function paras(text) {
    var blocks = String(text).split(/\n{2,}/);
    return blocks.map(function (b) {
      var lines = b.split("\n").map(inlineText).join("<br>");
      return '<p class="tl-p">' + lines + "</p>";
    }).join("");
  }

  var uid = 0;

  function renderEntry(e, opts) {
    var id = "tl" + (++uid);
    var expanded = !!opts.expanded;

    var chip = e.date
      ? '<span class="tl-date">' + esc(e.date) +
        (e.time ? ' <span class="tl-time">' + esc(e.time) + "</span>" : "") +
        (e.dateQual ? ' <span class="tl-qual">' + esc(e.dateQual) + "</span>" : "") +
        "</span>"
      : '<span class="tl-date tl-date--none">Undated</span>';

    if (!e.ok) {
      // FALLBACK: no date marker told us where this entry starts, so we assert
      // no structure. Render exactly what is stored, line breaks preserved
      // (white-space:pre-wrap), inside the same readable column.
      return '<li class="tl-entry tl-entry--raw">' +
        '<div class="tl-meta">' + chip + "</div>" +
        '<div class="tl-raw">' + inlineText(e.raw.trim()) + "</div>" +
        "</li>";
    }

    var bodyHtml = e.sections.map(function (s) {
      if (!s.text && !s.label) return "";
      if (s.label) {
        return '<div class="tl-sec">' +
          '<span class="tl-lbl">' + esc(s.label) + "</span>" +
          (s.text ? '<div class="tl-sec-body">' + paras(s.text) + "</div>" : "") +
          "</div>";
      }
      return '<div class="tl-sec tl-sec--plain">' + paras(s.text) + "</div>";
    }).join("");

    var hasBody = !!bodyHtml.trim();

    return '<li class="tl-entry">' +
      '<div class="tl-meta">' + chip +
        (e.leadLabel ? '<span class="tl-lead-lbl">' + esc(e.leadLabel) + "</span>" : "") +
      "</div>" +
      (e.headline ? '<p class="tl-headline">' + inlineText(e.headline) + "</p>" : "") +
      (hasBody
        ? '<div class="tl-body' + (expanded ? "" : " is-clamped") + '" id="' + id + '">' + bodyHtml + "</div>" +
          '<button type="button" class="tl-more" aria-expanded="' + (expanded ? "true" : "false") +
            '" aria-controls="' + id + '" onclick="toggleTimelineEntry(this)">' +
            (expanded ? "Show less" : "Show more") + "</button>"
        : "") +
      "</li>";
  }

  var COLLAPSE_AFTER = 5;   // more than this many entries -> hide the oldest

  /* renderTimeline(notesString, opts) -> HTML for a whole Activity Log.
     Oldest first, newest last.

     opts.collapseAfter  how many recent entries stay visible (default 5)
     opts.expandNewest   open the newest entry on load (default true)
     opts.emptyHtml      markup to use when there are no entries

     The defaults are the job detail view. The expanded board row passes
     tighter values so the History block stays subordinate to the decision
     buttons underneath it. */
  function renderTimeline(notes, opts) {
    opts = opts || {};
    var collapseAfter = (typeof opts.collapseAfter === "number") ? opts.collapseAfter : COLLAPSE_AFTER;
    var expandNewest = (opts.expandNewest !== false);

    var entries = parseNotes(notes);
    if (!entries.length) return opts.emptyHtml || '<div class="empty">No notes yet.</div>';

    var hiddenCount = Math.max(0, entries.length - collapseAfter);
    var html = "";

    if (hiddenCount > 0) {
      html += '<button type="button" class="tl-earlier" aria-expanded="false" ' +
        'aria-controls="tl-earlier-group" onclick="toggleTimelineEarlier(this)">' +
        "Show " + hiddenCount + " earlier " + (hiddenCount === 1 ? "entry" : "entries") +
        "</button>";
    }

    var older = entries.slice(0, hiddenCount);
    var recent = entries.slice(hiddenCount);

    if (older.length) {
      html += '<ol class="tl-list tl-list--earlier is-hidden" id="tl-earlier-group">' +
        older.map(function (e) { return renderEntry(e, { expanded: false }); }).join("") +
        "</ol>";
    }

    html += '<ol class="tl-list">' +
      recent.map(function (e, i) {
        // The newest entry (the last one) opens expanded; older ones collapsed.
        return renderEntry(e, { expanded: expandNewest && i === recent.length - 1 });
      }).join("") +
      "</ol>";

    return '<div class="tl-wrap">' + html + "</div>";
  }

  /* After the HTML is in the DOM: drop the "Show more" button on any entry
     that already fits, so the control only appears where it does something. */
  function initTimeline(scope) {
    var root = scope || document;
    var bodies = root.querySelectorAll(".tl-body.is-clamped");
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      // Skip anything not laid out yet. A hidden view, or a board panel still
      // animating open from grid-template-rows:0fr, measures zero for every
      // element - which would look like "it fits" and strip every clamp.
      if (b.clientHeight === 0) continue;
      if (b.scrollHeight <= b.clientHeight + 2) {
        b.classList.remove("is-clamped");
        var btn = root.querySelector('.tl-more[aria-controls="' + b.id + '"]');
        if (btn) btn.classList.add("is-hidden");
      }
    }
  }

  function toggleTimelineEntry(btn) {
    var body = document.getElementById(btn.getAttribute("aria-controls"));
    if (!body) return;
    var open = body.classList.toggle("is-clamped") === false;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.textContent = open ? "Show less" : "Show more";
  }

  function toggleTimelineEarlier(btn) {
    var group = document.getElementById(btn.getAttribute("aria-controls"));
    if (!group) return;
    var open = group.classList.toggle("is-hidden") === false;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    var n = group.children.length;
    btn.textContent = open
      ? "Hide earlier entries"
      : "Show " + n + " earlier " + (n === 1 ? "entry" : "entries");
    if (open) initTimeline(group);
  }

  var api = {
    parseNotes: parseNotes,
    renderTimeline: renderTimeline,
    initTimeline: initTimeline,
    toggleTimelineEntry: toggleTimelineEntry,
    toggleTimelineEarlier: toggleTimelineEarlier,
    // exposed for tests
    _sentenceCaseLabel: sentenceCaseLabel,
    _firstSentenceOf: firstSentenceOf,
    _displayIso: displayIso
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  for (var k in api) if (api.hasOwnProperty(k)) root[k] = api[k];
})(typeof globalThis !== "undefined" ? globalThis : this);
