# Waypoint — North Star (future vision, PARKED)

> The aspirational richer layout for Waypoint, from the "Opportunity Compass" concept.
> This is a design goal to build **toward**, phase by phase — NOT current scope, NOT started.
> The live Waypoint app (`waypoint-hq`) is the real, working version. This is where it could grow.

## What it is
A concept dashboard ("Opportunity Compass") reimagining Waypoint as a fuller command center.
Important: it's a **painted concept image, not running software** — a visual/structural target, not a shortcut.
Concept tagline: "Clarity is the quietest form of confidence." Uses the same DESIGN.md palette (on-brand).

## Layout captured from the concept
- **Left nav rail:** Dashboard · Opportunities · Applications · Companies · Prep · Notes · Settings. Deep Mesquite Green, with a desert/saguaro motif.
- **Top stat cards (6):** Target Companies · Active Applications · Interviews · Networking Conversations · Follow-Ups Due · Offers/Final Round — each with a small trend ("+3 this month").
- **Application Pipeline funnel:** Discovered → Researched → Applied → Screening → Interviewing → Final Round → Offer, with counts + conversion % between stages and an overall conversion rate.
- **Activity Trends chart:** Applications vs. Conversations over the last 8 weeks (line chart).
- **Active Opportunities table:** role/company with **company logos**, location, salary, status badge, fit score.
- **Preparation Tasks list:** dated to-dos (tailor resume, follow up with recruiter, prep STAR stories, comp check).
- **Right detail panel ("Selected Opportunity"):** Company Snapshot · Role Highlights · Interview Prep · Contacts/Networking · Next Best Action — a deeper version of today's drill-down.

## Honest gaps to close before building it
- **Real work, not a weekend:** new multi-panel layout, two charts (funnel + trends), and **company-logo fetching** per opportunity (needs a logo source/API — flag ToS + attribution before building).
- **New data:** several tiles imply things we don't track yet (Networking Conversations, Follow-Ups Due, a distinct Target-Companies count) — we'd add Airtable fields or derive them.
- **Analytics need volume:** conversion rates and fit-trend charts only become meaningful with ~15+ applications.

## How we'd approach it (when the time comes)
Phase it, like everything. Rough order of thin slices:
1. Add the pipeline funnel + activity-trend chart to the existing dashboard.
2. Build the right-hand "Selected Opportunity" detail panel.
3. Add company logos (after resolving the logo source + ToS).
4. Add the networking / follow-up tiles (with their new fields).

This is a "someday, deliberately" build — not a reason to stop using the working app now.
