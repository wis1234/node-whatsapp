// import express from 'express';
// import { createServer } from 'http';
// import { Server } from 'socket.io';
// import cors from 'cors';

// const app = express();
// const httpServer = createServer(app);

// // Configuration CORS améliorée
// app.use(cors({
//   origin: 'https://edusmart.erequest.net',
//   credentials: true
// }));

// // Configuration Socket.IO
// const io = new Server(httpServer, {
//   path: '/socket.io',
//   cors: {
//     origin: 'https://edusmart.erequest.net',
//     methods: ['GET', 'POST'],
//     credentials: true
//   },
//   transports: ['websocket', 'polling'],
//   pingInterval: 25000,
//   pingTimeout: 20000
// });

// // Gestion des participants par salle
// // Chaque participant : { socketId, userName, profilePhoto, isMuted, isVideoOff, isScreenSharing }
// const participants = {}; // { roomId: { socketId: { userName, profilePhoto, isMuted, isVideoOff, isScreenSharing } } }

// // Middleware d'authentification (à adapter selon votre backend Laravel)
// io.use(async (socket, next) => {
//   try {
//     const token = socket.handshake.auth.token;
//     // Ici vous pouvez valider le token avec Laravel si besoin
//     if (!token) throw new Error('Token manquant');
//     next();
//   } catch (err) {
//     next(new Error('Authentification échouée'));
//   }
// });

// // Gestion des connexions
// io.on('connection', (socket) => {
//   console.log('Nouvelle connexion:', socket.id);

//   // Quand un utilisateur rejoint une salle
//   socket.on('join-room', (roomId, userName, profilePhoto = null) => {
//     socket.join(roomId);

//     // Initialise la salle si besoin
//     if (!participants[roomId]) participants[roomId] = {};

//     // Ajoute le participant avec ses infos de base
//     participants[roomId][socket.id] = {
//       userName,
//       profilePhoto,
//       isMuted: false,
//       isVideoOff: false,
//       isScreenSharing: false
//     };

//     // Envoie la liste à tous les clients de la salle
//     io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
//       socketId,
//       ...user
//     })));

//     // Notifie les autres (optionnel)
//     socket.to(roomId).emit('user-joined', { socketId: socket.id, userName, profilePhoto });
//     console.log(`Socket ${socket.id} (${userName}) a rejoint la salle ${roomId}`);
//   });

//   // Mise à jour du statut (mute/unmute, vidéo on/off)
//   socket.on('update-status', (roomId, status) => {
//     if (participants[roomId] && participants[roomId][socket.id]) {
//       if ('isMuted' in status) participants[roomId][socket.id].isMuted = status.isMuted;
//       if ('isVideoOff' in status) participants[roomId][socket.id].isVideoOff = status.isVideoOff;
//       io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
//         socketId,
//         ...user
//       })));
//     }
//   });

//   // Partage d'écran
//   socket.on('screen-share-start', (roomId) => {
//     if (participants[roomId] && participants[roomId][socket.id]) {
//       participants[roomId][socket.id].isScreenSharing = true;
//       io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
//         socketId,
//         ...user
//       })));
//       socket.to(roomId).emit('screen-share-started', { socketId: socket.id });
//     }
//   });

//   socket.on('screen-share-stop', (roomId) => {
//     if (participants[roomId] && participants[roomId][socket.id]) {
//       participants[roomId][socket.id].isScreenSharing = false;
//       io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
//         socketId,
//         ...user
//       })));
//       socket.to(roomId).emit('screen-share-stopped', { socketId: socket.id });
//     }
//   });

//   // Signalisation WebRTC
//   socket.on('signal', (data) => {
//     socket.to(data.roomId).emit('signal', {
//       ...data,
//       from: socket.id
//     });
//   });

//   // Quand un utilisateur quitte (déconnexion)
//   socket.on('disconnecting', () => {
//     for (const roomId of socket.rooms) {
//       if (participants[roomId]) {
//         delete participants[roomId][socket.id];
//         // Met à jour la liste pour tous
//         io.to(roomId).emit('participants-list', Object.entries(participants[roomId]).map(([socketId, user]) => ({
//           socketId,
//           ...user
//         })));
//       }
//     }
//     console.log('Déconnexion:', socket.id);
//   });
// });

// // Route santé pour les tests
// app.get('/health', (req, res) => {
//   res.json({
//     status: 'ok',
//     socketConnections: io.engine.clientsCount
//   });
// });

// // Démarrer le serveur
// const PORT = process.env.PORT || 3001;
// httpServer.listen(PORT, '0.0.0.0', () => {
//   console.log(`Serveur Socket.IO en écoute sur le port ${PORT}`);
//   console.log(`Chemin d'accès: /socket.io`);
// });


import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const httpServer = createServer(app);

// Configuration CORS
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
  pingInterval: 10000,
  pingTimeout: 5000,
  connectionStateRecovery: {
    maxDisconnectionDuration: 60000,
    skipMiddlewares: true
  }
});

// Gestion des participants par salle
const participants = {}; // { roomId: { socketId: participantData } }
const MAX_PARTICIPANTS = 50;

