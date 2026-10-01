'use strict';

const { Server } = require('socket.io');
const socketAuthMiddleware = require('./socketAuthMiddleware');
const registerChatSocketHandlers = require('./chatSocketHandler');

let io = null;

/**
 * Initialize Socket.IO on existing HTTP server
 */
function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    path: '/socket.io/',
    cors: {
      origin: (origin, callback) => {
        if (!origin || [process.env.URL_REACT, 'http://localhost:3000', 'http://localhost:5173'].includes(origin) || origin.startsWith('http://192.168.') || origin.startsWith('http://10.0.') || origin.startsWith('http://127.0.0.1')) {
          return callback(null, true);
        }
        return callback(null, true); // Allow configured proxy connections
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    pingInterval: 25000,
    pingTimeout: 20000,
    transports: ['websocket', 'polling'],
  });

  // Handshake Authentication & Token Version Revocation Check
  io.use(socketAuthMiddleware);

  io.on('connection', (socket) => {
    registerChatSocketHandlers(io, socket);
  });

  console.log('>>> [REALTIME] Socket.IO server initialized successfully on /socket.io/');
  return io;
}

/**
 * Get Socket.IO server instance
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initSocketIO(server) first.');
  }
  return io;
}

/**
 * Close Socket.IO server during graceful shutdown
 */
async function closeSocketIO() {
  if (io) {
    console.log('[SHUTDOWN] Closing all Socket.IO client connections...');
    io.disconnectSockets(true);
    await new Promise((resolve) => {
      io.close(() => {
        console.log('[SHUTDOWN] Socket.IO server closed.');
        resolve();
      });
    });
  }
}

module.exports = {
  initSocketIO,
  getIO,
  closeSocketIO,
};
