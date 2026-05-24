import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Match, MatchStatus, CricketEventNode, TimelineBranch, MatchScorecardState, Scorecard } from '@cricket-multiverse/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load mock match data from disk
const mockDataPath = path.resolve(__dirname, '../data/mockMatch.json');
const rawMockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf8'));

interface MatchState {
  match: Match;
  branches: TimelineBranch[];
  nodes: CricketEventNode[];
  scorecardState: MatchScorecardState;
  mockIndex: number; // Index in rawMockData.events
  playbackTimer?: NodeJS.Timeout;
  slug?: string;
}

// In-memory match databases
export const matchesDb = new Map<string, MatchState>();

export function hasMatch(matchId: string): boolean {
  return matchesDb.has(matchId);
}

// Broadcast callback registered by the WebSocket server
let broadcastCallback: (message: any) => void = () => {};

export function registerBroadcastCallback(cb: (message: any) => void) {
  broadcastCallback = cb;
}

function getTeamShortName(fullName: string, slugPart?: string): string {
  const name = fullName.toLowerCase();
  
  // Standard IPL team mappings
  if (name.includes('mumbai')) return 'MI';
  if (name.includes('chennai')) return 'CSK';
  if (name.includes('kolkata')) return 'KKR';
  if (name.includes('bengaluru') || name.includes('bangalore')) return 'RCB';
  if (name.includes('rajasthan')) return 'RR';
  if (name.includes('delhi')) return 'DC';
  if (name.includes('hyderabad')) return 'SRH';
  if (name.includes('punjab')) return 'PBKS';
  if (name.includes('gujarat')) return 'GT';
  if (name.includes('lucknow')) return 'LSG';
  
  // General acronym logic for other teams
  const initials = fullName
    .split(/[\s-]+/)
    .map(word => word[0])
    .join('')
    .toUpperCase();
    
  if (initials.length >= 2 && initials.length <= 4) {
    return initials;
  }
  
  if (slugPart) {
    const slugInitials = slugPart
      .split('-')
      .map(w => w[0])
      .join('')
      .toUpperCase();
    if (slugInitials.length >= 2 && slugInitials.length <= 4) {
      return slugInitials;
    }
  }
  
  return initials.substring(0, 3);
}

function initMatchFromCricbuzz(match: Match, slug: string) {
  const initialBranch: TimelineBranch = {
    id: 'real',
    name: 'Real Match',
    premise: 'Live timeline',
    createdAt: new Date().toISOString(),
    projectedResult: 'Ongoing live match...'
  };

  const firstNode: CricketEventNode = {
    id: `node_${match.id}_toss`,
    type: 'toss',
    label: `Toss outcome pending`,
    description: `Match venue: ${match.venue}. Awaiting live updates.`,
    overNumber: 0,
    runs: 0,
    wickets: 0,
    team: match.teamA.shortName,
    timestamp: new Date().toISOString(),
    winProbability: { teamA: 0.5, teamB: 0.5 },
    momentum: 0,
    commentary: 'Match initialized. Awaiting commentary feed...',
    isAlternate: false,
    branchId: 'real'
  };

  const initialScorecard: MatchScorecardState = {
    matchId: match.id,
    branchId: 'real',
    teamA: { batting: [], bowling: [], extras: 0, totalRuns: 0, totalWickets: 0, overs: 0 },
    teamB: { batting: [], bowling: [], extras: 0, totalRuns: 0, totalWickets: 0, overs: 0 }
  };

  matchesDb.set(match.id, {
    match,
    branches: [initialBranch],
    nodes: [firstNode],
    scorecardState: initialScorecard,
    mockIndex: 0,
    slug
  });
}

async function scrapeCricbuzzMatchesList(): Promise<Match[]> {
  try {
    const res = await fetch('https://www.cricbuzz.com/cricket-match/live-scores');
    if (!res.ok) {
      throw new Error(`Cricbuzz returned status ${res.status}`);
    }
    const html = await res.text();
    const matches: Match[] = [];
    const regex = /href="\/live-cricket-scores\/(\d+)\/([\w-]+)"[^>]*title="([^"]+)"/g;
    
    let mMatch;
    while ((mMatch = regex.exec(html)) !== null) {
      const id = mMatch[1];
      const slug = mMatch[2];
      const title = mMatch[3];
      
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
      if (parts.length >= 1) {
        shortA = getTeamShortName(teamA, parts[0]);
        shortB = getTeamShortName(teamB, parts.length === 2 ? parts[1] : undefined);
      }
      
      let status: MatchStatus = 'live';
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
      
      let series = 'International';
      const lowerSlug = slug.toLowerCase();
      if (lowerSlug.includes('ipl') || lowerTitle.includes('ipl') || lowerTitle.includes('indian premier league')) {
        series = 'Indian Premier League';
      } else if (lowerSlug.includes('t20-blast') || lowerTitle.includes('t20 blast')) {
        series = 'T20 Blast';
      } else if (lowerSlug.includes('world-cup') || lowerTitle.includes('world cup')) {
        series = 'ICC World Cup';
      }

      const matchObj: Match = {
        id,
        teamA: { name: teamA, shortName: shortA },
        teamB: { name: teamB, shortName: shortB },
        status,
        venue: 'Cricbuzz Venue',
        date: new Date().toISOString(),
        currentInnings: 1,
        tossWinner: shortA,
        tossDecision: 'bat',
        series
      };
      
      if (!matchesDb.has(id)) {
        initMatchFromCricbuzz(matchObj, slug);
      } else {
        const state = matchesDb.get(id)!;
        state.match = matchObj;
        state.slug = slug;
      }
      
      matches.push(matchObj);
    }
    
    return matches;
  } catch (err) {
    console.error('Failed to scrape Cricbuzz matches list:', err);
    return [];
  }
}

