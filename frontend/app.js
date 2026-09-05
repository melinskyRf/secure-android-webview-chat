// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
/**
 * Enterprise Application UI Controller
 * Maps Network states to UI, handles Easter Egg Admin Access and Form Submits.
 */

// --- Web Security Enforcer ---
if (window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    window.location.href = window.location.href.replace('http:', 'https:');
}
if (window.self !== window.top) {
    window.top.location = window.self.location; // Anti-Clickjacking Frame Buster
}

// --- Rotating Token Handshake Verification ---
const SECRET_KEY = 'v2_node';
const IS_DEV = window.location.protocol === 'file:' 
    || window.location.hostname === 'localhost' 
    || window.location.hostname === '127.0.0.1';

function verifyHandshake() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('auth');
    
    // Skip token verification in local dev environments (Android file:// or Live Server)
    if (IS_DEV) return true;

    if (!token) return false;

    const now = Math.floor(Date.now() / 60000);
    const expectedNow = btoa(`${now}_${SECRET_KEY}`).replace(/=/g, '');
    const expectedPrev = btoa(`${(now - 1)}_${SECRET_KEY}`).replace(/=/g, '');

    return (token === expectedNow || token === expectedPrev);
}

// Simple Obfuscation Utils
function obf(str) { return btoa(str).replace(/=/g, ''); }
function deobf(str) { try { return atob(str); } catch(e) { return null; } }

const UI = {
    screens: {
        join: document.getElementById('join-screen'),
        chat: document.getElementById('chat-screen')
    },
    hub: {
        secretTrigger: document.getElementById('secret-admin-trigger'),
        adminForm: document.getElementById('admin-form'),
        guestForm: document.getElementById('join-form'),
    },
    inputs: {
        adminNick: document.getElementById('admin-nickname'),
        adminPass: document.getElementById('admin-pass'),
        adminToken: document.getElementById('admin-token'),
        guestRoom: document.getElementById('join-room'),
        guestPass: document.getElementById('join-password')
    },
    error: document.getElementById('join-error'),
    chat: {
        headerTitle: document.getElementById('room-title'),
        status: document.getElementById('connection-status'),
        box: document.getElementById('chat-box'),
        form: document.getElementById('chat-form'),
        input: document.getElementById('chat-input'),
        leaveBtn: document.getElementById('leave-btn'),
        overlayWaiting: document.getElementById('waiting-overlay'),
        shareRoom: document.getElementById('share-room'),
        sharePass: document.getElementById('share-pass'),
        shareGuestLink: document.getElementById('share-guest-link'),
        shareAdminLink: document.getElementById('share-admin-link'),
        copyBtn: document.getElementById('copy-creds-btn'),
        copyGuestLinkBtn: document.getElementById('copy-guest-link-btn'),
        telemetry: document.getElementById('admin-telemetry'),
        telChaffing: document.getElementById('tel-chaffing'),
        telGc: document.getElementById('tel-gc'),
        telGuest: document.getElementById('tel-guest'),
        settingsBtn: document.getElementById('admin-settings-btn'),
        settingsModal: document.getElementById('settings-modal'),
        saveSettingsBtn: document.getElementById('save-settings-btn'),
        closeSettingsBtn: document.getElementById('close-settings-btn'),
        applyProxyBtn: document.getElementById('apply-proxy-btn'),
        clearProxyBtn: document.getElementById('clear-proxy-btn'),
        inputRelayUrl: document.getElementById('setting-relay-url'),
        inputProxyHost: document.getElementById('setting-proxy-host'),
        inputProxyPort: document.getElementById('setting-proxy-port'),
        inputPowDiff: document.getElementById('setting-pow-diff'),
        shareLinksContainer: document.getElementById('share-links-container'),
        appLoader: document.getElementById('app-loader')
    }
};

let currentNickname = null;
let typingHideTimeout = null;
let _isAdminMode = false;
let _peerConnected = false; 
let _guestPlatform = 'web'; 

const MAX_DOM_MESSAGES = 150;
const messagesQueue = [];

function generateFingerprint() {
    // Combina características do hardware e software para criar um ID "único" sem precisar de cookies ou MAC
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    const debugInfo = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
    
    const parts = [
        navigator.userAgent,
        navigator.language,
        new Date().getTimezoneOffset(),
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        renderer,
        navigator.hardwareConcurrency || '0'
    ];
    return btoa(parts.join('|')).replace(/=/g, '');
}

