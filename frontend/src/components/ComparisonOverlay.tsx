'use client';

import React from 'react';
import { useMatchStore } from '../store/matchStore';
import { X, GitCompare, Sparkles, AlertTriangle } from 'lucide-react';

export default function ComparisonOverlay() {
  const { 
    match, 
    comparisonMode, 
    comparisonBranchId, 
    comparisonTimeline, 
    setComparisonMode,
    scorecardState, // active branch scorecard (Alternate)
    nodes,
    branches
  } = useMatchStore();

  if (!comparisonMode || !match || !comparisonBranchId) return null;

  // Find the alternate branch detail
  const altBranch = branches.find(b => b.id === comparisonBranchId);
  const realScorecard = comparisonTimeline?.scorecardState; // Canon timeline scorecard
  const altScorecard = scorecardState; // Current active alternate scorecard

  // Find real final match node
  const realFinalNode = comparisonTimeline?.nodes
    .filter(n => !n.isAlternate)
    .sort((a, b) => b.overNumber - a.overNumber)[0];

  // Find alt final match node
  const altFinalNode = nodes
    .filter(n => n.branchId === comparisonBranchId)
    .sort((a, b) => b.overNumber - a.overNumber)[0];

  const getRealResult = () => {
    if (match.status === 'completed' || match.status === 'mock') {
      return realFinalNode ? realFinalNode.description : 'Match completed';
    }
    return 'Match ongoing...';
  };

  const getAltResult = () => {
    return altBranch?.projectedResult || 'Simulation pending...';
  };

  // Compile top scorers dynamically
  const realTopScorer = realScorecard?.teamA.batting ? [...realScorecard.teamA.batting].sort((a, b) => b.runs - a.runs)[0] : null;
  const altTopScorer = altScorecard?.teamA.batting ? [...altScorecard.teamA.batting].sort((a, b) => b.runs - a.runs)[0] : null;

  return (
    <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl glass-panel border border-zinc-800 rounded-2xl flex flex-col shadow-2xl overflow-hidden max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/20">
          <div className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-rose-400" />
            <div>
              <h2 className="text-sm font-extrabold text-zinc-100 uppercase tracking-wider">
                Timeline Comparison Workspace
              </h2>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase mt-0.5">
                Comparing Canon vs Alternate Reality: "{altBranch?.name}"
              </p>
            </div>
          </div>
          <button 
            onClick={() => setComparisonMode(false)}
            className="p-1 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400 hover:text-zinc-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {/* Premise Highlight Card */}
          <div className="bg-gradient-to-r from-rose-950/20 to-zinc-900/20 p-4 rounded-xl border border-rose-900/20 flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <div>
              <span className="text-[9px] font-bold text-rose-400 uppercase tracking-widest block">Simulated Premise</span>
              <p className="text-xs text-zinc-300 italic">
                "{altBranch?.premise}"
              </p>
            </div>
          </div>

          {/* Side by Side Summary Cards */}
          <div className="grid grid-cols-2 gap-4">
            {/* Canon Reality */}
            <div className="bg-emerald-950/5 border border-emerald-900/10 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-emerald-400 tracking-wider uppercase">
                  Canon Reality (Real Match)
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-950/40 text-emerald-400 rounded-full font-bold border border-emerald-900/30">
                  Canon
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xl font-black text-zinc-100 font-mono">
                  {realScorecard ? (
                    `${match.teamA.shortName} ${realScorecard.teamA.totalRuns}/${realScorecard.teamA.totalWickets} (${realScorecard.teamA.overs} ov)`
                  ) : 'N/A'}
                </div>
                {realScorecard && (realScorecard.teamB.totalRuns > 0 || realScorecard.teamB.overs > 0) && (
                  <div className="text-xl font-black text-zinc-100 font-mono">
                    {match.teamB.shortName} {realScorecard.teamB.totalRuns}/{realScorecard.teamB.totalWickets} ({realScorecard.teamB.overs} ov)
                  </div>
                )}
                <div className="text-[10px] text-zinc-500 font-bold uppercase">
                  Match Scorecard Summary
                </div>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/60 flex-1">
                {getRealResult()}
              </p>
            </div>

            {/* Alternate Reality */}
            <div className="bg-rose-950/5 border border-rose-900/10 rounded-xl p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold text-rose-400 tracking-wider uppercase">
                  Alternate Reality (Simulated)
                </span>
                <span className="text-[10px] px-2 py-0.5 bg-rose-950/40 text-rose-400 rounded-full font-bold border border-rose-900/30">
                  Simulated
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-xl font-black text-zinc-100 font-mono">
                  {altScorecard ? (
                    `${match.teamA.shortName} ${altScorecard.teamA.totalRuns}/${altScorecard.teamA.totalWickets} (${altScorecard.teamA.overs} ov)`
                  ) : 'N/A'}
                </div>
                {altScorecard && (altScorecard.teamB.totalRuns > 0 || altScorecard.teamB.overs > 0) && (
                  <div className="text-xl font-black text-zinc-100 font-mono">
                    {match.teamB.shortName} {altScorecard.teamB.totalRuns}/{altScorecard.teamB.totalWickets} ({altScorecard.teamB.overs} ov)
                  </div>
                )}
                <div className="text-[10px] text-zinc-500 font-bold uppercase">
                  Projected Scorecard Summary
                </div>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-800/60 flex-1">
                {getAltResult()}
              </p>
            </div>
          </div>

          {/* Detailed Metric Table */}
          <div>
            <h3 className="text-xs font-bold text-zinc-400 mb-3 uppercase tracking-wider">
              Timeline Comparison Metrics
            </h3>
            <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/20">
              <table className="w-full text-left text-xs text-zinc-300">
                <thead>
                  <tr className="bg-zinc-900/40 font-bold text-zinc-400 border-b border-zinc-800">
                    <th className="px-4 py-3">Metric</th>
                    <th className="px-4 py-3 text-center">Canon Timeline</th>
                    <th className="px-4 py-3 text-center">Alternate Timeline</th>
                    <th className="px-4 py-3 text-center">Delta Shift</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900">
                  {/* Final Score */}
                  <tr>
                    <td className="px-4 py-3.5 font-bold text-zinc-200">Projected Score ({match.teamA.shortName})</td>
                    <td className="px-4 py-3.5 text-center font-mono text-zinc-300">
                      {realScorecard ? `${realScorecard.teamA.totalRuns}/${realScorecard.teamA.totalWickets}` : 'N/A'}
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono text-zinc-100 font-bold">
                      {altScorecard ? `${altScorecard.teamA.totalRuns}/${altScorecard.teamA.totalWickets}` : 'N/A'}
                    </td>
                    <td className={`px-4 py-3.5 text-center font-bold font-mono ${altScorecard && realScorecard && altScorecard.teamA.totalRuns - realScorecard.teamA.totalRuns >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {altScorecard && realScorecard && (altScorecard.teamA.totalRuns - realScorecard.teamA.totalRuns >= 0 ? '+' : '')}
                      {altScorecard && realScorecard && (altScorecard.teamA.totalRuns - realScorecard.teamA.totalRuns)} runs
                    </td>
                  </tr>

                  {/* Wickets Lost */}
                  <tr>
                    <td className="px-4 py-3.5 font-bold text-zinc-200">Wickets Lost ({match.teamA.shortName})</td>
                    <td className="px-4 py-3.5 text-center font-mono text-zinc-300">
                      {realScorecard ? `${realScorecard.teamA.totalWickets} wickets` : 'N/A'}
                    </td>
                    <td className="px-4 py-3.5 text-center font-mono text-zinc-100">
                      {altScorecard ? `${altScorecard.teamA.totalWickets} wickets` : 'N/A'}
                    </td>
                    <td className={`px-4 py-3.5 text-center font-bold font-mono ${altScorecard && realScorecard && altScorecard.teamA.totalWickets - realScorecard.teamA.totalWickets <= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {altScorecard && realScorecard && (altScorecard.teamA.totalWickets - realScorecard.teamA.totalWickets >= 0 ? '+' : '')}
                      {altScorecard && realScorecard && (altScorecard.teamA.totalWickets - realScorecard.teamA.totalWickets)} wickets
                    </td>
                  </tr>

                  {/* Match Win Margin */}
                  <tr>
                    <td className="px-4 py-3.5 font-bold text-zinc-200">Win Margin / Outcome</td>
                    <td className="px-4 py-3.5 text-center text-zinc-300">
                      {getRealResult()}
                    </td>
                    <td className="px-4 py-3.5 text-center text-zinc-100 font-semibold">
                      {getAltResult()}
                    </td>
                    <td className="px-4 py-3.5 text-center text-rose-400 font-bold">
                      Outcome Projected
                    </td>
                  </tr>

                  {/* Top Run Scorer */}
                  <tr>
                    <td className="px-4 py-3.5 font-bold text-zinc-200">Innings Top Scorer</td>
                    <td className="px-4 py-3.5 text-center text-zinc-300">
                      {realTopScorer ? `${realTopScorer.name} (${realTopScorer.runs} runs)` : 'N/A'}
                    </td>
                    <td className="px-4 py-3.5 text-center text-zinc-100">
                      {altTopScorer ? `${altTopScorer.name} (${altTopScorer.runs} runs)` : 'N/A'}
                    </td>
                    <td className="px-4 py-3.5 text-center font-bold text-emerald-400 font-mono">
                      {altScorecard && realTopScorer && altTopScorer && (
                        `${altTopScorer.runs - realTopScorer.runs >= 0 ? '+' : ''}${altTopScorer.runs - realTopScorer.runs} runs`
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 bg-zinc-950/60 text-right">
          <button 
            onClick={() => setComparisonMode(false)}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            Close Comparison
          </button>
        </div>
      </div>
    </div>
  );
}
