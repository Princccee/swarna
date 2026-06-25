import { create } from 'zustand';
import { getRateSocket } from '../lib/socket';

export interface RateEntry {
  metal: string;
  purity: string;
  ratePerGram: number;
  snappedAt: string;
}

interface RateState {
  rates: Record<string, RateEntry>;
  connected: boolean;
  connect: () => void;
  disconnect: () => void;
}

export const useRateStore = create<RateState>((set) => ({
  rates: {},
  connected: false,

  connect() {
    const socket = getRateSocket();

    socket.on('connect', () => set({ connected: true }));
    socket.on('disconnect', () => set({ connected: false }));

    socket.on('rate:snapshot', (data: RateEntry[]) => {
      const rates: Record<string, RateEntry> = {};
      data.forEach((r) => { rates[`${r.metal}:${r.purity}`] = r; });
      set({ rates });
    });

    socket.on('rate:update', (data: RateEntry) => {
      set((state) => ({
        rates: { ...state.rates, [`${data.metal}:${data.purity}`]: data },
      }));
    });
  },

  disconnect() {
    getRateSocket().disconnect();
    set({ connected: false });
  },
}));
