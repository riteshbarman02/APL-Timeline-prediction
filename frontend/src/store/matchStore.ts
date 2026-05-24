import { create } from 'zustand';
import { Match, CricketEventNode, TimelineBranch, MatchScorecardState } from '@cricket-multiverse/shared';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000';

interface MatchStore {
  match: Match | null;
  matches: Match[];
  branches: TimelineBranch[];
  nodes: CricketEventNode[];
  activeBranchId: string;
  scorecardState: MatchScorecardState | null;
  selectedNodeId: string | null;
  
  isSimulating: boolean;
  simulationError: string | null;
  
  comparisonMode: boolean;
  comparisonBranchId: string | null;
  comparisonTimeline: {
    branches: TimelineBranch[];
    nodes: CricketEventNode[];
    scorecardState: MatchScorecardState | null;
  } | null;

  socket: WebSocket | null;
  wsConnected: boolean;

  // Actions
  fetchMatches: () => Promise<void>;
  fetchTimeline: (matchId: string, branchId?: string) => Promise<void>;
  setActiveBranch: (branchId: string) => Promise<void>;
  setSelectedNodeId: (nodeId: string | null) => void;
  triggerSimulation: (matchId: string, nodeId: string, premise: string) => Promise<void>;
  setComparisonMode: (enabled: boolean, compareBranchId?: string | null) => void;
  resetMatch: (matchId: string) => Promise<void>;
  
  // WebSocket Lifecycle
  connectWebSocket: (matchId: string) => void;
  disconnectWebSocket: () => void;
}

export const useMatchStore = create<MatchStore>((set, get) => ({
  match: null,
  matches: [],
  branches: [],
  nodes: [],
  activeBranchId: 'real',
  scorecardState: null,
  selectedNodeId: null,

  isSimulating: false,
  simulationError: null,

  comparisonMode: false,
  comparisonBranchId: null,
  comparisonTimeline: null,

  socket: null,
  wsConnected: false,

  fetchMatches: async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/matches`);
      if (!res.ok) throw new Error('Failed to fetch matches');
      const data = await res.json();
      set({ matches: data });
    } catch (err) {
      console.error('Fetch matches error:', err);
    }
  },

  fetchTimeline: async (matchId, branchId = 'real') => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/matches/${matchId}/timeline?branchId=${branchId}`);
      if (!res.ok) throw new Error('Failed to fetch match timeline');
      
      const data = await res.json();
      set({
        match: data.match,
        branches: data.branches,
        nodes: data.nodes,
        activeBranchId: data.activeBranchId,
        scorecardState: data.scorecardState
      });
      
      // Auto-select the first node if none is selected
      const currentSelected = get().selectedNodeId;
      if (!currentSelected && data.nodes.length > 0) {
        set({ selectedNodeId: data.nodes[data.nodes.length - 1].id });
      }
    } catch (err: any) {
      console.error('Fetch timeline error:', err);
    }
  },

  setActiveBranch: async (branchId) => {
    const match = get().match;
    if (!match) return;
    await get().fetchTimeline(match.id, branchId);
  },

  setSelectedNodeId: (nodeId) => {
    set({ selectedNodeId: nodeId });
  },

  triggerSimulation: async (matchId, nodeId, premise) => {
    set({ isSimulating: true, simulationError: null });
    try {
      const res = await fetch(`${BACKEND_URL}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, nodeId, premise })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to simulate alternate timeline');
      }

      const data = await res.json(); // { branch, nodes, scorecardState }
      
      // Refetch the full timeline targeting the new branch
      await get().fetchTimeline(matchId, data.branch.id);
      
      // Auto-select the first node of the newly generated branch
      if (data.nodes.length > 0) {
        set({ selectedNodeId: data.nodes[0].id });
      }
    } catch (err: any) {
      console.error('Simulation error:', err);
      set({ simulationError: err.message });
    } finally {
      set({ isSimulating: false });
    }
  },

  setComparisonMode: async (enabled, compareBranchId = null) => {
    const match = get().match;
    if (!match) return;

    if (!enabled) {
      set({
        comparisonMode: false,
        comparisonBranchId: null,
        comparisonTimeline: null
      });
      return;
    }

    if (compareBranchId) {
      set({ isSimulating: true });
      try {
        const res = await fetch(`${BACKEND_URL}/api/matches/${match.id}/timeline?branchId=${compareBranchId}`);
        if (!res.ok) throw new Error('Failed to fetch comparison timeline');
        const data = await res.json();
        
        set({
          comparisonMode: true,
          comparisonBranchId: compareBranchId,
          comparisonTimeline: {
            branches: data.branches,
            nodes: data.nodes,
            scorecardState: data.scorecardState
          }
        });
      } catch (err) {
        console.error('Fetch comparison error:', err);
      } finally {
        set({ isSimulating: false });
      }
    }
  },

  resetMatch: async (matchId) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/matches/${matchId}/reset`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to reset match');
      
      // Clear selections and refetch timeline
      set({ selectedNodeId: null });
      await get().fetchTimeline(matchId, 'real');
    } catch (err) {
      console.error('Reset match error:', err);
    }
  },

  connectWebSocket: (matchId) => {
    // Avoid double connection
    if (get().socket) {
      get().disconnectWebSocket();
    }

    // Reset current match state variables to avoid visual glitch
    set({
      match: null,
      nodes: [],
      branches: [],
      scorecardState: null,
      selectedNodeId: null,
      activeBranchId: 'real'
    });

    console.log(`Connecting to WebSocket: ${WS_URL}`);
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('WS Connection established');
      set({ wsConnected: true });
      // Subscribe to match stream
      ws.send(JSON.stringify({ type: 'subscribe', matchId }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, data } = msg;

        if (type === 'init') {
          // Loaded when subscribing
          set({
            match: data.match,
            branches: data.branches,
            nodes: data.nodes,
            activeBranchId: data.activeBranchId,
            scorecardState: data.scorecardState
          });
          
          if (!get().selectedNodeId && data.nodes.length > 0) {
            set({ selectedNodeId: data.nodes[data.nodes.length - 1].id });
          }
        } else if (type === 'timeline_update') {
          const { node, scorecardState } = data;
          
          // Only update client list if we are currently looking at the live 'real' branch
          if (get().activeBranchId === 'real') {
            const currentNodes = get().nodes;
            const currentBranches = get().branches;
            
            // Check if node already exists to avoid duplicates
            if (!currentNodes.some(n => n.id === node.id)) {
              const updatedNodes = [...currentNodes, node];
              set({
                nodes: updatedNodes,
                scorecardState,
                // Automatically select the new node if the previous selection was the latest node
                selectedNodeId: get().selectedNodeId === currentNodes[currentNodes.length - 1]?.id 
                  ? node.id 
                  : get().selectedNodeId || node.id
              });
            }
          }
        } else if (type === 'scorecard_update') {
          const { scorecardState } = data;
          set({ scorecardState });
        } else if (type === 'match_completed') {
          const { match } = data;
          set({ match });
        }
      } catch (err) {
        console.error('Error handling WS message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WS Error:', err);
    };

    ws.onclose = () => {
      console.log('WS Connection closed');
      set({ wsConnected: false, socket: null });
    };

    set({ socket: ws });
  },

  disconnectWebSocket: () => {
    const ws = get().socket;
    if (ws) {
      ws.close();
      set({ socket: null, wsConnected: false });
    }
  }
}));
