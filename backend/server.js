// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
/**
 * backend/server.js
 * Signal-style Pure Relay Backend Bootstrap
 */
const { WebSocketServer } = require('ws');
const RelayManager = require('./RelayManager.js');

const PORT = process.env.PORT || 3000;
const wss = new WebSocketServer({ 
    port: PORT,
    maxPayload: 4096 // Strict 4KB payload limit for chat messages to prevent DoS
});
const relay = new RelayManager();

console.log(`[+] Modular Signal Backend Started on port ${PORT}`);

// Heartbeat Loop (Adaptive Detection)
const interval = setInterval(() => {
    relay.processHeartbeats(wss.clients);
}, 30000);

wss.on('close', () => clearInterval(interval));

wss.on('connection', (ws) => {
    // 1. Initialize Metadata Config
    relay.initClient(ws);

    // 2. Map Heartbeats
    ws.on('pong', () => relay.handlePong(ws));

    // 3. Map Payloads securely
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            relay.handleIncomingJSON(ws, data);
        } catch (jsonErr) {
            // Drop un-parseable noise quietly
        }
    });

    // 4. Memory Maps Garbage Collection
    ws.on('close', () => relay.handleDisconnect(ws));
    
    // Suppress Stack Trace Spillage
    ws.on('error', () => {}); 
});