function parseCricbuzzTeamScore(html: string, teamShort: string) {
  // Strategy 1: Look for score in data-team-id or title patterns
  // Cricbuzz often renders scores as: TEAMSHORT 120/3 (14.2)
  const scorePatterns = [
    // Pattern: TEAMSHORT followed by score
    new RegExp(`${teamShort}\\s+(\\d+)(?:\\/(\\d+))?\\s*\\(([\\d.]+)\\)`, 'i'),
    // Pattern: score near team short name in various structures
    new RegExp(`>\\s*${teamShort}\\s*<[^>]+>[^<]*<[^>]+>\\s*(\\d+)(?:\\/(\\d+))?`, 'i')
  ];
  
  for (const pattern of scorePatterns) {
    const m = html.match(pattern);
    if (m) {
      return {
        runs: Number(m[1] || 0),
        wickets: Number(m[2] || 0),
        overs: Number(m[3] || 0)
      };
    }
  }

  // Strategy 2: original mr-2 div approach
  const teamMarker = `<div class="mr-2">${teamShort}</div>`;
  const idx = html.indexOf(teamMarker);
  if (idx !== -1) {
    const chunk = html.substring(idx + teamMarker.length, idx + teamMarker.length + 500);
    const nextTeamIdx = chunk.indexOf('<div class="mr-2">');
    const scanArea = nextTeamIdx !== -1 ? chunk.substring(0, nextTeamIdx) : chunk;
    const text = scanArea.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    // Find score pattern: digits/digits (digits)
    const scoreMatch = text.match(/(\d+)\s*\/\s*(\d+)\s*\([\s]*(\d+\.?\d*)/);
    if (scoreMatch) {
      return { runs: Number(scoreMatch[1]), wickets: Number(scoreMatch[2]), overs: Number(scoreMatch[3]) };
    }
    // Innings 1 no wickets yet
    const simpleMatch = text.match(/(\d{2,})\s*\/\s*(\d+)/);
    if (simpleMatch) {
      return { runs: Number(simpleMatch[1]), wickets: Number(simpleMatch[2]), overs: 0 };
    }
  }

  // Strategy 3: Try data-* attributes or score spans anywhere near team short in page
  const scoreNearTeam = html.match(new RegExp(`${teamShort}[^<]{0,200}?(\\d{2,})\\s*\/\\s*(\\d+)\\s*\\(([\\d.]+)\\)`, 'i'));
  if (scoreNearTeam) {
    return { runs: Number(scoreNearTeam[1]), wickets: Number(scoreNearTeam[2]), overs: Number(scoreNearTeam[3]) };
  }

  return null;
}

async function pollCricbuzzLive(matchId: string, state: MatchState) {
  const slug = state.slug || 'match';
  const url = `https://www.cricbuzz.com/live-cricket-scores/${matchId}/${slug}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Cricbuzz returned HTTP status ${res.status}`);
  }
  const html = await res.text();
  
  // Parse Toss dynamically
  const tossRegex = /([A-Za-z0-9\s]+ won the toss and (?:opt|elect)ed to (?:bat|bowl|field) first?)/i;
  const tossTextMatch = html.match(tossRegex);
  if (tossTextMatch) {
    const tossText = tossTextMatch[1].trim();
    const tossNode = state.nodes.find(n => n.type === 'toss' && n.branchId === 'real');
    if (tossNode && (tossNode.label.includes('pending') || tossNode.label.includes('outcome pending'))) {
      const lowerToss = tossText.toLowerCase();
      const tossWinner = [state.match.teamA, state.match.teamB].find(t => 
        lowerToss.includes(t.name.toLowerCase()) || lowerToss.includes(t.shortName.toLowerCase())
      );
      
      let tossDecision: 'bat' | 'field' = 'bat';
      if (lowerToss.includes('bowl') || lowerToss.includes('field')) {
        tossDecision = 'field';
      }
      
      if (tossWinner) {
        state.match.tossWinner = tossWinner.shortName;
        state.match.tossDecision = tossDecision;
        tossNode.team = tossWinner.shortName;
        tossNode.label = `Toss: ${tossWinner.shortName} elects to ${tossDecision === 'field' ? 'Field' : 'Bat'}`;
        tossNode.description = tossText;
        tossNode.commentary = `${tossText}. Welcome to our live coverage!`;
      }
    }
  }
  
  // 1. Parse Scorecard Summary
  const teamAShort = state.match.teamA.shortName;
  const teamBShort = state.match.teamB.shortName;

  const scoreA = parseCricbuzzTeamScore(html, teamAShort);
  const scoreB = parseCricbuzzTeamScore(html, teamBShort);

  // 2. Update scorecardState total numbers
  if (scoreA) {
    state.scorecardState.teamA.totalRuns = scoreA.runs;
    state.scorecardState.teamA.totalWickets = scoreA.wickets;
    state.scorecardState.teamA.overs = scoreA.overs;
  }
  if (scoreB) {
    state.scorecardState.teamB.totalRuns = scoreB.runs;
    state.scorecardState.teamB.totalWickets = scoreB.wickets;
    state.scorecardState.teamB.overs = scoreB.overs;
  }

  // 3. Parse Active Batsmen & Bowlers from Over Summary
  const overSummaryMatch = html.match(/<div class="flex justify-between tb:justify-normal wb:justify-normal w-full">([\s\S]+?)<\/div>\s*<\/div>\s*<hr/);
  const activeBatsmen: any[] = [];
  const activeBowlers: any[] = [];
  if (overSummaryMatch) {
    const summaryHtml = overSummaryMatch[1];
    
    const batsmanRegex = /<div>([^<]+)<\/div>\s*<div>(\d+)\s*\(([^)]+)\)<\/div>/g;
    let bMatch;
    while ((bMatch = batsmanRegex.exec(summaryHtml)) !== null) {
      activeBatsmen.push({
        name: bMatch[1].trim(),
        runs: Number(bMatch[2]),
        balls: Number(bMatch[3]),
        fours: 0,
        sixes: 0,
        strikeRate: Number(bMatch[3]) > 0 ? Math.round((Number(bMatch[2]) / Number(bMatch[3])) * 100) : 0,
        isOut: false
      });
    }
    
    const bowlerRegex = /<div>([^<]+)<\/div>\s*<div[^>]*>([\d-]+)<\/div>/g;
    let boMatch;
    while ((boMatch = bowlerRegex.exec(summaryHtml)) !== null) {
      const stats = boMatch[2].split('-');
      if (stats.length === 4) {
        activeBowlers.push({
          name: boMatch[1].trim(),
          overs: Number(stats[0]),
          maidens: Number(stats[1]),
          runs: Number(stats[2]),
          wickets: Number(stats[3]),
          economy: Number(stats[0]) > 0 ? Math.round((Number(stats[2]) / Number(stats[0])) * 10) / 10 : 0
        });
      }
    }
  }

  // Determine who is batting and who is bowling
  let isTeamABatting = true;
  if (scoreB && scoreB.overs > 0 && (!scoreA || scoreA.overs === 20 || scoreA.wickets === 10)) {
    isTeamABatting = false;
  }
  
  if (isTeamABatting) {
    state.scorecardState.teamA.batting = activeBatsmen;
    state.scorecardState.teamB.bowling = activeBowlers;
  } else {
    state.scorecardState.teamB.batting = activeBatsmen;
    state.scorecardState.teamA.bowling = activeBowlers;
  }

  // 4. Parse Commentary - only capture MEANINGFUL CANON EVENTS: 4s, 6s, Wickets, No Balls, and milestone overs
  const canonEvents: any[] = [];
  const overRegex = /class="[^"]*font-bold[^"]*">(\d+\.\d+)<\/div>/g;
  let oMatch;
  while ((oMatch = overRegex.exec(html)) !== null) {
    const overNum = Number(oMatch[1]);
    const startIndex = oMatch.index;
    
    const searchArea = html.substring(startIndex);
    const firstDivIdx = searchArea.indexOf('<div>');
    if (firstDivIdx !== -1) {
      const commStart = firstDivIdx + '<div>'.length;
      const commEnd = searchArea.indexOf('</div>', commStart);
      if (commEnd !== -1) {
        const rawCommentary = searchArea.substring(commStart, commEnd);
        const commentary = rawCommentary.replace(/<[^>]+>/g, '').trim();
        
        const prefixArea = searchArea.substring(0, firstDivIdx);
        const eventBubbleMatch = prefixArea.match(/rounded-full[^>]*>([^<]+)<\/div>/);
        const event = (eventBubbleMatch ? eventBubbleMatch[1] : '').trim();
        
        // Only add MEANINGFUL events: 4, 6, W (wicket), NB (no ball)
        // Skip regular dot balls and singles (1, 2, 3)
        const isMeaningful = ['4', '6', 'W', 'NB', 'WD', 'LB'].includes(event);
        if (isMeaningful) {
          canonEvents.push({ over: overNum, event, commentary });
        }
      }
    }
  }

  // Also add milestone over checkpoints (end of powerplay over 6, over 10, over 15, over 20)
  const milestoneOvers = [6, 10, 15, 20];
  for (const milestone of milestoneOvers) {
    const alreadyHasMilestone = state.nodes.some(n => n.overNumber === milestone && n.branchId === 'real' && (n.type === 'over' || n.type === 'milestone'));
    if (!alreadyHasMilestone) {
      const currentScore = isTeamABatting ? scoreA : scoreB;
      if (currentScore && currentScore.overs >= milestone) {
        canonEvents.push({
          over: milestone,
          event: 'MILESTONE',
          commentary: `Over ${milestone} completed. Score: ${currentScore.runs}/${currentScore.wickets}`
        });
      }
    }
  }

  // Sort oldest to newest
  canonEvents.sort((a, b) => a.over - b.over);

  let newEventsAdded = false;

  for (const ball of canonEvents) {
    const exists = state.nodes.some(n => n.overNumber === ball.over && n.branchId === 'real' && n.type !== 'toss');
    if (!exists) {
      const parentNode = state.nodes
        .filter(n => n.branchId === 'real')
        .sort((a, b) => b.overNumber - a.overNumber)[0];

      const team = isTeamABatting ? teamAShort : teamBShort;
      const runs = isTeamABatting ? (scoreA?.runs || 0) : (scoreB?.runs || 0);
      const wickets = isTeamABatting ? (scoreA?.wickets || 0) : (scoreB?.wickets || 0);

      const target = isTeamABatting ? undefined : scoreA?.runs;
      const currentInnings = isTeamABatting ? 1 : 2;
      const winProb = calculateLiveWinProbability(runs, wickets, ball.over, target, currentInnings);

      // Determine event type and label properly
      let type: any = 'over';
      let label = `Over ${ball.over}: ${runs}/${wickets}`;
      
      if (ball.event === 'W') {
        type = 'wicket';
        label = `Wicket! ${team} ${runs}/${wickets} (Ov ${ball.over})`;
      } else if (ball.event === '6') {
        type = 'boundary';
        label = `SIX! ${team} ${runs}/${wickets} (Ov ${ball.over})`;
      } else if (ball.event === '4') {
        type = 'boundary';
        label = `FOUR! ${team} ${runs}/${wickets} (Ov ${ball.over})`;
      } else if (ball.event === 'NB') {
        type = 'over';
        label = `No Ball! ${team} ${runs}/${wickets} (Ov ${ball.over})`;
      } else if (ball.event === 'MILESTONE') {
        type = 'milestone';
        label = `Over ${ball.over}: ${team} ${runs}/${wickets}`;
        // Check for half century or century milestones
        if (runs >= 100 && runs < 110) label = `Century! ${team} ${runs}/${wickets} (Ov ${ball.over})`;
        else if (runs >= 50 && runs < 60) label = `Half Century! ${team} ${runs}/${wickets} (Ov ${ball.over})`;
        else if (ball.over === 6) label = `End of Powerplay: ${team} ${runs}/${wickets}`;
        else if (ball.over === 20) label = `Innings Over: ${team} ${runs}/${wickets}`;
      }

      const newNode: CricketEventNode = {
        id: `node_${matchId}_${ball.over.toString().replace('.', '_')}`,
        type,
        label,
        description: ball.commentary,
        overNumber: ball.over,
        runs,
        wickets,
        team,
        timestamp: new Date().toISOString(),
        winProbability: winProb,
        momentum: ball.event === 'W' ? -25 : (['4', '6'].includes(ball.event) ? 30 : 5),
        commentary: ball.commentary,
        isAlternate: false,
        branchId: 'real',
        parentId: parentNode?.id
      };

      state.nodes.push(newNode);
      newEventsAdded = true;

      broadcastCallback({
        type: 'timeline_update',
        matchId,
        data: {
          node: newNode,
          scorecardState: state.scorecardState
        }
      });
    }
  }

  if (!newEventsAdded) {
    broadcastCallback({
      type: 'scorecard_update',
      matchId,
      data: {
        scorecardState: state.scorecardState
      }
    });
  }
}

