const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const repo = 'isco1107-tech/erp-chile';
const workflow = 'desktop-release.yml';
const statePath = path.join('.vercel', 'desktop-build.json');

function gh(args, options = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...options });
}

function api(endpoint, method = 'GET', body) {
  const args = ['api', `repos/${repo}/${endpoint}`, '--method', method];
  if (body) args.push('--input', '-');
  const result = gh(args, body ? { input: JSON.stringify(body) } : {});
  return result ? JSON.parse(result) : undefined;
}

function main() {
  const command = process.argv[2];
  if (!['start', 'status', 'download', 'logs'].includes(command)) throw new Error('Usage: desktop-ci.cjs start [--edition=erp|pos] | status | download | logs');
  if (command === 'start') {
    const edition = process.argv.find(arg => arg.startsWith('--edition='))?.slice(10) ?? 'erp';
    if (!['erp', 'pos'].includes(edition)) throw new Error('Edition must be erp or pos');
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'desktop-client', '.github/workflows/desktop-release.yml'], { encoding: 'utf8' });
    if (dirty.trim()) throw new Error('Commit desktop sources and workflow before building. The exact committed source is required.');
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    // Build the exact source commit; never overlay a hand-picked file subset.
    api(`git/commits/${sha}`);
    const branch = `codex/desktop-release-${edition}-${Date.now()}`;
    api('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha });
    api(`actions/workflows/${workflow}/dispatches`, 'POST', { ref: branch, inputs: { edition } });
    fs.mkdirSync('.vercel', { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ branch, sha, edition }, null, 2) + '\n');
    console.log(JSON.stringify({ branch, sha, edition }));
    return;
  }

  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (!['erp', 'pos'].includes(state.edition) || !/^[0-9a-f]{40}$/.test(state.sha)) throw new Error('Start a new build with the current release helper');
  const runs = api(`actions/workflows/${workflow}/runs?branch=${encodeURIComponent(state.branch)}&event=workflow_dispatch&per_page=10`);
  const run = runs.workflow_runs.find(item => item.head_sha === state.sha);
  if (!run) return console.log('Waiting for workflow');
  console.log(JSON.stringify({ id: run.id, edition: state.edition, sha: run.head_sha, status: run.status, conclusion: run.conclusion, url: run.html_url }));
  const jobs = api(`actions/runs/${run.id}/jobs`);
  console.log(JSON.stringify(jobs.jobs.map(job => ({ name: job.name, status: job.status, conclusion: job.conclusion, step: job.steps?.find(step => step.status === 'in_progress')?.name }))));

  if (command === 'download') {
    if (run.status !== 'completed' || run.conclusion !== 'success') throw new Error('All installer jobs must succeed before downloading');
    const artifacts = api(`actions/runs/${run.id}/artifacts`);
    for (const target of ['windows', 'linux', 'macos-arm64', 'macos-x64']) {
      const name = `aether-${state.edition}-${target}`;
      if (!artifacts.artifacts.some(artifact => artifact.name === name && !artifact.expired)) throw new Error(`Missing successful artifact: ${name}`);
    }
    const directory = path.join('.vercel', 'desktop-artifacts', state.sha, state.edition);
    fs.mkdirSync(directory, { recursive: true });
    gh(['run', 'download', String(run.id), '--repo', repo, '--dir', directory]);
    fs.writeFileSync(statePath, JSON.stringify({ ...state, runId: run.id, artifactDirectory: directory }, null, 2) + '\n');
    console.log(`Verified build downloaded to ${directory}`);
  }
  if (command === 'logs') {
    console.log(gh(['run', 'view', String(run.id), '--repo', repo, '--log-failed'], { maxBuffer: 10 * 1024 * 1024 }));
  }
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
