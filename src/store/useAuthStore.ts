/**
 * Auth state store.
 * Holds the JWT access token and authenticated user profile in memory.
 *
 * The refresh token is stored in expo-secure-store (handled in D1 login flow).
 * On app restart, D1 is responsible for reading the refresh token, obtaining
 * a new access token, and calling setAuth() before navigating to D2.
 */

import { create } from 'zustand';

interface AuthUser {
  id:          string;
  role:        'doctor' | 'patient';
  name:        string;
  clinic_id:   string;
  clinic_name: string | null;  // not in auth API response; set after a clinic fetch
}

interface AuthState {
  token: string | null;
  user:  AuthUser | null;

  setAuth:    (token: string, user: AuthUser) => void;
  setClinic:  (clinic_name: string) => void;
  clearAuth:  () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user:  null,

  setAuth: (token, user) => set({ token, user }),

  // Called after fetching clinic details post-login
  setClinic: (clinic_name) =>
    set((state) =>
      state.user ? { user: { ...state.user, clinic_name } } : state,
    ),

  clearAuth: () => set({ token: null, user: null }),
}));
