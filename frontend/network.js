// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
/**
 * Enterprise Network Manager
 * State Machine | Admin/Guest Sync | PoW Negotiation
 */

const STATES = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING: 'CONNECTING',
    CONNECTED: 'CONNECTED',
    RECONNECTING: 'RECONNECTING'
};

class NetworkController {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.state = STATES.DISCONNECTED;
        this.reconnectAttempts = 0;
        this.backoffSchedule = [1000, 2000, 5000, 10000];
        
        this.onStateChange = null;     
        this.onEncryptedChat = null;
        this.onSystemInfo = null;
        this.onTypingTrigger = null;
        this.onReceipt = null;
        this.onMasterRecognized = null;
        
        this.currentRoom = null;
        this.currentPass = null;
        this.decryptionKey = null;

        // Admin Auth Tracking
        this.isAdmin = false;
        this.adminPass = null;
        this.adminToken = null;

        // Anti-Tracking
        this.chaffInterval = null;
    }

    setState(newState) {
        this.state = newState;
        if (this.onStateChange) this.onStateChange(newState);
    }

    async bootAdminSession(roomId, e2ePass, adminPass, adminToken) {
        this.isAdmin = true;
        this.adminPass = adminPass;
        this.adminToken = adminToken;
        this.currentRoom = roomId;
        this.currentPass = e2ePass;
        this.decryptionKey = null;
        this._connect();
    }

    async bootGuestSession(roomId, e2ePass) {
        this.isAdmin = false;
        this.adminPass = null;
        this.adminToken = null;
        this.currentRoom = roomId;
        this.currentPass = e2ePass;
        this.decryptionKey = null;
        this._connect();
    }

    _connect() {
        if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return;

        this.setState(this.reconnectAttempts > 0 ? STATES.RECONNECTING : STATES.CONNECTING);
        try { this.ws = new WebSocket(this.url); } catch(e) { this.setState(STATES.DISCONNECTED); return; }

        this.ws.onopen = () => {
            this.reconnectAttempts = 0; 
            if (this.isAdmin) {
                this.ws.send(JSON.stringify({ 
                    type: 'admin_create', 
                    roomId: this.currentRoom,
                    adminPass: this.adminPass,
                    adminToken: this.adminToken 
                }));
            } else {
                this.ws.send(JSON.stringify({ type: 'join', roomId: this.currentRoom }));
            }
        };

        this.ws.onmessage = async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'joined':
                        try {
                            this.decryptionKey = await window.CryptoManager.deriveKey(this.currentPass, data.salt);
                            this.setState(STATES.CONNECTED);
                            this._startChaffing();
                        } catch(e) {
                            if (this.onSystemInfo) this.onSystemInfo('Fatal Error: Key Derivation Failed.', true);
                            this.disconnect();
                        }
                        break;
                    case 'error':
                        if (this.onSystemInfo) this.onSystemInfo(`Server Reject: ${data.message}`, true);
                        this.disconnect();
                        break;
                    case 'chat':
                        if (!this.decryptionKey) return;
                        try {
                            const plaintext = await window.CryptoManager.decryptMessage(data.payload, this.decryptionKey);
                            if (plaintext === null) return; // Anti-Analysis Chaff Packet dropped silently.
                            if (this.onEncryptedChat) this.onEncryptedChat(data.sender, plaintext, data.messageId);
                            this._sendRaw({ type: 'receipt', messageId: data.messageId });
                        } catch (decryptErr) {
                            // Block replays silently
                        }
                        break;
                    case 'system':
                        if (this.onSystemInfo) this.onSystemInfo(data.message, false);
                        break;
                    case 'typing':
                        if (this.onTypingTrigger) this.onTypingTrigger(data.sender);
                        break;
                    case 'receipt':
                        if (this.onReceipt) this.onReceipt(data.messageId);
                        break;
                    case 'softban':
                        if (this.onSystemInfo) this.onSystemInfo(data.message, true);
                        if (data.powChallenge) {
                            const solutionNonce = await window.CryptoManager.solvePoW(data.powChallenge, data.difficulty);
                            this._sendRaw({ type: 'pow_solve', nonce: solutionNonce });
                        }
                        break;
                    case 'master_recognized':
                        if (this.onMasterRecognized) this.onMasterRecognized();
                        break;
                }
            } catch(e) { } 
        };

        this.ws.onclose = (e) => {
            if (e.code === 1000) { this.setState(STATES.DISCONNECTED); return; }

            this.setState(STATES.DISCONNECTED);
            if (this.reconnectAttempts >= 8) {
                if (this.onSystemInfo) this.onSystemInfo('Max network retries reached. Connection offline.', true);
                return;
            }
            
            const delayBase = this.backoffSchedule[Math.min(this.reconnectAttempts, this.backoffSchedule.length - 1)];
            const delay = delayBase + (Math.random() * (delayBase * 0.2)); 
            
            this.reconnectAttempts++;
            setTimeout(() => this._connect(), delay);
        };
        this.ws.onerror = () => {};
    }

    async emitSecureChat(senderName, plaintext, isDummy = false) {
        if (!this.decryptionKey || this.state !== STATES.CONNECTED) return null;
        try {
            const encryptedPayload = await window.CryptoManager.encryptMessage(plaintext, this.decryptionKey, isDummy);
            const messageId = window.crypto.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2);
            
            this._sendRaw({ type: 'chat', sender: senderName, payload: encryptedPayload, messageId: messageId });
            return messageId; 
        } catch(e) { return null; }
    }
    
    _startChaffing() {
        if (this.chaffInterval) clearInterval(this.chaffInterval);
        // Fire synthetic noise randomly between 4s and 10s to mask traffic shape
        this.chaffInterval = setInterval(() => {
            if (this.state === STATES.CONNECTED) {
                this.emitSecureChat('Ghost', '', true);
                if (this.onChaffSent) this.onChaffSent();
            }
        }, Math.floor(Math.random() * 6000) + 4000);
    }
    
    emitTyping(senderName) {
        if (this.state === STATES.CONNECTED) this._sendRaw({ type: 'typing', sender: senderName });
    }

    _sendRaw(obj) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
    }

    disconnect() {
        if (this.chaffInterval) { clearInterval(this.chaffInterval); this.chaffInterval = null; }
        if (this.ws) {
            this.ws.onclose = null; // Prevent reconnect loop
            this.ws.close(1000);
            this.ws = null;
        }
        this.decryptionKey = null;
        this.setState(STATES.DISCONNECTED);
    }

    updateUrl(newUrl) {
        const wasConnected = this.state === STATES.CONNECTED;
        this.disconnect();
        this.url = newUrl;
        if (wasConnected) this._connect();
    }

    setAndroidProxy(host, port) {
        if (window.Android && window.Android.setProxy) {
            window.Android.setProxy(host, port);
        }
    }

    clearAndroidProxy() {
        if (window.Android && window.Android.clearProxy) {
            window.Android.clearProxy();
        }
    }
}

const DEFAULT_WS_URL = window.location.protocol === 'file:' 
    ? 'ws://10.0.2.2:3000' 
    : (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + (window.location.host || 'localhost:3000');
window.Network = new NetworkController(DEFAULT_WS_URL);
