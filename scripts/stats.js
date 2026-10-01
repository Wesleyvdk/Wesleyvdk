const fs = require('node:fs');

const user = process.env.STATS_USER || 'Wesleyvdk';
const organizations = [...new Set((process.env.STATS_ORGS || 'Aylian-Studios')
  .split(',').map(name => name.trim()).filter(Boolean))];
const includePrivate = process.env.STATS_INCLUDE_PRIVATE !== 'false';
const token = process.env.STATS_TOKEN || process.env.GH_TOKEN;
const colors = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Rust: '#dea584', Python: '#3572A5',
  HTML: '#e34c26', CSS: '#563d7c', Java: '#b07219', 'C#': '#178600',
  'C++': '#f34b7d', C: '#555555', Lua: '#000080', Svelte: '#ff3e00',
  Kotlin: '#A97BFF', Shell: '#89e051', Yacc: '#4B6C4B', EJS: '#a91e50',
  'Game Maker Language': '#71b417', Other: '#7f8caa',
};

function xml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]);
}

async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    // API paths and response bodies may identify private repositories; don't log them.
    throw new Error(`GitHub API returned HTTP ${response.status}. Check STATS_TOKEN access and rate limits.`);
  }
  return response.json();
}

async function repositories(path) {
  const result = [];
  for (let page = 1; ; page++) {
    const batch = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    result.push(...batch);
    if (batch.length < 100) return result;
  }
}

async function collectRepositories() {
  const identity = await api('/user');
  if (includePrivate && identity.login.toLowerCase() !== user.toLowerCase()) {
    throw new Error(`STATS_TOKEN must belong to ${user} to include their private repositories.`);
  }
  const personal = includePrivate
    ? await repositories('/user/repos?affiliation=owner')
    : await repositories(`/users/${encodeURIComponent(user)}/repos`);
  const all = personal.filter(repo => repo.owner.login.toLowerCase() === user.toLowerCase());

  for (const organization of organizations) {
    const path = `/orgs/${encodeURIComponent(organization)}`;
    const owned = await repositories(`${path}/repos?type=${includePrivate ? 'all' : 'public'}`);
    if (includePrivate) {
      const metadata = await api(path);
      const privateCount = owned.filter(repo => repo.private).length;
      if (privateCount === 0 || (metadata.total_private_repos != null && privateCount < metadata.total_private_repos)) {
        throw new Error(`STATS_TOKEN cannot read all private repositories in ${organization}. Grant repository access before publishing combined statistics.`);
      }
    }
    all.push(...owned);
  }

  return [...new Map(all.filter(repo => !repo.fork && !repo.archived && (includePrivate || !repo.private))
    .map(repo => [repo.id, repo])).values()];
}

async function languageTotals(repos) {
  const totals = new Map();
  // A small worker pool avoids flooding the API on large accounts.
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, repos.length) }, async () => {
    while (next < repos.length) {
      const repo = repos[next++];
      const languages = await api(`/repos/${repo.full_name}/languages`);
      for (const [name, bytes] of Object.entries(languages)) {
        if (Number.isFinite(bytes) && bytes > 0) totals.set(name, (totals.get(name) || 0) + bytes);
      }
    }
  }));
  return totals;
}

function chart(totals) {
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, bytes]) => sum + bytes, 0);
  if (!total) throw new Error('No language data was returned; keeping the existing chart.');
  const displayed = sorted.slice(0, 10);
  const remainder = sorted.slice(10).reduce((sum, [, bytes]) => sum + bytes, 0);
  if (remainder) displayed.push(['Other', remainder]);

  const width = 400;
  const trackWidth = 340;
  const firstRow = 90;
  const footerY = firstRow + displayed.length * 40;
  const height = footerY + 64;
  const scope = [user, ...organizations].join(' + ');
  const visibility = includePrivate ? 'public + private' : 'public only';
  const date = new Date().toISOString().slice(0, 10);
  const rows = displayed.map(([name, bytes], index) => {
    const percent = bytes / total * 100;
    const barWidth = Math.min(trackWidth, Math.max(0, trackWidth * bytes / total));
    const color = colors[name] || '#8b9bc5';
    return `<g transform="translate(30, ${firstRow + index * 40})">
      <text class="language" x="0" y="0">${xml(name)}</text>
      <text class="percent" x="${trackWidth}" y="0" text-anchor="end">${percent.toFixed(1)}%</text>
      <rect x="0" y="9" width="${trackWidth}" height="8" rx="4" fill="#292e42"/>
      <rect x="0" y="9" width="${barWidth.toFixed(2)}" height="8" rx="4" fill="${color}"/>
    </g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Languages across ${xml(scope)}</title>
  <desc id="description">Combined repository code sizes, ${visibility}. Forks and archived repositories are excluded. Percentages measure bytes, not expertise or personal contributions.</desc>
  <style>
    text { font-family: 'Segoe UI', Ubuntu, sans-serif; }
    .heading { font-size: 18px; font-weight: 600; fill: #7aa2f7; }
    .language { font-size: 13px; font-weight: 600; fill: #c0caf5; }
    .percent, .note { font-size: 12px; fill: #9aa5ce; }
  </style>
  <rect x="1" y="1" width="398" height="${height - 2}" rx="12" fill="#1a1b26" stroke="#414868"/>
  <text class="heading" x="200" y="30" text-anchor="middle">Code by language</text>
  <text class="note" x="200" y="51" text-anchor="middle">${xml(scope)}</text>
  ${rows}
  <text class="note" x="30" y="${footerY + 6}">Repository bytes · ${visibility}</text>
  <text class="note" x="30" y="${footerY + 25}">Excludes forks and archived repositories</text>
  <text class="note" x="30" y="${footerY + 44}">Updated ${date}</text>
</svg>\n`;
}

async function main() {
  if (!token) throw new Error('Set STATS_TOKEN or GH_TOKEN with access to the selected repositories.');
  const repos = await collectRepositories();
  const svg = chart(await languageTotals(repos));
  fs.writeFileSync('github-stats.svg', svg);
  console.log('Updated aggregate language chart for the personal account and configured organizations.');
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
