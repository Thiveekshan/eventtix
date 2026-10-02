#!/usr/bin/env node
'use strict';

/**
 * Security gate.
 *
 * Reads the scan results written by scripts/security-scan.sh, and decides if the build may continue:
 *   - HIGH or CRITICAL findings that can be fixed          -> the pipeline FAILS
 *   - HIGH or CRITICAL findings with no fix available yet   -> reported, the pipeline continues
 *   - findings listed in security/accepted-risks.json       -> reported with their reason, the pipeline continues
 *   - a scan that did not produce a result                  -> the pipeline FAILS (no result is not "no problems")
 *
 * It prints a summary and writes security-reports/security-report.md, which Jenkins keeps.
 *
 * Run with:  node scripts/security-gate.js
 */

const fs = require('fs');
const path = require('path');

const REPORT_DIR = process.env.SECURITY_REPORT_DIR || 'security-reports';
const ACCEPTED_FILE = process.env.SECURITY_ACCEPTED_FILE || 'security/accepted-risks.json';
const TODAY = process.env.SECURITY_TODAY ? new Date(process.env.SECURITY_TODAY) : new Date();
const MAX_LISTED = 25;

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
const BLOCKING_SEVERITIES = new Set(['CRITICAL', 'HIGH']);

const REPORTS = [
  { file: 'npm-audit-backend.json', kind: 'npm', label: 'npm audit: backend dependencies' },
  { file: 'npm-audit-frontend.json', kind: 'npm', label: 'npm audit: frontend dependencies' },
  { file: 'trivy-image-backend.json', kind: 'trivy', label: 'Trivy: backend image' },
  { file: 'trivy-image-frontend.json', kind: 'trivy', label: 'Trivy: frontend image' },
  { file: 'trivy-fs.json', kind: 'trivy', label: 'Trivy: source code (secrets, Dockerfiles)' },
];

// ---------------------------------------------------------------------------
// Reading the scan results

function readJson(file) {
  const full = path.join(REPORT_DIR, file);
  if (!fs.existsSync(full)) {
    return { error: 'no result file was written' };
  }
  const text = fs.readFileSync(full, 'utf8').trim();
  if (!text) {
    return { error: 'the result file is empty (did the scan fail to run?)' };
  }
  try {
    return { data: JSON.parse(text) };
  } catch {
    return { error: 'the result file is not valid JSON' };
  }
}

function normaliseSeverity(value) {
  const upper = String(value || 'UNKNOWN').toUpperCase();
  return SEVERITIES.includes(upper) ? upper : 'UNKNOWN';
}

function fromTrivy(data, label) {
  const findings = [];
  for (const result of data.Results || []) {
    const target = result.Target;
    const osPackage = result.Class === 'os-pkgs';

    for (const v of result.Vulnerabilities || []) {
      findings.push({
        source: label,
        kind: 'vulnerability',
        id: v.VulnerabilityID,
        severity: normaliseSeverity(v.Severity),
        pkg: v.PkgName,
        installed: v.InstalledVersion || '',
        fixed: v.FixedVersion || '',
        title: v.Title || v.Description || '',
        url: v.PrimaryURL || '',
        target,
        hint: osPackage
          ? 'Rebuild the image from an updated base image (docker build --pull).'
          : 'Upgrade this package in package.json and the lockfile, or remove it from the image if it is not needed.',
      });
    }

    for (const m of result.Misconfigurations || []) {
      if (m.Status && m.Status !== 'FAIL') continue;
      findings.push({
        source: label,
        kind: 'misconfiguration',
        id: m.ID,
        severity: normaliseSeverity(m.Severity),
        pkg: '',
        title: m.Title || m.Message || '',
        target: `${target}${m.CauseMetadata && m.CauseMetadata.StartLine ? `:${m.CauseMetadata.StartLine}` : ''}`,
        hint: m.Resolution || m.Message || '',
      });
    }

    for (const s of result.Secrets || []) {
      findings.push({
        source: label,
        kind: 'secret',
        id: s.RuleID,
        severity: normaliseSeverity(s.Severity),
        pkg: '',
        title: s.Title || 'Possible secret in source code',
        target: `${target}:${s.StartLine}`,
        hint: 'Remove the secret from the code, rotate it, and load it from an environment variable.',
      });
    }
  }
  return findings;
}

