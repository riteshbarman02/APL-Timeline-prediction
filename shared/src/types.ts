export type MatchStatus = 'live' | 'mock' | 'completed' | 'upcoming';

export type MatchPhase =
  | 'pre_toss'
  | 'innings1'
  | 'innings_break'
  | 'innings2'
  | 'completed';

export interface TeamInfo {
  name: string;
  shortName: string;
  logoUrl?: string;
}

/** Snapshot of a single innings */
export interface Innings {
  number: 1 | 2;
  battingTeam: string;   // short name
  bowlingTeam: string;   // short name
  runs: number;
  wickets: number;
  overs: number;
  isComplete: boolean;
  target?: number;       // only set on innings 2
}

export interface Match {
  id: string;
  teamA: TeamInfo;
  teamB: TeamInfo;
  status: MatchStatus;
  currentInnings: 1 | 2;
  venue: string;
  date: string;
  tossWinner: string;
  tossDecision: 'bat' | 'field';
  series?: string;

  // --- domain-derived fields (set by normalizeMatch) ---
  innings: Innings[];          // ordered [inn1, inn2?]
  target?: number;             // innings[1].target if chasing
  isChase: boolean;
  matchPhase: MatchPhase;
}

export type EventNodeType =
  | 'toss'
  | 'over'
  | 'wicket'
  | 'boundary'
  | 'timeout'
  | 'milestone'
  | 'simulation_start'
  | 'simulation_node';

export interface WinProbability {
  teamA: number; // e.g. 0.45 (45%)
  teamB: number; // e.g. 0.55 (55%)
}

export interface CricketEventNode {
  id: string;
  type: EventNodeType;
  label: string;
  description: string;
  overNumber: number;   // e.g., 5 for complete over 5, 5.4 for mid-over
  runs: number;
  wickets: number;
  team: string;         // shortName of batting team — always a real team name
  inn: 1 | 2;          // which innings this node belongs to
  timestamp: string;
  winProbability: WinProbability;
  momentum: number;     // range -100 to 100
  commentary: string;
  isAlternate: boolean;
  branchId: string;     // "real" or alternate branch ID
  parentId?: string;    // ID of the node leading directly to this one
}

export interface TimelineBranch {
  id: string;                   // "real" or UUID
  name: string;
  parentBranchId?: string;
  parentEventNodeId?: string;
  premise: string;
  createdAt: string;
  projectedResult?: string;
}

export interface PlayerScorecardEntry {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: number;
  isOut: boolean;
  dismissalInfo?: string;
}

export interface BowlerScorecardEntry {
  name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number;
}

export interface Scorecard {
  batting: PlayerScorecardEntry[];
  bowling: BowlerScorecardEntry[];
  extras: number;
  totalRuns: number;
  totalWickets: number;
  overs: number;
  target?: number;
}

export interface MatchScorecardState {
  matchId: string;
  branchId: string;
  teamA: Scorecard;
  teamB: Scorecard;
}

export interface SimulateRequest {
  matchId: string;
  nodeId: string;
  premise: string;
}

export interface SimulateResponse {
  branch: TimelineBranch;
  nodes: CricketEventNode[];
  scorecardState: MatchScorecardState;
}

export interface MatchTimelineData {
  match: Match;
  branches: TimelineBranch[];
  nodes: CricketEventNode[];
  activeBranchId: string;
  scorecardState: MatchScorecardState;
}

// WebSocket Event Payloads
export type WsMessageType =
  | 'init'
  | 'timeline_update'
  | 'scorecard_update'
  | 'match_update'        // fires when match object changes (e.g. innings transition)
  | 'match_completed';

export interface WsMessage {
  type: WsMessageType;
  matchId: string;
  data: any;
}
