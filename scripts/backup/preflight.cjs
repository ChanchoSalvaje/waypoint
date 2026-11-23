const policy = require('../../config/backup-policy.json');

function preflight(measured, rules = policy) {
  const failures = [];
  const number = (name) => {
    const value = measured[name];
    if (!Number.isFinite(value) || value < 0) { failures.push(`Missing or invalid measurement: ${name}`); return null; }
    return value;
  };
  const archive = number('archiveBytes'), used = number('accountStorageUsedBytes');
  const allowance = number('accountStorageAllowanceBytes'), managed = number('managedStorageBytes');
  const database = number('databaseBytes'), transfer = number('monthlyTransferBytes');
  const computeRemaining = number('includedComputeRemainingUsd'), runCost = number('estimatedRunCostUsd');
  const dailyRuns = number('runsToday'), copies = number('retainedCopies'), runtime = number('runtimeSeconds');
  for (const [name, message] of [
    ['privateDestinationVerified', 'Private destination has not been verified.'],
    ['encryptionVerified', 'Encryption has not been verified.'],
    ['paidUsageBlockedVerified', 'Provider hard spending block has not been verified.'],
    ['freshUsageVerified', 'Shared account usage has not been freshly verified.'],
    ['copyIntegrityVerified', 'Archive integrity has not been verified.'],
  ]) if (measured[name] !== true) failures.push(message);
  if (archive !== null && archive > rules.maximumBackupBytes) failures.push('Archive exceeds the per-copy cap.');
  if (archive === 0) failures.push('An empty archive is not a backup.');
  if (archive !== null && used !== null && allowance !== null && used + archive + rules.minimumUnallocatedStorageBytes > allowance) failures.push('Upload would consume the shared storage reserve.');
  if (archive !== null && managed !== null && managed + archive > rules.maximumManagedStorageBytes) failures.push('Managed storage cap would be exceeded during upload overlap.');
  if (archive !== null && archive * rules.minimumRetainedCopies > rules.maximumManagedStorageBytes) failures.push('Minimum recovery copies cannot fit.');
  if (database !== null && database > rules.maximumDatabaseBytes) failures.push('Database exceeds the operating cap.');
  if (transfer !== null && transfer > rules.maximumMonthlyTransferBytes) failures.push('Projected monthly transfer exceeds the operating cap.');
  if (computeRemaining !== null && runCost !== null && runCost > computeRemaining) failures.push('Insufficient included compute remains.');
  if (dailyRuns !== null && (!Number.isInteger(dailyRuns) || dailyRuns >= rules.maximumRunsPerDay)) failures.push('Daily run limit reached or invalid.');
  if (copies !== null && (!Number.isInteger(copies) || copies > rules.maximumRetainedCopies)) failures.push('Retention count exceeds policy or is invalid.');
  if (runtime !== null && runtime > rules.jobTimeoutMinutes * 60) failures.push('Runtime cap exceeded.');
  return { ok: failures.length === 0, failures };
}

if (require.main === module) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => input += chunk);
  process.stdin.on('end', () => {
    try {
      const result = preflight(JSON.parse(input));
      process.stdout.write(JSON.stringify(result) + '\n');
      if (!result.ok) process.exitCode = 1;
    } catch { process.stderr.write('Expected a measurement JSON object on stdin.\n'); process.exitCode = 1; }
  });
}
module.exports = { preflight };