// --- 5-Click Admin Easter Egg ---
let clickCount = 0;
let clickTimer = null;

UI.hub.secretTrigger.addEventListener('click', () => {
    clickCount++;
    if (clickTimer) clearTimeout(clickTimer);
    
    clickTimer = setTimeout(() => { clickCount = 0; }, 2000); 
    
    if (clickCount >= 3) {
        clickCount = 0;
        UI.hub.guestForm.classList.add('hidden');
        UI.hub.adminForm.classList.remove('hidden');
        UI.error.classList.add('hidden');
        
        // Auto-Paste Admin Master Keys
        UI.inputs.adminPass.value = 'admin123';
        UI.inputs.adminToken.value = 'token123';
        UI.inputs.adminNick.focus();
    }
});

// --- Admin Flow (Creation) ---
UI.hub.adminForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nick = UI.inputs.adminNick.value.trim();
    const aPass = UI.inputs.adminPass.value;
    const aToken = UI.inputs.adminToken.value;
    
    if (!nick || !aPass || !aToken) return;

    _isAdminMode = true;
    _peerConnected = false;
    currentNickname = nick;
    
    // Capture Platform Selection
    const selectedPlatform = document.querySelector('input[name="guest-platform"]:checked');
    _guestPlatform = selectedPlatform ? selectedPlatform.value : 'web';
    
    // Auto-Generate Burnable E2E Node Credentials
    const randomRoomId = 'node-' + generateSecureString(8);
    const randomPass = generateSecureString(16);

    // Guest link usa uma página fake aleatória — ela redireciona para app.html silenciosamente
    const fakePages = ['sys_auth.html', 'node_res.html', 'config_v2_res.bin.html'];
    const randomFake = fakePages[Math.floor(Math.random() * fakePages.length)];
    const baseDir = window.location.origin + window.location.pathname.replace(/\/[^\/]*$/, '/');
    const appUrl = baseDir + 'app.html';
    const guestLink = `${baseDir}${randomFake}?r=${obf(randomRoomId)}&p=${obf(randomPass)}`;
    const adminLink = `${appUrl}?admin=1&r=${obf(randomRoomId)}&p=${obf(randomPass)}&an=${obf(nick)}&ap=${obf(aPass)}&at=${obf(aToken)}`;

    UI.chat.shareRoom.value = randomRoomId;
    UI.chat.sharePass.value = randomPass;
    UI.chat.shareGuestLink.value = guestLink;
    UI.chat.shareAdminLink.value = adminLink;

    if (_guestPlatform === 'app') {
        UI.chat.shareLinksContainer.classList.add('hidden');
    } else {
        UI.chat.shareLinksContainer.classList.remove('hidden');
    }

    initChatView(randomRoomId, randomPass, aPass, aToken);
    
    // Registrar este dispositivo como Master se o login for bem-sucedido
    setTimeout(() => {
        window.Network._sendRaw({
            type: 'admin_cmd',
            command: 'trust_this_device'
        });
    }, 2000);
});

// --- Guest Flow (Single-Use Join) ---
UI.hub.guestForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const room = UI.inputs.guestRoom.value.trim();
    const pass = UI.inputs.guestPass.value;
    
    if (!room || !pass) return;
    
    _isAdminMode = false;
    _peerConnected = true; // Guest assumes active if join succeeds
    currentNickname = 'Guest';
    
    initChatView(room, pass, null, null);
});

function initChatView(room, e2ePass, adminPass, adminToken) {
    UI.chat.box.innerHTML = '';
    messagesQueue.length = 0;
    
    UI.screens.join.classList.add('hidden');
    UI.screens.chat.classList.remove('hidden');
    UI.chat.headerTitle.textContent = room;
    
    if (_isAdminMode) {
        UI.chat.telemetry.classList.remove('hidden');
        UI.chat.settingsBtn.classList.remove('hidden');
        UI.chat.overlayWaiting.classList.remove('hidden');
        UI.chat.input.disabled = true; 
        UI.chat.box.style.filter = 'blur(2px)';
        UI.chat.box.style.opacity = '1.0'; 
        window.Network.bootAdminSession(room, e2ePass, adminPass, adminToken);
    } else {
        UI.chat.telemetry.classList.add('hidden');
        UI.chat.overlayWaiting.classList.add('hidden');
        UI.chat.input.disabled = false;
        UI.chat.box.style.filter = 'none';
        UI.chat.box.style.opacity = '1';
        window.Network.bootGuestSession(room, e2ePass);
    }
}

