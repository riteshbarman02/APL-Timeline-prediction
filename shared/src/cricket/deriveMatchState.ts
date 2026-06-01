/**
 * deriveMatchState.ts
 *
 * Pure function that computes all derived match state from Match + nodes.
 * UI and backend consume this — no cricket logic lives in components.
 */

import { Match, CricketEventNode } from '../types.js';
import { resolveBattingOrder } from './normalizeMatch.js';

export interface DerivedMatchState {
  // Innings identity
  inn1BattingTeam: string;    // short name
  inn2BattingTeam: string;    // short name
  currentInningsNum: 1 | 2;
  currentBattingTeam: string;
  currentBowlingTeam: string;

  // Scores
  inn1Runs: number;
  inn1Wickets: number;
  inn1Overs: number;
  inn2Runs: number;
  inn2Wickets: number;
  inn2Overs: number;

  // Chase
  target: number | undefined;
  isChase: boolean;
  runsNeeded: number | undefined;
  ballsRemaining: number | undefined;
  requiredRunRate: number | undefined;

  // Result
  isCompleted: boolean;
  winner: string | undefined;   // short name of winning team, or 'draw'

  // Phase
  matchPhase: string;
}

export function deriveMatchState(
  match: Match,
  nodes: CricketEventNode[]
): DerivedMatchState {
  const teamAShort = match.teamA.shortName;
  const teamBShort = match.teamB.shortName;

  // Resolve batting order from toss
  const { inn1, inn2 } = resolveBattingOrder(
    match.tossWinner,
    match.tossDecision,
    teamAShort,
    teamBShort
  );

  const currentInningsNum = match.currentInnings;
  const currentBattingTeam = currentInningsNum === 2 ? inn2 : inn1;
  const currentBowlingTeam = currentInningsNum === 2 ? inn1 : inn2;

  // Pull innings data from match.innings (set by normalizeMatch)
  const inn1Data = match.innings?.find(i => i.number === 1);
  const inn2Data = match.innings?.find(i => i.number === 2);

  // Fall back to nodes if innings array not yet populated
  const inn1Nodes = nodes.filter(n => n.inn === 1 && n.team === inn1 && n.type !== 'toss');
  const inn2Nodes = nodes.filter(n => n.inn === 2 && n.team === inn2 && n.type !== 'toss');

  const inn1Runs = inn1Data?.runs ?? (inn1Nodes.length > 0 ? Math.max(...inn1Nodes.map(n => n.runs)) : 0);
  const inn1Wickets = inn1Data?.wickets ?? (inn1Nodes.length > 0 ? Math.max(...inn1Nodes.map(n => n.wickets)) : 0);
  const inn1Overs = inn1Data?.overs ?? (inn1Nodes.length > 0 ? Math.max(...inn1Nodes.map(n => n.overNumber)) : 0);

  const inn2Runs = inn2Data?.runs ?? (inn2Nodes.length > 0 ? Math.max(...inn2Nodes.map(n => n.runs)) : 0);
  const inn2Wickets = inn2Data?.wickets ?? (inn2Nodes.length > 0 ? Math.max(...inn2Nodes.map(n => n.wickets)) : 0);
  const inn2Overs = inn2Data?.overs ?? (inn2Nodes.length > 0 ? Math.max(...inn2Nodes.map(n => n.overNumber)) : 0);

  // Target: always inn1 total + 1
  const target = currentInningsNum === 2 ? inn1Runs + 1 : undefined;
  const isChase = currentInningsNum === 2;

  // Chase metrics
  let runsNeeded: number | undefined;
  let ballsRemaining: number | undefined;
  let requiredRunRate: number | undefined;

  if (isChase && target !== undefined) {
    runsNeeded = Math.max(0, target - inn2Runs);
    const ballsDone = Math.floor(inn2Overs) * 6 + Math.round((inn2Overs % 1) * 10);
    ballsRemaining = Math.max(0, 120 - ballsDone);
    const oversRemaining = ballsRemaining / 6;
    requiredRunRate = oversRemaining > 0 ? Math.round((runsNeeded / oversRemaining) * 100) / 100 : Infinity;
  }

  // Result
  let isCompleted = match.status === 'completed';
  let winner: string | undefined;

  if (isChase && target !== undefined) {
    if (inn2Runs >= target) {
      isCompleted = true;
      winner = inn2;
    } else if (inn2Wickets >= 10 || inn2Overs >= 20) {
      isCompleted = true;
      winner = inn2Runs + 1 > target ? inn2 : inn1;
    }
  }

  // Phase string
  const matchPhase = match.matchPhase ?? (isChase ? 'innings2' : 'innings1');

  return {
    inn1BattingTeam: inn1,
    inn2BattingTeam: inn2,
    currentInningsNum,
    currentBattingTeam,
    currentBowlingTeam,
    inn1Runs,
    inn1Wickets,
    inn1Overs,
    inn2Runs,
    inn2Wickets,
    inn2Overs,
    target,
    isChase,
    runsNeeded,
    ballsRemaining,
    requiredRunRate,
    isCompleted,
    winner,
    matchPhase,
  };
}