// Entity Sport API Utility
async function fetchFromEntitySport(endpoint: string) {
  const token = process.env.CRICKET_API_KEY;
  const baseUrl = 'https://restapi.entitysport.com/v2';
  const url = `${baseUrl}/${endpoint}${endpoint.includes('?') ? '&' : '?'}token=${token}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Entity Sport API returned status ${res.status}`);
  }
  return await res.json();
}

// Map Entity Sport match format to shared Match format
function mapEntitySportMatch(item: any): Match {
  let status: MatchStatus = 'completed';
  if (item.status_str === 'live' || item.status === 3) {
    status = 'live';
  } else if (item.status_str === 'completed' || item.status === 2) {
    status = 'completed';
  } else if (item.status_str === 'upcoming' || item.status === 1) {
    status = 'upcoming';
  }

  // Entity Sport uses various field names across API versions - try all variants
  const ta = item.teama || item.team_a || item.teams?.[0] || {};
  const tb = item.teamb || item.team_b || item.teams?.[1] || {};
  const nameA = ta.name || ta.team_name || item.localteam_name || 'Team A';
  const nameB = tb.name || tb.team_name || item.visitorteam_name || 'Team B';
  const shortA = ta.short_name || ta.shortname || ta.abbr || ta.code || getTeamShortName(nameA);
  const shortB = tb.short_name || tb.shortname || tb.abbr || tb.code || getTeamShortName(nameB);

  const toss = item.toss || {};
  const tossWinnerName = toss.winner || toss.toss_winner || ta.short_name || shortA;
  const tossDecision = (toss.decision || toss.toss_decision || 'bat').toLowerCase().includes('field') ? 'field' : 'bat';

  return {
    id: String(item.match_id || item.mid || item.id),
    teamA: { name: nameA, shortName: shortA },
    teamB: { name: nameB, shortName: shortB },
    status,
    currentInnings: item.live?.innings?.number === 2 ? 2 : 1,
    venue: item.venue?.name || item.venue_name || 'Live Venue',
    date: item.date_start || item.start_date || new Date().toISOString(),
    tossWinner: tossWinnerName,
    tossDecision,
    series: item.competition?.title || item.competition?.name || item.league?.name || 'International'
  };
}

