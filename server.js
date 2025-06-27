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
const participants = {}; // { roomId: { socketId: userName } }

// Middleware d'authentification
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    // Ici vous devriez valider le token avec votre backend Laravel
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
  socket.on('join-room', (roomId, userName) => {
    socket.join(roomId);

    // Initialise la salle si besoin
    if (!participants[roomId]) participants[roomId] = {};

    // Ajoute le participant
    participants[roomId][socket.id] = userName;

    // Envoie la liste à tous les clients de la salle
    io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, userName]) => ({
      socketId,
      userName
    })));

    // Notifie les autres (optionnel)
    socket.to(roomId).emit('user-joined', { socketId: socket.id, userName });
    console.log(`Socket ${socket.id} (${userName}) a rejoint la salle ${roomId}`);
  });

  // Signalisation WebRTC
  socket.on('signal', (data) => {
    socket.to(data.roomId).emit('signal', {
      ...data,
      from: socket.id
    });
  });

  // Quand un utilisateur quitte (déconnexion)
  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (participants[roomId]) {
        delete participants[roomId][socket.id];
        // Met à jour la liste pour tous
        io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, userName]) => ({
          socketId,
          userName
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