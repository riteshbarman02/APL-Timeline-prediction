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

  // Identify batting teams for both innings
  const teamAShort = match.teamA.shortName;
  const teamBShort = match.teamB.shortName;
  const tossWinner = match.tossWinner;
  const tossDecision = match.tossDecision;

  let innings1BattingTeam = teamAShort;
  let innings2BattingTeam = teamBShort;
  if (tossWinner && tossDecision === 'field') {
    innings1BattingTeam = tossWinner === teamAShort ? teamBShort : teamAShort;
    innings2BattingTeam = tossWinner === teamAShort ? teamAShort : teamBShort;
  } else if (tossWinner && tossDecision === 'bat') {
    innings1BattingTeam = tossWinner === teamAShort ? teamAShort : teamBShort;
    innings2BattingTeam = tossWinner === teamAShort ? teamBShort : teamAShort;
  }

  const isNodeInnings2 = (currentNode.team === innings2BattingTeam && currentNode.type !== 'toss') || match.currentInnings === 2;

  // Derive Innings 1 total from parent nodes when in Innings 2
  const innings1Total = (() => {
    if (!isNodeInnings2) return 0;
    const inn1Nodes = parentNodes.filter(n => n.team === innings1BattingTeam && n.type !== 'toss');
    if (inn1Nodes.length > 0) {
      return Math.max(...inn1Nodes.map(n => n.runs));
    }
    return 0;
  })();

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
7. IMPORTANT ON INNINGS & BATTING TEAMS:
   If the match is currently in Innings 1 (i.e. Batting Team is the first innings team, which is ${innings1BattingTeam}):
   - You MUST simulate BOTH the rest of Innings 1 AND the entire Innings 2.
   - You must include an Innings End milestone node for ${innings1BattingTeam} at over 20.
   - You must then simulate Innings 2 where ${innings2BattingTeam} bats to chase the target.
   - For all simulated nodes, the "team" field MUST match the team actually batting at that moment (${innings1BattingTeam} for Innings 1 nodes, and ${innings2BattingTeam} for Innings 2 nodes).
   If the match is already in Innings 2 (i.e. Batting Team is ${innings2BattingTeam}):
   - You only need to simulate the remainder of Innings 2. All simulated nodes must have "team" set to ${innings2BattingTeam}.
`;

  const userPrompt = `
MATCH CONTEXT:
Teams: ${match.teamA.name} (${match.teamA.shortName}) vs ${match.teamB.name} (${match.teamB.shortName})
Venue: ${match.venue}
Toss: Won by ${match.tossWinner}, decided to ${match.tossDecision} first.
Innings 1 Target Score (if Innings 2 is chasing): ${isNodeInnings2 ? `${innings1Total} runs scored, target = ${innings1Total + 1}` : 'To be determined after Innings 1'}

CURRENT POSITION IN MATCH:
Current Innings: ${isNodeInnings2 ? 2 : 1}
Batting Team: ${currentNode.team}
Current Score: ${currentNode.runs}/${currentNode.wickets}
Current Over: ${currentNode.overNumber}
Current Event Node: ${currentNode.label} - ${currentNode.description}

PREVIOUS KEY MATCH EVENTS:
${parentTimelineStr}

NEW CANON PREMISE TO INJECT:
"${premise}"

