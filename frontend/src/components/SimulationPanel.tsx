'use client';

import React, { useState } from 'react';
import { useMatchStore } from '../store/matchStore';
import { Sparkles, GitFork, AlertCircle, Loader2 } from 'lucide-react';

export default function SimulationPanel() {
  const [premise, setPremise] = useState('');
  const { 
    match, 
    selectedNodeId, 
    nodes, 
    triggerSimulation, 
    isSimulating, 
    simulationError 
  } = useMatchStore();

  if (!match || !selectedNodeId) {
    return (
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10 glass-panel border border-zinc-800/80 px-6 py-4 rounded-xl text-center shadow-lg pointer-events-auto">
        <p className="text-xs text-zinc-400 font-medium">
          Select any node in the timeline graph to create an alternate reality
        </p>
      </div>
    );
  }

  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  if (!selectedNode) return null;

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!premise.trim()) return;
    await triggerSimulation(match.id, selectedNodeId, premise.trim());
    setPremise(''); // Clear input
  };

  const applyShortcut = async (text: string) => {
    setPremise(text);
    await triggerSimulation(match.id, selectedNodeId, text);
    setPremise('');
  };

  const presets = [
    { text: 'Openers score a century', label: 'Century Openers 🏏' },
    { text: 'Openers out within 6 overs', label: 'Early Collapse ☝️' },
    { text: 'Spinner takes a wicket first ball', label: 'Golden Arm 🌀' },
    { text: 'Tactical bowling change: death overs nailed', label: 'Yorker Masterclass 🎯' }
  ];

  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 w-[600px] z-10 glass-panel border border-zinc-800/80 rounded-xl p-4 shadow-2xl flex flex-col gap-3 pointer-events-auto">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <GitFork className="w-4 h-4 text-rose-400" />
          <span className="text-xs font-extrabold text-zinc-100 tracking-wider uppercase">
            Branch timeline at {selectedNode.label}
          </span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono">
          Parent Score: {selectedNode.runs}/{selectedNode.wickets} (ov {selectedNode.overNumber})
        </div>
      </div>

      {/* presets */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset, index) => (
          <button
            key={index}
            type="button"
            disabled={isSimulating}
            onClick={() => applyShortcut(preset.text)}
            className="text-[10px] font-bold px-2 py-1 bg-zinc-900 border border-zinc-800 hover:border-rose-900/40 hover:bg-rose-950/20 text-zinc-300 rounded-md transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSimulate} className="flex gap-2">
        <input
          type="text"
          value={premise}
          onChange={(e) => setPremise(e.target.value)}
          disabled={isSimulating}
          placeholder="e.g. Openers out within 6 overs, or dropped catch at boundary..."
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-rose-500 transition-all placeholder:text-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isSimulating || !premise.trim()}
          className="bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs px-4 py-2 rounded-lg transition-all shadow-md shadow-rose-950/20 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSimulating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Simulating...
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              Simulate Reality
            </>
          )}
        </button>
      </form>

      {/* Error State */}
      {simulationError && (
        <div className="flex items-center gap-2 p-2 bg-rose-950/40 border border-rose-900/30 rounded-lg text-[11px] text-rose-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{simulationError}</span>
        </div>
      )}
    </div>
  );
}
