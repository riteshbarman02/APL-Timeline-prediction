'use client';

import React from 'react';
import { useMatchStore } from '../store/matchStore';
import { 
  Sparkles, 
  RefreshCw, 
  GitFork, 
  GitCompare, 
  Activity 
} from 'lucide-react';

export default function Navbar() {
  const { 
    match, 
    matches,
    connectWebSocket,
    branches, 
    activeBranchId, 
    setActiveBranch, 
    resetMatch, 
    wsConnected,
    setComparisonMode,
    comparisonMode
  } = useMatchStore();

  if (!match) return null;

  return (
    <nav className="h-16 border-b border-zinc-800 bg-zinc-950/60 backdrop-blur-md px-6 flex items-center justify-between z-20 relative">
      {/* Brand & Match Details */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="bg-gradient-to-r from-rose-500 to-pink-500 p-1.5 rounded-lg shadow-md shadow-rose-950/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            IPL Multiverse
          </span>
        </div>

        <div className="h-4 w-[1px] bg-zinc-800" />

        <div className="flex items-center gap-2">
          {matches.length > 0 ? (
            <div className="flex items-center gap-2 bg-zinc-900/40 border border-zinc-800/80 px-2.5 py-1 rounded-lg">
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Match:</span>
              <select
                value={match.id}
                onChange={(e) => connectWebSocket(e.target.value)}
                className="bg-transparent text-xs text-zinc-100 font-bold focus:outline-none cursor-pointer pr-1"
              >
                {matches.map((m) => (
                  <option key={m.id} value={m.id} className="bg-zinc-900 text-zinc-100">
                    {m.teamA.shortName} vs {m.teamB.shortName} ({m.status === 'mock' ? 'Demo' : 'Live'})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span className="text-xs font-bold text-zinc-100">
              {match.teamA.name} vs {match.teamB.name}
            </span>
          )}
          <span className="text-[10px] text-zinc-500 font-medium truncate max-w-[150px]">
            {match.venue}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="text-[9px] text-zinc-500 font-bold uppercase">
            {wsConnected ? 'Live Feed' : 'Demo Feed'}
          </span>
        </div>
      </div>

      {/* Branch Navigation Dropdown */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-zinc-900/60 border border-zinc-800 px-3 py-1.5 rounded-lg">
          <GitFork className="w-3.5 h-3.5 text-rose-400" />
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
            Timeline:
          </span>
          <select
            value={activeBranchId}
            onChange={(e) => setActiveBranch(e.target.value)}
            className="bg-transparent text-xs text-zinc-100 font-bold focus:outline-none cursor-pointer pr-2"
          >
            {branches.map((branch) => (
              <option 
                key={branch.id} 
                value={branch.id}
                className="bg-zinc-900 text-zinc-100"
              >
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Compare Button */}
          {activeBranchId !== 'real' && (
            <button
              onClick={() => setComparisonMode(!comparisonMode, activeBranchId)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                comparisonMode 
                  ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-[0_0_10px_rgba(244,63,94,0.1)]' 
                  : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-300'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              Compare Timelines
            </button>
          )}

          {/* Reset Button */}
          <button
            onClick={() => resetMatch(match.id)}
            className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
            title="Reset simulation and restart playback from start"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Reset Match
          </button>
        </div>
      </div>
    </nav>
  );
}