// Botão dedicado: copiar só o Guest Link
if (UI.chat.copyGuestLinkBtn) {
    UI.chat.copyGuestLinkBtn.addEventListener('click', () => {
        const link = UI.chat.shareGuestLink.value;
        if (!link) return;
        navigator.clipboard.writeText(link).then(() => {
            UI.chat.copyGuestLinkBtn.textContent = '✅ Copiado!';
            setTimeout(() => { UI.chat.copyGuestLinkBtn.textContent = '📋 Copiar Link'; }, 2000);
        });
    });
}


UI.chat.copyBtn.addEventListener('click', () => {
    let creds = '';
    if (_guestPlatform === 'app') {
        creds = `Secure Node ID: ${UI.chat.shareRoom.value}\nPassphrase: ${UI.chat.sharePass.value}`;
    } else {
        creds = `Secure Burnable Node ID: ${UI.chat.shareRoom.value}\nPassphrase: ${UI.chat.sharePass.value}\nGuest Link: ${UI.chat.shareGuestLink.value}`;
    }
    
    navigator.clipboard.writeText(creds).then(() => {
        UI.chat.copyBtn.textContent = '✅ Copiado!';
        setTimeout(() => { UI.chat.copyBtn.textContent = 'Copiar Tudo'; }, 2000);
    });
});

// --- Network Triggers ---
let chaffCount = 0;
window.Network.onChaffSent = () => {
    chaffCount++;
    if (_isAdminMode) {
        UI.chat.telChaffing.textContent = `Active Noise: ${chaffCount} dummy packets`;
        UI.chat.telChaffing.className = 'tel-val success';
    }
};

window.Network.onStateChange = (state) => {
    switch(state) {
        case 'DISCONNECTED':  updateStatus('Disconnected', 'disconnected'); break;
        case 'CONNECTING':    updateStatus('Connecting...', 'connecting'); break;
        case 'RECONNECTING':  updateStatus('Reconnecting Drop...', 'connecting'); break;
        case 'CONNECTED':
            updateStatus('E2E Layer Secured', 'connected');
            
            // Enviar Identidade Master para verificação automática
            window.Network._sendRaw({
                type: 'verify_master',
                fingerprint: generateFingerprint()
            });

            if (_isAdminMode && !_peerConnected) appendSystemNode('Link Armed. Waiting for Guest mapping...', false);
            break;
    }
};

window.Network.onMasterRecognized = () => {
    if (_isAdminMode) return; // Já está no modo admin
    
    console.log('[!] Master Identity Recognized. Auto-escalating...');
    
    // Auto-login como admin usando as chaves padrão se não estiver em uma sala
    if (UI.screens.chat.classList.contains('hidden')) {
        _isAdminMode = true;
        currentNickname = 'Master';
        
        // Simular o comportamento do form de admin
        const randomRoomId = 'master-node-' + Math.random().toString(36).substring(7);
        const randomPass = Math.random().toString(36).substring(2, 15);
        
        initChatView(randomRoomId, randomPass, 'admin123', 'token123');
        appendSystemNode('Master Identity Recognized: Administrative Hub unlocked.', false);
    }
};

window.Network.onSystemInfo = (message, isError) => {
    if (isError && UI.screens.chat.classList.contains('hidden')) {
        showJoinError(message);
    } else {
        appendSystemNode(message, isError);
        
        // --- Admin Lock Handlers ---
        // Natively trap "Guest safely dropped into Node." mapped by RelayManager.
        if (_isAdminMode && (message.includes('safely dropped') || message.includes('restored'))) {
            _peerConnected = true;
            UI.chat.overlayWaiting.classList.add('hidden');
            UI.chat.input.disabled = false;
            UI.chat.box.style.filter = 'none';
            UI.chat.box.style.opacity = '1';
            UI.chat.telGuest.textContent = 'Locked In securely';
            UI.chat.telGuest.className = 'tel-val success';
            appendSystemNode('Guest secured. Link is locked and single-use burned.', false);
        }
        
        if (_isAdminMode && message.includes('left actively')) {
            _peerConnected = false;
            UI.chat.input.disabled = true;
            UI.chat.box.style.opacity = '0.3';
            UI.chat.telGuest.textContent = 'Link Scorched (Disconnected)';
            UI.chat.telGuest.className = 'tel-val alert';
            appendSystemNode('Network scorched. Guest evicted permanently.', true);
        }
    }
};