// Initialize a real API match structure in matchesDb
function initMatchFromApiData(match: Match, item: any) {
  const initialBranch: TimelineBranch = {
    id: 'real',
    name: 'Real Match',
    premise: 'Live timeline',
    createdAt: new Date().toISOString(),
    projectedResult: 'Ongoing live match...'
  };

  const firstNode: CricketEventNode = {
    id: `node_${match.id}_toss`,
    type: 'toss',
    label: `Toss: ${match.tossWinner} elects to ${match.tossDecision}`,
    description: `Match at ${match.venue}. ${match.tossWinner} won the toss and elected to ${match.tossDecision} first.`,
    overNumber: 0,
    runs: 0,
    wickets: 0,
    team: match.tossWinner,
    timestamp: new Date().toISOString(),
    winProbability: { teamA: 0.5, teamB: 0.5 },
    momentum: 0,
    commentary: 'Match initialized. Welcome to live coverage!',
    isAlternate: false,
    branchId: 'real'
  };

  const initialScorecard: MatchScorecardState = {
    matchId: match.id,
    branchId: 'real',
    teamA: { batting: [], bowling: [], extras: 0, totalRuns: 0, totalWickets: 0, overs: 0 },
    teamB: { batting: [], bowling: [], extras: 0, totalRuns: 0, totalWickets: 0, overs: 0 }
  };

  matchesDb.set(match.id, {
    match,
    branches: [initialBranch],
    nodes: [firstNode],
    scorecardState: initialScorecard,
    mockIndex: 0
  });
}

