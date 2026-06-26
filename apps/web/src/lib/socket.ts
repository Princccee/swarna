import { io, Socket } from 'socket.io-client';

// Empty string = same origin; nginx proxies /socket.io/ → API container
const BASE_URL = '';

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
