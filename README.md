# Waypoint

A personal dashboard for running a job search. It sits on top of an Airtable base and opens on what needs doing today, then the pipeline, then the full detail behind each opportunity: notes, prep, pay range and status. I can update a job from the page, and every change is written back to Airtable.

## How it's built

- Plain HTML, CSS and JavaScript on the front end, with no framework, so it stays easy to maintain.
- Netlify Functions read and write Airtable. The API token stays in Netlify's environment variables and never reaches the browser.
- A Netlify edge function puts the whole site behind a password.
- Writes are limited on purpose. One record at a time, five allowed fields, and notes that can only be added to, never overwritten.
- A background function checks public job boards (Greenhouse, Lever, Ashby) for companies on a watchlist and adds new matches for review.
- Tests cover the fit-read and notes-timeline display logic.

## How I built it

I'm not a software engineer. I worked out what Waypoint should do and how it should behave with Claude, then directed Claude Code to build it in small slices: read-only first, then writes, then deployment behind a password.

The rest of the system runs outside this repo. Scheduled AI tasks read job-alert email, score each role against my criteria, and draft research on the ones I flag. I make every decision and submit every application myself.
