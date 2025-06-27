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

// Configuration Socket.IO cruciale
const io = new Server(httpServer, {
  path: '/socket.io', // Chemin d'accès explicite
  cors: {
    origin: 'https://edusmart.erequest.net',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'], // Activation des deux transports
  pingInterval: 25000,
  pingTimeout: 20000
});

// Middleware d'authentification
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    // Ici vous devriez valider le token avec votre backend Laravel
    // Exemple fictif :
    if (!token) throw new Error('Token manquant');
    next();
  } catch (err) {
    next(new Error('Authentification échouée'));
  }
});

// Gestion des connexions
io.on('connection', (socket) => {
  console.log('Nouvelle connexion:', socket.id);

  // Gestion des salles (exemple pour les appels vidéo)
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} a rejoint la salle ${roomId}`);
    socket.to(roomId).emit('user-connected', socket.id);
  });

  // Signalisation WebRTC
  socket.on('signal', (data) => {
    socket.to(data.roomId).emit('signal', {
      ...data,
      from: socket.id
    });
  });

  // Gestion de déconnexion
  socket.on('disconnect', () => {
    console.log('Déconnexion:', socket.id);
    // Ici vous devriez gérer la sortie des salles
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