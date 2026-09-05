// ============================================================================
// CONTEUDO EDUCACIONAL - FINS DE ESTUDO E PESQUISA EM SEGURANCA DA INFORMACAO
// ============================================================================
// Este codigo e exclusivamente para fins educacionais e de pesquisa.
// NAO deve ser utilizado para atividades ilegais ou maliciosas.
// O autor nao se responsabiliza pelo uso indevido deste material.
// Use apenas em ambientes isolados (VMs, laboratorios).
// ============================================================================
/**
 * backend/RoomState.js
 * Manages Single-Use rooms and Admin Locks
 */

const crypto = require('crypto');

const ROOM_STATUS = {
    WAITING: 'WAITING',   // Admin created it, waiting for EXACTLY ONE guest
    ACTIVE: 'ACTIVE',     // Guest joined, session live
    BURNED: 'BURNED'      // Guest connected then left, or max capacity met. Rejoin impossible.
};

class RoomState {
    constructor() {
        // roomId -> { clients: Set, salt: string, status: string, adminWs: WebSocket }
        this.rooms = new Map(); 
    }

    /**
     * Called EXCLUSIVELY by the Admin after verifying tokens
     */
    createAdminRoom(roomId, adminWs) {
        if (this.rooms.has(roomId)) return null;

        const salt = crypto.randomBytes(16).toString('hex');
        
        this.rooms.set(roomId, {
            clients: new Set([adminWs]),
            salt: salt,
            status: ROOM_STATUS.WAITING,
            adminWs: adminWs
        });
        
        return salt;
    }

    /**
     * Determines if a standard Guest is allowed to join an existing literal room.
     */
    canGuestJoin(roomId) {
        const room = this.rooms.get(roomId);
        if (!room) return false; // Doesn't exist (Guests can't create)
        if (room.status !== ROOM_STATUS.WAITING) return false; // Single-Use logic: if it's already active or burned, reject.
        return true;
    }

    /**
     * Locks the guest into the room and immediately shifts state to ACTIVE locking out any future joins.
     */
    guestLockIn(roomId, guestWs) {
        const room = this.rooms.get(roomId);
        if(!room) return null;
        
        room.clients.add(guestWs);
        room.status = ROOM_STATUS.ACTIVE; // Burn the invite link dynamically

        return room.salt;
    }

    /**
     * Drops a socket. If the Guest drops, the room is permanently SCORCHED (Single-Use enforcement).
     * If the Admin drops while waiting, the room evaporates passively.
     */
    leaveRoom(roomId, ws) {
        const room = this.rooms.get(roomId);
        if (!room) return false;

        room.clients.delete(ws);
        
        if (ws === room.adminWs) {
            // Admin left. Scorch everything instantly.
            this.rooms.delete(roomId);
            return false;
        }

        // A Guest left. Scorch the room so no one can reuse the ID.
        room.status = ROOM_STATUS.BURNED;
        
        // Evict immediately if entirely empty
        if (room.clients.size === 0) {
            this.rooms.delete(roomId);
            return false;
        }
        
        return true; // Someone (Admin) is still technically attached to see the "Guest Disconnected" message
    }

    getPeers(roomId, currentWs) {
        const room = this.rooms.get(roomId);
        if (!room) return [];
        return Array.from(room.clients).filter(client => client !== currentWs && client.readyState === 1);
    }
}

module.exports = RoomState;
