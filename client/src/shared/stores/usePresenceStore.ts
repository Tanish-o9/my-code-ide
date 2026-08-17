import { create } from 'zustand';

export interface PresentUser {
  userId: string;
  name: string;
  email: string;
  avatar: string;
  color: string;
}

interface PresenceState {
  presentUsers: PresentUser[];
  setPresentUsers: (users: PresentUser[]) => void;
  clearStore: () => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  presentUsers: [],
  setPresentUsers: (users) => set({ presentUsers: users }),
  clearStore: () => set({ presentUsers: [] }),
}));
