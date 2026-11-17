const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../public/waypoint-model');

test('opportunity filters distinguish undecided, pursued, submitted, and incomplete research', () => {
  const jobs = [
    { id: 'undecided', stage: 'Saved', researchStatus: 'Ready', fit: 5, dateFound: '2026-11-15' },
    { id: 'pursuing', stage: 'Saved', pursue: true, researchStatus: 'Partial', dateFound: '2026-11-17' },
    { id: 'review', stage: 'Tailoring–in review', dateFound: '2026-11-16' },
    { id: 'applied', stage: 'Applied', researchStatus: 'Partial', suggestedUpdate: 'TYPE: interview', dateFound: '2026-11-14' },
    { id: 'closed', stage: 'Closed', dateFound: '2026-11-17' },
  ];
  const rows = (view, sort = 'newest', query = '') => M.opportunityRows(jobs, { view, sort, query }).map(j => j.id);
  assert.deepEqual(rows('decide'), ['undecided']);
  assert.deepEqual(rows('preparing'), ['pursuing', 'review']);
  assert.deepEqual(rows('applied'), ['applied']);
  assert.deepEqual(rows('research'), ['pursuing', 'review']);
  assert.deepEqual(rows('active'), ['pursuing', 'review', 'undecided', 'applied']);
  assert.equal(rows('active', 'priority')[0], 'applied');
  assert.equal(rows('active', 'fit')[0], 'undecided');
  assert.deepEqual(rows('active', 'newest', '   '), rows('active'));
});

test('new posts include tracked and screened-out discoveries by Arizona calendar day', () => {
  const now = new Date('2026-11-17T22:15:00Z');
  const items = [
    { id: 'legacy', stage: 'Closed', dateFound: '2026-11-17' },
    { id: 'lateYesterday', firstSeenAt: '2026-11-17T06:59:00Z' },
    { id: 'ignored', state: 'Ignored', firstSeenAt: '2026-11-17T07:00:00Z' },
    { id: 'latest', firstSeenAt: '2026-11-17T22:00:00Z', employerAt: '2026-10-15T00:00:00Z' },
    { id: 'future', firstSeenAt: '2026-11-17T23:00:00Z' },
    { id: 'undated' },
  ];
  assert.deepEqual(M.recentPosts(items, 1, now).map(item => item.id), ['latest', 'ignored', 'legacy']);
  assert.deepEqual(M.recentPosts(items, 7, now).map(item => item.id), ['latest', 'ignored', 'legacy', 'lateYesterday']);
  assert.equal(M.windowStart(30, now), '2026-10-19');
});

test('new posts combine exact source matches and retain distinct requisitions', () => {
  const { combinePosts, mapLead } = require('../netlify/functions/new-posts');
  const { schema } = require('../netlify/functions/lib/airtable');
  const lead = mapLead({ id: 'lead', createdTime: '2026-11-17T22:00:00Z', fields: {
    [schema.leadFields['Source Key']]: 'gh:100',
    [schema.leadFields.State]: 'New',
    [schema.leadFields['Review Notes']]: 'Old note\n{"waypoint_work_v2":{"status":"hold","next_step":"Confirm Tucson eligibility."}}\n{"waypoint_work_v2":bad}',
  } });
  const distinct = { ...lead, id: 'distinct', sourceKey: 'gh:1000' };
  const tracked = { id: 'tracked', sourceKey: 'li:1 | gh:100' };
  assert.equal(lead.firstSeenAt, '2026-11-17T22:00:00Z');
  assert.equal(lead.usesCreatedTime, true);
  assert.equal(lead.status, 'Needs verification');
  assert.equal(lead.nextStep, 'Confirm Tucson eligibility.');
  assert.deepEqual(combinePosts([lead, distinct], [tracked]).map(item => item.id), ['tracked', 'distinct']);
});
