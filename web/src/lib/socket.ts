"use client";

import { io, type Socket } from "socket.io-client";

import { API_URL } from "@/lib/api";

let socket: Socket | null = null;

/**
 * One shared connection for the whole app. The session cookie travels with the
 * handshake, so no token has to be passed in from the client.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_URL, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
