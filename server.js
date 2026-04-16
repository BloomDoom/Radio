// ═══════════════════════════════════════════════
//  Radio Chat Server
//  Run:  npm install   (first time only)
//        node server.js
// ═══════════════════════════════════════════════

const { WebSocketServer } = require('ws');
const http = require('http');

const PORT = 8080;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end('Radio Chat Server running.');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    console.log(`[+] Client connected  (${req.socket.remoteAddress})`);

    ws.on('message', (raw) => {
        try {
            const data = JSON.parse(raw.toString());

            // Basic validation
            if (typeof data.nick !== 'string' || typeof data.text !== 'string') return;

            // Trim to safe lengths
            data.nick = data.nick.slice(0, 30);
            data.text = data.text.slice(0, 300);

            const payload = JSON.stringify(data);

            // Broadcast to every connected client
            wss.clients.forEach((client) => {
                if (client.readyState === 1 /* OPEN */) {
                    client.send(payload);
                }
            });
        } catch {
            // Ignore malformed messages
        }
    });

    ws.on('close', () => {
        console.log(`[-] Client disconnected (${req.socket.remoteAddress})`);
    });
});

server.listen(PORT, () => {
    console.log(`✓  Chat server listening on  ws://localhost:${PORT}`);
    console.log(`   Press Ctrl+C to stop.\n`);
});
