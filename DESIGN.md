# Waypoint — Design System (v1)

> The visual identity for the Waypoint app. The design counterpart to `CLAUDE.md`.
> Claude Code and future sessions read this so the look stays consistent — no re-guessing colors.
> Status: v1, derived from Tim's personality palette. Living doc — update as decisions finalize.

## Source & intent
The palette is personality-derived (from Tim's "Tim's Palette" work), not a designer default.
Voice: grounded, considered, warm-but-not-flashy. Tagline / headline: **"Here is the way, Tim."**
North Star (parked, not built): the richer "Opportunity Compass" dashboard layout — logos per
opportunity, funnel, trend charts. This doc is the identity; that layout is a future build.

## The personality palette (meaning → hex)
| Role (meaning)        | Name               | Hex      |
|-----------------------|--------------------|----------|
| Core / Ground         | Deep Mesquite Green| `#2F4A3A`|
| Creative Fire         | Ember Copper       | `#B85C38`|
| Depth / Reflection    | Midnight Indigo    | `#25283D`|
| Clarity / Truth       | Warm Parchment     | `#E8DDC7`|
| Desert Soul           | Sonoran Clay       | `#A66A4C`|
| Precision / Technology| Soft Steel Blue    | `#6F8796`|
| Compassion / Humanity | Muted Rosewood     | `#8B4F55`|
| Quiet Light           | Antique Gold       | `#C7A45A`|

## Functional mapping (UI role → hex)
A dashboard uses ~1 accent + 1–2 structural + neutrals. Meaning colors map to roles as:
- **Accent / primary action / highlights:** Ember Copper `#B85C38` (soft tint `#F5E9E1`)
- **Ground / nav / header band:** Deep Mesquite Green `#2F4A3A`
- **Text / ink:** Midnight Indigo `#25283D`
- **Secondary / info / links:** Soft Steel Blue `#6F8796`
- **Page background:** Warm Parchment, lightened `#F3EEE4`
- **Cards / surface:** warm white `#FCFAF6`
- **Hairlines / borders:** `#E3DCCF`
- **Muted text:** `#6B6459`

## Stage badges (single-select → hex)
Badge text is light `#FBF7F0`, except **Offer** which uses dark `#25283D`.
- Saved → `#6F8796` (Soft Steel Blue — neutral, early)
- Tailoring → `#B85C38` (Ember Copper — active work)
- Ready to apply → `#A66A4C` (Sonoran Clay — warm, near-ready)
- Applied → `#25283D` (Midnight Indigo — committed)
- Screening → `#2F4A3A` (Mesquite Green — progressing)
- Interviewing → `#8B4F55` (Muted Rosewood — human, high-touch)
- Offer → `#C7A45A` (Antique Gold — the "quiet light" / achievement)
- Closed → `#9A958C` (muted clay-gray)

## Logo
- **Mark:** 8-point compass star (a waypoint marker). Ember Copper `#B85C38` with a small light center dot.
  - SVG path: `M50 16 L57.8 42.2 L84 50 L57.8 57.8 L50 84 L42.2 57.8 L16 50 L42.2 42.2 Z`
- **Wordmark:** "Waypoint", weight 500, sentence case. Midnight Indigo on light surfaces; Warm Parchment on dark.
- **Eyebrow:** "COMMAND CENTER", letter-spaced, small. Soft Steel Blue on light; Antique Gold on dark.
- **Lockup:** horizontal (mark left of wordmark). Verified to work on both light (parchment) and dark (mesquite) surfaces.

## Favicon
Compass star in Ember Copper on a Deep Mesquite Green rounded tile:
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#2F4A3A"/><path d="M50 16 L57.8 42.2 L84 50 L57.8 57.8 L50 84 L42.2 57.8 L16 50 L42.2 42.2 Z" fill="#B85C38"/><circle cx="50" cy="50" r="4" fill="#F3EEE4"/></svg>`
Plus 32×32 and 180×180 PNG fallbacks in `public/`.

## Typography & rules
- Clean sans (system / Anthropic Sans). Two weights: 400 regular, 500 medium.
- Sentence case everywhere (no ALL CAPS except the small letter-spaced eyebrow).
- Keep contrast legible: text on parchment = indigo; light text on dark badges; dark text on gold.

## Change log
- v1 (2026-07-06): initial identity — personality palette adopted, functional mapping + stage colors set, compass-star logo + favicon defined. Retired the earlier guessed burnt-orange accent (`#C2571A`) in favor of Ember Copper.
- v1.1 (2026-07-06): visual-identity pass deployed to production (`waypoint-hq`) — palette applied, favicon live. Header refined into the full logo lockup (compass-star mark + "Waypoint" wordmark + "COMMAND CENTER" eyebrow), sized smaller than the "Here is the way, Tim." greeting so the two don't compete.
