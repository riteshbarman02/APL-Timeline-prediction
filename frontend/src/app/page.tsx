'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMatchStore } from '../store/matchStore';
import { 
  Sparkles, 
  Tv, 
  Calendar, 
  PlayCircle, 
  MapPin, 
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { Match } from '@cricket-multiverse/shared';

export default function MatchesDashboard() {
  const { matches, fetchMatches } = useMatchStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      await fetchMatches();
      setLoading(false);
    };
    load();
  }, [fetchMatches]);

  const iplMatches = matches.filter(m => 
    (m.status === 'live' || m.status === 'upcoming') &&
    (m.series?.toLowerCase().includes('ipl') || 
     m.series?.toLowerCase().includes('indian premier league'))
  );

  const liveMatches = matches.filter(m => 
    m.status === 'live' && 
    !(m.series?.toLowerCase().includes('ipl') || 
      m.series?.toLowerCase().includes('indian premier league'))
  );

  const upcomingMatches = matches.filter(m => 
    m.status === 'upcoming' && 
    !(m.series?.toLowerCase().includes('ipl') || 
      m.series?.toLowerCase().includes('indian premier league'))
  );

  const demoMatches = matches.filter(m => m.status === 'mock');

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col relative overflow-y-auto">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-rose-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />

      {/* Navbar header */}
      <header className="h-16 border-b border-zinc-900 bg-zinc-950/40 backdrop-blur-md px-8 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2">
          <div className="bg-gradient-to-r from-rose-500 to-pink-500 p-2 rounded-lg">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-sm font-black tracking-wider uppercase bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">
            IPL Multiverse
          </span>
        </div>

        <button 
          onClick={() => fetchMatches()} 
          className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh Matches
        </button>
      </header>

      {/* Hero section */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-10 flex flex-col gap-10 z-10">
        <div className="text-center max-w-2xl mx-auto flex flex-col gap-3">
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white leading-tight">
            CRICKET ALTERNATE REALITY <span className="bg-gradient-to-r from-rose-400 to-pink-500 bg-clip-text text-transparent">ENGINE</span>
          </h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Select a live, upcoming, or demo match. Traverse the live timeline graph and inject custom premises at any ball to simulate branching outcomes powered by Google Gemini.
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500">
            <RefreshCw className="w-8 h-8 animate-spin text-rose-500" />
            <span className="text-xs font-bold tracking-wider uppercase">Fetching Cricket Fixtures...</span>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            
            {/* Featured IPL Matches Section */}
            <div>
              <h2 className="text-xs font-extrabold tracking-widest text-transparent bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 bg-clip-text uppercase mb-4 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                IPL Matches - Live & Upcoming ({iplMatches.length})
              </h2>
              {iplMatches.length === 0 ? (
                <div className="glass-panel text-center py-8 rounded-xl border border-zinc-900 text-xs text-zinc-500">
                  No live or upcoming IPL matches currently scheduled.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {iplMatches.map(m => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              )}
            </div>

            {/* 1. Other Live Matches Section */}
            <div>
              <h2 className="text-xs font-extrabold tracking-widest text-zinc-400 uppercase mb-4 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                </span>
                Other Live Matches ({liveMatches.length})
              </h2>
              {liveMatches.length === 0 ? (
                <div className="glass-panel text-center py-8 rounded-xl border border-zinc-900 text-xs text-zinc-500">
                  No other live matches currently in progress.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {liveMatches.map(m => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              )}
            </div>

            {/* 2. Other Upcoming Matches Section */}
            <div>
              <h2 className="text-xs font-extrabold tracking-widest text-zinc-400 uppercase mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-400" />
                Other Upcoming Matches ({upcomingMatches.length})
              </h2>
              {upcomingMatches.length === 0 ? (
                <div className="glass-panel text-center py-8 rounded-xl border border-zinc-900 text-xs text-zinc-500">
                  No other upcoming matches scheduled.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {upcomingMatches.map(m => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              )}
            </div>

            {/* 3. Demo Playback Section */}
            <div>
              <h2 className="text-xs font-extrabold tracking-widest text-zinc-400 uppercase mb-4 flex items-center gap-2">
                <PlayCircle className="w-4 h-4 text-emerald-400" />
                Demo Playbacks & Scenarios ({demoMatches.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {demoMatches.map(m => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-zinc-900 text-center text-[10px] text-zinc-600 bg-zinc-950/40">
        IPL Multiverse • Powered by Google Gemini & React Flow
      </footer>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const getStatusBadge = () => {
    switch (match.status) {
      case 'live':
        return (
          <span className="flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full bg-rose-950/50 text-rose-400 border border-rose-900/30">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            LIVE
          </span>
        );
      case 'upcoming':
        return (
          <span className="flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-950/50 text-sky-400 border border-sky-900/30">
            UPCOMING
          </span>
        );
      case 'mock':
        return (
          <span className="flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-950/50 text-amber-400 border border-amber-900/30">
            DEMO PLAYBACK
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-400 border border-zinc-800">
            COMPLETED
          </span>
        );
    }
  };

  const formattedDate = () => {
    try {
      const d = new Date(match.date);
      return d.toLocaleDateString(undefined, { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return match.date;
    }
  };

  return (
    <Link href={`/match/${match.id}`} className="block select-none group pointer-events-auto">
      <div className="glass-panel glass-panel-hover rounded-xl p-5 border border-zinc-900 transition-all duration-300 flex flex-col gap-4 shadow-md group-hover:translate-y-[-2px] group-hover:border-zinc-800/80 group-hover:shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
        {/* Status Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 overflow-hidden max-w-[70%]">
            {getStatusBadge()}
            {match.series && (
              <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-900/60 text-zinc-400 border border-zinc-800/40 truncate">
                {match.series}
              </span>
            )}
          </div>
          <span className="text-[10px] text-zinc-500 font-mono flex-shrink-0">
            ID: {match.id}
          </span>
        </div>

        {/* Versus Teams Block */}
        <div className="flex flex-col gap-2 py-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-zinc-200 group-hover:text-white transition-colors">
              {match.teamA.name}
            </span>
            <span className="text-xs font-mono font-extrabold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              {match.teamA.shortName}
            </span>
          </div>
          
          <div className="text-[10px] font-black text-zinc-600 tracking-wider">VS</div>
          
          <div className="flex items-center justify-between">
            <span className="text-sm font-black text-zinc-200 group-hover:text-white transition-colors">
              {match.teamB.name}
            </span>
            <span className="text-xs font-mono font-extrabold text-zinc-500 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
              {match.teamB.shortName}
            </span>
          </div>
        </div>

        {/* Meta Info footer */}
        <div className="border-t border-zinc-900/60 pt-3 flex flex-col gap-1.5 text-[11px] text-zinc-500 font-medium">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-zinc-600" />
            <span className="truncate">{match.venue}</span>
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span>{formattedDate()}</span>
            <span className="text-rose-400 font-bold group-hover:text-rose-300 flex items-center gap-0.5 transition-colors">
              Launch Workspace
              <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-1" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
