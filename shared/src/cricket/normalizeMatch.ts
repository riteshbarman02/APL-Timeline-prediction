/**
 * normalizeMatch.ts
 *
 * Converts raw Cricbuzz HTML + existing match data into a normalized Match
 * with innings[], target, isChase, and matchPhase correctly set.
 *
 * This is the single source of truth for innings detection.
 * NO other file should re-implement innings logic.
 */

import { Match, Innings, MatchPhase } from '../types.js';

export interface RawTeamScore {
  runs: number;
  wickets: number;
  overs: number;
}

/**
 * Determine which team bats first based on toss data.
 * Returns { inn1: shortName, inn2: shortName }
 */
export function resolveBattingOrder(
  tossWinner: string,
  tossDecision: 'bat' | 'field',
  teamAShort: string,
  teamBShort: string
): { inn1: string; inn2: string } {
  const tossWinnerIsA =
    tossWinner === teamAShort ||
    tossWinner.toLowerCase() === teamAShort.toLowerCase();

  if (tossDecision === 'bat') {
    return {
      inn1: tossWinnerIsA ? teamAShort : teamBShort,
      inn2: tossWinnerIsA ? teamBShort : teamAShort,
    };
  } else {
    // 'field' → toss winner fields, opponent bats first
    return {
      inn1: tossWinnerIsA ? teamBShort : teamAShort,
      inn2: tossWinnerIsA ? teamAShort : teamBShort,
    };
  }
}

/**
 * Detect current innings number from Cricbuzz HTML text.
 * Returns 1 or 2.
 */
export function detectCurrentInningsFromHtml(html: string): 1 | 2 {
  // Cricbuzz shows these patterns when innings 2 is live:
  // "RCB need 182 runs", "Target: 183", "chasing 183", "2nd Innings", "Innings 2"
  const hasTarget = /need\s+\d+\s+runs?|target[:\s]+\d+|chasing\s+\d+/i.test(html);
  const has2ndLabel = /2nd\s+inn|second\s+inn|innings\s+2/i.test(html);
  return hasTarget || has2ndLabel ? 2 : 1;
}

/**
 * Determine matchPhase from innings data and score completeness.
 */
export function resolveMatchPhase(
  currentInnings: 1 | 2,
  inn1: Innings | undefined,
  inn2: Innings | undefined,
  matchStatus: string
): MatchPhase {
  if (matchStatus === 'completed') return 'completed';
  if (!inn1) return 'pre_toss';
  if (currentInnings === 1 && inn1 && !inn1.isComplete) return 'innings1';
  if (inn1?.isComplete && !inn2) return 'innings_break';
  if (currentInnings === 2 && inn2 && !inn2.isComplete) return 'innings2';
  if (inn2?.isComplete) return 'completed';
  return 'innings1';
}

/**
 * Build Innings objects from raw scoreA/scoreB data.
 * scoreA = Team A's batting score, scoreB = Team B's batting score.
 */
export function buildInnings(
  inn1BattingTeam: string,
  inn2BattingTeam: string,
  scoreA: RawTeamScore | null,   // Team A total
  scoreB: RawTeamScore | null,   // Team B total
  teamAShort: string,
  teamBShort: string,
  currentInnings: 1 | 2
): Innings[] {
  const innings: Innings[] = [];

  // Find which score belongs to inn1 and inn2 based on batting order
  const inn1ScoreIsA = inn1BattingTeam === teamAShort;
  const inn1Score = inn1ScoreIsA ? scoreA : scoreB;
  const inn2Score = inn1ScoreIsA ? scoreB : scoreA;

  if (inn1Score && (inn1Score.runs > 0 || inn1Score.overs > 0)) {
    const isComplete =
      inn1Score.overs >= 20 || inn1Score.wickets >= 10;

    innings.push({
      number: 1,
      battingTeam: inn1BattingTeam,
      bowlingTeam: inn2BattingTeam,
      runs: inn1Score.runs,
      wickets: inn1Score.wickets,
      overs: inn1Score.overs,
      isComplete,
    });
  } else if (currentInnings >= 1) {
    // Innings 1 started but no score parsed yet
    innings.push({
      number: 1,
      battingTeam: inn1BattingTeam,
      bowlingTeam: inn2BattingTeam,
      runs: 0,
      wickets: 0,
      overs: 0,
      isComplete: false,
    });
  }

  if (currentInnings === 2 && inn1Score) {
    const target = inn1Score.runs + 1;
    const inn2Runs = inn2Score?.runs ?? 0;
    const inn2Wickets = inn2Score?.wickets ?? 0;
    const inn2Overs = inn2Score?.overs ?? 0;
    const isComplete =
      inn2Overs >= 20 || inn2Wickets >= 10 || inn2Runs >= target;

    innings.push({
      number: 2,
      battingTeam: inn2BattingTeam,
      bowlingTeam: inn1BattingTeam,
      runs: inn2Runs,
      wickets: inn2Wickets,
      overs: inn2Overs,
      isComplete,
      target,
    });
  }

  return innings;
}

/**
 * Main entry point.
 * Merges newly derived data back onto the existing match object in-place.
 * Returns the updated partial match fields.
 */
export function normalizeFromCricbuzz(
  html: string,
  existingMatch: Match,
  scoreA: RawTeamScore | null,
  scoreB: RawTeamScore | null
): Partial<Match> {
  const teamAShort = existingMatch.teamA.shortName;
  const teamBShort = existingMatch.teamB.shortName;

  // Resolve batting order from toss (never guess from score state)
  const { inn1, inn2 } = resolveBattingOrder(
    existingMatch.tossWinner,
    existingMatch.tossDecision,
    teamAShort,
    teamBShort
  );

  // Detect innings from HTML signals
  let currentInnings = detectCurrentInningsFromHtml(html);

  // Score-based fallback: if inn1 score looks complete and inn2 has started
  const inn1ScoreIsA = inn1 === teamAShort;
  const inn1Score = inn1ScoreIsA ? scoreA : scoreB;
  const inn2Score = inn1ScoreIsA ? scoreB : scoreA;
  const scoreAComplete = inn1Score && (inn1Score.overs >= 20 || inn1Score.wickets >= 10);
  const scoreBStarted = inn2Score && (inn2Score.runs > 0 || inn2Score.overs > 0);

  if (scoreAComplete || scoreBStarted) {
    currentInnings = 2;
  }

  // Never regress from 2 → 1
  if (existingMatch.currentInnings === 2) {
    currentInnings = 2;
  }

  const innings = buildInnings(
    inn1, inn2, scoreA, scoreB, teamAShort, teamBShort, currentInnings
  );

  const inn1Data = innings.find(i => i.number === 1);
  const inn2Data = innings.find(i => i.number === 2);

  const target = inn2Data?.target;
  const isChase = currentInnings === 2;
  const matchPhase = resolveMatchPhase(
    currentInnings,
    inn1Data,
    inn2Data,
    existingMatch.status
  );

  return {
    currentInnings,
    innings,
    target,
    isChase,
    matchPhase,
  };
}