// Helper to initialize an in-memory match from mock JSON
export function initMatch(matchId: string): MatchState {
  let existingSlug: string | undefined;
  let existingMatch: Match | undefined;

  if (matchesDb.has(matchId)) {
    const existing = matchesDb.get(matchId)!;
    if (existing.playbackTimer) clearInterval(existing.playbackTimer);
    existingSlug = existing.slug;
    existingMatch = existing.match;
  }

  const initialBranch: TimelineBranch = {
    id: 'real',
    name: 'Real Match',
    premise: 'Live timeline',
    createdAt: new Date().toISOString(),
    projectedResult: 'Ongoing live match...'
  };

  if (existingMatch) {
    const firstNode: CricketEventNode = {
      id: `node_${matchId}_toss`,
      type: 'toss',
      label: existingMatch.status === 'upcoming'
        ? 'Toss outcome pending'
        : `Toss: ${existingMatch.tossWinner} elects to ${existingMatch.tossDecision}`,
      description: `Match venue: ${existingMatch.venue}.`,
      overNumber: 0,
      runs: 0,
      wickets: 0,
      team: existingMatch.tossWinner || existingMatch.teamA.shortName,
      timestamp: new Date().toISOString(),
      winProbability: { teamA: 0.5, teamB: 0.5 },
      momentum: 0,
      commentary: existingMatch.status === 'upcoming'
        ? 'Match is upcoming. Live updates will start when the match begins.'
        : 'Match initialized. Awaiting commentary feed...',
      isAlternate: false,
      branchId: 'real'
    };

    const initialScorecard: MatchScorecardState = {
      matchId,
      branchId: 'real',
      teamA: { batting: [], bowling: [], extras: 0, totalRuns: 0, totalWickets: 0, overs: 0 },
      teamB: { batting: [], bowling: [], extras: 0, totalRuns: 0, totalWickets: 0, overs: 0 }
    };

    const state: MatchState = {
      match: existingMatch,
      branches: [initialBranch],
      nodes: [firstNode],
      scorecardState: initialScorecard,
      mockIndex: 0,
      slug: existingSlug
    };
    matchesDb.set(matchId, state);
    return state;
  }

  const firstEvent = rawMockData.events[0];
  const firstNode: CricketEventNode = {
    ...firstEvent.node,
    id: 'node_toss',
    parentId: undefined
  };

  const initialScorecard: MatchScorecardState = {
    matchId,
    branchId: 'real',
    teamA: firstEvent.scorecard.teamA,
    teamB: firstEvent.scorecard.teamB
  };

  const state: MatchState = {
    match: { ...rawMockData.match, id: matchId, series: 'Indian Premier League' },
    branches: [initialBranch],
    nodes: [firstNode],
    scorecardState: initialScorecard,
    mockIndex: 1
  };

  matchesDb.set(matchId, state);
  return state;
}

