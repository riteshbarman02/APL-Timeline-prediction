import { GoogleGenAI } from '@google/genai';
import { Match, CricketEventNode, TimelineBranch, MatchScorecardState, Scorecard } from '@cricket-multiverse/shared';

// Initialize the Gemini client if the API key is present
const apiKey = process.env.GEMINI_API_KEY;
let aiClient: GoogleGenAI | null = null;

if (apiKey && apiKey !== 'your_gemini_api_key_here' && apiKey.trim() !== '') {
  console.log('Gemini API key found, initializing client...');
  aiClient = new GoogleGenAI({ apiKey });
} else {
  console.warn('WARNING: No valid GEMINI_API_KEY found. Running Gemini simulator in Mock Fallback mode.');
}

// Interface for Gemini JSON response
interface SimulatedMatchResponse {
  projectedResult: string;
  simulatedNodes: Array<{
    type: 'over' | 'wicket' | 'boundary' | 'timeout' | 'milestone' | 'simulation_node';
    label: string;
    description: string;
    overNumber: number;
    runs: number;
    wickets: number;
    team: string;
    winProbability: { [teamName: string]: number };
    momentum: number;
    commentary: string;
  }>;
  finalScorecard: {
    teamA: Omit<Scorecard, 'target'>;
    teamB: Omit<Scorecard, 'target'>;
  };
}

