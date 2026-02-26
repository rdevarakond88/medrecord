/**
 * App.tsx — Production app root
 *
 * Provides the full provider tree required by the live screens:
 *   SQLiteProvider → initialises medrecord.db schema once on first launch
 *   QueryClientProvider → React Query cache for server API calls
 *   NavigationContainer → React Navigation root
 *
 * Registered routes (native stack):
 *   PatientSearch  → D2 PatientSearchScreen  (initial route)
 *   PatientDetail  → D3 PatientDetailScreen
 *
 * D1 (Login) is not yet built — PatientSearch renders null on mount when
 * token/user are absent (its own auth guard). Wire Login route when D1 is built.
 */

import React from 'react';
import { registerRootComponent } from 'expo';
import { SQLiteProvider } from 'expo-sqlite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';
import { initializeDatabase } from './src/db/schema';
import { useAuthStore } from './src/store/useAuthStore';
import { upsertPatientFromServer } from './src/db/patients';
import PatientSearchScreen from './src/screens/doctor/PatientSearchScreen';
import PatientDetailScreen from './src/screens/doctor/PatientDetailScreen';
import NewVisitScreen from './src/screens/doctor/NewVisitScreen';

// ─── Login stub ────────────────────────────────────────────────────────────
// D1 (Login screen) is not built yet. This stub:
//  1. Seeds a fake auth token (doctor-dev-001)
//  2. Seeds two test patients in SQLite so D2 shows data and D3 is reachable
// Replace with the real LoginScreen when D1 is built.
function LoginScreen() {
  const navigation = useNavigation<any>();
  const db         = useSQLiteContext();
  const setAuth    = useAuthStore((s) => s.setAuth);

  async function devLogin() {
    const doctorId = 'doctor-dev-001';
    setAuth('dev-token', {
      id:          doctorId,
      role:        'doctor',
      name:        'Dr. Dev',
      clinic_id:   'clinic-001',
      clinic_name: 'Dev Clinic',
    });
    // Seed two test patients so D2 shows the "has-data" state
    await upsertPatientFromServer(db, {
      doctor_id:       doctorId,
      server_id:       'srv-patient-001',
      mobile_number:   '9876543210',
      name:            'Ravi Kumar',
      date_of_birth:   '1985-03-12',
      gender:          'male',
      consent_granted: true,
      last_visit_date: '2026-02-20',
    });
    await upsertPatientFromServer(db, {
      doctor_id:       doctorId,
      server_id:       'srv-patient-002',
      mobile_number:   '8765432109',
      name:            'Sunita Devi',
      date_of_birth:   '1992-07-25',
      gender:          'female',
      consent_granted: false,
      last_visit_date: '2026-02-18',
    });
    navigation.replace('PatientSearch');
  }

  return (
    <View style={loginStyles.container}>
      <Text style={loginStyles.title}>MedRecord</Text>
      <Text style={loginStyles.sub}>D1 Login — not built yet</Text>
      <TouchableOpacity style={loginStyles.btn} onPress={devLogin}>
        <Text style={loginStyles.btnText}>Dev Login → D2</Text>
      </TouchableOpacity>
    </View>
  );
}
const loginStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', gap: 12 },
  title:     { fontSize: 28, fontWeight: '700', color: '#1A6DB5' },
  sub:       { fontSize: 13, color: '#999' },
  btn:       { marginTop: 8, backgroundColor: '#1A6DB5', paddingVertical: 14, paddingHorizontal: 40, borderRadius: 10 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: '600' },
});

// ─── DocumentScanner stub (D7) ────────────────────────────────────────────
// D7 (Document Scanner) is not built yet. Prevents a navigation crash when
// D6's "Scan a Document" button fires. Replace with the real DocumentScannerScreen
// when D7 is built. The stub receives patientId + visitId from D6 — both are
// available so the scan can be correctly associated when D7 is real.
function DocumentScannerScreen() {
  const navigation = useNavigation<any>();
  return (
    <View style={stubStyles.container}>
      <Text style={stubStyles.title}>Document Scanner</Text>
      <Text style={stubStyles.sub}>D7 — not built yet</Text>
      <TouchableOpacity style={stubStyles.btn} onPress={() => navigation.goBack()}>
        <Text style={stubStyles.btnText}>← Back to Visit</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── NewPatientForm stub ───────────────────────────────────────────────────
// D5 is not built yet. Prevents a navigation crash when D2's "Add New Patient"
// button fires. Replace with the real NewPatientFormScreen when D5 is built.
function NewPatientFormScreen() {
  const navigation = useNavigation<any>();
  return (
    <View style={stubStyles.container}>
      <Text style={stubStyles.title}>New Patient Form</Text>
      <Text style={stubStyles.sub}>D5 — not built yet</Text>
      <TouchableOpacity style={stubStyles.btn} onPress={() => navigation.goBack()}>
        <Text style={stubStyles.btnText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );
}
const stubStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', gap: 12 },
  title:     { fontSize: 22, fontWeight: '700', color: '#333' },
  sub:       { fontSize: 13, color: '#999' },
  btn:       { marginTop: 8, backgroundColor: '#555', paddingVertical: 12, paddingHorizontal: 32, borderRadius: 8 },
  btnText:   { color: '#fff', fontSize: 15, fontWeight: '600' },
});

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
    patientId: string;
    visitId:   string;   // pre-generated local visit ID — not yet written to SQLite
  };
  NewPatientForm: { prefillMobile?: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

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
  return (
    <SQLiteProvider databaseName="medrecord.db" onInit={initializeDatabase}>
      <QueryClientProvider client={queryClient}>
        <NavigationContainer>
          <Stack.Navigator
            initialRouteName="PatientSearch"
            screenOptions={{ headerShown: false }}
          >
            <Stack.Screen name="Login"             component={LoginScreen} />
            <Stack.Screen name="PatientSearch"     component={PatientSearchScreen} />
            <Stack.Screen name="PatientDetail"     component={PatientDetailScreen} />
            <Stack.Screen name="NewVisit"          component={NewVisitScreen} />
            <Stack.Screen name="DocumentScanner"   component={DocumentScannerScreen} />
            <Stack.Screen name="NewPatientForm"    component={NewPatientFormScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </QueryClientProvider>
    </SQLiteProvider>
  );
}

registerRootComponent(App);
