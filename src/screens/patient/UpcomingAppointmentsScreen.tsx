import React from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
} from 'react-native';

type Appointment = {
  id: string;
  doctorName: string;
  clinicName: string;
  date: string;
  time: string;
};

type UIState = 'data' | 'empty' | 'error';

// Toggle to preview different UI states during mockup review
const PREVIEW_STATE: UIState = 'data';

const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: '1',
    doctorName: 'Dr. Sarah Patel',
    clinicName: 'Sunrise Family Clinic',
    date: 'Mon, Jun 23, 2026',
    time: '10:30 AM',
  },
  {
    id: '2',
    doctorName: 'Dr. James Okafor',
    clinicName: 'Westside Medical Center',
    date: 'Wed, Jun 25, 2026',
    time: '2:00 PM',
  },
  {
    id: '3',
    doctorName: 'Dr. Sarah Patel',
    clinicName: 'Sunrise Family Clinic',
    date: 'Mon, Jul 7, 2026',
    time: '11:00 AM',
  },
];

function AppointmentCard({ item }: { item: Appointment }) {
  return (
    <View style={styles.card}>
      <Text style={styles.doctorName}>{item.doctorName}</Text>
      <Text style={styles.clinicName}>{item.clinicName}</Text>
      <View style={styles.dateTimeRow}>
        <Text style={styles.dateText}>{item.date}</Text>
        <Text style={styles.dot}> · </Text>
        <Text style={styles.timeText}>{item.time}</Text>
      </View>
    </View>
  );
}

export default function UpcomingAppointmentsScreen() {
  const uiState = PREVIEW_STATE;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.screenTitle}>Upcoming Appointments</Text>
      </View>

      {uiState === 'data' && (
        <FlatList
          data={MOCK_APPOINTMENTS}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AppointmentCard item={item} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {uiState === 'empty' && (
        <View style={styles.center}>
          <Text style={styles.stateTitle}>No upcoming appointments</Text>
          <Text style={styles.stateSubtitle}>
            Your scheduled appointments will appear here.
          </Text>
        </View>
      )}

      {uiState === 'error' && (
        <View style={styles.center}>
          <Text style={styles.stateTitle}>Unable to load appointments</Text>
          <Text style={styles.stateSubtitle}>
            You appear to be offline. Check your connection and try again.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => {}}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  list: {
    padding: 16,
  },
  separator: {
    height: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  clinicName: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 8,
  },
  dateTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1565C0',
  },
  dot: {
    fontSize: 13,
    color: '#999999',
  },
  timeText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1565C0',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  stateSubtitle: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#1565C0',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