export async function simulateTimeline(
  match: Match,
  currentNode: CricketEventNode,
  parentNodes: CricketEventNode[],
  premise: string
): Promise<{
  branch: TimelineBranch;
  nodes: CricketEventNode[];
  scorecardState: MatchScorecardState;
}> {
  const branchId = `branch_${Date.now()}`;
  const branchName = premise.length > 20 ? premise.substring(0, 20) + '...' : premise;

  if (!aiClient) {
    // Return pre-baked fallback mock timelines for El Clasico (MI vs CSK)
    return generateMockFallback(match, currentNode, premise, branchId, branchName);
  }

  // Build the match context for the prompt
  const parentTimelineStr = parentNodes
    .map(n => `Over ${n.overNumber} (${n.team}): ${n.label} | ${n.description} | Score: ${n.runs}/${n.wickets}`)
    .join('\n');

  const systemInstruction = `
You are an expert international cricket data scientist, strategist, and sports commentator. 
Your task is to simulate the remainder of a T20 cricket match based on a specific "Canon Premise" or "Tactical Decision" tweak starting from a specific point in the match.

CRITICAL INSTRUCTIONS:
1. Generate a realistic ball-by-ball and over-by-over progression of the remaining match.
2. The simulation must fully incorporate the user's premise. For example, if the premise is "openers score a century", you must ensure both openers have a massive partnership and high scores in the final scorecard. If the premise is "openers out within 6 overs", they must be dismissed early in the scorecard, and the middle-order must face early pressure.
3. Keep cumulative scores mathematically logical. If current score is 54/1 at over 6, the next nodes must start from 54/1 at over 6. Wickets cannot decrease. Total runs must increase logically based on scoring rates.
4. If it's Innings 2, the chasing team wins if they surpass the target score (which is Innings 1 total + 1 run). If they reach 20 overs without passing the target, or lose 10 wickets, they lose.
5. Provide professional, detailed sports commentary for each simulated node. Include tactical insights about bowler selection, field placements, batting speeds, and pressure indexes.
6. Return your response in STRICT JSON format matching the schema requested.
`;

  const userPrompt = `
MATCH CONTEXT:
Teams: ${match.teamA.name} (${match.teamA.shortName}) vs ${match.teamB.name} (${match.teamB.shortName})
Venue: ${match.venue}
Toss: Won by ${match.tossWinner}, decided to ${match.tossDecision} first.
Innings 1 Target Score (if Innings 2 is chasing): ${match.currentInnings === 2 ? 'Innings 1 score + 1' : 'To be determined after Innings 1'}

CURRENT POSITION IN MATCH:
Current Innings: ${match.currentInnings}
Batting Team: ${currentNode.team}
Current Score: ${currentNode.runs}/${currentNode.wickets}
Current Over: ${currentNode.overNumber}
Current Event Node: ${currentNode.label} - ${currentNode.description}

PREVIOUS KEY MATCH EVENTS:
${parentTimelineStr}

NEW CANON PREMISE TO INJECT:
"${premise}"

Generate the alternate timeline from this point forward until the match completes.
Provide 4 to 6 key simulation nodes representing major milestones (overs, wickets, boundaries, final match completion).
Also provide the final scorecard at the end of the match.

Response format must be a single JSON object with this shape:
{
  "projectedResult": "Brief summary of the final outcome using the team shortnames, e.g. '${match.teamB.shortName} wins by 4 runs'",
  "simulatedNodes": [
    {
      "type": "over" | "wicket" | "boundary" | "timeout" | "milestone",
      "label": "e.g. 'Over 12: ${match.teamB.shortName} 90/3'",
      "description": "Tactical summary of the block of play",
      "overNumber": 12.0,
      "runs": 90,
      "wickets": 3,
      "team": "${match.teamB.shortName}",
      "winProbability": { "${match.teamA.shortName}": 0.4, "${match.teamB.shortName}": 0.6 },
      "momentum": 15,
      "commentary": "Commentary details..."
    }
  ],
  "finalScorecard": {
    "teamA": {
      "batting": [
        { "name": "Player Name", "runs": 45, "balls": 30, "fours": 4, "sixes": 2, "strikeRate": 150.0, "isOut": true, "dismissalInfo": "c Fielder b Bowler" }
      ],
      "bowling": [
        { "name": "Bowler Name", "overs": 4, "maidens": 0, "runs": 28, "wickets": 2, "economy": 7.0 }
      ],
      "extras": 4,
      "totalRuns": 170,
      "totalWickets": 8,
      "overs": 20
    },
    "teamB": {
      "batting": [
        { "name": "Player Name", "runs": 45, "balls": 30, "fours": 4, "sixes": 2, "strikeRate": 150.0, "isOut": true, "dismissalInfo": "c Fielder b Bowler" }
      ],
      "bowling": [
        { "name": "Bowler Name", "overs": 4, "maidens": 0, "runs": 28, "wickets": 2, "economy": 7.0 }
      ],
      "extras": 2,
      "totalRuns": 182,
      "totalWickets": 4,
      "overs": 19.2
    }
  }
}
`;

  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json'
      }
    });

    const jsonText = response.text || '';
    const parsed: SimulatedMatchResponse = JSON.parse(jsonText);

    // Convert response into our app data formats
    const simulatedNodes: CricketEventNode[] = parsed.simulatedNodes.map((n, index) => {
      // Node IDs
      const nodeId = `${branchId}_node_${index}`;
      const parentId = index === 0 ? currentNode.id : `${branchId}_node_${index - 1}`;
      
      // Map probabilities to both team shortNames and generic teamA/teamB keys
      const wp: any = {};
      const valA = n.winProbability[match.teamA.shortName] ?? n.winProbability[match.teamA.name] ?? n.winProbability.teamA ?? 0.5;
      const valB = n.winProbability[match.teamB.shortName] ?? n.winProbability[match.teamB.name] ?? n.winProbability.teamB ?? 0.5;
      
      wp.teamA = valA;
      wp.teamB = valB;
      wp[match.teamA.shortName] = valA;
      wp[match.teamB.shortName] = valB;

      return {
        id: nodeId,
        type: n.type,
        label: n.label,
        description: n.description,
        overNumber: n.overNumber,
        runs: n.runs,
        wickets: n.wickets,
        team: n.team,
        timestamp: new Date().toISOString(),
        winProbability: wp,
        momentum: n.momentum,
        commentary: n.commentary,
        isAlternate: true,
        branchId,
        parentId
      };
    });

    const branch: TimelineBranch = {
      id: branchId,
      name: branchName,
      parentBranchId: currentNode.branchId,
      parentEventNodeId: currentNode.id,
      premise,
      createdAt: new Date().toISOString(),
      projectedResult: parsed.projectedResult
    };

    // Ensure target field is attached to Scorecard state
    const scorecardState: MatchScorecardState = {
      matchId: match.id,
      branchId,
      teamA: {
        ...parsed.finalScorecard.teamA,
        target: match.currentInnings === 2 ? parsed.finalScorecard.teamB.totalRuns + 1 : undefined
      },
      teamB: {
        ...parsed.finalScorecard.teamB,
        target: match.currentInnings === 2 ? parsed.finalScorecard.teamA.totalRuns + 1 : undefined
      }
    };

    return { branch, nodes: simulatedNodes, scorecardState };

  } catch (error) {
    console.error('Failed to run Gemini simulation, falling back to mock:', error);
    return generateMockFallback(match, currentNode, premise, branchId, branchName);
  }
}

