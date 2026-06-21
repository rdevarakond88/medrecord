import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useAuthStore } from '../../store/useAuthStore';

type AppointmentStatus = 'Confirmed' | 'Pending' | 'Cancelled';

interface Appointment {
  id: string;
  doctorName: string;
  clinicName: string;
  dateTime: string;
  status: AppointmentStatus;
}

// MOCK DATA — replace with API call in Step 5
const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: '1',
    doctorName: 'Dr. Ramakant Sinha',
    clinicName: 'Sinha Multispecialty Clinic',
    dateTime: 'Mon, 23 Jun 2026  ·  10:30 AM',
    status: 'Confirmed',
  },
  {
    id: '2',
    doctorName: 'Dr. Priya Nair',
    clinicName: 'Nair Family Health Centre',
    dateTime: 'Wed, 25 Jun 2026  ·  3:00 PM',
    status: 'Pending',
  },
  {
    id: '3',
    doctorName: 'Dr. Anil Desai',
    clinicName: 'City General Hospital',
    dateTime: 'Fri, 27 Jun 2026  ·  11:00 AM',
    status: 'Cancelled',
  },
];

// Toggle for mockup review — remove in Step 5
const INITIAL_MOCK_STATE: 'empty' | 'has-data' | 'offline' = 'has-data';

const STATUS_STYLE: Record<AppointmentStatus, { bg: string; text: string }> = {
  Confirmed: { bg: '#D1FAE5', text: '#065F46' },
  Pending:   { bg: '#FEF3C7', text: '#92400E' },
  Cancelled: { bg: '#FEE2E2', text: '#991B1B' },
};

function AppointmentCard({ item }: { item: Appointment }) {
  const s = STATUS_STYLE[item.status];
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.doctorName} numberOfLines={1}>{item.doctorName}</Text>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusText, { color: s.text }]}>{item.status}</Text>
        </View>
      </View>
      <Text style={styles.clinicName}>{item.clinicName}</Text>
      <Text style={styles.dateTime}>{item.dateTime}</Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.centeredState}>
      <View style={styles.emptyIconBox}>
        <Text style={styles.emptyIconText}>No upcoming</Text>
      </View>
      <Text style={styles.emptyTitle}>No upcoming appointments</Text>
      <Text style={styles.emptySubtitle}>
        Your scheduled appointments will appear here once a doctor books one for you.
      </Text>
    </View>
  );
}

function OfflineState() {
  return (
    <View style={styles.offlineContainer}>
      <View style={styles.offlineBanner}>
        <Text style={styles.offlineBannerText}>
          You are offline — showing last saved data
        </Text>
      </View>
      <FlatList
        data={MOCK_APPOINTMENTS.slice(0, 1)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <AppointmentCard item={item} />}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

type MockState = 'empty' | 'has-data' | 'offline';
const DEV_STATES: MockState[] = ['empty', 'has-data', 'offline'];

export default function PatientAppointmentsScreen() {
  const { token, user } = useAuthStore();
  const [mockState, setMockState] = useState<MockState>(INITIAL_MOCK_STATE);

  if (!token || !user) return null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Dev state switcher — remove in Step 5 */}
      <View style={styles.devSwitcher}>
        {DEV_STATES.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.devBtn, mockState === s && styles.devBtnActive]}
            onPress={() => setMockState(s)}
          >
            <Text style={[styles.devBtnText, mockState === s && styles.devBtnTextActive]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.screenTitle}>Upcoming Appointments</Text>

      {mockState === 'empty' && <EmptyState />}

      {mockState === 'has-data' && (
        <FlatList
          data={MOCK_APPOINTMENTS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AppointmentCard item={item} />}
          contentContainerStyle={styles.list}
        />
      )}

      {mockState === 'offline' && <OfflineState />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // --- Card ---
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  clinicName: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 6,
  },
  dateTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },

  // --- Empty state ---
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyIconText: {
    fontSize: 10,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },

  // --- Offline state ---
  offlineContainer: {
    flex: 1,
  },
  offlineBanner: {
    backgroundColor: '#FEF9C3',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE047',
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#713F12',
    textAlign: 'center',
  },

  // --- Dev switcher ---
  devSwitcher: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#F3F4F6',
    columnGap: 8,
  },
  devBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  devBtnActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  devBtnText: {
    fontSize: 11,
    color: '#374151',
  },
  devBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
