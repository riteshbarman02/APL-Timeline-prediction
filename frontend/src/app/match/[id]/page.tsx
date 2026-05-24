'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { 
  ReactFlow, 
  Background, 
  Controls, 
  MiniMap,
  Node,
  Edge,
  MarkerType
} from '@xyflow/react';
import { useMatchStore } from '../../../store/matchStore';
import { CricketEventNode } from '@cricket-multiverse/shared';
import Navbar from '../../../components/Navbar';
import RightSidebar from '../../../components/RightSidebar';
import SimulationPanel from '../../../components/SimulationPanel';
import ComparisonOverlay from '../../../components/ComparisonOverlay';
import CricketNode from '../../../components/CricketNode';
import { Sparkles, HelpCircle } from 'lucide-react';

const nodeTypes = {
  cricketNode: CricketNode
};

export default function MultiverseDashboard() {
  const params = useParams();
  const matchId = params.id as string;
  
  const [isMounted, setIsMounted] = useState(false);
  const {
    nodes: storeNodes,
    branches,
    match,
    selectedNodeId,
    activeBranchId,
    setSelectedNodeId,
    connectWebSocket,
    disconnectWebSocket,
    fetchMatches
  } = useMatchStore();

  useEffect(() => {
    setIsMounted(true);
    // Fetch all matches
    fetchMatches();
    
    // Connect to the specific match stream from the route parameter
    if (matchId) {
      console.log(`Connecting to match workspace: ${matchId}`);
      connectWebSocket(matchId);
    }

    return () => {
      disconnectWebSocket();
    };
  }, [connectWebSocket, disconnectWebSocket, fetchMatches, matchId]);
  // Track user-overridden positions for alternate timeline nodes (drag-to-reposition)
  const [userPositions, setUserPositions] = useState<Record<string, { x: number; y: number }>>({});

  const handleNodeDragStop = useCallback((_: any, node: any) => {
    // Only persist positions for alternate nodes (canon stays fixed)
    if (node.data?.node?.isAlternate) {
      setUserPositions(prev => ({ ...prev, [node.id]: node.position }));
    }
  }, []);

  // Visual layout branching algorithm
  const { flowNodes, flowEdges } = useMemo(() => {
    if (storeNodes.length === 0) return { flowNodes: [], flowEdges: [] };

    // Use real team names from match state, fallback to generic
    const teamAShortName = match?.teamA?.shortName || 'Team A';
    const teamBShortName = match?.teamB?.shortName || 'Team B';
    const tossWinner = match?.tossWinner;
    const tossDecision = match?.tossDecision;
    // Determine which team bats first based on toss
    let battingFirstTeam = teamAShortName;
    let battingSecondTeam = teamBShortName;
    if (tossWinner && tossDecision === 'field') {
      // toss winner chose to field → opponent bats first
      battingFirstTeam = tossWinner === teamAShortName ? teamBShortName : teamAShortName;
      battingSecondTeam = tossWinner === teamAShortName ? teamAShortName : teamBShortName;
    }

    // Find the first batting team to differentiate Innings 1 and Innings 2
    const firstBattingNode = storeNodes.find(n => n.type !== 'toss');
    const firstBattingTeam = firstBattingNode?.team;

    const isNodeInnings2 = (node: CricketEventNode) => {
      return node.type !== 'toss' && firstBattingTeam && node.team !== firstBattingTeam;
    };

    // Calculate Y offsets for each branch to prevent collisions (baseline is Y = 200 for Innings 1)
    const branchYOffsets: { [branchId: string]: number } = { real: 200 };
    let offsetCounter = 1;
    
    // Sort alternate branches by creation date
    const sortedBranches = [...branches]
      .filter(b => b.id !== 'real')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    sortedBranches.forEach(b => {
      // Alternate heights around 200: 200 (canon), 50 (alt 1), 350 (alt 2), -100 (alt 3)
      const multiplier = offsetCounter % 2 === 0 ? -1 : 1;
      const index = Math.ceil(offsetCounter / 2);
      branchYOffsets[b.id] = 200 + (multiplier * index * 150);
      offsetCounter++;
    });

    // Compute node depths to determine X positions without overlap (sequential ordering)
    const depths: { [nodeId: string]: number } = {};
    
    // Resolve depths iteratively by traversing parent pointers
    let resolvedAny = true;
    let iterations = 0;
    const maxIterations = storeNodes.length * 2;
    
    while (resolvedAny && iterations < maxIterations) {
      resolvedAny = false;
      iterations++;
      
      storeNodes.forEach(node => {
        if (depths[node.id] !== undefined) return;
        
        if (!node.parentId) {
          depths[node.id] = 0;
          resolvedAny = true;
        } else if (depths[node.parentId] !== undefined) {
          const parentNode = storeNodes.find(n => n.id === node.parentId);
          const parentIsInnings1 = parentNode && !isNodeInnings2(parentNode);
          const currentIsInnings2 = isNodeInnings2(node);
          
          depths[node.id] = depths[node.parentId] + 1;
          resolvedAny = true;
        }
      });
    }

    // Fallback for any nodes that couldn't be resolved (e.g. disconnected)
    storeNodes.forEach(node => {
      if (depths[node.id] === undefined) {
        // Fallback to a depth based on overNumber
        depths[node.id] = Math.round(node.overNumber * 6);
      }
    });

    // Calculate dynamic backdrop boundaries
    const innings2Nodes = storeNodes.filter(isNodeInnings2);
    const minInnings2Depth = innings2Nodes.length > 0
      ? Math.min(...innings2Nodes.map(n => depths[n.id]))
      : Infinity;

    const maxDepth = Math.max(...Object.values(depths), 0);
    const branchHeights = Object.values(branchYOffsets);
    const minY = Math.min(...branchHeights, 200) - 150;
    const maxY = Math.max(...branchHeights, 200) + 200;
    const backdropHeight = maxY - minY;

    const startX_1 = -100;
    let width_1 = (maxDepth + 1) * 320 + 90;
    let startX_2 = 0;
    let width_2 = 0;

    if (minInnings2Depth !== Infinity) {
      width_1 = minInnings2Depth * 320 + 10;
      startX_2 = startX_1 + width_1;
      width_2 = (maxDepth - minInnings2Depth) * 320 + 340;
    }

    const flowNodes: Node[] = [];

    // 1. Add background tracks (overlays)
    if (storeNodes.length > 0) {
      flowNodes.push({
        id: 'bg_innings_1',
        type: 'default',
        data: { label: `${battingFirstTeam} — 1st INNINGS` },
        position: { x: startX_1, y: minY },
        draggable: false,
        selectable: false,
        style: {
          width: width_1,
          height: backdropHeight,
          background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.05) 0%, rgba(16, 185, 129, 0.01) 100%)',
          border: '1px dashed rgba(16, 185, 129, 0.2)',
          borderRadius: '24px',
          pointerEvents: 'none',
          zIndex: -2,
          color: 'rgba(16, 185, 129, 0.5)',
          fontWeight: 900,
          fontSize: '18px',
          letterSpacing: '0.15em',
          padding: '20px 24px',
          textAlign: 'left',
          display: 'flex',
          justifyContent: 'flex-start',
          alignItems: 'flex-start'
        }
      });

      if (minInnings2Depth !== Infinity) {
        flowNodes.push({
          id: 'bg_innings_2',
          type: 'default',
          data: { label: `${battingSecondTeam} — 2nd INNINGS` },
          position: { x: startX_2, y: minY },
          draggable: false,
          selectable: false,
          style: {
            width: width_2,
            height: backdropHeight,
            background: 'linear-gradient(180deg, rgba(14, 165, 233, 0.05) 0%, rgba(14, 165, 233, 0.01) 100%)',
            border: '1px dashed rgba(14, 165, 233, 0.2)',
            borderRadius: '24px',
            pointerEvents: 'none',
            zIndex: -2,
            color: 'rgba(14, 165, 233, 0.5)',
            fontWeight: 900,
            fontSize: '18px',
            letterSpacing: '0.15em',
            padding: '20px 24px',
            textAlign: 'left',
            display: 'flex',
            justifyContent: 'flex-start',
            alignItems: 'flex-start'
          }
        });
      }
    }

    // 2. Map standard cricketNodes
    storeNodes.forEach(node => {
      const depth = depths[node.id];
      const defaultX = 50 + depth * 320;
      const defaultY = branchYOffsets[node.branchId] !== undefined 
        ? branchYOffsets[node.branchId] 
        : 200;

      // If user has dragged this alternate node, use their saved position
      const savedPos = userPositions[node.id];
      const x = savedPos ? savedPos.x : defaultX;
      const y = savedPos ? savedPos.y : defaultY;

      // Alternate branch nodes are draggable (user can reposition them)
      const isDraggable = node.isAlternate === true;

      flowNodes.push({
        id: node.id,
        type: 'cricketNode',
        position: { x, y },
        draggable: isDraggable,
        data: {
          node,
          isSelected: node.id === selectedNodeId
        }
      });
    });

    // Create React Flow Edges
    const flowEdges: Edge[] = [];
    storeNodes.forEach(node => {
      if (node.parentId) {
        const isEdgeAlternate = node.isAlternate;
        const color = isEdgeAlternate ? '#f43f5e' : '#10b981';
        
        flowEdges.push({
          id: `edge-${node.parentId}-${node.id}`,
          source: node.parentId,
          target: node.id,
          animated: true,
          style: {
            stroke: color,
            strokeWidth: 3,
            filter: `drop-shadow(0 0 4px ${color})`
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 15,
            height: 15,
            color
          }
        });
      }
    });

    return { flowNodes, flowEdges };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeNodes, branches, selectedNodeId, match, userPositions]);

  if (!isMounted) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center gap-3">
        <Sparkles className="w-8 h-8 text-rose-500 animate-pulse" />
        <span className="text-sm font-bold text-zinc-400">Loading IPL Multiverse Workspace...</span>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden relative">
      {/* Navbar */}
      <Navbar />

      {/* Main Panel Content */}
      <div className="flex-1 flex min-h-0 relative">
        
        {/* Left Interactive Canvas Workspace */}
        <div className="flex-1 min-w-0 h-full relative">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onNodeDragStop={handleNodeDragStop}
            fitView
            minZoom={0.2}
            maxZoom={1.5}
            fitViewOptions={{ padding: 0.15 }}
            className="bg-zinc-950"
          >
            <Background color="#27272a" gap={20} size={1} />
            <Controls className="bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-md overflow-hidden scale-90 origin-bottom-left" />
            <MiniMap 
              position="bottom-left" 
              className="!bg-zinc-900/60 border border-zinc-800 rounded-lg backdrop-blur-md overflow-hidden scale-75 origin-bottom-left" 
              nodeColor={(node) => {
                const isAlt = (node.data as any)?.node?.isAlternate;
                return isAlt ? '#f43f5e' : '#10b981';
              }}
              maskColor="rgba(9, 9, 11, 0.7)"
            />
          </ReactFlow>

          {/* Floating Instructions Legend */}
          <div className="absolute top-4 left-4 z-10 glass-panel border border-zinc-800/80 px-3 py-2 rounded-lg text-[10px] text-zinc-400 flex flex-col gap-1.5 shadow-md max-w-xs pointer-events-none">
            <div className="flex items-center gap-1.5 font-bold text-zinc-200">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Canvas Guide</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-emerald-500 rounded-sm" />
              <span>Canon Timeline (Real-time live feed)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-rose-500 rounded-sm" />
              <span>Alternate Reality (Simulated paths)</span>
            </div>
            <div className="text-[9px] text-zinc-500 italic border-t border-zinc-900 pt-1 mt-0.5">
              Click a node to inspect. Drag alternate (red) nodes to reposition. Use the simulator to inject what-if scenarios.
            </div>
          </div>

          {/* Bottom Floating Simulation Input Form */}
          <SimulationPanel />
        </div>

        {/* Right Sidebar Details */}
        <RightSidebar />
      </div>

      {/* Comparison Workspace Modal Overlay */}
      <ComparisonOverlay />
    </div>
  );
}
