import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import axios from 'axios';

const app = express();
const server = createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "https://edusmart.erequest.net",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Config
const PORT = process.env.SIGNAL_PORT || 3001;
const LARAVEL_URL = process.env.LARAVEL_URL || 'https://edusmart.erequest.net';

// Stockage des salles et sockets
const rooms = new Map();
const userSockets = new Map();

// Auth middleware Socket.IO
const authenticateToken = async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) {
            return next(new Error('Authentication error: token missing'));
        }

        const response = await axios.get(`${LARAVEL_URL}/api/user`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        socket.user = response.data;
        return next();
    } catch (err) {
        console.error('Authentication error:', err.message || err);
        return next(new Error('Authentication error'));
    }
};

io.use(authenticateToken);

// Connexions
io.on('connection', (socket) => {
    if (!socket.user) {
        console.log(`Socket connected without user info, disconnecting: ${socket.id}`);
        socket.disconnect(true);
        return;
    }

    console.log(`User ${socket.user.id} connected (socket ${socket.id})`);
    userSockets.set(socket.user.id, socket.id);

    socket.on('join-room', async (roomId) => {
        try {
            const response = await axios.get(`${LARAVEL_URL}/api/video-calls/${roomId}/verify-access`, {
                headers: { 'Authorization': `Bearer ${socket.handshake.auth.token}` }
            });

            if (!response.data.canAccess) {
                socket.emit('error', { message: 'Access denied to this room' });
                return;
            }

            socket.join(roomId);

            if (!rooms.has(roomId)) {
                rooms.set(roomId, { participants: new Set(), host: null });
            }

            const room = rooms.get(roomId);
            room.participants.add(socket.user.id);

            socket.to(roomId).emit('user-joined', {
                userId: socket.user.id,
                userName: socket.user.name,
                socketId: socket.id
            });

            const participants = Array.from(room.participants).map(userId => ({
                userId,
                socketId: userSockets.get(userId)
            }));

            socket.emit('room-joined', {
                roomId,
                participants,
                isHost: room.participants.size === 1
            });

            console.log(`User ${socket.user.id} joined room ${roomId}`);
        } catch (err) {
            console.error('Error joining room:', err.message || err);
            socket.emit('error', { message: 'Failed to join room' });
        }
    });

    // Signalisation WebRTC
    socket.on('offer', (data) => {
        socket.to(data.roomId).emit('offer', {
            offer: data.offer,
            from: socket.user.id,
            fromSocketId: socket.id
        });
    });

    socket.on('answer', (data) => {
        socket.to(data.roomId).emit('answer', {
            answer: data.answer,
            from: socket.user.id,
            fromSocketId: socket.id
        });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.roomId).emit('ice-candidate', {
            candidate: data.candidate,
            from: socket.user.id,
            fromSocketId: socket.id
        });
    });

    // Statut (mute/video)
    socket.on('update-status', (data) => {
        socket.to(data.roomId).emit('user-status-updated', {
            userId: socket.user.id,
            isMuted: data.isMuted,
            isVideoOff: data.isVideoOff
        });
    });

    // Chat
    socket.on('chat-message', (data) => {
        socket.to(data.roomId).emit('chat-message', {
            message: data.message,
            from: socket.user.id,
            fromName: socket.user.name,
            timestamp: new Date().toISOString()
        });
    });

    // Partage écran
    socket.on('screen-share-start', (data) => {
        socket.to(data.roomId).emit('screen-share-started', {
            from: socket.user.id,
            fromName: socket.user.name
        });
    });

    socket.on('screen-share-stop', (data) => {
        socket.to(data.roomId).emit('screen-share-stopped', {
            from: socket.user.id
        });
    });

    // Quitter la salle
    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);

        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            room.participants.delete(socket.user.id);
            if (room.participants.size === 0) rooms.delete(roomId);
        }

        socket.to(roomId).emit('user-left', {
            userId: socket.user.id,
            userName: socket.user.name
        });

        console.log(`User ${socket.user.id} left room ${roomId}`);
    });

    // Déconnexion
    socket.on('disconnect', () => {
        if (!socket.user) return;

        console.log(`User ${socket.user.id} disconnected: ${socket.id}`);

        rooms.forEach((room, roomId) => {
            if (room.participants.has(socket.user.id)) {
                room.participants.delete(socket.user.id);
                socket.to(roomId).emit('user-left', {
                    userId: socket.user.id,
                    userName: socket.user.name
                });
                if (room.participants.size === 0) rooms.delete(roomId);
            }
        });

        userSockets.delete(socket.user.id);
    });
});

// Routes API simples
app.get('/api/rooms/:roomId/participants', (req, res) => {
    const { roomId } = req.params;
    const room = rooms.get(roomId);

    if (!room) return res.json({ participants: [] });

    const participants = Array.from(room.participants).map(userId => ({
        userId,
        socketId: userSockets.get(userId)
    }));

    res.json({ participants });
});

app.get('/api/rooms/:roomId/exists', (req, res) => {
    const { roomId } = req.params;
    res.json({ exists: rooms.has(roomId) });
});

// Health check route optionnelle
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Lancement serveur
server.listen(PORT, () => {
    console.log(`Signal server running on port ${PORT}`);
    console.log(`CORS enabled for: ${process.env.FRONTEND_URL || "https://edusmart.erequest.net"}`);
});

// Gestion des erreurs
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});