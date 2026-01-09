const fs = require('fs');

// 1. The GraphQL Query to get public + private stats
const query = `
  query {
    viewer {
      login
      contributionsCollection {
        totalCommitContributions
        restrictedContributionsCount
        totalPullRequestContributions
        totalIssueContributions
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes {
          languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
            edges {
              size
              node {
                color
                name
              }
            }
          }
        }
      }
    }
  }
`;

// 2. Fetch Data
async function fetchStats() {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${process.env.STATS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  
  const json = await response.json();
  if (json.errors) {
    console.error(json.errors);
    process.exit(1);
  }
  return json.data.viewer;
}

// 3. Generate SVG
async function main() {
  const data = await fetchStats();
  
  // Calculate specific stats
  const totalCommits = data.contributionsCollection.totalCommitContributions + data.contributionsCollection.restrictedContributionsCount;
  const totalPRs = data.contributionsCollection.totalPullRequestContributions;
  const totalIssues = data.contributionsCollection.totalIssueContributions;
  const username = data.login;

  // Simple SVG Template (Tokyo Night Theme)
  const svg = `
  <svg width="400" height="180" viewBox="0 0 400 180" xmlns="http://www.w3.org/2000/svg" role="img">
    <title>Wesley's GitHub Stats</title>
    <style>
      .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #7aa2f7; }
      .stat { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #a9b1d6; }
      .value { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #c0caf5; }
      .bg { fill: #1a1b26; stroke: #414868; stroke-width: 1px; rx: 10px; }
      .icon { fill: #7aa2f7; }
    </style>
    <rect x="1" y="1" width="398" height="178" class="bg"/>
    
    <text x="25" y="35" class="header">${username}'s GitHub Stats</text>
    
    <g transform="translate(25, 65)">
        <path class="icon" d="M10.5 7.75a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zm1.43.75a4.002 4.002 0 01-7.86 0H.75a.75.75 0 110-1.5h3.32a4.001 4.001 0 017.86 0h3.32a.75.75 0 110 1.5h-3.32z"/>
        <text x="25" y="5" class="stat">Total Commits (Public + Private):</text>
        <text x="280" y="5" class="value" text-anchor="end">${totalCommits}</text>
    </g>

    <g transform="translate(25, 95)">
        <path class="icon" d="M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm2.25 7.5a.75.75 0 100 1.5.75.75 0 000-1.5zM1.5 10.75a2.25 2.25 0 114.5 0 2.25 2.25 0 01-4.5 0zm2.25-9a3.75 3.75 0 00-3.75 3.75v6a3.75 3.75 0 003.75 3.75h6a.75.75 0 000-1.5h-6a2.25 2.25 0 01-2.25-2.25v-6A2.25 2.25 0 013.75 3.75h.75a.75.75 0 000-1.5h-.75z"/>
        <text x="25" y="5" class="stat">Pull Requests:</text>
        <text x="280" y="5" class="value" text-anchor="end">${totalPRs}</text>
    </g>

    <g transform="translate(25, 125)">
        <path class="icon" d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"/>
        <text x="25" y="5" class="stat">Issues Opened:</text>
        <text x="280" y="5" class="value" text-anchor="end">${totalIssues}</text>
    </g>
  </svg>
  `;

  fs.writeFileSync('github-stats.svg', svg);
  console.log('Successfully generated github-stats.svg');
}

main();
