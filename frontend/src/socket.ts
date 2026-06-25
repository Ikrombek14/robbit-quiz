import { io, type Socket } from "socket.io-client";

// Dev'da backend :4000 da (xuddi shu host/IP). Production'da bir xil origin.
const SOCKET_URL = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:4000`
  : window.location.origin;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: true });
  }
  return socket;
}
