'use client';

import React, { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { 
  Trophy, 
  CircleDot, 
  Skull, 
  Zap, 
  Clock, 
  Award, 
  Sparkles,
  GitCommit
} from 'lucide-react';
import { CricketEventNode, TeamInfo } from '@cricket-multiverse/shared';

// Type definitions for custom node
type CustomNode = Node<{
  node: CricketEventNode;
  isSelected: boolean;
  teamA?: TeamInfo;
  teamB?: TeamInfo;
}, 'cricketNode'>;

const CricketNode = ({ data }: NodeProps<CustomNode>) => {
  const { node, isSelected, teamA, teamB } = data;
  const { type, label, runs, wickets, overNumber, team, isAlternate } = node;

  // Resolve full team name from short name
  const resolveTeamName = (shortName: string): string => {
    if (teamA && (teamA.shortName === shortName || teamA.name === shortName)) {
      return teamA.shortName; // Use short name on the node header (space-constrained)
    }
    if (teamB && (teamB.shortName === shortName || teamB.name === shortName)) {
      return teamB.shortName;
    }
    // If the stored value is already a reasonable name (not generic), return it
    if (shortName && shortName !== 'Team A' && shortName !== 'Team B') {
      return shortName;
    }
    // Fallback: return whatever we have
    return shortName || '—';
  };

  const displayTeam = resolveTeamName(team);

  // Get icon and colors based on type
  const getIcon = () => {
    switch (type) {
      case 'toss':
        return <Trophy className="w-5 h-5 text-amber-400" />;
      case 'over':
        return <CircleDot className="w-5 h-5 text-sky-400" />;
      case 'wicket':
        return <Skull className="w-5 h-5 text-rose-500 animate-pulse" />;
      case 'boundary':
        return <Zap className="w-5 h-5 text-emerald-400" />;
      case 'timeout':
        return <Clock className="w-5 h-5 text-zinc-400" />;
      case 'milestone':
        return <Award className="w-5 h-5 text-purple-400" />;
      case 'simulation_start':
      case 'simulation_node':
        return <Sparkles className="w-5 h-5 text-rose-400" />;
      default:
        return <GitCommit className="w-5 h-5 text-zinc-400" />;
    }
  };

  const getBorderColor = () => {
    if (isSelected) {
      return isAlternate ? 'border-rose-500 ring-2 ring-rose-500/20' : 'border-emerald-500 ring-2 ring-emerald-500/20';
    }
    return isAlternate ? 'border-rose-950/60 hover:border-rose-800' : 'border-zinc-800 hover:border-zinc-600';
  };

  const getGlowClass = () => {
    if (type === 'wicket') {
      return isAlternate ? 'glow-node-alt' : 'glow-node-real';
    }
    if (isSelected) {
      return isAlternate ? 'shadow-[0_0_12px_rgba(244,63,94,0.3)]' : 'shadow-[0_0_12px_rgba(16,185,129,0.3)]';
    }
    return '';
  };

  return (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 glass-panel transition-all duration-200 cursor-pointer w-60 ${getBorderColor()} ${getGlowClass()}`}>
      {/* Handles for React Flow connections */}
      <Handle
        type="target"
        position={Position.Left}
        className="opacity-0 w-0 h-0"
        isConnectable={false}
      />

      {/* Event Icon */}
      <div className={`p-2 rounded-md ${isAlternate ? 'bg-rose-950/40 border border-rose-900/30' : 'bg-zinc-900/80 border border-zinc-800'}`}>
        {getIcon()}
      </div>

      {/* Node Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1.5 mb-0.5">
          <span className="text-[10px] font-semibold text-zinc-400 tracking-wider uppercase truncate">
            {displayTeam} • OV {overNumber}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            isAlternate 
              ? 'bg-rose-950/50 text-rose-400 border border-rose-900/30' 
              : 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/30'
          }`}>
            {isAlternate ? 'Simulated' : 'Canon'}
          </span>
        </div>
        <h4 className="text-xs font-bold text-zinc-100 truncate mb-1">
          {label}
        </h4>
        <div className="text-[11px] font-mono font-semibold text-zinc-300">
          {runs}/{wickets}
          <span className="text-zinc-500 font-normal ml-1 text-[10px]">({displayTeam})</span>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="opacity-0 w-0 h-0"
        isConnectable={false}
      />
    </div>
  );
};

export default memo(CricketNode);