function fromNpmAudit(data, label) {
  if (data.error) {
    // npm itself failed (for example the registry could not be reached).
    throw new Error(`npm audit reported an error: ${data.error.summary || data.error.code || 'unknown'}`);
  }
  const findings = [];
  const seen = new Set();
  for (const vuln of Object.values(data.vulnerabilities || {})) {
    // "via" holds the advisories themselves (objects) or just the name of another affected package (string).
    for (const via of vuln.via || []) {
      if (typeof via !== 'object') continue;
      const id = (via.url || '').split('/').pop() || via.title || vuln.name;
      const key = `${vuln.name}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      let fixed = '';
      if (vuln.fixAvailable && typeof vuln.fixAvailable === 'object') {
        fixed = `${vuln.fixAvailable.name}@${vuln.fixAvailable.version}`;
      } else if (vuln.fixAvailable === true) {
        fixed = 'run npm audit fix';
      }
      findings.push({
        source: label,
        kind: 'dependency',
        id,
        severity: normaliseSeverity(via.severity || vuln.severity),
        pkg: vuln.name,
        installed: vuln.range || '',
        fixed,
        title: via.title || '',
        url: via.url || '',
        target: label,
        hint: fixed ? `Update the dependency (${fixed}).` : 'No fix is available yet.',
      });
    }
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Documented exceptions

function loadAcceptedRisks() {
  const problems = [];
  if (!fs.existsSync(ACCEPTED_FILE)) {
    return { accepted: [], problems };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(ACCEPTED_FILE, 'utf8'));
  } catch {
    return { accepted: [], problems: [`${ACCEPTED_FILE} is not valid JSON`] };
  }
  const accepted = [];
  for (const [index, entry] of (parsed.accepted || []).entries()) {
    const where = `${ACCEPTED_FILE} entry ${index + 1}${entry.id ? ` (${entry.id})` : ''}`;
    if (!entry.id || !entry.reason || !entry.expires) {
      problems.push(`${where} must have "id", "reason" and "expires"`);
      continue;
    }
    const expires = new Date(`${entry.expires}T23:59:59Z`);
    if (Number.isNaN(expires.getTime())) {
      problems.push(`${where} has an invalid "expires" date (use YYYY-MM-DD)`);
      continue;
    }
    accepted.push({ ...entry, expired: expires < TODAY });
  }
  return { accepted, problems };
}

function findException(finding, accepted) {
  return accepted.find(
    (entry) =>
      entry.id.toLowerCase() === String(finding.id).toLowerCase() &&
      (!entry.package || entry.package === finding.pkg),
  );
}

// ---------------------------------------------------------------------------
// Main

function main() {
  const problems = [];
  const rows = [];
  const all = [];

  for (const report of REPORTS) {
    const read = readJson(report.file);
    if (read.error) {
      problems.push(`${report.label}: ${read.error}`);
      rows.push({ label: report.label, counts: null });
      continue;
    }
    let findings;
    try {
      findings = report.kind === 'npm' ? fromNpmAudit(read.data, report.label) : fromTrivy(read.data, report.label);
    } catch (err) {
      problems.push(`${report.label}: ${err.message}`);
      rows.push({ label: report.label, counts: null });
      continue;
    }
    const counts = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
    findings.forEach((f) => (counts[f.severity] += 1));
    rows.push({ label: report.label, counts });
    all.push(...findings);
  }

  const { accepted, problems: acceptedProblems } = loadAcceptedRisks();
  problems.push(...acceptedProblems);

  const blocking = [];
  const noFix = [];
  const accepted_ = [];
  const expiredUsed = [];

  for (const finding of all) {
    if (!BLOCKING_SEVERITIES.has(finding.severity)) continue;
    const exception = findException(finding, accepted);
    if (exception && !exception.expired) {
      accepted_.push({ finding, exception });
      continue;
    }
    if (exception && exception.expired) expiredUsed.push(finding.id);
    const hasNoFix = finding.kind === 'vulnerability' || finding.kind === 'dependency' ? !finding.fixed : false;
    (hasNoFix ? noFix : blocking).push(finding);
  }

  const order = (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity);
  blocking.sort(order);
  noFix.sort(order);

  const lines = [];
  const out = (text = '') => lines.push(text);

  out('Security scan summary');
  out('');
  out(`${'Scan'.padEnd(46)} ${'CRIT'.padStart(5)} ${'HIGH'.padStart(5)} ${'MED'.padStart(5)} ${'LOW'.padStart(5)}`);
  for (const row of rows) {
    if (!row.counts) {
      out(`${row.label.padEnd(46)}  NO RESULT`);
      continue;
    }
    const c = row.counts;
    out(
      `${row.label.padEnd(46)} ${String(c.CRITICAL).padStart(5)} ${String(c.HIGH).padStart(5)} ${String(c.MEDIUM).padStart(5)} ${String(c.LOW).padStart(5)}`,
    );
  }

  const describe = (f) => {
    const version = f.installed ? ` ${f.installed}` : '';
    const fix = f.fixed ? `  ->  fix: ${f.fixed}` : '';
    const subject = f.pkg ? `${f.pkg}${version}` : f.target;
    return `[${f.severity}] ${f.id}  ${subject}${fix}\n      ${f.title}\n      Where: ${f.target}\n      Action: ${f.hint}`;
  };

  if (blocking.length) {
    out('');
    out(`BLOCKING: ${blocking.length} high or critical finding(s) that must be fixed or formally accepted`);
    blocking.slice(0, MAX_LISTED).forEach((f) => out(`  ${describe(f)}`));
    if (blocking.length > MAX_LISTED) out(`  ... and ${blocking.length - MAX_LISTED} more (see the JSON reports)`);
  }
  if (noFix.length) {
    out('');
    out(`MONITORED: ${noFix.length} high or critical finding(s) with no fix available yet (not blocking)`);
    noFix.slice(0, MAX_LISTED).forEach((f) => out(`  [${f.severity}] ${f.id}  ${f.pkg} ${f.installed}  (${f.source})`));
  }
  if (accepted_.length) {
    out('');
    out(`ACCEPTED RISKS: ${accepted_.length} finding(s) covered by security/accepted-risks.json`);
    accepted_.forEach(({ finding, exception }) => {
      out(`  [${finding.severity}] ${finding.id}  ${finding.pkg || finding.target}`);
      out(`      Reason: ${exception.reason}`);
      if (exception.mitigation) out(`      Mitigation: ${exception.mitigation}`);
      out(`      Expires: ${exception.expires}`);
    });
  }
  if (expiredUsed.length) {
    out('');
    out(`EXPIRED EXCEPTIONS (no longer applied): ${[...new Set(expiredUsed)].join(', ')}`);
  }
  if (problems.length) {
    out('');
    out('PROBLEMS:');
    problems.forEach((p) => out(`  - ${p}`));
  }

  const failed = blocking.length > 0 || problems.length > 0;
  out('');
  out(failed ? 'SECURITY GATE FAILED' : 'SECURITY GATE PASSED');

  console.log(lines.join('\n'));
  writeMarkdown({ rows, blocking, noFix, accepted: accepted_, problems, failed });
  process.exit(failed ? 1 : 0);
}

function writeMarkdown({ rows, blocking, noFix, accepted, problems, failed }) {
  const md = [];
  md.push('# Security report', '');
  md.push(`Result: **${failed ? 'FAILED' : 'PASSED'}**`, '');
  md.push('## Findings by scan', '');
  md.push('| Scan | Critical | High | Medium | Low |', '| --- | ---: | ---: | ---: | ---: |');
  for (const row of rows) {
    md.push(
      row.counts
        ? `| ${row.label} | ${row.counts.CRITICAL} | ${row.counts.HIGH} | ${row.counts.MEDIUM} | ${row.counts.LOW} |`
        : `| ${row.label} | no result | | | |`,
    );
  }

  const table = (title, items, withAction) => {
    if (!items.length) return;
    md.push('', `## ${title}`, '');
    md.push(
      withAction
        ? '| Severity | Id | Where | Package | Fix | What it is | Action |'
        : '| Severity | Id | Where | Package | Fix | What it is |',
      withAction ? '| --- | --- | --- | --- | --- | --- | --- |' : '| --- | --- | --- | --- | --- | --- |',
    );
    for (const f of items) {
      const cells = [f.severity, f.id, f.target, `${f.pkg} ${f.installed || ''}`.trim(), f.fixed || 'none yet', f.title];
      if (withAction) cells.push(f.hint);
      md.push(`| ${cells.map((c) => String(c).replace(/\|/g, '/').replace(/\n/g, ' ')).join(' | ')} |`);
    }
  };
  table('Blocking findings (must be fixed or accepted)', blocking, true);
  table('High or critical findings with no fix available (monitored)', noFix, false);

  if (accepted.length) {
    md.push('', '## Accepted risks', '', '| Id | Package | Reason | Mitigation | Expires |', '| --- | --- | --- | --- | --- |');
    for (const { finding, exception } of accepted) {
      md.push(
        `| ${finding.id} | ${finding.pkg || finding.target} | ${exception.reason} | ${exception.mitigation || ''} | ${exception.expires} |`,
      );
    }
  }
  if (problems.length) {
    md.push('', '## Problems', '', ...problems.map((p) => `- ${p}`));
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(REPORT_DIR, 'security-report.md'), `${md.join('\n')}\n`);
}

main();
