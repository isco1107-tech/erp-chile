const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const repo = 'isco1107-tech/erp-chile';
const statePath = path.join('.vercel', 'desktop-build.json');

function credential() {
  const raw = execFileSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n', encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 15000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  });
  return raw.split('\n').find(line => line.startsWith('password='))?.slice(9);
}

async function main() {
  const token = credential();
  if (!token) throw new Error('No GitHub credential available');
  const api = async (endpoint, method = 'GET', body) => {
    const response = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Aether-build', 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: ${response.status}`);
    return response.json();
  };
  if (process.argv[2] === 'start') {
    const base = await api('git/ref/heads/main');
    const commit = await api(`git/commits/${base.object.sha}`);
    const files = ['desktop-client/src-tauri/tauri.conf.json', 'desktop-client/src-tauri/Cargo.toml', 'desktop-client/src-tauri/Cargo.lock', 'desktop-client/package.json', 'desktop-client/package-lock.json', '.github/workflows/desktop-release.yml'];
    const tree = await api('git/trees', 'POST', {
      base_tree: commit.tree.sha,
      tree: files.map(file => ({ path: file, mode: '100644', type: 'blob', content: fs.readFileSync(file, 'utf8') })),
    });
    const release = await api('git/commits', 'POST', {
      message: 'Build Aether desktop 0.1.1 installers', tree: tree.sha, parents: [base.object.sha],
    });
    const branch = `codex/desktop-release-${Date.now()}`;
    await api('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: release.sha });
    fs.mkdirSync('.vercel', { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({ branch, sha: release.sha }, null, 2));
    console.log(JSON.stringify({ branch, sha: release.sha }));
  } else {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    const runs = await api(`actions/runs?head_sha=${state.sha}`);
    const run = runs.workflow_runs.find(item => item.name === 'Desktop installers');
    if (!run) return console.log('Waiting for workflow');
    console.log(JSON.stringify({ id: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url }));
    const jobs = await api(`actions/runs/${run.id}/jobs`);
    console.log(JSON.stringify(jobs.jobs.map(job => ({ name: job.name, status: job.status, conclusion: job.conclusion, step: job.steps?.find(step => step.status === 'in_progress')?.name }))));
    if (process.argv[2] === 'download') {
      const artifacts = await api(`actions/runs/${run.id}/artifacts`);
      fs.mkdirSync('.vercel/desktop-artifacts', { recursive: true });
      for (const artifact of artifacts.artifacts) {
        const response = await fetch(artifact.archive_download_url, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Aether-build' } });
        if (!response.ok) throw new Error(`Artifact download: ${response.status}`);
        fs.writeFileSync(`.vercel/desktop-artifacts/${artifact.name}.zip`, Buffer.from(await response.arrayBuffer()));
        console.log(`Downloaded ${artifact.name}`);
      }
    }
    if (process.argv[2] === 'logs') {
      for (const job of jobs.jobs.filter(job => job.conclusion === 'failure')) {
        const response = await fetch(`https://api.github.com/repos/${repo}/actions/jobs/${job.id}/logs`, { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Aether-build' } });
        console.log((await response.text()).split('\n').slice(-45).join('\n'));
      }
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
