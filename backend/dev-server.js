/**
 * dev-server.js
 * Servidor de desenvolvimento unificado:
 * - Serve os arquivos do frontend (HTTP) na porta 3000
 * - Roda o backend WebSocket na MESMA porta
 * Uso: node backend/dev-server.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const RelayManager = require('./RelayManager.js');

const PORT = 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

// --- MIME Types ---
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png':  'image/png',
    '.ico':  'image/x-icon',
};

// --- HTTP Server (serve frontend) ---
const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0]; // ignora query strings

    // Rota raiz → index.html
    if (urlPath === '/' || urlPath === '') urlPath = '/index.html';

    const filePath = path.join(FRONTEND_DIR, urlPath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// --- WebSocket Server (no mesmo HTTP server) ---
const relay = new RelayManager();
const wss = new WebSocketServer({ server });

// Heartbeat Loop
const interval = setInterval(() => {
    relay.processHeartbeats(wss.clients);
}, 30000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws, req) => {
    relay.initClient(ws, req);
    ws.on('pong', () => relay.handlePong(ws));
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            relay.handleIncomingJSON(ws, data);
        } catch (_) {}
    });
    ws.on('close', () => relay.handleDisconnect(ws));
    ws.on('error', () => {});
});

// --- Start ---
server.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║     🔒 Secure Chat Dev Server            ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Frontend: http://localhost:${PORT}          ║`);
    console.log(`║  WebSocket: ws://localhost:${PORT}           ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('  Abra no browser: http://localhost:3000');
    console.log('  Para entrar no Admin: clique 7x no título');
    console.log('  Pressione Ctrl+C para parar.\n');
});
