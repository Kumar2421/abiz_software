import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";

import { clientOrigins } from "./env.js";
import { TOKEN_COOKIE, userFromToken } from "./lib/auth.js";

let io: IOServer | null = null;

function tokenFromHandshake(socket: Socket): string | null {
  const auth = socket.handshake.auth as { token?: string } | undefined;
  if (auth?.token) return auth.token;

  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === TOKEN_COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function initRealtime(server: HttpServer): IOServer {
  io = new IOServer(server, {
    cors: { origin: clientOrigins, credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = tokenFromHandshake(socket);
      if (!token) throw new Error("Missing auth token");
      const user = await userFromToken(token);
      socket.data.user = user;
      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const { companyId } = socket.data.user as { companyId: string };
    // One room per company — every agent of that company sees the same stream.
    socket.join(`company:${companyId}`);

    socket.on("conversation:open", (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on("conversation:close", (conversationId: string) => {
      socket.leave(`conversation:${conversationId}`);
    });
  });

  return io;
}

/** Fan out an event to every connected client of one company. */
export function emitToCompany(
  companyId: string,
  event: string,
  payload: unknown,
) {
  io?.to(`company:${companyId}`).emit(event, payload);
}
