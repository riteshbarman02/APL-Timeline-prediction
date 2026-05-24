import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import {
  listMatches,
  getMatchTimeline,
  initMatch,
  startLivePlayback,
  stopLivePlayback,
  registerBroadcastCallback,
  addAlternateBranch,
  hasMatch
} from './services/liveCricket.js';
import { simulateTimeline } from './services/geminiSimulator.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// REST APIs
app.get('/api/matches', async (req, res) => {
  try {
    const matches = await listMatches();
    res.json(matches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/matches/:id/timeline', async (req, res) => {
  try {
    const { id } = req.params;
    const { branchId } = req.query;

    if (id !== 'ipl_2026_mi_csk' && !hasMatch(id)) {
      console.log(`Match ${id} not in database during REST timeline request. Populating matches...`);
      await listMatches();
    }

    const timeline = getMatchTimeline(id, branchId as string || 'real');
    res.json(timeline);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/matches/:id/reset', (req, res) => {
  try {
    const { id } = req.params;
    initMatch(id);
    startLivePlayback(id);
    res.json({ message: `Match ${id} reset and live playback restarted.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/simulate', async (req, res) => {
  try {
    const { matchId, nodeId, premise } = req.body;
    if (!matchId || !nodeId || !premise) {
      return res.status(400).json({ error: 'Missing required parameters: matchId, nodeId, premise' });
    }

    // 1. Get the current match timeline state
    const timeline = getMatchTimeline(matchId, 'real'); // Base context from real timeline
    const match = timeline.match;
    
    // 2. Find the selected target node
    // We search the full database of matches to find it
    const allTimelineNodes = getMatchTimeline(matchId, 'real'); // We get the list
    const state = getMatchTimeline(matchId, 'real'); // Let's traverse all nodes in current match
    
    // In our system, the active branches contain a history of nodes. Let's find the selected node.
    // To get the full list of nodes, we can query without filtering, or fetch the match database state.
    // Let's implement a simple search inside the match nodes
    // Since getMatchTimeline returns nodes filtered by active branch path, we can search the nodes in all branches.
    const rawTimeline = getMatchTimeline(matchId, 'real'); // This returns nodes for 'real'.
    // Let's get the node from the database. To be safe, let's find the node from the match's entire node list.
    // We can query the full unfiltered list directly by searching all branch paths, but let's query the specific branch.
    // Wait, the node might be in another alternate branch. Let's traverse all branches to find it.
    let selectedNode = rawTimeline.nodes.find(n => n.id === nodeId);
    if (!selectedNode) {
      // Look in other branches
      for (const branch of rawTimeline.branches) {
        const tempTimeline = getMatchTimeline(matchId, branch.id);
        selectedNode = tempTimeline.nodes.find(n => n.id === nodeId);
        if (selectedNode) break;
      }
    }

    if (!selectedNode) {
      return res.status(404).json({ error: 'Selected node not found in match history' });
    }

    // 3. Build parent nodes array for context (climbing up the tree)
    const parentNodes: any[] = [];
    let currentParentId = selectedNode.parentId;
    const searchTimeline = getMatchTimeline(matchId, selectedNode.branchId);

    while (currentParentId) {
      const parent = searchTimeline.nodes.find(n => n.id === currentParentId);
      if (parent) {
        parentNodes.unshift(parent);
        currentParentId = parent.parentId;
      } else {
        break;
      }
    }

    // 4. Trigger Gemini simulation
    console.log(`Running simulation on node ${nodeId} for premise: "${premise}"`);
    const simulationResult = await simulateTimeline(match, selectedNode, parentNodes, premise);

    // 5. Save the alternate timeline
    addAlternateBranch(
      matchId,
      simulationResult.branch,
      simulationResult.nodes,
      simulationResult.scorecardState
    );

    res.json(simulationResult);
  } catch (err: any) {
    console.error('Simulation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Setup HTTP & WS servers
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// Map to keep track of active subscriptions
const subscriptions = new Map<WebSocket, string>();

wss.on('connection', (ws: WebSocket) => {
  console.log('New WS Client connected');

  ws.on('message', async (message: string) => {
    try {
      const parsed = JSON.parse(message);
      if (parsed.type === 'subscribe') {
        const { matchId } = parsed;
        subscriptions.set(ws, matchId);
        
        // Ensure match is initialized from Cricbuzz/API list if not in db
        if (matchId !== 'ipl_2026_mi_csk' && !hasMatch(matchId)) {
          console.log(`Match ${matchId} not in database. Populating matches...`);
          await listMatches();
        }
        
        // Start playback/polling loop for this match
        startLivePlayback(matchId);
        
        // Push initial state immediately upon subscription
        const timeline = getMatchTimeline(matchId, 'real');
        ws.send(JSON.stringify({
          type: 'init',
          matchId,
          data: timeline
        }));

        console.log(`Client subscribed to match: ${matchId}`);
      }
    } catch (err) {
      console.error('WS Message parsing error:', err);
    }
  });

  ws.on('close', () => {
    const matchId = subscriptions.get(ws);
    subscriptions.delete(ws);
    console.log('WS Client disconnected');
    
    // Stop playback if no other clients are subscribed to this match
    if (matchId && matchId !== defaultMatchId) {
      const otherSubs = Array.from(subscriptions.values()).some(id => id === matchId);
      if (!otherSubs) {
        console.log(`Stopping live playback for match ${matchId} (no subscribers)`);
        stopLivePlayback(matchId);
      }
    }
  });
});

// Upgrade HTTP connection to WebSocket
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Register broadcast hook in the liveCricket service
registerBroadcastCallback((message) => {
  const json = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      const subMatchId = subscriptions.get(client);
      if (subMatchId === message.matchId) {
        client.send(json);
      }
    }
  });
});

// Start playback for our default match immediately
const defaultMatchId = 'ipl_2026_mi_csk';
initMatch(defaultMatchId);
startLivePlayback(defaultMatchId);

server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`WS Server listening for upgrades on same port`);
});
