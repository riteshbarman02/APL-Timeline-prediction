'use client';

import React, { useState, useEffect } from 'react';
import { useMatchStore } from '../store/matchStore';
import { 
  TrendingUp, 
  FileText, 
  BarChart3, 
  MessageSquare,
  Sparkles,
  User,
  Zap,
  TrendingDown
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

export default function RightSidebar() {
  const [activeTab, setActiveTab] = useState<'insights' | 'analytics' | 'scorecard' | 'feed'>('insights');
  const [isMounted, setIsMounted] = useState(false);

  const { 
    match, 
    nodes, 
    activeBranchId, 
    scorecardState, 
    selectedNodeId,
    branches,
    derivedState,
    displayState
  } = useMatchStore();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!match) {
    return (
      <div className="w-96 glass-panel border-l border-zinc-800 flex items-center justify-center p-6 text-zinc-500">
        No match loaded
      </div>
    );
  }

  // Find the selected node
  const selectedNode = nodes.find(n => n.id === selectedNodeId) || nodes[nodes.length - 1];

  // Helper to compile win probability chart data
  const getChartData = () => {
    if (!isMounted) return [];
    
    // Sort nodes chronologically by over number
    const sortedRealNodes = [...nodes]
      .filter(n => !n.isAlternate)
      .sort((a, b) => a.overNumber - b.overNumber);

    const sortedAltNodes = [...nodes]
      .filter(n => n.isAlternate)
      .sort((a, b) => a.overNumber - b.overNumber);

    // Map overs to metrics
    const chartMap = new Map<number, { over: number; Real: number; Alternate?: number }>();

    sortedRealNodes.forEach(node => {
      chartMap.set(node.overNumber, {
        over: node.overNumber,
        Real: Math.round(node.winProbability.teamA * 100)
      });
    });

    sortedAltNodes.forEach(node => {
      const existing = chartMap.get(node.overNumber);
      if (existing) {
        existing.Alternate = Math.round(node.winProbability.teamA * 100);
      } else {
        chartMap.set(node.overNumber, {
          over: node.overNumber,
          Real: 0, // Fallback if no real node exists at this over (rare)
          Alternate: Math.round(node.winProbability.teamA * 100)
        });
      }
    });

    return Array.from(chartMap.values()).sort((a, b) => a.over - b.over);
  };

  const winProbTeamA = selectedNode ? Math.round(selectedNode.winProbability.teamA * 100) : 50;
  const winProbTeamB = 100 - winProbTeamA;

  return (
    <div className="w-96 glass-panel border-l border-zinc-800 flex flex-col h-full z-10">
      {/* Tabs Header */}
      <div className="grid grid-cols-4 border-b border-zinc-800 bg-zinc-950/40">
        {[
          { id: 'insights', label: 'Insights', icon: <FileText className="w-4 h-4" /> },
          { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
          { id: 'scorecard', label: 'Scorecard', icon: <TrendingUp className="w-4 h-4" /> },
          { id: 'feed', label: 'Feed', icon: <MessageSquare className="w-4 h-4" /> }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex flex-col items-center gap-1.5 py-3 text-[10px] font-bold tracking-wider uppercase border-b-2 transition-all duration-200 ${
              activeTab === tab.id
                ? 'text-emerald-400 border-emerald-400 bg-zinc-900/40'
                : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-900/10'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tabs Content */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {selectedNode && (
          <div className="border-b border-zinc-800 pb-3">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Selected Node Info
            </span>
            <div className="flex items-center justify-between gap-3 mt-1.5">
              <h3 className="text-sm font-extrabold text-zinc-100 truncate">
                {selectedNode.label}
              </h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                selectedNode.isAlternate 
                  ? 'bg-rose-950/40 text-rose-400 border border-rose-900/30' 
                  : 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/30'
              }`}>
                {selectedNode.isAlternate ? 'Simulated' : 'Canon'}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {selectedNode.description}
            </p>
          </div>
        )}

        {/* 1. Insights Tab */}
        {activeTab === 'insights' && selectedNode && (
          <div className="flex flex-col gap-4 flex-1">
            {/* Match Status Card */}
            {displayState && (
              <div className="bg-gradient-to-r from-zinc-900 to-zinc-900/50 p-4 rounded-xl border border-zinc-805/80 shadow-inner flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[9px] px-2 py-0.5 rounded-md font-extrabold tracking-wider ${
                    displayState.phase === 'CHASE' 
                      ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' 
                      : displayState.phase === '1ST INNINGS'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : displayState.phase === 'COMPLETED'
                      ? 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {displayState.phase}
                  </span>
                  {displayState.targetStr && (
                    <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                      {displayState.targetStr}
                    </span>
                  )}
                </div>
                <h4 className="text-sm font-black text-zinc-100 tracking-tight leading-tight mt-1">
                  {displayState.title}
                </h4>
                <div className="text-[11px] text-zinc-400 flex flex-col gap-1 mt-1 border-t border-zinc-850/60 pt-2">
                  <div className="flex justify-between items-center">
                    <span>1st Innings:</span>
                    <span className="font-mono font-bold text-zinc-300">{displayState.inn1Summary}</span>
                  </div>
                  {displayState.inn2Summary && (
                    <div className="flex justify-between items-center">
                      <span>2nd Innings:</span>
                      <span className="font-mono font-bold text-zinc-300">{displayState.inn2Summary}</span>
                    </div>
                  )}
                </div>
                
                {/* Live Chase Details */}
                {derivedState && derivedState.isChase && derivedState.runsNeeded !== undefined && (
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-zinc-800/40 text-[10px] bg-zinc-950/40 p-2 rounded-lg">
                    <div>
                      <span className="text-zinc-500 block uppercase font-bold">Runs Needed</span>
                      <span className="text-xs font-mono font-black text-zinc-200">{derivedState.runsNeeded} runs</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block uppercase font-bold">Req. Run Rate</span>
                      <span className="text-xs font-mono font-black text-zinc-200">
                        {derivedState.requiredRunRate === Infinity ? 'N/A' : `${derivedState.requiredRunRate} / ov`}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Win Probability Bar */}
            <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/80">
              <div className="flex items-center justify-between text-xs font-bold mb-2">
                <span className="text-emerald-400">{match.teamA.shortName} {winProbTeamA}%</span>
                <span className="text-sky-400">{match.teamB.shortName} {winProbTeamB}%</span>
              </div>
              <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden flex">
                <div 
                  className="bg-emerald-500 transition-all duration-500" 
                  style={{ width: `${winProbTeamA}%` }} 
                />
                <div 
                  className="bg-sky-500 transition-all duration-500 flex-1" 
                />
              </div>
              <div className="text-[10px] text-zinc-500 mt-2 text-center">
                Win probability at Over {selectedNode.overNumber}
              </div>
            </div>
 
            {/* Momentum Indicator */}
            <div className="bg-zinc-900/40 p-3 rounded-lg border border-zinc-800/80 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-zinc-300">Momentum</h4>
                <div className="text-[10px] text-zinc-500 mt-0.5">Rating from -100 to +100</div>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedNode.momentum >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-rose-400" />
                )}
                <span className={`text-sm font-mono font-extrabold ${selectedNode.momentum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {selectedNode.momentum >= 0 ? '+' : ''}{selectedNode.momentum}
                </span>
              </div>
            </div>
 
            {/* Commentary / Summary Block */}
            <div className="flex-1 bg-gradient-to-b from-zinc-900/60 to-zinc-950/60 p-4 rounded-xl border border-zinc-800/60 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Sparkles className="w-4 h-4" />
                AI TACTICAL COMMENTARY
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed italic flex-1 overflow-y-auto">
                "{selectedNode.commentary}"
              </p>
            </div>
          </div>
        )}

        {/* 2. Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="flex-1 flex flex-col gap-4">
            <h4 className="text-xs font-bold text-zinc-400">Win Probability Deviation</h4>
            <div className="h-60 bg-zinc-900/30 rounded-lg p-2 border border-zinc-900">
              {isMounted && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={getChartData()}>
                    <defs>
                      <linearGradient id="colorReal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorAlt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis 
                      dataKey="over" 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false}
                      label={{ value: 'Overs', position: 'insideBottom', offset: -5, fill: '#71717a', fontSize: 10 }}
                    />
                    <YAxis 
                      stroke="#52525b" 
                      fontSize={10} 
                      tickLine={false}
                      domain={[0, 100]}
                      label={{ value: `${match.teamA.shortName} Win %`, angle: -90, position: 'insideLeft', fill: '#71717a', fontSize: 10 }}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#18181b', borderColor: '#27272a', borderRadius: '8px', fontSize: '11px' }}
                      labelFormatter={(label) => `Over: ${label}`}
                    />
                    <Area 
                      name="Canon" 
                      type="monotone" 
                      dataKey="Real" 
                      stroke="#10b981" 
                      fillOpacity={1} 
                      fill="url(#colorReal)" 
                      strokeWidth={2}
                    />
                    {activeBranchId !== 'real' && (
                      <Area 
                        name="Simulated" 
                        type="monotone" 
                        dataKey="Alternate" 
                        stroke="#f43f5e" 
                        strokeDasharray="4 4" 
                        fillOpacity={1} 
                        fill="url(#colorAlt)" 
                        strokeWidth={2}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="flex flex-col gap-2 bg-zinc-900/20 p-3 rounded-lg border border-zinc-800/40">
              <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                <div className="w-3 h-3 bg-emerald-500 rounded-sm" />
                CANON TIMELINE: {match.teamA.shortName} vs {match.teamB.shortName}
              </div>
              {activeBranchId !== 'real' && (
                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400">
                  <div className="w-3 h-3 bg-rose-500 rounded-sm border border-dashed border-rose-300" />
                  SIMULATED TIMELINE: "{branches.find(b => b.id === activeBranchId)?.name}"
                </div>
              )}
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                This chart shows {match.teamA.shortName}'s win probability changes. Deviations represent how decisions like dropped catches or custom premises altered match outcomes.
              </p>
            </div>
          </div>
        )}

        {/* 3. Scorecard Tab */}
        {activeTab === 'scorecard' && (
          <div className="flex flex-col gap-4 flex-1">
            {!scorecardState ? (
              <div className="text-center text-xs text-zinc-500 py-10">No scorecard state compiled yet.</div>
            ) : (() => {
              const inn1Scorecard = derivedState 
                ? (derivedState.inn1BattingTeam === match.teamA.shortName ? scorecardState.teamA : scorecardState.teamB)
                : scorecardState.teamA;

              const inn2Scorecard = derivedState
                ? (derivedState.inn2BattingTeam === match.teamA.shortName ? scorecardState.teamA : scorecardState.teamB)
                : scorecardState.teamB;

              const inn1BattingName = derivedState
                ? (derivedState.inn1BattingTeam === match.teamA.shortName ? match.teamA.name : match.teamB.name)
                : match.teamA.name;

              const inn2BattingName = derivedState
                ? (derivedState.inn2BattingTeam === match.teamA.shortName ? match.teamA.name : match.teamB.name)
                : match.teamB.name;

              const hasInn2Started = derivedState ? (derivedState.currentInningsNum === 2 || inn2Scorecard.batting.length > 0) : false;

              return (
                <div className="flex flex-col gap-6">
                  {/* Innings 1 Card */}
                  <div>
                    <h4 className="text-xs font-extrabold text-zinc-300 mb-2 border-b border-zinc-800 pb-1 flex justify-between items-center">
                      <span>{inn1BattingName.toUpperCase()} BATTING (1st INN)</span>
                      <span className="font-mono text-[11px] text-emerald-400">
                        {inn1Scorecard.totalRuns}/{inn1Scorecard.totalWickets} ({inn1Scorecard.overs} ov)
                      </span>
                    </h4>
                    {inn1Scorecard.batting.length === 0 ? (
                      <div className="text-[10px] text-zinc-500 py-2">Innings has not started</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] text-zinc-300">
                          <thead>
                            <tr className="text-zinc-500 font-bold border-b border-zinc-800/60">
                              <th className="py-1">Batter</th>
                              <th className="py-1 text-right">R</th>
                              <th className="py-1 text-right">B</th>
                              <th className="py-1 text-right">4s</th>
                              <th className="py-1 text-right">6s</th>
                              <th className="py-1 text-right">SR</th>
                            </tr>
                          </thead>
                          <tbody>
                            {inn1Scorecard.batting.map((batter, idx) => (
                              <tr key={idx} className="border-b border-zinc-900/40">
                                <td className="py-1.5 font-bold text-zinc-200">
                                  {batter.name}
                                  {batter.isOut ? (
                                    <span className="block text-[9px] font-normal text-zinc-500 truncate max-w-[120px]">{batter.dismissalInfo}</span>
                                  ) : (
                                    <span className="text-[9px] font-normal text-emerald-400 ml-1">batting*</span>
                                  )}
                                </td>
                                <td className="py-1.5 text-right font-mono font-bold text-zinc-100">{batter.runs}</td>
                                <td className="py-1.5 text-right font-mono text-zinc-400">{batter.balls}</td>
                                <td className="py-1.5 text-right font-mono text-zinc-400">{batter.fours}</td>
                                <td className="py-1.5 text-right font-mono text-zinc-400">{batter.sixes}</td>
                                <td className="py-1.5 text-right font-mono text-zinc-400">{batter.strikeRate}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Innings 2 Card */}
                  {hasInn2Started && (
                    <div>
                      <h4 className="text-xs font-extrabold text-zinc-300 mb-2 border-b border-zinc-800 pb-1 flex justify-between items-center">
                        <span>{inn2BattingName.toUpperCase()} BATTING (2nd INN)</span>
                        <span className="font-mono text-[11px] text-emerald-400">
                          {inn2Scorecard.totalRuns}/{inn2Scorecard.totalWickets} ({inn2Scorecard.overs} ov)
                        </span>
                      </h4>
                      {inn2Scorecard.batting.length === 0 ? (
                        <div className="text-[10px] text-zinc-500 py-2">Chase has not started</div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px] text-zinc-300">
                            <thead>
                              <tr className="text-zinc-500 font-bold border-b border-zinc-800/60">
                                <th className="py-1">Batter</th>
                                <th className="py-1 text-right">R</th>
                                <th className="py-1 text-right">B</th>
                                <th className="py-1 text-right">4s</th>
                                <th className="py-1 text-right">6s</th>
                                <th className="py-1 text-right">SR</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inn2Scorecard.batting.map((batter, idx) => (
                                <tr key={idx} className="border-b border-zinc-900/40">
                                  <td className="py-1.5 font-bold text-zinc-200">
                                    {batter.name}
                                    {batter.isOut ? (
                                      <span className="block text-[9px] font-normal text-zinc-500 truncate max-w-[120px]">{batter.dismissalInfo}</span>
                                    ) : (
                                      <span className="text-[9px] font-normal text-emerald-400 ml-1">batting*</span>
                                    )}
                                  </td>
                                  <td className="py-1.5 text-right font-mono font-bold text-zinc-100">{batter.runs}</td>
                                  <td className="py-1.5 text-right font-mono text-zinc-400">{batter.balls}</td>
                                  <td className="py-1.5 text-right font-mono text-zinc-400">{batter.fours}</td>
                                  <td className="py-1.5 text-right font-mono text-zinc-400">{batter.sixes}</td>
                                  <td className="py-1.5 text-right font-mono text-zinc-400">{batter.strikeRate}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {/* 4. Feed Tab */}
        {activeTab === 'feed' && (
          <div className="flex-1 flex flex-col gap-3">
            <h4 className="text-xs font-bold text-zinc-400">Match Commentary Logs</h4>
            <div className="flex flex-col gap-3 flex-1">
              {[...nodes]
                .sort((a, b) => b.overNumber - a.overNumber)
                .map((node) => (
                  <div 
                    key={node.id} 
                    className={`p-3 rounded-lg border text-xs transition-all duration-200 ${
                      selectedNodeId === node.id 
                        ? 'bg-zinc-900 border-emerald-500/40 shadow-sm' 
                        : 'bg-zinc-900/30 border-zinc-800/80 hover:border-zinc-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5 font-semibold text-[10px] text-zinc-400 tracking-wider">
                      <span>Over {node.overNumber} ({node.team})</span>
                      <span className={node.isAlternate ? 'text-rose-400' : 'text-emerald-400'}>
                        {node.runs}/{node.wickets}
                      </span>
                    </div>
                    <div className="font-bold text-zinc-100 mb-1">{node.label}</div>
                    <p className="text-zinc-300 leading-relaxed italic">
                      "{node.commentary}"
                    </p>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