window.Network.onEncryptedChat = (sender, text, msgId) => {
    appendMessageCore('them', sender, text, msgId);
    clearTypingIndicator();
    
    // Safety Fallback logic
    if (_isAdminMode && !_peerConnected) {
         _peerConnected = true;
         UI.chat.overlayWaiting.classList.add('hidden');
         UI.chat.input.disabled = false;
         UI.chat.box.style.opacity = '1';
    }
};

window.Network.onTypingTrigger = (sender) => { showTypingIndicator(sender); };
window.Network.onReceipt = (msgId) => {
    const el = document.getElementById(`receipt-${msgId}`);
    if (el) { el.textContent = 'Delivered'; el.classList.add('delivered'); }
};

// --- DOM Memory GC ---
function enforceGarbageCollection() {
    while (messagesQueue.length > MAX_DOM_MESSAGES) {
        const oldestNode = messagesQueue.shift();
        if (oldestNode && oldestNode.parentNode) {
            oldestNode.classList.add('fade-out');
            setTimeout(() => { if(oldestNode.parentNode) oldestNode.remove(); }, 300);
        }
    }
    if (_isAdminMode) UI.chat.telGc.textContent = `DOM Active [${messagesQueue.length} Nodes]`;
}

// --- Frame Render ---
function appendMessageCore(type, sender, text, msgId) {
    const isMine = type === 'mine';
    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement('div');
    wrapper.className = `message message-${isMine ? 'mine' : 'them'} fade-in-up`;
    
    if (!isMine) {
        const senderLabel = document.createElement('div');
        senderLabel.className = 'msg-sender';
        senderLabel.textContent = sender;
        wrapper.appendChild(senderLabel);
    }
    
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = text;
    wrapper.appendChild(bubble);
    
    if (isMine && msgId) {
        const receipt = document.createElement('div');
        receipt.className = 'receipt-status';
        receipt.id = `receipt-${msgId}`;
        receipt.textContent = 'Sent';
        wrapper.appendChild(receipt);
    }
    
    fragment.appendChild(wrapper);
    UI.chat.box.appendChild(fragment);
    
    messagesQueue.push(wrapper);    
    enforceGarbageCollection();
    scrollToBottom();
}

function appendSystemNode(text, isDanger) {
    const el = document.createElement('div');
    el.className = `system-message fade-in-up ${isDanger ? 'text-danger' : ''}`;
    el.textContent = text;
    UI.chat.box.appendChild(el);
    messagesQueue.push(el);
    enforceGarbageCollection();
    scrollToBottom();
}

function updateStatus(text, cssClass) {
    UI.chat.status.textContent = text;
    UI.chat.status.className = 'status ' + cssClass;
}

// --- Typing Dynamics ---
let typingIndicatorNode = null;
function showTypingIndicator(sender) {
    if (!typingIndicatorNode) {
        typingIndicatorNode = document.createElement('div');
        typingIndicatorNode.className = 'system-message fade-in-up bounce-text';
        UI.chat.box.appendChild(typingIndicatorNode);
        scrollToBottom();
    }
    typingIndicatorNode.textContent = `${sender} is typing...`;
    clearTimeout(typingHideTimeout);
    typingHideTimeout = setTimeout(clearTypingIndicator, 3000);
}

function clearTypingIndicator() {
    if (typingIndicatorNode && typingIndicatorNode.parentNode) {
        typingIndicatorNode.remove();
        typingIndicatorNode = null;
    }
}

// --- Inputs & Exits ---
UI.chat.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = UI.chat.input.value.trim();
    if (!text || UI.chat.input.disabled) return;
    
    UI.chat.input.value = '';
    if (navigator.vibrate) navigator.vibrate([10]);
    
    const msgId = await window.Network.emitSecureChat(currentNickname, text);
    if (msgId) appendMessageCore('mine', currentNickname, text, msgId);
});

let lastTypingTime = 0;
UI.chat.input.addEventListener('input', () => {
    const now = Date.now();
    if (now - lastTypingTime > 2000) {
        lastTypingTime = now;
        window.Network.emitTyping(currentNickname);
    }
});

