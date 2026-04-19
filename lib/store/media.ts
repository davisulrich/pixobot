import { create } from 'zustand';

export type MediaType = 'photo' | 'video';

// Drawing + text overlay captured in the edit screen.
// Stored as SVG-path data so it can be re-rendered losslessly at any resolution.
export type OverlayData = {
  paths: { d: string; color: string }[];
  textBoxes: { text: string; x: number; y: number; scale: number }[];
  // Screen dimensions at edit time — used to scale paths to the viewer's screen
  width: number;
  height: number;
};

interface MediaState {
  pendingUri: string | null;
  pendingType: MediaType | null;
  pendingOverlay: OverlayData | null;
  setPending: (uri: string, type: MediaType) => void;
  setOverlay: (overlay: OverlayData | null) => void;
  clearPending: () => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  pendingUri: null,
  pendingType: null,
  pendingOverlay: null,
  setPending: (uri, type) => set({ pendingUri: uri, pendingType: type }),
  setOverlay: (overlay) => set({ pendingOverlay: overlay }),
  clearPending: () => set({ pendingUri: null, pendingType: null, pendingOverlay: null }),
}));