// Get full details of a match timeline
export function getMatchTimeline(matchId: string, branchId = 'real') {
  const state = matchesDb.get(matchId) || initMatch(matchId);

  // Filter nodes belonging to the requested branch, or traversing back to its ancestors
  const activeBranch = state.branches.find(b => b.id === branchId) || state.branches[0];
  const branchIdsToInclude = new Set<string>();
  
  let currentBranchId: string | undefined = activeBranch.id;
  while (currentBranchId) {
    branchIdsToInclude.add(currentBranchId);
    const branch = state.branches.find(b => b.id === currentBranchId);
    currentBranchId = branch?.parentBranchId;
  }

  // Filter nodes that are part of the path of branches
  const filteredNodes = state.nodes.filter(node => branchIdsToInclude.has(node.branchId));

  return {
    match: state.match,
    branches: state.branches,
    nodes: filteredNodes,
    activeBranchId: branchId,
    scorecardState: state.scorecardState
  };
}

// List all active matches (async support for Entity Sport live matching)
export async function listMatches(): Promise<Match[]> {
  const mockId = 'ipl_2026_mi_csk';
  if (!matchesDb.has(mockId)) {
    initMatch(mockId);
  }
  const defaultMatches = Array.from(matchesDb.values())
    .filter(s => s.match.id === mockId)
    .map(s => s.match);

  const token = process.env.CRICKET_API_KEY;
  let apiMatches: Match[] = [];

  if (token && token.trim() !== '') {
    try {
      console.log('Fetching live and upcoming matches list from Entity Sport...');
      const [liveData, upcomingData] = await Promise.all([
        fetchFromEntitySport('matches/?status=3').catch(() => ({ status: 'error' })),
        fetchFromEntitySport('matches/?status=1').catch(() => ({ status: 'error' }))
      ]);

      if (liveData.status === 'ok' && liveData.response?.items) {
        liveData.response.items.forEach((item: any) => {
          const match = mapEntitySportMatch(item);
          if (!matchesDb.has(match.id)) {
            initMatchFromApiData(match, item);
          }
          apiMatches.push(match);
        });
      }

      if (upcomingData.status === 'ok' && upcomingData.response?.items) {
        upcomingData.response.items.slice(0, 10).forEach((item: any) => {
          const match = mapEntitySportMatch(item);
          if (!matchesDb.has(match.id)) {
            initMatchFromApiData(match, item);
          }
          apiMatches.push(match);
        });
      }
    } catch (err) {
      console.error('Failed to list live/upcoming matches from Entity Sport API:', err);
    }
  }

  // Fallback to Cricbuzz scraping if no matches were fetched from Entity Sport
  if (apiMatches.length === 0) {
    console.log('No matches from Entity Sport or key invalid. Scraping Cricbuzz...');
    const scraped = await scrapeCricbuzzMatchesList();
    return [...defaultMatches, ...scraped];
  }

  return [...defaultMatches, ...apiMatches];
}

