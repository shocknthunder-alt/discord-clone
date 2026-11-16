import { create } from "zustand";
import type { StickerDTO } from "@discord-clone/shared";
import { fetchStickers } from "../api/media.api";

/** The open server's stickers. */
interface StickerState {
  serverId: string | null;
  stickers: StickerDTO[];
  load: (serverId: string) => Promise<void>;
}

let seq = 0;

export const useStickerStore = create<StickerState>((set, get) => ({
  serverId: null,
  stickers: [],
  load: async (serverId) => {
    const my = ++seq;
    if (get().serverId !== serverId) set({ serverId, stickers: [] });
    try {
      const stickers = await fetchStickers(serverId);
      if (my === seq) set({ serverId, stickers });
    } catch {
      /* older server without stickers */
    }
  },
}));
