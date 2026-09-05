// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
/**
 * Enterprise Web Crypto Module for E2E Encryption
 * Includes Replay Protection, Nonce Cache Exhaustion Defense, and PoW.
 */

const iterations = 600000;
const hashAlgorithm = 'SHA-256';

// Replay Attack Defense temporal window (60 seconds)
const TIME_WINDOW_MS = 60000;
// Nonce exhaustion cache (keeps track of IVs used in the last 60 seconds)
const usedIvs = new Set();
const processedMessageUuids = new Set();

async function deriveKey(password, hexSalt) {
    const enc = new TextEncoder();
    const saltBuffer = new Uint8Array(hexSalt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    
    const baseKey = await window.crypto.subtle.importKey(
        'raw', 
        enc.encode(password), 
        { name: 'PBKDF2' }, 
        false, 
        ['deriveKey']
    );

    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: iterations,
            hash: hashAlgorithm
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false, 
        ['encrypt', 'decrypt']
    );
}

// Generate quick cryptographically secure UUID v4
function secureUuidv4() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

async function encryptMessage(text, key, isDummy = false) {
    // Anti-Tracking: Cryptographic Padding (Uniform Block Size)
    // We pad the envelope with random noise so every packet looks uniform in size.
    // This defeats Deep Packet Inspection (DPI) size-analysis attacks.
    const envelope = {
        message: isDummy ? '' : text,
        timestamp: Date.now(),
        uuid: secureUuidv4(),
        isDummy: isDummy,
        padding: ""
    };

    let baseStr = JSON.stringify(envelope);
    // Pad to nearest 512-byte block
    const targetSize = Math.ceil((baseStr.length + 16) / 512) * 512;
    const paddingRequired = targetSize - baseStr.length;
    
    // Generate gibberish padding
    const padArray = new Uint8Array(paddingRequired);
    window.crypto.getRandomValues(padArray);
    envelope.padding = window.btoa(String.fromCharCode.apply(null, padArray)).substring(0, paddingRequired);

    const enc = new TextEncoder();
    const encodedData = enc.encode(JSON.stringify(envelope));
    
    // Strict 12-byte IV randomly generated per-message
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const ivBase64 = arrayBufferToBase64(iv.buffer);
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encodedData
    );

    return {
        iv: ivBase64,
        ciphertext: arrayBufferToBase64(encryptedBuffer)
    };
}

async function decryptMessage(encryptedObj, key) {
    const ivString = encryptedObj.iv;
    
    // 1. Nonce Replay Defense
    if (usedIvs.has(ivString)) {
        throw new Error('REPLAY_ATTACK: Duplicate IV detected and actively dropped.');
    }

    const ivBuffer = base64ToArrayBuffer(ivString);
    const cipherBuffer = base64ToArrayBuffer(encryptedObj.ciphertext);

    try {
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
            key,
            cipherBuffer
        );

        const dec = new TextDecoder();
        const envelopeStr = dec.decode(decryptedBuffer);
        const envelope = JSON.parse(envelopeStr);

        // 2. Temporal Window Drift Check
        const now = Date.now();
        if (Math.abs(now - envelope.timestamp) > TIME_WINDOW_MS) {
            throw new Error('REPLAY_ATTACK: Message outside of strict temporal window.');
        }

        // 3. UUID Multi-Replay Check
        if (processedMessageUuids.has(envelope.uuid)) {
            throw new Error('REPLAY_ATTACK: Identical UUID detected spanning multiple encryptions.');
        }

        // Integrity OK - Store memory signatures securely
        usedIvs.add(ivString);
        processedMessageUuids.add(envelope.uuid);
        
        // Anti-Memory Leak: Clean up old Sets
        if (usedIvs.size > 200) { usedIvs.clear(); processedMessageUuids.clear(); }

        if (envelope.isDummy) return null; // Silent Drop for Chaffing Noise
        return envelope.message;
        
    } catch (e) {
        throw e; // Decryption explicitly failed (Tampered AES-GCM Tag or manual throw)
    }
}

/**
 * Lightweight Proof-of-Work Solver (SHA-256 Hashcash alternative)
 * Blocks until a valid nonce is incrementally computed solving the difficulty.
 */
async function solvePoW(challengeHex, difficulty) {
    const targetPrefix = '0'.repeat(difficulty);
    let nonce = 0;
    
    while(true) {
        const payload = challengeHex + nonce.toString();
        // Use raw fast hashing to avoid massive event loop blockage per-tick
        const hashBuf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
        const hashStr = arrayBufferToHex(hashBuf);
        
        if (hashStr.startsWith(targetPrefix)) {
            return nonce.toString();
        }
        nonce++;
        if (nonce % 500 === 0) {
            // Yield loop occasionally so UI doesn't visually freeze hard
            await new Promise(r => setTimeout(r, 0)); 
        }
    }
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) { binary += String.fromCharCode(bytes[i]); }
    return window.btoa(binary);
}
function base64ToArrayBuffer(base64) {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) { bytes[i] = binary.charCodeAt(i); }
    return bytes.buffer;
}
function arrayBufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

window.CryptoManager = {
    deriveKey,
    encryptMessage,
    decryptMessage,
    solvePoW
};
