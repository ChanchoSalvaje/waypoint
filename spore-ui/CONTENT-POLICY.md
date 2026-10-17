# Content display and calendar ingestion policy

`content-policy.js` is shared by the structured commitment validator and the UI. Publisher/ingestion workers must apply the same policy before constructing brief text, saved notes, or commitments.

Normalize the exact event title with Unicode NFKC, lowercase, then remove every character except Unicode letters and numbers. Compare the **whole normalized result** against the set in `content-policy.js`. Do not substring-match, stem, infer a medical category, or suppress related events. Do not place excluded titles into skipped-item labels, receipts, or dashboard descriptions. This policy is an omission on future ingestion and a reversible display filter; never delete underlying calendar items, notes, or tasks.

Use `SporeContentPolicy.calendarItems(items)` before structured publication. `SporeCommitments.validatePublication()` rejects an excluded exact title as a final guard. Normalized exact standalone title lines are also omitted from note/detail presentation; substantive unrelated prose is preserved. Historical free-form paragraphs are not broadly rewritten based on title fragments.

The four navigation tabs are Today, Career, SAFOJ & Jung, and Writing Room. `personal` remains a valid stored section and task category. Old `#personal` links resolve to Today. Today retains all existing personal tasks/completion state and commitments, and displays personal notes in compact cards. No records are copied or migrated.

SAFOJ & Jung includes saved safoj records and records from other sections explicitly mentioning the whole words SAFOJ, Jung, or Jungian. This is a display grouping only. Saved meeting/reading paragraphs remain visible as context cards; they never become inferred tasks, deadlines, or new commitments. Dates and text come from saved records, not hardcoded event examples.
