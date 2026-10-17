# Spore presentation repair — local review only

The connected application keeps its existing authentication SDK, bridge, HTML login shell, security headers and Airtable integration. Only the presentation section of `public/spore/app.js` and its CSS are rebuilt. No deployment or push is part of this change.

## Build and check

From the checkout:

```
python3 spore-ui/build.py --preview-dir /absolute/local/preview-directory
node --test spore-ui/*.test.cjs tests/spore-*.test.cjs
python3 -m http.server 8769 --bind 127.0.0.1 --directory /absolute/local/preview-directory
```

`build.py` preserves the existing SDK prefix and bridge suffix byte-for-byte. It uses marked boundaries on subsequent builds. Do not run the older sibling `spore-connected/build.py`; that regenerates from an earlier staging prototype.

The separate synthetic preview uses an in-memory adapter and `connect-src 'none'`. It cannot contact Supabase or Airtable. `preview-sdk.js`, `preview-checks.js`, review controls and example records never enter the production bundle. Reload resets preview data. Production uses the existing data adapter without modification.

## Changes

- Seven curated works selected deterministically from the Arizona calendar date plus section. Every section changes daily, repeats after seven days, and differs from the other sections on a given day. No random or cross-device state is required.
- Today has a visible compact art feature, with optional expanded tarot reflection and historical story. Artwork is explicitly a visual companion, not falsely labelled as a tarot card. This removes the old four-of-six missing-card-image problem without inventing historic card imagery.
- Artist/source credits, descriptive alt text and original section-specific reflection captions. Image errors and missing catalog entries show a labelled original symbolic illustration; no broken-image icon or silent unrelated museum substitute.
- Date-only refresh at Arizona midnight, browser focus and visibility return. It replaces only presentation nodes. Note input/caret, planner input and task editor stay mounted; art expansion refresh waits until focus leaves it. No record write or authentication call is added.
- Safe small text renderer for paragraphs, headings, lists and HTTPS source links. It uses text nodes, never HTML injection. Exact source URLs stay in anchor targets; existing named links retain their names. Bare email/calendar URLs become Email source/Calendar event; other links show their hostname. Stored note/brief bodies remain unchanged.
- Flexible mobile layout, short commitment dates, wrapping long strings, contained text blocks and no clipped/truncated prose. Source bodies, note forms and expanded readings remain fully available.
- Updated SAFOJ/Writing introductory copy. Existing palette and task operations remain intact.

## Provenance

Existing reused assets retain their original credit/source metadata:

- Anna Atkins, *Polysiphonia violacea*, c.1853 — Met collection 291509.
- Albrecht Dürer, *The Rhinoceros*, 1515 — National Gallery of Art 47903.
- William Blake, *Angel of the Revelation*, c.1803–5 — Met collection 340852.

Four additional JPEGs were fetched from the Met's Open Access API on 2026-10-17 UTC. Each adjacent JSON records `isPublicDomain: true`, source image URL, object URL, artist and date. Pixels were inspected. No paid or generated image assets are required:

- Vincent van Gogh, *Cypresses*, 1889 — https://www.metmuseum.org/art/collection/search/437980
- Johannes Vermeer, *Young Woman with a Water Pitcher*, ca.1662 — https://www.metmuseum.org/art/collection/search/437881
- Katsushika Hokusai, *The Great Wave*, ca.1830–32 — https://www.metmuseum.org/art/collection/search/39799
- Thomas Cole, *The Oxbow*, 1836 — https://www.metmuseum.org/art/collection/search/10497

The Met releases eligible Open Access images under CC0: https://www.metmuseum.org/hubs/open-access . Images are embedded data URLs; the app does not make external image requests. Credits link to collection records. Captions are original prompts, not purported artist intentions. The fallback illustrations are existing original Spore SVG artwork.

## Review scope

The original production layout reproduced horizontal overflow and text escaping brief/commitment bounds with privacy-safe long content at a narrow viewport. The repair is tested with the same content shapes, every section, eight successive art days, image decode, expanded readings, missing/corrupt assets, draft/caret/focus preservation and 200% text. Browser geometry checks include text ranges and exclude the intentionally hidden bodies of closed disclosures. These are desktop Chrome responsive checks, not a claim of testing a physical Android device.

Before publication, review the synthetic screenshots and approve this presentation-only change. No database migration, new account, permission change, service subscription or credential configuration is needed.
