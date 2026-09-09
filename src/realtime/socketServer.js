import { Server } from "socket.io";
import { authenticateHandshake, isStillActive } from "./socketAuth.js";
import { messagingRoles } from "../utils/constant.js";

// A minute is short enough that a revoked account loses its feed while the
// person is still looking at the screen, and long enough that the sweep is one
// clustered index seek per connected user per minute.
const SWEEP_MS = 60 * 1000;

const roomFor = (userCode) => `user:${userCode}`;

let io = null;
let sweep = null;

export const attachSocketServer = (httpServer) => {
  // ⚠️ socket.io does not use the Express cors() middleware -- the handshake
  // never reaches it. The origin has to be given here, with credentials on,
  // because the cookie is how the handshake authenticates and without
  // withCredentials on the client it is never sent at all.
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

      // The three roles with no messaging have nothing to receive. Refusing the
      // connection is cheaper than holding one open that can never be used.
      if (!messagingRoles.includes(user.Role)) return next(new Error("Forbidden"));

      socket.data.user = user;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", (socket) => {
    // One room per user, not per conversation. A message that arrives while the
    // recipient is looking at another screen is still delivered -- it reached
    // them -- so delivery must not depend on having a conversation open.
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

// Delivery is a side effect of a message that is already stored. It must never
// fail the send -- the same rule safeNotify follows, and for the same reason.
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
