// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
/**
 * backend/RelayManager.js
 * Admin Authorization Verification & Pure Relay logic
 */

const fs = require('fs');
const path = require('path');
const RoomState = require('./RoomState.js');
const AntiBotSystem = require('./AntiBot.js');

// Master Credentials configured for Deployment 
const ADMIN_PASS = 'admin123';
const ADMIN_TOKEN = 'token123';
const HONEYPOT_ROOMS = ['admin', 'root', 'test', '1234', 'secret', 'password', 'chat'];
const TRUST_PATH = path.join(__dirname, 'trusted_admins.json');

class RelayManager {
    constructor() {
        this.roomState = new RoomState();
        this.antiBot = new AntiBotSystem();
        this.metadata = new WeakMap(); 
        this.trustedAdmins = this._loadTrusted();
    }

    _loadTrusted() {
        try {
            if (fs.existsSync(TRUST_PATH)) return JSON.parse(fs.readFileSync(TRUST_PATH, 'utf8'));
        } catch (e) {}
        return [];
    }

    _saveTrusted() {
        try {
            fs.writeFileSync(TRUST_PATH, JSON.stringify(this.trustedAdmins, null, 2));
        } catch (e) {}
    }

    initClient(ws, req) {
        // Limpar IP (remover prefixo IPv6-mapped IPv4)
        let ip = ws._socket.remoteAddress || '127.0.0.1';
        ip = ip.replace(/^.*:/, ''); 
        
        const ua = req ? req.headers['user-agent'] : 'Unknown';

        this.metadata.set(ws, {
            isAlive: true,
            roomId: null,
            outQueue: [],
            isSending: false,
            ip: ip,
            ua: ua,
            fingerprint: null,
            isMaster: false,
            ...this.antiBot.initializeMeta()
        });
    }

    sendQueued(ws, payloadObj) {
        const meta = this.metadata.get(ws);
        if (!meta) return;
        meta.outQueue.push(JSON.stringify(payloadObj));
        if (!meta.isSending) this._processQueue(ws, meta);
    }

    _processQueue(ws, meta) {
        if (!meta || meta.outQueue.length === 0 || ws.readyState !== 1) {
            if (meta) meta.isSending = false;
            return;
        }

        meta.isSending = true;
        const msgStr = meta.outQueue.shift();
        
        ws.send(msgStr, (err) => {
            if (err) return ws.terminate(); 
            setImmediate(() => this._processQueue(ws, meta));
        });
    }

    processHeartbeats(clients) {
        clients.forEach((ws) => {
            const meta = this.metadata.get(ws);
            if (meta && meta.isAlive === false) return ws.terminate();
            if (meta) meta.isAlive = false;
            try { ws.ping(); } catch (e) {} 
        });
    }

