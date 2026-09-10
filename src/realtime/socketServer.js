import { Server } from "socket.io";
import { authenticateHandshake, isStillActive } from "./socketAuth.js";
import { messagingRoles } from "../utils/constant.js";

const SWEEP_MS = 60 * 1000;

const roomFor = (userCode) => `user:${userCode}`;

let io = null;
let sweep = null;

export const attachSocketServer = (httpServer) => {
  io = new Server(httpServer, {
    path: "/socket.io",
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const user = await authenticateHandshake(socket.handshake.headers?.cookie);

      if (!user) return next(new Error("Not authenticated"));

      if (!messagingRoles.includes(user.Role)) return next(new Error("Forbidden"));

      socket.data.user = user;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", (socket) => {
    socket.join(roomFor(socket.data.user.UserCode));
  });

  sweep = setInterval(async () => {
    const sockets = await io.fetchSockets();

    for (const socket of sockets) {
      try {
        if (!(await isStillActive(socket.data.user.UserId))) socket.disconnect(true);
      } catch (error) {
        console.error("socket sweep failed:", error);
      }
    }
  }, SWEEP_MS);

  sweep.unref?.();

  return io;
};

export const closeSocketServer = async () => {
  if (sweep) clearInterval(sweep);
  if (io) await io.close();

  sweep = null;
  io = null;
};

export const isConnected = (userCode) => {
  if (!io) return false;

  const room = io.sockets.adapter.rooms.get(roomFor(userCode));

  return Boolean(room && room.size > 0);
};

export const deliver = (userCode, event, payload) => {
  try {
    if (!io) return false;

    io.to(roomFor(userCode)).emit(event, payload);

    return isConnected(userCode);
  } catch (error) {
    console.error(`deliver to ${userCode} failed:`, error);
    return false;
  }
};
