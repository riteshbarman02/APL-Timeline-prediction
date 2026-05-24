/**
 * getMatchDisplayState.ts
 *
 * Converts a Match + DerivedMatchState into ready-to-render display strings.
 * UI components ONLY consume this — they never compute cricket logic themselves.
 */

import { Match } from '../types.js';
import { DerivedMatchState } from './deriveMatchState.js';

export interface MatchDisplayState {
  /** e.g. "MI need 42 runs in 18 balls" or "RR: 182/6 (20 ov)" */
  title: string;

  /** e.g. "RR 182/6 (20 overs)" */
  subtitle: string;

  /** e.g. "CHASE" | "1ST INNINGS" | "INNINGS BREAK" | "COMPLETED" */
  phase: string;

  /** Full name of currently batting team */
  battingTeamName: string;

  /** Short name of currently batting team */
  battingTeamShort: string;

  /** Full name of currently bowling team */
  bowlingTeamName: string;

  /** Short name of currently bowling team */
  bowlingTeamShort: string;

  /** e.g. "56/2 (8.3 ov)" */
  scoreline: string;

  /** e.g. "RR: 182/6 (20 ov)" */
  inn1Summary: string;

  /** e.g. "MI: 56/2 (8.3 ov)" or undefined if innings 2 not started */
  inn2Summary: string | undefined;

  /** Target string e.g. "Target: 183" or undefined */
  targetStr: string | undefined;

  /** 0–100 progress of current innings overs */
  oversProgress: number;

  /** Win probability of teamA (0–100 %) */
  teamAWinPct: number;

  /** Win probability of teamB (0–100 %) */
  teamBWinPct: number;
}

function resolveFullName(match: Match, shortName: string): string {
  if (match.teamA.shortName === shortName) return match.teamA.name;
  if (match.teamB.shortName === shortName) return match.teamB.name;
  return shortName;
}

function fmtOvers(overs: number): string {
  const completed = Math.floor(overs);
  const balls = Math.round((overs % 1) * 10);
  return balls === 0 ? `${completed}` : `${completed}.${balls}`;
}

export function getMatchDisplayState(
  match: Match,
  d: DerivedMatchState
): MatchDisplayState {
  const battingTeamName = resolveFullName(match, d.currentBattingTeam);
  const bowlingTeamName = resolveFullName(match, d.currentBowlingTeam);
  const inn1FullName = resolveFullName(match, d.inn1BattingTeam);
  const inn2FullName = resolveFullName(match, d.inn2BattingTeam);

  // Phase label
  let phase = '1ST INNINGS';
  if (d.matchPhase === 'innings_break') phase = 'INNINGS BREAK';
  else if (d.matchPhase === 'innings2') phase = 'CHASE';
  else if (d.matchPhase === 'completed') phase = 'COMPLETED';
  else if (d.matchPhase === 'pre_toss') phase = 'PRE TOSS';

  // Current scoreline
  const currentRuns = d.isChase ? d.inn2Runs : d.inn1Runs;
  const currentWkts = d.isChase ? d.inn2Wickets : d.inn1Wickets;
  const currentOvers = d.isChase ? d.inn2Overs : d.inn1Overs;
  const scoreline = `${currentRuns}/${currentWkts} (${fmtOvers(currentOvers)} ov)`;

  // Title
  let title: string;
  if (d.matchPhase === 'completed' && d.winner) {
    const winnerName = resolveFullName(match, d.winner);
    if (d.isChase && d.runsNeeded !== undefined) {
      title = `${winnerName} won the match`;
    } else {
      title = `${winnerName} won the match`;
    }
  } else if (d.isChase && d.runsNeeded !== undefined && d.ballsRemaining !== undefined) {
    if (d.runsNeeded <= 0) {
      title = `${battingTeamName} have won!`;
    } else {
      const balls = d.ballsRemaining;
      title = `${battingTeamName} need ${d.runsNeeded} run${d.runsNeeded !== 1 ? 's' : ''} in ${balls} ball${balls !== 1 ? 's' : ''}`;
    }
  } else if (d.matchPhase === 'innings_break') {
    title = `${inn2FullName} to chase ${d.inn1Runs + 1}`;
  } else {
    title = `${battingTeamName}: ${scoreline}`;
  }

  // Subtitle
  let subtitle: string;
  if (d.isChase) {
    subtitle = `${inn1FullName}: ${d.inn1Runs}/${d.inn1Wickets} (${fmtOvers(d.inn1Overs)} ov) | Target: ${d.target}`;
  } else {
    subtitle = `${battingTeamName} batting`;
  }

  const inn1Summary = `${d.inn1BattingTeam}: ${d.inn1Runs}/${d.inn1Wickets} (${fmtOvers(d.inn1Overs)} ov)`;
  const inn2Summary = d.currentInningsNum === 2
    ? `${d.inn2BattingTeam}: ${d.inn2Runs}/${d.inn2Wickets} (${fmtOvers(d.inn2Overs)} ov)`
    : undefined;

  const targetStr = d.target !== undefined ? `Target: ${d.target}` : undefined;

  const oversProgress = Math.min(100, Math.round((currentOvers / 20) * 100));

  // Simple win probability based on chase state
  let teamAWinPct = 50;
  if (d.isChase && d.target !== undefined && d.requiredRunRate !== undefined) {
    const batting2IsA = d.inn2BattingTeam === match.teamA.shortName;
    const chaseProb = Math.max(5, Math.min(95, Math.round((1 - d.requiredRunRate / 18) * 100)));
    teamAWinPct = batting2IsA ? chaseProb : 100 - chaseProb;
  }
  const teamBWinPct = 100 - teamAWinPct;

  return {
    title,
    subtitle,
    phase,
    battingTeamName,
    battingTeamShort: d.currentBattingTeam,
    bowlingTeamName,
    bowlingTeamShort: d.currentBowlingTeam,
    scoreline,
    inn1Summary,
    inn2Summary,
    targetStr,
    oversProgress,
    teamAWinPct,
    teamBWinPct,
  };
}
