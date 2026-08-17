import { create } from 'zustand';

interface FollowState {
  followedUserId: string | null;
  followUser: (userId: string) => void;
  unfollow: () => void;
}

export const useFollowStore = create<FollowState>((set) => ({
  followedUserId: null,
  followUser: (userId) => set({ followedUserId: userId }),
  unfollow: () => set({ followedUserId: null }),
}));
