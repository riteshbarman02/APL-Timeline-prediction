export type MatchStatus = 'live' | 'mock' | 'completed' | 'upcoming';

export interface TeamInfo {
  name: string;
  shortName: string;
  logoUrl?: string;
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
  overNumber: number; // e.g., 5 for complete over 5, 5.4 for mid-over
  runs: number;
  wickets: number;
  team: string; // shortName of batting team
  timestamp: string;
  winProbability: WinProbability;
  momentum: number; // range -100 to 100, indicating direction of play
  commentary: string;
  isAlternate: boolean;
  branchId: string; // "real" or alternate branch ID
  parentId?: string; // ID of the node leading directly to this one
}

export interface TimelineBranch {
  id: string; // "real" or UUID
  name: string; // e.g., "Real Match" or "Openers Century"
  parentBranchId?: string; // nested branches
  parentEventNodeId?: string; // node from which this branch splits
  premise: string; // the starting condition/action description
  createdAt: string;
  projectedResult?: string; // Summary of projected final result (e.g. "MI: 195/4, wins by 12 runs")
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
  premise: string; // The "Canon Premise" or "Tactical Tweak"
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
export type WsMessageType = 'init' | 'timeline_update' | 'match_completed';

export interface WsMessage {
  type: WsMessageType;
  matchId: string;
  data: any;
}
