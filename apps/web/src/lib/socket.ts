import { io, Socket } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_URL ?? '';

let rateSocket: Socket | null = null;

export function getRateSocket(): Socket {
  if (!rateSocket) {
    rateSocket = io(`${BASE_URL}/rates`, { autoConnect: true, transports: ['websocket'] });
  }
  return rateSocket;
}

export function disconnectRateSocket() {
  rateSocket?.disconnect();
  rateSocket = null;
}