// Win probability computer for live matches
function calculateLiveWinProbability(runs: number, wickets: number, overs: number, target?: number, currentInnings = 1) {
  if (currentInnings === 2 && target) {
    const runsNeeded = target - runs;
    const oversLeft = 20 - overs;
    if (runsNeeded <= 0) return { teamA: 1.0, teamB: 0.0 };
    if (wickets >= 10 || oversLeft <= 0) return { teamA: 0.0, teamB: 1.0 };
    const reqRunRate = runsNeeded / (oversLeft || 0.1);
    const winProbA = Math.max(0.05, Math.min(0.95, 1.0 - (reqRunRate / 18)));
    return { teamA: winProbA, teamB: 1.0 - winProbA };
  } else {
    // Innings 1
    const currentRunRate = overs > 0 ? (runs / overs) : 7.5;
    const winProbA = Math.max(0.05, Math.min(0.95, 0.5 + (currentRunRate - 7.5) * 0.04 - wickets * 0.04));
    return { teamA: winProbA, teamB: 1.0 - winProbA };
  }
}

// Scorecard mapper from Entity Sport live response
function mapLiveScorecard(apiMatch: any, match: Match): MatchScorecardState {
  const live = apiMatch.live || {};
  const batsmen = live.batsmen || [];
  const bowlers = live.bowlers || [];

  const teamA: Scorecard = {
    batting: batsmen.map((b: any) => ({
      name: b.name || 'Batter',
      runs: Number(b.runs || 0),
      balls: Number(b.balls || 0),
      fours: Number(b.fours || 0),
      sixes: Number(b.sixes || 0),
      strikeRate: Number(b.balls) > 0 ? Math.round((Number(b.runs) / Number(b.balls)) * 100) : 0,
      isOut: b.how_out !== 'not out',
      dismissalInfo: b.how_out
    })),
    bowling: bowlers.map((bo: any) => ({
      name: bo.name || 'Bowler',
      overs: Number(bo.overs || 0),
      maidens: Number(bo.maidens || 0),
      runs: Number(bo.runs || 0),
      wickets: Number(bo.wickets || 0),
      economy: Number(bo.overs) > 0 ? Math.round((Number(bo.runs) / Number(bo.overs)) * 10) / 10 : 0
    })),
    extras: 0,
    totalRuns: live.live_score?.runs || 0,
    totalWickets: live.live_score?.wickets || 0,
    overs: live.live_score?.overs || 0,
    target: live.live_score?.target
  };

  return {
    matchId: match.id,
    branchId: 'real',
    teamA,
    teamB: { batting: [], bowling: [], extras: 0, totalRuns: 0, totalWickets: 0, overs: 0 }
  };
}

