import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = '/Users/eigenplus/.gemini/antigravity-ide/brain/92e4dbe6-6565-49b6-a1b5-01baf1306f67/.system_generated/steps/318/content.md';

function parseMatches(html: string) {
  const matches: any[] = [];
  const regex = /href="\/live-cricket-scores\/(\d+)\/([\w-]+)"[^>]*title="([^"]+)"/g;
  
  let match;
  while ((match = regex.exec(html)) !== null) {
    const id = match[1];
    const slug = match[2];
    const title = match[3];
    
    const vsIndex = title.toLowerCase().indexOf(' vs ');
    let teamA = 'Team A';
    let teamB = 'Team B';
    if (vsIndex !== -1) {
      teamA = title.substring(0, vsIndex).trim();
      const commaIndex = title.indexOf(',', vsIndex);
      if (commaIndex !== -1) {
        teamB = title.substring(vsIndex + 4, commaIndex).trim();
      } else {
        teamB = title.substring(vsIndex + 4).trim();
      }
    }
    
    const parts = slug.split('-vs-');
    let shortA = 'TMA';
    let shortB = 'TMB';
    if (parts.length === 2) {
      shortA = parts[0].toUpperCase();
      const bParts = parts[1].split('-');
      shortB = bParts[0].toUpperCase();
    }
    
    let status = 'live';
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('- preview') || lowerTitle.includes('- upcoming match')) {
      status = 'upcoming';
    } else if (
      lowerTitle.includes('- complete') ||
      lowerTitle.includes(' won') ||
      lowerTitle.includes(' draw') ||
      lowerTitle.includes(' tied') ||
      lowerTitle.includes(' lost') ||
      lowerTitle.includes(' abandon') ||
      lowerTitle.includes(' no result')
    ) {
      status = 'completed';
    }
    
    matches.push({
      id,
      slug,
      title,
      teamA,
      shortA,
      teamB,
      shortB,
      status
    });
  }
  
  return matches;
}

try {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const parsed = parseMatches(html);
  console.log(`Found ${parsed.length} matches:`);
  parsed.slice(0, 15).forEach((m, idx) => {
    console.log(`${idx + 1}: ID=${m.id}, Title="${m.title}", Teams=${m.teamA} (${m.shortA}) vs ${m.teamB} (${m.shortB}), Status=${m.status}`);
  });
} catch (err: any) {
  console.error('Error reading/parsing file:', err.message);
}
