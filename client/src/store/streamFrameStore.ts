import { create } from "zustand";
import { getStoredFrameId, storeFrameId } from "../components/streamFrames";

interface StreamFrameState {
  frameId: string;
  setFrameId: (id: string) => void;
}

export const useStreamFrameStore = create<StreamFrameState>((set) => ({
  frameId: getStoredFrameId(),
  setFrameId: (id) => {
    storeFrameId(id);
    set({ frameId: id });
  },
}));