// Middleware d'authentification
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (!token) throw new Error('Missing token');
    // Ici vous pourriez valider le token avec votre backend Laravel
    next();
  } catch (err) {
    next(new Error('Authentication failed'));
  }
});

// Gestion des connexions
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Rejoindre une salle
  socket.on('join-room', (roomId, userName, profilePhoto = null) => {
    try {
      // Vérifier si la salle est pleine
      if (participants[roomId] && Object.keys(participants[roomId]).length >= MAX_PARTICIPANTS) {
        socket.emit('room-full');
        return;
      }

      socket.join(roomId);

      // Initialiser la salle si nécessaire
      if (!participants[roomId]) {
        participants[roomId] = {};
      }

      // Ajouter le participant
      participants[roomId][socket.id] = {
        socketId: socket.id,
        userName,
        profilePhoto: profilePhoto || 'https://edusmart.erequest.net/images/default-profile.png',
        isMuted: false,
        isVideoOff: false,
        isScreenSharing: false,
        joinedAt: new Date().toISOString()
      };

      // Envoyer la liste mise à jour à tous les participants
      broadcastParticipantsList(roomId);

      // Notifier les autres de la nouvelle connexion
      socket.to(roomId).emit('user-joined', participants[roomId][socket.id]);
      console.log(`User ${userName} joined room ${roomId}`);
    } catch (error) {
      console.error('Join-room error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Mise à jour du statut
  socket.on('update-status', (roomId, status) => {
    try {
      if (participants[roomId]?.[socket.id]) {
        if ('isMuted' in status) participants[roomId][socket.id].isMuted = status.isMuted;
        if ('isVideoOff' in status) participants[roomId][socket.id].isVideoOff = status.isVideoOff;
        broadcastParticipantsList(roomId);
      }
    } catch (error) {
      console.error('Update-status error:', error);
    }
  });

  // Partage d'écran
  socket.on('screen-share-start', (roomId) => {
    try {
      if (participants[roomId]?.[socket.id]) {
        participants[roomId][socket.id].isScreenSharing = true;
        broadcastParticipantsList(roomId);
        socket.to(roomId).emit('screen-share-started', { socketId: socket.id });
      }
    } catch (error) {
      console.error('Screen-share-start error:', error);
    }
  });

  socket.on('screen-share-stop', (roomId) => {
    try {
      if (participants[roomId]?.[socket.id]) {
        participants[roomId][socket.id].isScreenSharing = false;
        broadcastParticipantsList(roomId);
        socket.to(roomId).emit('screen-share-stopped', { socketId: socket.id });
      }
    } catch (error) {
      console.error('Screen-share-stop error:', error);
    }
  });

  // Signalisation WebRTC
  socket.on('signal', (data) => {
    try {
      if (!data.roomId || !data.type) {
        throw new Error('Invalid signal data');
      }

      const validTypes = ['offer', 'answer', 'ice-candidate', 'hang-up'];
      if (!validTypes.includes(data.type)) {
        throw new Error('Invalid signal type');
      }

      console.log(`Signal from ${socket.id} to room ${data.roomId}:`, {
        type: data.type,
        to: data.to
      });

      if (data.to) {
        socket.to(data.to).emit('signal', {
          ...data,
          from: socket.id
        });
      } else {
        socket.to(data.roomId).emit('signal', {
          ...data,
          from: socket.id
        });
      }
    } catch (error) {
      console.error('Signal error:', error);
      socket.emit('signal-error', { message: error.message });
    }
  });

  // Messages de chat
  socket.on('chat-message', (data) => {
    try {
      if (!data.roomId || !data.message) {
        throw new Error('Invalid message data');
      }

      const user = participants[data.roomId]?.[socket.id];
      if (!user) throw new Error('User not in room');

      const messageData = {
        from: socket.id,
        fromName: user.userName,
        message: data.message,
        timestamp: new Date().toISOString()
      };

      io.to(data.roomId).emit('chat-message', messageData);
    } catch (error) {
      console.error('Chat-message error:', error);
    }
  });

  // Gestion de la déconnexion
  socket.on('disconnecting', (reason) => {
    console.log(`Client ${socket.id} disconnecting (reason: ${reason})`);
    
    socket.rooms.forEach(roomId => {
      if (participants[roomId]?.[socket.id]) {
        const userName = participants[roomId][socket.id].userName;
        
        socket.to(roomId).emit('user-leaving', { 
          socketId: socket.id,
          userName
        });

        delete participants[roomId][socket.id];
        
        if (participants[roomId]) {
          broadcastParticipantsList(roomId);
        }
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`Client ${socket.id} disconnected`);
  });
});

// Fonction pour diffuser la liste des participants
function broadcastParticipantsList(roomId) {
  if (!participants[roomId]) return;

  const participantsList = Object.values(participants[roomId]).map(p => ({
    socketId: p.socketId,
    userName: p.userName,
    profilePhoto: p.profilePhoto,
    isMuted: p.isMuted,
    isVideoOff: p.isVideoOff,
    isScreenSharing: p.isScreenSharing
  }));

  io.to(roomId).emit('participants-list', participantsList);
}

// Route santé
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    socketConnections: io.engine.clientsCount,
    activeRooms: Object.keys(participants).length
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
