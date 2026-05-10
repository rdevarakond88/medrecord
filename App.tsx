/**
 * App.tsx — Production app root
 *
 * Provides the full provider tree required by the live screens:
 *   SQLiteProvider → initialises medrecord.db schema once on first launch
 *   QueryClientProvider → React Query cache for server API calls
 *   NavigationContainer → React Navigation root
 *
 * Registered routes (native stack):
 *   Login          → D1 LoginScreen         (initial route)
 *   PatientSearch  → D2 PatientSearchScreen
 *   PatientDetail  → D3 PatientDetailScreen
 *   NewVisit       → D6 NewVisitScreen
 *   DocumentScanner → D7 DocumentScannerScreen
 *   NewPatientForm → D5 NewPatientFormScreen
 */

import React, { useState, useEffect } from 'react';
import { registerRootComponent } from 'expo';
import { SQLiteProvider } from 'expo-sqlite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { View, ActivityIndicator, StyleSheet } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { initializeDatabase } from './src/db/schema';
import LoginScreen from './src/screens/doctor/LoginScreen';
import PatientSearchScreen from './src/screens/doctor/PatientSearchScreen';
import PatientDetailScreen from './src/screens/doctor/PatientDetailScreen';
import NewVisitScreen from './src/screens/doctor/NewVisitScreen';
import DocumentScannerScreen from './src/screens/doctor/DocumentScannerScreen';
import NewPatientFormScreen from './src/screens/doctor/NewPatientFormScreen';
import VisitDetailScreen from './src/screens/doctor/VisitDetailScreen';
import ConsentRequestScreen from './src/screens/doctor/ConsentRequestScreen';
import { useSyncWorker } from './src/sync/useSyncWorker';
import { refreshAccessToken } from './src/api/auth';
import { ApiError } from './src/api/apiClient';
import { REFRESH_TOKEN_KEY, USER_PROFILE_KEY } from './src/auth/constants';
import { useAuthStore } from './src/store/useAuthStore';
import type { AuthUser } from './src/store/useAuthStore';


// ─── Navigation types ──────────────────────────────────────────────────────

export type RootStackParamList = {
  Login: undefined;
  PatientSearch: undefined;
  PatientDetail: {
    patientLocalId:  string;
    patientServerId: string | null;
    consentGranted:  boolean;
  };
  NewVisit: {
    patientId:       string;    // local SQLite patient ID
    patientServerId: string | null;
    patientName:     string;
    patientMobile:   string;
    consentGranted:  boolean;
  };
  DocumentScanner: {
    patientId:          string;
    visitId:            string;   // pre-generated local visit ID — not yet written to SQLite
    existingScanCount?: number;   // D7-SF-6: shows "N scan(s) attached" pill in viewfinder top bar
  };
  NewPatientForm: { prefillMobile?: string };
  VisitDetail: {
    visitServerId:   string;
    visitDate:       string;                 // YYYY-MM-DD from server
    visitStatus:     'open' | 'submitted';
    chiefComplaint:  string | null;
    clinicName:      string;
    isOwnVisit:      boolean;
    consentGranted:  boolean;
    patientServerId: string;
    patientName:     string;
  };
  ConsentRequest: {
    patientLocalId:  string;
    patientServerId: string | null;
    patientName:     string;
    maskedMobile:    string;
    patientMobile:   string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// ─── Sync worker mount ─────────────────────────────────────────────────────
// Renders null — mounts the sync worker hook inside the SQLiteProvider +
// QueryClientProvider tree so useSQLiteContext() resolves.
// Must be inside SQLiteProvider but does NOT need to be inside NavigationContainer.
function SyncWorkerMount() {
  useSyncWorker();
  return null;
}

// ─── React Query client ────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

// ─── Root component ────────────────────────────────────────────────────────

function App() {
  // F-3 / H-3: session restoration on cold start.
  // null = still checking SecureStore; 'Login' or 'PatientSearch' = ready.
  const [initialRoute, setInitialRoute] =
    useState<keyof RootStackParamList | null>(null);

  useEffect(() => {
    async function restoreSession(): Promise<void> {
      try {
        const storedRefresh = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!storedRefresh) {
          setInitialRoute('Login');
          return;
        }

        // Attempt token refresh — throws on expired/revoked token
        const { access_token, refresh_token: rotatedToken } =
          await refreshAccessToken(storedRefresh);

        const storedUserJson = await SecureStore.getItemAsync(USER_PROFILE_KEY);
        if (!storedUserJson) {
          // No cached user profile — cannot restore session without a /me endpoint
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          setInitialRoute('Login');
          return;
        }

        const user = JSON.parse(storedUserJson) as AuthUser;

        // Rotate refresh token if the server issued a new one (SW-H-2 pattern)
        if (rotatedToken) {
          await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, rotatedToken);
        }

        // F-2: access token stays in Zustand only — never written back to SecureStore
        useAuthStore.getState().setAuth(access_token, user);
        setInitialRoute('PatientSearch');
      } catch (err) {
        // Only wipe credentials on an explicit auth rejection (401/403 — token
        // expired or revoked server-side). Network errors (no connectivity, timeout,
        // DNS failure) leave credentials intact so the doctor can restore their
        // session when back online. Indian clinic WiFi is unreliable; losing a
        // 30-day session on a brief connectivity drop is unacceptable (D1-SA2-H-1).
        const isAuthError =
          err instanceof ApiError && (err.status === 401 || err.status === 403);
        if (isAuthError) {
          await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
          await SecureStore.deleteItemAsync(USER_PROFILE_KEY);
        }
        setInitialRoute('Login');
      }
    }
    void restoreSession();
  }, []);

  // Show a minimal splash while we check SecureStore — prevents a flash of
  // the Login screen on every cold start for already-authenticated doctors.
  if (initialRoute === null) {
    return (
      <View style={splashStyles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <SQLiteProvider databaseName="medrecord.db" onInit={initializeDatabase}>
      <QueryClientProvider client={queryClient}>
        <SyncWorkerMount />
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Login"             component={LoginScreen} />
            <Stack.Screen name="PatientSearch"     component={PatientSearchScreen} />
            <Stack.Screen name="PatientDetail"     component={PatientDetailScreen} />
            <Stack.Screen name="NewVisit"          component={NewVisitScreen} />
            <Stack.Screen name="DocumentScanner"   component={DocumentScannerScreen} />
            <Stack.Screen name="NewPatientForm"    component={NewPatientFormScreen} />
            <Stack.Screen name="VisitDetail"       component={VisitDetailScreen} />
            <Stack.Screen name="ConsentRequest"    component={ConsentRequestScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SQLiteProvider>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

registerRootComponent(App);
