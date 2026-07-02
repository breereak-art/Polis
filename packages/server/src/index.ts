import path from 'path';

// Load environment from a .env file (Qwen credentials, etc.) before anything
// else reads process.env. Node >=20.12 provides process.loadEnvFile, which
// throws if the file is missing — so we try a few likely locations.
for (const candidate of [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'),
]) {
    try {
        (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(candidate);
        break;
    } catch {
        /* try next candidate */
    }
}

import express from 'express';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { OfficeRoom } from './rooms/OfficeRoom';

// Setup Express
const app = express();
app.use(express.json());

// Basic REST API for Office Management
app.get('/api/offices', (req, res) => {
    res.json({ status: 'ok', offices: [] });
});

app.post('/api/vote-chaos', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'No active office room.' });
        return;
    }
    const { event, voterId } = req.body || {};
    const result = room.registerAudienceVote(event || 'server_outage', voterId);
    res.json({ ok: true, ...result });
});

// Tyr trust ledger snapshot — agent trust profiles + hash-chain integrity proof.
app.get('/api/tyr', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'No active office room.' });
        return;
    }
    res.json({ ok: true, ...room.getTyrSnapshot() });
});

app.get('/api/episode-recap', (req, res) => {
    const room = OfficeRoom.getActiveRoom();
    if (!room) {
        res.status(503).json({ ok: false, error: 'No active office room.' });
        return;
    }
    res.json({ ok: true, recap: room.getEpisodeRecap() });
});

// Production: serve the built UI (packages/ui/dist) from this same server so a
// single container exposes everything — REST, WebSocket and the console.
const uiDist = path.resolve(__dirname, '..', '..', 'ui', 'dist');
app.use(express.static(uiDist));
app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(uiDist, 'index.html'), (err) => {
        if (err) res.status(404).send('UI not built — run: npm run build --workspace=@agent-office/ui');
    });
});

// Create HTTP and Colyseus server
const httpServer = createServer(app);
const colyseusServer = new Server({
    server: httpServer,
});

// Define Rooms
colyseusServer.define('office', OfficeRoom);

// Start listening
const PORT = Number(process.env.PORT || 3000);
colyseusServer.listen(PORT).then(() => {
    console.log(`[Server] AgentOffice Engine listening on ws://localhost:${PORT}`);
});
