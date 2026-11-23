const { list, schema, json } = require('./lib/airtable');
const { mapRecord } = require('./jobs');
const { windowStart } = require('../../public/waypoint-model');

const leadOutput = {
  sourceKey: 'Source Key',
  company: 'Company',
  role: 'Role',
  location: 'Location',
  sourceUrl: 'Posting URL',
  applyUrl: 'Apply URL',
  firstSeenAt: 'First Seen At',
  employerAt: 'Employer Timestamp',
  employerDateKind: 'Timestamp Kind',
  state: 'State',
  decision: "Tim's decision",
};

function latestHold(notes) {
  const lines = String(notes ?? '').split(/\r?\n/).reverse();
  for (const line of lines) {
    if (!line.trimStart().startsWith('{"waypoint_work_v2"')) continue;
    try {
      return JSON.parse(line).waypoint_work_v2;
    } catch {
      continue;
    }
  }
  return null;
}

function mapLead(row) {
  const output = Object.fromEntries(Object.entries(leadOutput).map(([key, name]) =>
    [key, row.fields[schema.leadFields[name]] ?? '']
  ));
  const hold = output.state === 'New' ? latestHold(row.fields[schema.leadFields['Review Notes']]) : null;
  return {
    ...output,
    leadRecordId: row.id,
    fit: row.fields[schema.leadFields['Fit Score']] ?? null,
    fitBasis: row.fields[schema.leadFields['Fit Basis']] || '',
    id: output.sourceKey || [output.company, output.role, row.createdTime].join("|"),
    firstSeenAt: output.firstSeenAt || row.createdTime,
    usesCreatedTime: !output.firstSeenAt,
    status: output.state === 'Ignored' ? 'Screened out' : hold?.status === 'hold' ? 'Needs verification' :
      output.state === 'New' ? 'Awaiting review' : output.state || 'Review status unknown',
    nextStep: typeof hold?.next_step === 'string' ? hold.next_step : '',
    kind: 'lead',
  };
}

function mapOpportunity(row) {
  const { id, company, role, stage, firstSeenAt, dateFound, employerPostedAt, link, applyLink, jobKey, workMode, fit, fitBasis } = mapRecord(row);
  return {
    id: stage === "Closed" ? jobKey || [company, role, dateFound].join("|") : id,
    company, role, stage, firstSeenAt, dateFound, fit, fitBasis,
    employerAt: employerPostedAt,
    employerDateKind: 'Employer publication',
    location: workMode,
    sourceKey: jobKey,
    sourceUrl: link,
    applyUrl: applyLink,
    status: stage || 'Stage unknown',
    kind: 'opportunity',
  };
}

function combinePosts(leads, opportunities) {
  const trackedKeys = new Set(opportunities.flatMap(item => item.sourceKey.split(/[\s|,;]+/).filter(Boolean)));
  return [...opportunities, ...leads.filter(item => !item.sourceKey || !trackedKeys.has(item.sourceKey))];
}

exports.handler = async () => {
  try {
    const start = windowStart(30);
    const midnight = `DATETIME_PARSE('${start}T00:00:00-07:00')`;
    const calendarDate = `DATETIME_PARSE('${start}T00:00:00Z')`;
    const leadDate = `IF({First Seen At},{First Seen At},CREATED_TIME())`;
    const [leadRows, opportunityRows] = await Promise.all([
      list(schema.leads, { filterByFormula: `NOT(IS_BEFORE(${leadDate},${midnight}))`,
        'fields[]':[...Object.values(leadOutput),'Fit Score','Fit Basis','Review Notes'] }),
      list(schema.opportunities, {
        filterByFormula: `IF({First Seen At},NOT(IS_BEFORE({First Seen At},${midnight})),AND({Date Found},NOT(IS_BEFORE({Date Found},${calendarDate}))))`,
        'fields[]':['Company','Role','Stage','First Seen At','Date Found','Employer Posted At','Link','Apply Link','Job Key','Work Mode','Fit Score','Fit Basis'],
      }),
    ]);
    return json(200, { posts: combinePosts(leadRows.map(mapLead), opportunityRows.map(mapOpportunity)) });
  } catch (error) {
    return json(error.statusCode || 502, {
      error: error.code ? error.message : 'Could not read recent posts from the tracker.',
      ...(error.code ? { code: error.code } : {}),
    });
  }
};

exports.combinePosts = combinePosts;
exports.mapLead = mapLead;
