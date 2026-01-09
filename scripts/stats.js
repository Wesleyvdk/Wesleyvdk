const fs = require('fs');

// 1. Query to fetch repositories and their languages
const query = `
  query {
    viewer {
      login
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: UPDATED_AT, direction: DESC}) {
        nodes {
          name
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

async function main() {
  const data = await fetchStats();
  const repoNodes = data.repositories.nodes;
  
  // 2. Aggregate Language Data
  const languageStats = {};
  let totalSize = 0;

  repoNodes.forEach(repo => {
    if (repo.languages && repo.languages.edges) {
      repo.languages.edges.forEach(edge => {
        const langName = edge.node.name;
        const langColor = edge.node.color || '#ccc';
        const langSize = edge.size;

        if (!languageStats[langName]) {
          languageStats[langName] = { size: 0, color: langColor };
        }
        languageStats[langName].size += langSize;
        totalSize += langSize;
      });
    }
  });

  // 3. Convert to Array, Sort, and Calculate Percentage
  let sortedLangs = Object.entries(languageStats)
    .map(([name, data]) => ({
      name,
      color: data.color,
      size: data.size,
      percent: (data.size / totalSize) * 100
    }))
    .sort((a, b) => b.size - a.size)
    .slice(0, 10); // Take top 5

  // 4. Generate SVG
  // Height = Header + (5 languages * 35px spacing) + padding
  const svgHeight = 60 + (sortedLangs.length * 40); 
  
  let svgContent = '';
  let yOffset = 50;

  sortedLangs.forEach(lang => {
    const barWidth = Math.max(2, (lang.percent * 2.5)); // Scale bar (max width ~250px)
    
    svgContent += `
    <g transform="translate(25, ${yOffset})">
      <text x="0" y="0" class="lang-name">${lang.name}</text>
      <text x="340" y="0" class="lang-percent" text-anchor="end">${lang.percent.toFixed(1)}%</text>
      
      <rect x="0" y="8" width="340" height="8" rx="4" fill="#24283b" />
      
      <rect x="0" y="8" width="${barWidth * 3.4}" height="8" rx="4" fill="${lang.color}" />
    </g>
    `;
    yOffset += 40;
  });

  const svg = `
  <svg width="400" height="${svgHeight}" viewBox="0 0 400 ${svgHeight}" xmlns="http://www.w3.org/2000/svg" role="img">
    <title>Most Used Languages</title>
    <style>
      .header { font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; fill: #7aa2f7; }
      .lang-name { font: 600 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #a9b1d6; }
      .lang-percent { font: 400 14px 'Segoe UI', Ubuntu, Sans-Serif; fill: #565f89; }
      .bg { fill: #1a1b26; stroke: #414868; stroke-width: 1px; rx: 10px; }
    </style>
    <rect x="1" y="1" width="398" height="${svgHeight - 2}" class="bg"/>
    <text x="200" y="30" class="header" text-anchor="middle">Top Languages</text>
    ${svgContent}
  </svg>
  `;

  fs.writeFileSync('github-stats.svg', svg);
  console.log('Successfully generated github-stats.svg');
}

main();
