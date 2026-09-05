// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
/**
 * backend/AntiBot.js
 * Implements sliding-window Rate-Limiting, duplicate-caching detection, and PoW puzzle solving.
 */
const crypto = require('crypto');

class AntiBotSystem {
    constructor(rateLimitMs = 1000, maxMsgs = 5, softBanDuration = 15000, powDifficulty = 4) {
        this.RATE_LIMIT_WINDOW_MS = rateLimitMs;
        this.RATE_LIMIT_MAX_MSGS = maxMsgs;
        this.SOFT_BAN_COOLDOWN_MS = softBanDuration;
        this.POW_DIFFICULTY = powDifficulty;
    }

    /**
     * Initializes a user tracking meta-object map.
     */
    initializeMeta() {
        return {
            timestamps: [],             // Sliding-window capacity tracker
            lastPayloadHashes: [],      // Duplicate cache buffer
            isBanned: false,
            banExpiresAt: 0,
            powChallenge: null
        };
    }

    /**
     * Inspects a socket's metadata array structure to ensure burst velocity is valid
     * Returns true if request should be dropped (they are actively banned or just exceeded the window).
     */
    applyRateLimit(meta) {
        const now = Date.now();

        // Expire cooldowns natively
        if (meta.isBanned) {
            if (now >= meta.banExpiresAt) {
                 meta.isBanned = false; // Natural lift
                 meta.timestamps = [];
            } else {
                 return true; // Still dropped unconditionally until PoW or Timeout
            }
        }

        // Sliding window GC purge
        meta.timestamps = meta.timestamps.filter(ts => ts > (now - this.RATE_LIMIT_WINDOW_MS));
        meta.timestamps.push(now);

        // Burst Detonation Check
        if (meta.timestamps.length > this.RATE_LIMIT_MAX_MSGS) {
            meta.isBanned = true;
            meta.banExpiresAt = now + this.SOFT_BAN_COOLDOWN_MS;
            meta.powChallenge = crypto.randomBytes(8).toString('hex');
            return true;
        }

        return false;
    }

    /**
     * Analyzes incoming string payload contents defensively blocking resends.
     * Yields false if completely duplicated in recent memory buffer.
     */
    isDuplicatePayload(meta, payloadObj) {
        if (!payloadObj) return false;
        
        // Convert to string dynamically safely caching
        const sha256 = crypto.createHash('sha256').update(JSON.stringify(payloadObj)).digest('hex');
        
        if (meta.lastPayloadHashes.includes(sha256)) return true;
        
        // Cache append & slide limit
        meta.lastPayloadHashes.unshift(sha256);
        if (meta.lastPayloadHashes.length > 10) meta.lastPayloadHashes.pop();
        
        return false;
    }

    /**
     * Processes PoW solution via hashcash check
     */
    verifyPoWSolution(meta, nonceCandidate) {
        if (!meta.isBanned || !meta.powChallenge || typeof nonceCandidate !== 'string') return false;

        const computedHash = crypto.createHash('sha256').update(meta.powChallenge + nonceCandidate).digest('hex');
        
        if (computedHash.startsWith('0'.repeat(this.POW_DIFFICULTY))) {
            meta.isBanned = false;
            meta.powChallenge = null;
            meta.timestamps = []; // Clear rate limits completely
            return true;
        }
        return false;
    }
}

module.exports = AntiBotSystem;
