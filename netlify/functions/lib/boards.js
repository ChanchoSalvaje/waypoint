// Public, documented job-board GET APIs only. No applications, scraping or credentials.
const clean = value => String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ').trim();
const stamp = value => { if (value == null || value === '') return null; const d = new Date(value); return Number.isFinite(d.getTime()) ? d.toISOString() : null; };
function boardUrl(provider, board) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(board)) throw new Error('Invalid board identifier.');
  const slug = encodeURIComponent(board);
  if (provider === 'Greenhouse') return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
  if (provider === 'Lever') return `https://api.lever.co/v0/postings/${slug}?mode=json&limit=100&skip=0`;
  if (provider === 'Ashby') return `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
  throw new Error('Unsupported job-board provider.');
}
function normalize(provider, board, payload) {
  const rows = provider === 'Lever' ? payload : payload.jobs;
  if (!Array.isArray(rows)) throw new Error('Provider did not return a valid job list.');
  return rows.filter(j => provider !== 'Ashby' || j.isListed !== false).map(j => {
    if (provider === 'Greenhouse') return { key: `gh:${j.id}`, id: String(j.id), title: j.title, location: j.location?.name || '', url: j.absolute_url, apply: j.absolute_url, text: clean(j.content), timestamp: stamp(j.updated_at), timestampKind: 'Employer updated (not publication)' };
    if (provider === 'Lever') return { key: `lever:${j.id}`, id: String(j.id), title: j.text, location: j.categories?.location || j.workplaceType || '', url: j.hostedUrl, apply: j.applyUrl || j.hostedUrl, text: clean([j.descriptionPlain || j.description, ...(j.lists || []).map(x => `${x.text}\n${x.content}`), j.additionalPlain || j.additional, j.salaryDescriptionPlain || j.salaryDescription].filter(Boolean).join('\n')), timestamp: stamp(j.createdAt), timestampKind: j.createdAt ? 'Employer created' : 'Not supplied' };
    return { key: `ashby:${j.id || j.jobUrl?.split('/').filter(Boolean).pop()}`, id: String(j.id || j.jobUrl?.split('/').filter(Boolean).pop() || ''), title: j.title, location: `${j.location || ''}${j.workplaceType ? ' · ' + j.workplaceType : ''}`, url: j.jobUrl, apply: j.applyUrl || j.jobUrl, text: [j.descriptionPlain || clean(j.descriptionHtml), j.compensation?.compensationTierSummary || ''].filter(Boolean).join('\n'), timestamp: stamp(j.publishedAt), timestampKind: 'Employer last published' };
  });
}
async function fetchBoard(provider, board, fetcher = fetch) {
  let url = boardUrl(provider, board), data, jobs = [], seen = new Set();
  for (let page = 0; page < 100; page++) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', 'User-Agent': 'Waypoint/2 (personal career research)' } });
    if (!response.ok) throw new Error(`Board returned HTTP ${response.status}.`);
    data = await response.json(); const batch = normalize(provider, board, data);
    if (batch.some(j => !j.id || !j.title || !/^https:\/\//.test(j.url || ''))) throw new Error('Provider returned an invalid posting.');
    if (provider === 'Lever' && batch.length && batch.every(j => seen.has(j.id))) throw new Error('Board pagination repeated a page.');
    batch.forEach(j => seen.add(j.id)); jobs.push(...batch);
    if (provider === 'Greenhouse' && Number.isInteger(data.meta?.total) && data.meta.total !== jobs.length) throw new Error('Incomplete Greenhouse listing.');
    if (provider !== 'Lever' || batch.length < 100) return jobs;
    url = boardUrl(provider, board).replace('skip=0', `skip=${(page + 1) * 100}`);
  }
  throw new Error('Board pagination limit reached.');
}
// Broad candidate collection; qualification and final Fit belong to the research pass.
function candidate(title) { return /\b(ai|artificial intelligence|transformation|pmo|portfolio|program manag(?:er|ement)|strategic initiatives|enterprise applications|business systems|digital services|operational excellence)\b/i.test(title) && !/\b(intern|internship|counsel|attorney)\b/i.test(title); }
function planCandidates(jobs, knownIds, inboxKeys) {
  if (knownIds == null) return []; // Honest baseline, no old jobs described as new.
  return jobs.filter(j => !knownIds.has(j.id) && !inboxKeys.has(j.key) && candidate(j.title));
}
module.exports = { fetchBoard, normalize, boardUrl, candidate, planCandidates };
