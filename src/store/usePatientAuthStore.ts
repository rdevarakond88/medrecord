/**
 * Patient auth state store.
 * Holds the patient JWT access token and profile in memory.
 *
 * Separate from useAuthStore (doctor) so both can coexist on the same device
 * during integration testing without overwriting each other's tokens.
 *
 * Refresh token is persisted in expo-secure-store under PATIENT_REFRESH_TOKEN_KEY.
 * Access token stays in-memory only (never persisted — security-spec.md F-2).
 */

import { create } from 'zustand';

export interface PatientUser {
  id:            string;
  role:          'patient';
  name:          string | null;
  mobile_number: string;
}

interface PatientAuthState {
  token: string | null;
  user:  PatientUser | null;

  setAuth:   (token: string, user: PatientUser) => void;
  clearAuth: () => void;
}

export const usePatientAuthStore = create<PatientAuthState>((set) => ({
  token: null,
  user:  null,

  setAuth:   (token, user) => set({ token, user }),
  clearAuth: () => set({ token: null, user: null }),
}));
