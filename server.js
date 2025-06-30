import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

// Configuration CORS améliorée
app.use(cors({
  origin: 'https://edusmart.erequest.net',
  credentials: true
}));

// Configuration Socket.IO
const io = new Server(httpServer, {
  path: '/socket.io',
  cors: {
    origin: 'https://edusmart.erequest.net',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 20000
});

// Gestion des participants par salle
const participants = {}; // { roomId: { socketId: { userName, profilePhoto, isMuted, isVideoOff, isScreenSharing } } }

// Middleware d'authentification (à adapter selon votre backend Laravel)
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) throw new Error('Token manquant');
    next();
  } catch (err) {
    next(new Error('Authentification échouée'));
  }
});

// Gestion des connexions
io.on('connection', (socket) => {
  console.log('Nouvelle connexion:', socket.id);

  // Quand un utilisateur rejoint une salle
  socket.on('join-room', (roomId, userName, profilePhoto = null) => {
    socket.join(roomId);

    if (!participants[roomId]) participants[roomId] = {};

    participants[roomId][socket.id] = {
      userName,
      profilePhoto,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false
    };

    io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
      socketId,
      ...user
    })));

    socket.to(roomId).emit('user-joined', { socketId: socket.id, userName, profilePhoto });
    console.log(`Socket ${socket.id} (${userName}) a rejoint la salle ${roomId}`);
  });

  // Mise à jour du statut (mute/unmute, vidéo on/off)
  socket.on('update-status', (roomId, status) => {
    if (participants[roomId] && participants[roomId][socket.id]) {
      if ('isMuted' in status) participants[roomId][socket.id].isMuted = status.isMuted;
      if ('isVideoOff' in status) participants[roomId][socket.id].isVideoOff = status.isVideoOff;
      io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
        socketId,
        ...user
      })));
    }
  });

  // Partage d'écran
  socket.on('screen-share-start', (roomId) => {
    if (participants[roomId] && participants[roomId][socket.id]) {
      participants[roomId][socket.id].isScreenSharing = true;
      io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
        socketId,
        ...user
      })));
      socket.to(roomId).emit('screen-share-started', { socketId: socket.id });
    }
  });

  socket.on('screen-share-stop', (roomId) => {
    if (participants[roomId] && participants[roomId][socket.id]) {
      participants[roomId][socket.id].isScreenSharing = false;
      io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
        socketId,
        ...user
      })));
      socket.to(roomId).emit('screen-share-stopped', { socketId: socket.id });
    }
  });

  // Signalisation WebRTC (CORRIGÉ ICI)
  socket.on('signal', (data) => {
    // On route UNIQUEMENT au destinataire
    if (data.to) {
      io.to(data.to).emit('signal', {
        ...data,
        from: socket.id
      });
    }
  });

  // Quand un utilisateur quitte (déconnexion)
  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (participants[roomId]) {
        delete participants[roomId][socket.id];
        io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
          socketId,
          ...user
        })));
      }
    }
    console.log('Déconnexion:', socket.id);
  });
});

// Route santé pour les tests
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    socketConnections: io.engine.clientsCount
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur Socket.IO en écoute sur le port ${PORT}`);
  console.log(`Chemin d'accès: /socket.io`);
});