Generate the alternate timeline from this point forward until the match completes.
If the current position is in Innings 1:
- Simulate the rest of Innings 1 up to over 20 (team: ${innings1BattingTeam}).
- Create an Innings End milestone node for ${innings1BattingTeam} at over 20 showing their final total score (e.g. 180/5).
- Calculate the target score for Innings 2 (Innings 1 total runs + 1).
- Simulate the entirety of Innings 2 where ${innings2BattingTeam} chases that target. Include milestone nodes in Innings 2 (e.g. over 6, over 15, and the match end node showing the final result).
- Provide 4 to 6 key simulation nodes representing major milestones across both innings.
If the current position is in Innings 2:
- You only need to simulate the rest of Innings 2. All simulated nodes must be for Innings 2.
- Provide 3 to 5 key simulation nodes representing major milestones until match completion.

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
      "team": "Team shortname, e.g. '${match.teamB.shortName}'",
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
        inn: (n.team === innings2BattingTeam ? 2 : 1) as 1 | 2,
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
    const isTeamABattingFirst = innings1BattingTeam === match.teamA.shortName;
    const scorecardState: MatchScorecardState = {
      matchId: match.id,
      branchId,
      teamA: {
        ...parsed.finalScorecard.teamA,
        target: !isTeamABattingFirst ? parsed.finalScorecard.teamB.totalRuns + 1 : undefined
      },
      teamB: {
        ...parsed.finalScorecard.teamB,
        target: isTeamABattingFirst ? parsed.finalScorecard.teamA.totalRuns + 1 : undefined
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
  const shortA = match.teamA.shortName;
  const shortB = match.teamB.shortName;
  const nameA = match.teamA.name;
  const nameB = match.teamB.name;
  
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
        inn: 1,
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
        inn: 1,
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
        inn: 2,
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
        inn: 2,
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
        inn: 1,
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
        inn: 1,
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
        inn: 2,
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
        inn: 2,
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
    // Custom generic timeline — determine if branch starts in Innings 2
    // Innings 2 batting team is the one that bats second based on toss
    let innings1BattingTeam = shortA;
    let innings2BattingTeam = shortB;
    if (match.tossWinner && match.tossDecision === 'field') {
      innings1BattingTeam = match.tossWinner === shortA ? shortB : shortA;
      innings2BattingTeam = match.tossWinner === shortA ? shortA : shortB;
    } else if (match.tossWinner && match.tossDecision === 'bat') {
      innings1BattingTeam = match.tossWinner === shortA ? shortA : shortB;
      innings2BattingTeam = match.tossWinner === shortA ? shortB : shortA;
    }
    const isBranchInnings2 = currentNode.team === innings2BattingTeam && currentNode.type !== 'toss';

    if (!isBranchInnings2) {
      // Branch point is in Innings 1. Simulate both Innings 1 and Innings 2.
      const inn1EndRuns = currentNode.runs + 85;
      const inn1EndWickets = Math.min(9, currentNode.wickets + 3);
      const target = inn1EndRuns + 1;
      
      const inn2EndRuns = target + 4; // Chasing team (MI) wins
      const inn2EndWickets = 4;

      projectedResult = `MI wins by 6 wickets, chasing target of ${target}`;

      nodes = [
        {
          type: 'simulation_node',
          label: `Play shifts: CSK adapting`,
          description: `Timeline branches due to: "${premise}" in 1st Innings.`,
          overNumber: Math.min(15, currentNode.overNumber + 2),
          runs: currentNode.runs + 25,
          wickets: Math.min(9, currentNode.wickets + 1),
          team: 'CSK',
          inn: 1,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 0.50, teamB: 0.50 },
          momentum: 5,
          commentary: `Under the custom premise: "${premise}", CSK adjusts their strategy. Batter starts targeting specific matchups.`
        },
        {
          type: 'milestone',
          label: `1st Innings End: CSK ${inn1EndRuns}/${inn1EndWickets}`,
          description: `CSK completes their innings posting ${inn1EndRuns} runs.`,
          overNumber: 20,
          runs: inn1EndRuns,
          wickets: inn1EndWickets,
          team: 'CSK',
          inn: 1,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 0.45, teamB: 0.55 },
          momentum: 10,
          commentary: `CSK finishes on ${inn1EndRuns}/${inn1EndWickets} after 20 overs. Late boundaries helped boost the total. Target for MI is ${target} runs.`
        },
        {
          type: 'over',
          label: `Powerplay: MI 52/1`,
          description: `MI begins their chase of ${target} in the Powerplay.`,
          overNumber: 6,
          runs: 52,
          wickets: 1,
          team: 'MI',
          inn: 2,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 0.55, teamB: 0.45 },
          momentum: 15,
          commentary: `Solid powerplay start for MI. One wicket down, but runs are flowing smoothly on this deck.`
        },
        {
          type: 'over',
          label: `MI 128/3 (15 Ov)`,
          description: `Chase reaches a crucial stage. MI needs ${target - 128} runs from 30 balls.`,
          overNumber: 15,
          runs: 128,
          wickets: 3,
          team: 'MI',
          inn: 2,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 0.65, teamB: 0.35 },
          momentum: 20,
          commentary: `Spinners keeping things tight, but MI is keeping up with the rate. An exciting finish awaits.`
        },
        {
          type: 'over',
          label: `Match complete: MI wins!`,
          description: `Projected: MI successfully chases down the target in 19.3 overs.`,
          overNumber: 19.3,
          runs: inn2EndRuns,
          wickets: inn2EndWickets,
          team: 'MI',
          inn: 2,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 1.0, teamB: 0.0 },
          momentum: 80,
          commentary: `A spectacular boundary finishes the chase! MI wins El Clásico by 6 wickets, successfully chasing ${target}. The tactic: "${premise}" set a chain of events that culminated in a clinical chase.`
        }
      ];

      scorecardTeamA = {
        batting: [
          { name: "MI Opener 1", runs: 72, balls: 45, fours: 8, sixes: 2, strikeRate: 160.0, isOut: false },
          { name: "MI Batter 1", runs: 30, balls: 24, fours: 3, sixes: 0, strikeRate: 125.0, isOut: true, dismissalInfo: "c Fielder b Bowler" },
          { name: "MI Batter 2", runs: 45, balls: 28, fours: 4, sixes: 1, strikeRate: 160.7, isOut: false }
        ],
        bowling: [
          { name: "CSK Bowler 1", overs: 4, maidens: 0, runs: 28, wickets: 2, economy: 7.0 }
        ],
        extras: 6,
        totalRuns: inn2EndRuns,
        totalWickets: inn2EndWickets,
        overs: 19.3
      };

      scorecardTeamB = {
        batting: [
          { name: "CSK Opener 1", runs: 65, balls: 40, fours: 7, sixes: 2, strikeRate: 162.5, isOut: true, dismissalInfo: "c Dhoni b Pathirana" },
          { name: "CSK Batter 1", runs: 40, balls: 30, fours: 4, sixes: 1, strikeRate: 133.3, isOut: false },
          { name: "CSK Batter 2", runs: 50, balls: 32, fours: 5, sixes: 2, strikeRate: 156.3, isOut: false }
        ],
        bowling: [
          { name: "MI Bowler 1", overs: 4, maidens: 0, runs: 24, wickets: 2, economy: 6.0 }
        ],
        extras: 4,
        totalRuns: inn1EndRuns,
        totalWickets: inn1EndWickets,
        overs: 20
      };

    } else {
      // Branch point is in Innings 2. Only simulate remaining Innings 2.
      // Try to get target from the current score context (parent nodes should have innings 1 total)
      const guessedInnings1Total = Math.max(150, currentNode.runs + 30);
      const target = guessedInnings1Total + 1;
      const inn2EndRuns = target + 2; // Chasing team wins
      const inn2EndWickets = Math.min(9, currentNode.wickets + 2);

      projectedResult = `MI wins by ${10 - inn2EndWickets} wickets, chasing target of ${target}`;

      nodes = [
        {
          type: 'simulation_node',
          label: `Play shifts: MI adapting`,
          description: `Timeline branches due to: "${premise}" in 2nd Innings.`,
          overNumber: Math.min(18, currentNode.overNumber + 2),
          runs: currentNode.runs + 20,
          wickets: Math.min(9, currentNode.wickets + 1),
          team: 'MI',
          inn: 2,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 0.55, teamB: 0.45 },
          momentum: 10,
          commentary: `Under the custom premise: "${premise}", MI adapts their chase strategy. Batsmen start targeting specific bowlers.`
        },
        {
          type: 'over',
          label: `Simulator: Final overs pressure`,
          description: `Chase reaches crunch phase. MI closing in on target of ${target}.`,
          overNumber: 18.0,
          runs: currentNode.runs + 45,
          wickets: Math.min(9, currentNode.wickets + 2),
          team: 'MI',
          inn: 2,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 0.65, teamB: 0.35 },
          momentum: 20,
          commentary: "A tense struggle. AI projections show boundaries are harder to hit, but wickets are preserved."
        },
        {
          type: 'over',
          label: `Match complete: MI wins!`,
          description: `Projected: MI successfully chases down the target.`,
          overNumber: 20,
          runs: inn2EndRuns,
          wickets: inn2EndWickets,
          team: 'MI',
          inn: 2,
          timestamp: new Date().toISOString(),
          winProbability: { teamA: 1.0, teamB: 0.0 },
          momentum: 80,
          commentary: `Match simulation completes! The alternate decision: "${premise}" created a final margin of ${10 - inn2EndWickets} wickets in favor of MI.`
        }
      ];

      scorecardTeamA = {
        batting: [
          { name: "MI Opener 1", runs: 75, balls: 48, fours: 8, sixes: 2, strikeRate: 156.3, isOut: false },
          { name: "MI Batter 1", runs: 45, balls: 32, fours: 4, sixes: 1, strikeRate: 140.6, isOut: false }
        ],
        bowling: [
          { name: "CSK Bowler 1", overs: 4, maidens: 0, runs: 28, wickets: 2, economy: 7.0 }
        ],
        extras: 6,
        totalRuns: inn2EndRuns,
        totalWickets: inn2EndWickets,
        overs: 20
      };

      scorecardTeamB = {
        batting: [
          { name: "CSK Opener 1", runs: 65, balls: 40, fours: 7, sixes: 2, strikeRate: 162.5, isOut: true, dismissalInfo: "c Dhoni b Pathirana" }
        ],
        bowling: [
          { name: "MI Bowler 1", overs: 4, maidens: 0, runs: 24, wickets: 2, economy: 6.0 }
        ],
        extras: 4,
        totalRuns: target - 1,
        totalWickets: 6,
        overs: 20
      };
    }
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

  // shortA/shortB/nameA/nameB are already declared at top of function
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
