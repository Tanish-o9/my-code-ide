import { create } from 'zustand';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  theme_preference: 'light' | 'dark';
  createdAt: string;
}

interface AuthState {
  user: UserProfile | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  login: (user: UserProfile, accessToken: string) => void;
  logout: () => void;
  setAccessToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: false,

  login: (user, accessToken) => set({
    user,
    accessToken,
    isAuthenticated: true,
    isLoading: false,
  }),
  
  logout: () => set({
    user: null,
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
  }),

  setAccessToken: (accessToken) => set({ 
    accessToken,
    isAuthenticated: !!accessToken 
  }),

  setLoading: (isLoading) => set({ isLoading }),
}));