// Start simulation/playback of a live match or mock match
export function startLivePlayback(matchId: string) {
  const state = matchesDb.get(matchId) || initMatch(matchId);
  
  if (state.playbackTimer) {
    clearInterval(state.playbackTimer);
  }

  const token = process.env.CRICKET_API_KEY;
  const isCricbuzz = state.slug !== undefined;

  if (matchId !== 'ipl_2026_mi_csk' && (isCricbuzz || (token && token.trim() !== ''))) {
    if (isCricbuzz) {
      console.log(`Starting Cricbuzz Live Polling for match ${matchId}`);
      // Poll immediately once, then set interval
      pollCricbuzzLive(matchId, state).catch(err => console.error('Initial Cricbuzz poll failed:', err));
      state.playbackTimer = setInterval(async () => {
        try {
          await pollCricbuzzLive(matchId, state);
        } catch (err) {
          console.error(`Cricbuzz Live Polling Error on match ${matchId}:`, err);
        }
      }, 15000);
    } else {
      console.log(`Starting Entity Sport Live Polling for match ${matchId}`);
      state.playbackTimer = setInterval(async () => {
        try {
          const data = await fetchFromEntitySport(`matches/${matchId}/live`);
          if (data.status === 'ok' && data.response) {
            const apiMatch = data.response;
            const live = apiMatch.live;
            if (!live) return;

            const runs = Number(live.live_score?.runs || 0);
            const wickets = Number(live.live_score?.wickets || 0);
            const overs = Number(live.live_score?.overs || 0);
            // Use batting team from API or fall back to match state
            const battingTeamShort = live.batting_team?.short_name || live.batting_team?.abbr || state.match.teamA.shortName;
            
            const commentaries = live.commentary || [];
            const latestComm = commentaries[0] || { commentary: 'Live ball-by-ball updates streaming...' };
            const commText = latestComm.commentary || '';

            const parentNode = state.nodes
              .filter(n => n.branchId === 'real')
              .sort((a, b) => b.overNumber - a.overNumber)[0];

            // Determine if this is a meaningful event
            const isWicket = wickets > (parentNode?.wickets || 0);
            const isBoundary = commText.toLowerCase().includes('six') || 
                              commText.toLowerCase().includes('four') ||
                              (latestComm.event && ['4', '6'].includes(latestComm.event));
            const isMilestoneOver = [6, 10, 15, 20].includes(Math.floor(overs));
            const isNewOver = Math.floor(overs) > Math.floor(parentNode?.overNumber || 0);

            // Only create nodes for meaningful events
            const isMeaningfulEvent = isWicket || isBoundary || (isMilestoneOver && isNewOver);
            
            if (isMeaningfulEvent && overs >= (parentNode?.overNumber || 0)) {
              let type: any = 'over';
              let label = `Over ${overs}: ${battingTeamShort} ${runs}/${wickets}`;
              
              if (isWicket) {
                type = 'wicket';
                label = `Wicket! ${battingTeamShort} ${runs}/${wickets} (Ov ${overs})`;
              } else if (isBoundary) {
                const isSix = commText.toLowerCase().includes('six') || latestComm.event === '6';
                type = 'boundary';
                label = `${isSix ? 'SIX' : 'FOUR'}! ${battingTeamShort} ${runs}/${wickets} (Ov ${overs})`;
              } else if (Math.floor(overs) === 6) {
                label = `End of Powerplay: ${battingTeamShort} ${runs}/${wickets}`;
              } else if (Math.floor(overs) === 20) {
                label = `Innings Over: ${battingTeamShort} ${runs}/${wickets}`;
              }

              const target = live.live_score?.target;
              const currentInnings = apiMatch.live_score?.innings?.number || 1;
              const winProb = calculateLiveWinProbability(runs, wickets, overs, target, currentInnings);

              const newNode: CricketEventNode = {
                id: `node_${matchId}_${Date.now()}`,
                type,
                label,
                description: commText || `${battingTeamShort}: ${runs}/${wickets} at over ${overs}`,
                overNumber: overs,
                runs,
                wickets,
                team: battingTeamShort,
                timestamp: new Date().toISOString(),
                winProbability: winProb,
                momentum: type === 'wicket' ? -25 : (type === 'boundary' ? 30 : 5),
                commentary: commText || `Over ${overs}: ${battingTeamShort} ${runs}/${wickets}`,
                isAlternate: false,
                branchId: 'real',
                parentId: parentNode?.id
              };

              state.nodes.push(newNode);

              const mappedScorecard = mapLiveScorecard(apiMatch, state.match);
              state.scorecardState = mappedScorecard;

              broadcastCallback({
                type: 'timeline_update',
                matchId,
                data: {
                  node: newNode,
                  scorecardState: state.scorecardState
                }
              });
            } else if (runs !== (parentNode?.runs || 0) || wickets !== (parentNode?.wickets || 0)) {
              // Score changed but no major event - just update scorecard
              const mappedScorecard = mapLiveScorecard(apiMatch, state.match);
              state.scorecardState = mappedScorecard;
              broadcastCallback({
                type: 'scorecard_update',
                matchId,
                data: { scorecardState: state.scorecardState }
              });
            }
          }
        } catch (err) {
          console.error(`Live Match Polling Error on match ${matchId}:`, err);
        }
      }, 20000);
    }

  } else {
    // Stream mock match data event every 15 seconds
    console.log(`Starting Mock Playback for match ${matchId}`);
    
    state.playbackTimer = setInterval(() => {
      const events = rawMockData.events;
      if (state.mockIndex >= events.length) {
        clearInterval(state.playbackTimer);
        state.match.status = 'completed';
        
        broadcastCallback({
          type: 'match_completed',
          matchId,
          data: { match: state.match }
        });
        return;
      }

      const nextEvent = events[state.mockIndex];
      
      const parentNode = state.nodes
        .filter(n => n.branchId === 'real')
        .sort((a, b) => b.overNumber - a.overNumber)[0];

      const newNode: CricketEventNode = {
        ...nextEvent.node,
        parentId: parentNode?.id,
        branchId: 'real',
        isAlternate: false
      };

      state.nodes.push(newNode);
      
      state.scorecardState = {
        matchId,
        branchId: 'real',
        teamA: nextEvent.scorecard.teamA,
        teamB: nextEvent.scorecard.teamB
      };

      state.mockIndex++;

      broadcastCallback({
        type: 'timeline_update',
        matchId,
        data: {
          node: newNode,
          scorecardState: state.scorecardState
        }
      });

    }, 15000);
  }
}

// Stop playback
export function stopLivePlayback(matchId: string) {
  const state = matchesDb.get(matchId);
  if (state && state.playbackTimer) {
    clearInterval(state.playbackTimer);
    state.playbackTimer = undefined;
  }
}

// Inject alternate nodes (simulated branches)
export function addAlternateBranch(
  matchId: string,
  branch: TimelineBranch,
  simulatedNodes: CricketEventNode[],
  simulatedScorecard: MatchScorecardState
) {
  const state = matchesDb.get(matchId) || initMatch(matchId);
  state.branches.push(branch);
  state.nodes.push(...simulatedNodes);
}
