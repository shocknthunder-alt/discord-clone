import { create } from "zustand";

export interface ScreenChoice {
  id: string;
  audio: boolean;
}

interface ScreenPickerState {
  open: boolean;
  resolve: ((choice: ScreenChoice | null) => void) | null;
}

export const useScreenPickerStore = create<ScreenPickerState>(() => ({ open: false, resolve: null }));

/** Desktop app only: opens the screen/window picker and resolves with the choice (null = cancelled). */
export function requestDesktopScreenSource(): Promise<ScreenChoice | null> {
  return new Promise((resolve) => {
    useScreenPickerStore.getState().resolve?.(null); // a second request cancels the first
    useScreenPickerStore.setState({ open: true, resolve });
  });
}

export function closeScreenPicker(choice: ScreenChoice | null) {
  const { resolve } = useScreenPickerStore.getState();
  useScreenPickerStore.setState({ open: false, resolve: null });
  resolve?.(choice);
}
