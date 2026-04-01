import { create } from 'zustand';

// Note: Snapchat passes captured media via a shared in-memory store rather than
// route params — URIs can be long and params have size limits. We clear the store
// when the edit screen dismisses so there's never stale media sitting in memory.

export type MediaType = 'photo' | 'video';

interface MediaState {
  pendingUri: string | null;
  pendingType: MediaType | null;
  setPending: (uri: string, type: MediaType) => void;
  clearPending: () => void;
}

export const useMediaStore = create<MediaState>((set) => ({
  pendingUri: null,
  pendingType: null,
  setPending: (uri, type) => set({ pendingUri: uri, pendingType: type }),
  clearPending: () => set({ pendingUri: null, pendingType: null }),
}));