// Generate rich fallback matches for standard demo scenarios
function generateMockFallback(
  match: Match,
  currentNode: CricketEventNode,
  premise: string,
  branchId: string,
  branchName: string
): {
  branch: TimelineBranch;
  nodes: CricketEventNode[];
  scorecardState: MatchScorecardState;
} {
  const normPremise = premise.toLowerCase();
  
  let projectedResult = '';
  let nodes: Omit<CricketEventNode, 'id' | 'parentId' | 'branchId' | 'isAlternate'>[] = [];
  let scorecardTeamA: Scorecard;
  let scorecardTeamB: Scorecard;

  if (normPremise.includes('century') || normPremise.includes('hundred')) {
    // Opener scores a century
    projectedResult = 'MI: 215/3, MI wins by 24 runs';
    
    nodes = [
      {
        type: 'milestone',
        label: 'Rohit Sharma Century! MI 148/1',
        description: 'Rohit Sharma brings up a spectacular 100 off just 52 balls at Wankhede.',
        overNumber: 14.2,
        runs: 148,
        wickets: 1,
        team: 'MI',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.85, teamB: 0.15 },
        momentum: 80,
        commentary: "A roaring ovation! Rohit sweeps Jadeja over backward square leg for a six to reach his century. A legendary knock from the Hitman!"
      },
      {
        type: 'over',
        label: 'Innings End: MI 215/3',
        description: 'MI posts a massive total of 215, riding on Rohit\'s undefeated 124.',
        overNumber: 20,
        runs: 215,
        wickets: 3,
        team: 'MI',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.90, teamB: 0.10 },
        momentum: 90,
        commentary: "CSK bowlers had no answers. Rohit finishes on 124* off 64 balls. David and Hardik provided the late fire. CSK will have to chase 216."
      },
      {
        type: 'wicket',
        label: 'CSK 86/4: Spin Web',
        description: 'CSK middle order collapses under scoreboard pressure. Piyush Chawla bags two.',
        overNumber: 10.4,
        runs: 86,
        wickets: 4,
        team: 'CSK',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.95, teamB: 0.05 },
        momentum: -50,
        commentary: "CSK is buckling! Gaikwad fought hard for 42, but Dube and Jadeja fell trying to clear the boundary. Required rate is now 13.5."
      },
      {
        type: 'over',
        label: 'MI Wins by 24 Runs! CSK 191/6',
        description: 'CSK finishes on 191/6. Despite Mitchell\'s 60*, MI secures a comfortable victory.',
        overNumber: 20,
        runs: 191,
        wickets: 6,
        team: 'CSK',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 1.0, teamB: 0.0 },
        momentum: 60,
        commentary: "Bumrah concedes just 6 runs in the final over. A comprehensive win for Mumbai, sparked entirely by Rohit's masterclass century."
      }
    ];

    scorecardTeamA = {
      batting: [
        { name: "R. Sharma", runs: 124, balls: 64, fours: 12, sixes: 7, strikeRate: 193.8, isOut: false },
        { name: "I. Kishan", runs: 28, balls: 20, fours: 3, sixes: 1, strikeRate: 140.0, isOut: true, dismissalInfo: "c Dhoni b Chahar" },
        { name: "S. Yadav", runs: 12, balls: 8, fours: 1, sixes: 1, strikeRate: 150.0, isOut: true, dismissalInfo: "b Pathirana" },
        { name: "T. David", runs: 35, balls: 18, fours: 2, sixes: 3, strikeRate: 194.4, isOut: false }
      ],
      bowling: [
        { name: "J. Bumrah", overs: 4, maidens: 0, runs: 22, wickets: 2, economy: 5.5 },
        { name: "G. Coetzee", overs: 4, maidens: 0, runs: 38, wickets: 1, economy: 9.5 },
        { name: "P. Chawla", overs: 4, maidens: 0, runs: 28, wickets: 2, economy: 7.0 }
      ],
      extras: 6,
      totalRuns: 215,
      totalWickets: 3,
      overs: 20
    };

    scorecardTeamB = {
      batting: [
        { name: "R. Gaikwad", runs: 42, balls: 28, fours: 5, sixes: 1, strikeRate: 150.0, isOut: true, dismissalInfo: "c Kishan b Chawla" },
        { name: "R. Ravindra", runs: 15, balls: 12, fours: 1, sixes: 1, strikeRate: 125.0, isOut: true, dismissalInfo: "b Bumrah" },
        { name: "D. Mitchell", runs: 60, balls: 38, fours: 4, sixes: 3, strikeRate: 157.9, isOut: false }
      ],
      bowling: [
        { name: "D. Chahar", overs: 4, maidens: 0, runs: 42, wickets: 1, economy: 10.5 },
        { name: "M. Pathirana", overs: 4, maidens: 0, runs: 30, wickets: 1, economy: 7.5 }
      ],
      extras: 4,
      totalRuns: 191,
      totalWickets: 6,
      overs: 20
    };

  } else if (normPremise.includes('6 overs') || normPremise.includes('early') || normPremise.includes('out')) {
    // Openers dismissed within 6 overs
    projectedResult = 'CSK: 135 all out, MI wins by 7 wickets';
    
    nodes = [
      {
        type: 'wicket',
        label: 'Powerplay Disasters: CSK 38/3',
        description: 'Both Gaikwad and Rahane dismissed inside the powerplay by Bumrah\'s swing.',
        overNumber: 5.2,
        runs: 38,
        wickets: 3,
        team: 'CSK',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.78, teamB: 0.22 },
        momentum: -60,
        commentary: "CSK openers in tatters! Gaikwad edged to slip, and Rachin was clean bowled next ball. Wankhede is rocking!"
      },
      {
        type: 'over',
        label: 'CSK Innings: 135 All Out',
        description: 'Shivam Dube fights alone with 45, but Coetzee sweeps the tail.',
        overNumber: 18.4,
        runs: 135,
        wickets: 10,
        team: 'CSK',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.92, teamB: 0.08 },
        momentum: -80,
        commentary: "Bowled out! Mitchell Santner hits it straight to long-on. CSK registers a sub-par 135. MI needs 136 to win."
      },
      {
        type: 'over',
        label: 'MI 78/1: Easy Chase',
        description: 'Rohit Sharma guides MI smoothly towards the target with low risk.',
        overNumber: 10,
        runs: 78,
        wickets: 1,
        team: 'MI',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.98, teamB: 0.02 },
        momentum: 40,
        commentary: "MI in absolute cruise control. Rohit 40*, SKY 20*. Scoring runs at will with no scoreboard pressure."
      },
      {
        type: 'over',
        label: 'MI Wins by 7 Wickets! MI 139/3',
        description: 'MI chases down 136 in 16.2 overs. Clinical chase.',
        overNumber: 16.2,
        runs: 139,
        wickets: 3,
        team: 'MI',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 1.0, teamB: 0.0 },
        momentum: 50,
        commentary: "SKY hits a four to finish the match. Clinical performance by Mumbai Indians, setup entirely by the powerplay wickets."
      }
    ];

    scorecardTeamA = {
      batting: [
        { name: "R. Sharma", runs: 58, balls: 42, fours: 6, sixes: 2, strikeRate: 138.1, isOut: true, dismissalInfo: "c Dhoni b Jadeja" },
        { name: "I. Kishan", runs: 18, balls: 14, fours: 2, sixes: 0, strikeRate: 128.6, isOut: true, dismissalInfo: "b Chahar" },
        { name: "S. Yadav", runs: 42, balls: 26, fours: 5, sixes: 1, strikeRate: 161.5, isOut: false }
      ],
      bowling: [
        { name: "J. Bumrah", overs: 4, maidens: 1, runs: 15, wickets: 3, economy: 3.75 },
        { name: "G. Coetzee", overs: 3.4, maidens: 0, runs: 28, wickets: 4, economy: 7.63 }
      ],
      extras: 4,
      totalRuns: 139,
      totalWickets: 3,
      overs: 16.2
    };

    scorecardTeamB = {
      batting: [
        { name: "R. Gaikwad", runs: 6, balls: 8, fours: 1, sixes: 0, strikeRate: 75.0, isOut: true, dismissalInfo: "c Rohit b Bumrah" },
        { name: "R. Ravindra", runs: 2, balls: 4, fours: 0, sixes: 0, strikeRate: 50.0, isOut: true, dismissalInfo: "b Bumrah" },
        { name: "S. Dube", runs: 45, balls: 32, fours: 3, sixes: 2, strikeRate: 140.6, isOut: true, dismissalInfo: "c David b Coetzee" }
      ],
      bowling: [
        { name: "D. Chahar", overs: 3, maidens: 0, runs: 24, wickets: 1, economy: 8.0 },
        { name: "R. Jadeja", overs: 4, maidens: 0, runs: 22, wickets: 1, economy: 5.5 }
      ],
      extras: 5,
      totalRuns: 135,
      totalWickets: 10,
      overs: 18.4
    };

  } else {
    // Custom generic timeline
    projectedResult = `CSK: 168/7, MI: 169/5, MI wins by 5 wickets`;
    
    nodes = [
      {
        type: 'simulation_node',
        label: 'Alternate: Play shifts',
        description: `Timeline branches due to: "${premise}"`,
        overNumber: currentNode.overNumber + 2,
        runs: currentNode.runs + 18,
        wickets: currentNode.wickets,
        team: currentNode.team,
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.55, teamB: 0.45 },
        momentum: 10,
        commentary: `The simulation branches here. Because of the shift: "${premise}", team strategies adapt immediately.`
      },
      {
        type: 'over',
        label: 'Simulator: Final overs pressure',
        description: 'Match reaches crunch phase with win probabilities balancing.',
        overNumber: 18.0,
        runs: currentNode.runs + 65,
        wickets: currentNode.wickets + 2,
        team: currentNode.team,
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 0.60, teamB: 0.40 },
        momentum: 20,
        commentary: "A tense struggle. AI projections show boundaries are harder to hit, but wickets are preserved."
      },
      {
        type: 'over',
        label: 'Simulator: Match complete',
        description: `Projected: MI wins by 5 wickets. Setup: "${premise}"`,
        overNumber: 20,
        runs: 169,
        wickets: 5,
        team: 'MI',
        timestamp: new Date().toISOString(),
        winProbability: { teamA: 1.0, teamB: 0.0 },
        momentum: 50,
        commentary: `Match simulation completes! The alternate decision: "${premise}" created a final margin of 5 wickets in favor of Mumbai Indians.`
      }
    ];

    scorecardTeamA = {
      batting: [
        { name: "R. Sharma", runs: 65, balls: 40, fours: 7, sixes: 2, strikeRate: 162.5, isOut: true, dismissalInfo: "c Dhoni b Pathirana" },
        { name: "I. Kishan", runs: 30, balls: 22, fours: 4, sixes: 0, strikeRate: 136.4, isOut: true, dismissalInfo: "b Chahar" },
        { name: "H. Pandya", runs: 28, balls: 15, fours: 1, sixes: 2, strikeRate: 186.7, isOut: false }
      ],
      bowling: [
        { name: "J. Bumrah", overs: 4, maidens: 0, runs: 24, wickets: 2, economy: 6.0 }
      ],
      extras: 4,
      totalRuns: 169,
      totalWickets: 5,
      overs: 19.4
    };

    scorecardTeamB = {
      batting: [
        { name: "R. Gaikwad", runs: 52, balls: 36, fours: 6, sixes: 1, strikeRate: 144.4, isOut: true, dismissalInfo: "b Bumrah" },
        { name: "S. Dube", runs: 35, balls: 24, fours: 2, sixes: 2, strikeRate: 145.8, isOut: true, dismissalInfo: "c Rohit b Coetzee" }
      ],
      bowling: [
        { name: "D. Chahar", overs: 4, maidens: 0, runs: 35, wickets: 1, economy: 8.75 }
      ],
      extras: 6,
      totalRuns: 168,
      totalWickets: 7,
      overs: 20
    };
  }

  // Convert the template nodes into full parent-child nodes
  const simulatedNodes: CricketEventNode[] = [];
  let currentParentId = currentNode.id;

  nodes.forEach((n, idx) => {
    const nodeId = `${branchId}_node_${idx}`;
    simulatedNodes.push({
      ...n,
      id: nodeId,
      branchId,
      parentId: currentParentId,
      isAlternate: true
    });
    currentParentId = nodeId;
  });

  const branch: TimelineBranch = {
    id: branchId,
    name: branchName,
    parentBranchId: currentNode.branchId,
    parentEventNodeId: currentNode.id,
    premise,
    createdAt: new Date().toISOString(),
    projectedResult
  };

  const scorecardState: MatchScorecardState = {
    matchId: match.id,
    branchId,
    teamA: scorecardTeamA,
    teamB: scorecardTeamB
  };

  const shortA = match.teamA.shortName;
  const shortB = match.teamB.shortName;
  const nameA = match.teamA.name;
  const nameB = match.teamB.name;

  const mockObject = { branch, nodes: simulatedNodes, scorecardState };
  let mockString = JSON.stringify(mockObject);
  
  // Replace team shortnames and names
  mockString = mockString
    .replace(/"MI"/g, `"${shortA}"`)
    .replace(/"CSK"/g, `"${shortB}"`)
    .replace(/\bMI\b/g, shortA)
    .replace(/\bCSK\b/g, shortB)
    .replace(/Mumbai Indians/g, nameA)
    .replace(/Chennai Super Kings/g, nameB);
    
  // Replace player names dynamically to match current team prefixes
  const playerReplacements = [
    { from: 'Rohit Sharma', to: `${shortA} Opener 1` },
    { from: 'R. Sharma', to: `${shortA} Batter 1` },
    { from: 'I. Kishan', to: `${shortA} Batter 2` },
    { from: 'S. Yadav', to: `${shortA} Batter 3` },
    { from: 'T. David', to: `${shortA} Batter 4` },
    { from: 'R. Gaikwad', to: `${shortB} Batter 1` },
    { from: 'R. Ravindra', to: `${shortB} Batter 2` },
    { from: 'D. Mitchell', to: `${shortB} Batter 3` },
    { from: 'S. Dube', to: `${shortB} Batter 4` },
    { from: 'J. Bumrah', to: `${shortA} Bowler 1` },
    { from: 'G. Coetzee', to: `${shortA} Bowler 2` },
    { from: 'P. Chawla', to: `${shortA} Bowler 3` },
    { from: 'D. Chahar', to: `${shortB} Bowler 1` },
    { from: 'M. Pathirana', to: `${shortB} Bowler 2` },
    { from: 'R. Jadeja', to: `${shortB} Bowler 3` }
  ];
  
  playerReplacements.forEach(rep => {
    mockString = mockString.replace(new RegExp(rep.from, 'g'), rep.to);
  });
  
  return JSON.parse(mockString);
}