    handleIncomingJSON(ws, data) {
        const meta = this.metadata.get(ws);
        if (!meta) return;

        // --- Master Identity Verification ---
        if (data.type === 'verify_master') {
            meta.fingerprint = data.fingerprint;
            console.log(`[AUTH] Master Verify Attempt | IP: ${meta.ip} | Fingerprint: ${data.fingerprint}`);
            
            const isMatch = this.trustedAdmins.some(adm => 
                adm.ip === meta.ip && 
                adm.ua === meta.ua && 
                adm.fingerprint === data.fingerprint
            );
            
            if (isMatch) {
                console.log(`[AUTH] MASTER RECOGNIZED: ${meta.ip}`);
                meta.isMaster = true;
                this.sendQueued(ws, { type: 'master_recognized', message: 'Welcome back, Master.' });
            }
            return;
        }

        // --- Anti-Bot Drop Verification Array ---
        if (data.type === 'pow_solve') {
             if (this.antiBot.verifyPoWSolution(meta, data.nonce)) {
                 this.sendQueued(ws, { type: 'system', message: 'Challenge solved. Routing restored.' });
             } else {
                 this.sendQueued(ws, { type: 'error', message: 'Invalid PoW sequence computed. Still banned.' });
             }
             return;
        }

        const shouldDrop = this.antiBot.applyRateLimit(meta);
        if (shouldDrop && meta.powChallenge) { 
             this.sendQueued(ws, {
                 type: 'softban',
                 powChallenge: meta.powChallenge,
                 difficulty: this.antiBot.POW_DIFFICULTY,
                 message: `Flood burst blocked. Solving puzzle directly requested. Banned for ${this.antiBot.SOFT_BAN_COOLDOWN_MS/1000}s.`
             });
             return; 
        } else if (shouldDrop) return;

        // --- Admin Authentication & Secure Creation ---
        if (data.type === 'admin_create') {
            const { roomId, adminPass, adminToken } = data;
            
            // Validate Hardcoded Credentials (Zero-Knowledge config layer)
            if (adminPass !== ADMIN_PASS || adminToken !== ADMIN_TOKEN) {
                this.sendQueued(ws, { type: 'error', message: 'Unauthorized. Admin credential sequence rejected.' });
                return ws.close(1008, 'Unauthorized Admin Call');
            }

            // [DEV AUTO-REGISTER] Se for localhost e não houver masters, registra este!
            const isLocal = meta.ip === '127.0.0.1' || meta.ip === '::1';
            if (isLocal && this.trustedAdmins.length === 0 && meta.fingerprint) {
                this.trustedAdmins.push({
                    ip: meta.ip,
                    ua: meta.ua,
                    fingerprint: meta.fingerprint,
                    addedAt: new Date().toISOString(),
                    note: 'Auto-registered first local admin'
                });
                this._saveTrusted();
                console.log(`[AUTH] AUTO-REGISTERED MASTER: ${meta.ip}`);
            }

            if (!roomId || typeof roomId !== 'string') return ws.close(1008, 'Invalid Room Parameter');

            const salt = this.roomState.createAdminRoom(roomId, ws);
            if (!salt) {
                this.sendQueued(ws, { type: 'error', message: 'Room creation failed dynamically. Exists?' });
                return ws.close(1008, 'Collision Error');
            }
            
            meta.roomId = roomId;
            this.sendQueued(ws, { type: 'joined', salt: salt });
            // Admin doesn't need "system broadcast" here as they are securely waiting on Empty
            return;
        }

        // --- Pure Guest Logic (Join Only) ---
        if (data.type === 'join') {
            const requestedRoomId = data.roomId;
            
            // --- Honeypot Tarpit Logic ---
            if (HONEYPOT_ROOMS.includes(requestedRoomId?.toLowerCase())) {
                // Delay response to waste attacker's time
                setTimeout(() => {
                    this.sendQueued(ws, { 
                        type: 'error', 
                        message: 'Connection timed out. Internal relay fault 0x88. Retrying...' 
                    });
                    // Force a dummy PoW challenge to eat their CPU
                    this.sendQueued(ws, {
                        type: 'softban',
                        powChallenge: 'honeypot-' + Math.random().toString(36).substring(7),
                        difficulty: 8, // Very hard
                        message: 'Security validation required for high-traffic node.'
                    });
                }, 5000 + Math.random() * 5000);
                return;
            }
            
            if (!this.roomState.canGuestJoin(requestedRoomId)) {
                this.sendQueued(ws, { type: 'error', message: 'Invalid Node Address or One-Time Pass expired/used.' });
                return ws.close(1008, 'Burn-On-Read Link Logic Engaged');
            }

            const activeSalt = this.roomState.guestLockIn(requestedRoomId, ws);
            meta.roomId = requestedRoomId;

            this.sendQueued(ws, { type: 'joined', salt: activeSalt });
            this._broadcast(requestedRoomId, ws, { type: 'system', message: 'Guest safely dropped into Node.' });
            return;
        }

        // --- Standard Encrypted Pipelines ---
        if (['chat', 'typing', 'receipt'].includes(data.type)) {
            if (!meta.roomId) return ws.close(1008, 'Missing active map bounds.');
            if (data.type === 'chat' && this.antiBot.isDuplicatePayload(meta, data.payload)) return;

            this._broadcast(meta.roomId, ws, data);
            return;
        }

        // --- Admin Commands (Room Control) ---
        if (data.type === 'admin_cmd') {
             if (this.roomState.getAdmin(meta.roomId) !== ws) return; // Verify sender is the Room Owner

              if (data.command === 'set_pow') {
                   const room = this.roomState.getRoom(meta.roomId);
                   if (room) {
                       room.customDifficulty = data.value;
                       this.sendQueued(ws, { type: 'system', message: `Room State: PoW Difficulty elevated to ${data.value}` });
                   }
              }

              if (data.command === 'trust_this_device') {
                   const alreadyTrusted = this.trustedAdmins.some(adm => 
                       adm.ip === meta.ip && adm.ua === meta.ua && adm.fingerprint === meta.fingerprint
                   );
                   if (!alreadyTrusted) {
                       this.trustedAdmins.push({
                           ip: meta.ip,
                           ua: meta.ua,
                           fingerprint: meta.fingerprint,
                           addedAt: new Date().toISOString()
                       });
                       this._saveTrusted();
                       this.sendQueued(ws, { type: 'system', message: 'Device identity archived. Master status enabled.' });
                   }
              }
        }
    }

    _broadcast(roomId, senderWs, payload) {
        const peers = this.roomState.getPeers(roomId, senderWs);
        peers.forEach(peerWs => this.sendQueued(peerWs, payload));
    }

    handleDisconnect(ws) {
        const meta = this.metadata.get(ws);
        if (!meta || !meta.roomId) return;

        const hasRemaining = this.roomState.leaveRoom(meta.roomId, ws);
        if (hasRemaining) {
            this._broadcast(meta.roomId, ws, { type: 'system', message: 'User left actively. Link scorched per Singe-Use logic.' });
        }
    }

    handlePong(ws) {
        const meta = this.metadata.get(ws);
        if (meta) meta.isAlive = true;
    }
}

module.exports = RelayManager;