UI.chat.leaveBtn.addEventListener('click', () => {
    window.Network.disconnect();
    UI.screens.chat.classList.add('hidden');
    UI.screens.join.classList.remove('hidden');
    UI.chat.telemetry.classList.add('hidden');
    
    // Reset defaults natively
    UI.hub.adminForm.classList.add('hidden');
    UI.hub.guestForm.classList.remove('hidden'); // Guarantee Guest visible fallback
    
    UI.inputs.guestPass.value = ''; 
    UI.inputs.guestRoom.value = '';
    UI.inputs.adminPass.value = '';
    UI.inputs.adminToken.value = '';
});

function showJoinError(text) {
    UI.error.textContent = text;
    UI.error.classList.remove('hidden');
}
function scrollToBottom() { UI.chat.box.scrollTop = UI.chat.box.scrollHeight; }

// --- Admin Control Logic ---
UI.chat.settingsBtn.addEventListener('click', () => {
    UI.chat.inputRelayUrl.value = window.Network.url;
    UI.chat.settingsModal.classList.remove('hidden');
});

UI.chat.closeSettingsBtn.addEventListener('click', () => UI.chat.settingsModal.classList.add('hidden'));

UI.chat.saveSettingsBtn.addEventListener('click', () => {
    const newUrl = UI.chat.inputRelayUrl.value.trim();
    const newPow = UI.chat.inputPowDiff.value;
    
    if (newUrl && newUrl !== window.Network.url) {
        window.Network.updateUrl(newUrl);
    }
    
    // Push PoW update to server (if connected)
    window.Network._sendRaw({
        type: 'admin_cmd',
        command: 'set_pow',
        value: parseInt(newPow)
    });
    
    UI.chat.settingsModal.classList.add('hidden');
    appendSystemNode(`Local State Updated: Relay[${newUrl}] PoW[${newPow}]`, false);
});

UI.chat.applyProxyBtn.addEventListener('click', () => {
    const host = UI.chat.inputProxyHost.value || '127.0.0.1';
    const port = parseInt(UI.chat.inputProxyPort.value) || 9050;
    window.Network.setAndroidProxy(host, port);
    appendSystemNode(`Android Native Routing Requested: socks5://${host}:${port}`, false);
});

UI.chat.clearProxyBtn.addEventListener('click', () => {
    window.Network.clearAndroidProxy();
    appendSystemNode('Android Native Routing: Clearnet Restored.', false);
});

// --- Web Auto-Join Flow ---
window.addEventListener('DOMContentLoaded', async () => {
    // 1. Mandatory Handshake Check
    const isValid = verifyHandshake();
    const urlParams = new URLSearchParams(window.location.search);
    const isSecretAdmin = urlParams.get('t') === 'adm';

    // Artificial delay to show off the premium loader and ensure crypto settles
    setTimeout(async () => {
        if (!isValid) {
            window.location.href = 'index.html';
            return;
        }

        if (UI.chat.appLoader) {
            UI.chat.appLoader.style.opacity = '0';
            setTimeout(() => { 
                UI.chat.appLoader.style.visibility = 'hidden'; 
                // Auto-Switch to Admin if coming from Secret Door
                if (isSecretAdmin) {
                     UI.hub.guestForm.classList.add('hidden');
                     UI.hub.adminForm.classList.remove('hidden');
                }
            }, 500);
        }
    }, 1200);

    const roomParam = urlParams.get('r');
    const passParam = urlParams.get('p');
    const room = roomParam ? deobf(roomParam) : null;
    const pass = passParam ? deobf(passParam) : null;
    
    // Iniciar conexão de rede sempre que a página carregar (para verify_master)
    if (!room) {
        window.Network.connect(); 
    }

    if (room && pass) {
        if (urlParams.get('admin') === '1') {
            const adminNick = deobf(urlParams.get('an'));
            const aPass = deobf(urlParams.get('ap'));
            const aToken = deobf(urlParams.get('at'));
            
            if (adminNick && aPass && aToken) {
                _isAdminMode = true;
                _peerConnected = false;
                currentNickname = adminNick;
                
                UI.chat.shareRoom.value = room;
                UI.chat.sharePass.value = pass;
                
                const baseUrl = window.location.origin + window.location.pathname;
                UI.chat.shareGuestLink.value = `${baseUrl}?r=${obf(room)}&p=${obf(pass)}`;
                UI.chat.shareAdminLink.value = window.location.href;

                initChatView(room, pass, aPass, aToken);
            }
        } else {
            // Guest Flow
            _isAdminMode = false;
            _peerConnected = true;
            currentNickname = 'Guest';
            initChatView(room, pass, null, null);
        }
        
        // Obfuscate the URL so credentials aren't left in the browser history
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }
});
