/**
 * PatientAppointmentsScreen.tsx — P9: Upcoming Appointments (patient)
 *
 * Spec:    docs/ui-ux-spec.md § Patient App (fictional extension)
 * Status:  Static mockup — no real API calls
 *
 * Shows the patient's upcoming clinic appointments with doctor name,
 * clinic name, date, and time. Three UI states:
 *   has_data     — appointment cards in a scrollable list
 *   empty        — friendly illustration with explanatory text
 *   offline_error — cannot connect; shows retry button
 *
 * State switcher visible in __DEV__ only.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors, Spacing } from '../../constants/theme';
import type { RootStackParamList } from '../../../App';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Appointment {
  id:          string;
  doctorName:  string;
  clinicName:  string;
  date:        string;   // DD/MM/YYYY
  time:        string;   // e.g. "10:30 AM"
  dayLabel:    string;   // e.g. "25"
  monthLabel:  string;   // e.g. "Jun"
  status:      'confirmed' | 'pending';
}

type UIState = 'has_data' | 'empty' | 'offline_error';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_APPOINTMENTS: Appointment[] = [
  {
    id:          'appt-1',
    doctorName:  'Dr. Ananya Krishnan',
    clinicName:  'Arogya Family Clinic',
    date:        '25/06/2026',
    time:        '10:30 AM',
    dayLabel:    '25',
    monthLabel:  'Jun',
    status:      'confirmed',
  },
  {
    id:          'appt-2',
    doctorName:  'Dr. Rajan Mehta',
    clinicName:  'Suryodaya Health Centre, Pune',
    date:        '28/06/2026',
    time:        '03:00 PM',
    dayLabel:    '28',
    monthLabel:  'Jun',
    status:      'confirmed',
  },
  {
    id:          'appt-3',
    doctorName:  'Dr. Priya Subramaniam',
    clinicName:  'Wellness Plus Clinic, Bengaluru',
    date:        '05/07/2026',
    time:        '09:00 AM',
    dayLabel:    '05',
    monthLabel:  'Jul',
    status:      'pending',
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AppointmentCard({ appt }: { appt: Appointment }) {
  const isConfirmed = appt.status === 'confirmed';
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Appointment with ${appt.doctorName} at ${appt.clinicName}, ${appt.date} at ${appt.time}. Status: ${appt.status}.`}
    >
      {/* ── Date block ── */}
      <View style={styles.dateBlock}>
        <Text style={styles.dateDay}>{appt.dayLabel}</Text>
        <Text style={styles.dateMonth}>{appt.monthLabel}</Text>
      </View>

      {/* ── Divider ── */}
      <View style={styles.cardDivider} />

      {/* ── Details ── */}
      <View style={styles.cardDetails}>
        <Text style={styles.doctorName} numberOfLines={1}>{appt.doctorName}</Text>
        <Text style={styles.clinicName} numberOfLines={1}>{appt.clinicName}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.timeRow}>
            <Text style={styles.timeIcon} accessible={false}>⏰</Text>
            <Text style={styles.timeText}>{appt.time}</Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              isConfirmed ? styles.statusConfirmed : styles.statusPending,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                isConfirmed ? styles.statusTextConfirmed : styles.statusTextPending,
              ]}
            >
              {isConfirmed ? 'Confirmed' : 'Pending'}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{label}</Text>
      <View style={styles.sectionHeaderLine} />
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.centreBlock}>
      <View style={styles.illustration} accessible={false}>
        <Text style={styles.illustrationIcon}>📅</Text>
      </View>
      <Text style={styles.stateTitle}>No upcoming appointments</Text>
      <Text style={styles.stateBody}>
        When a doctor schedules an appointment for you, it will appear here.
      </Text>
    </View>
  );
}

function OfflineErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.centreBlock}>
      <View style={[styles.illustration, styles.errorIllustration]} accessible={false}>
        <Text style={styles.illustrationIcon}>📡</Text>
      </View>
      <Text style={styles.stateTitle}>Could not load appointments</Text>
      <Text style={styles.stateBody}>
        You appear to be offline. Check your connection and try again.
      </Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel="Retry loading appointments"
      >
        <Text style={styles.retryBtnText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PatientAppointmentsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [uiState, setUiState] = useState<UIState>('has_data');

  function handleRetry() {
    // Mockup only — retry restores the data state
    setUiState('has_data');
  }

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          Upcoming Appointments
        </Text>
      </View>

      {/* ── Dev state switcher (mockup — __DEV__ only) ── */}
      {__DEV__ && (
        <View style={styles.devSwitcher}>
          <Text style={styles.devLabel}>DEV state:</Text>
          {(['has_data', 'empty', 'offline_error'] as UIState[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.devChip, uiState === s && styles.devChipActive]}
              onPress={() => setUiState(s)}
            >
              <Text style={[styles.devChipText, uiState === s && styles.devChipTextActive]}>
                {s}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Body ── */}
      {uiState === 'has_data' && (
        <FlatList
          data={MOCK_APPOINTMENTS}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={<SectionHeader label="JUNE – JULY 2026" />}
          renderItem={({ item }) => <AppointmentCard appt={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
      {uiState === 'empty'         && <EmptyState />}
      {uiState === 'offline_error' && <OfflineErrorState onRetry={handleRetry} />}

      {/* ── Bottom tab bar (patient app) ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('PatientTimeline')}
          accessibilityRole="tab"
          accessibilityLabel="My Records tab"
          accessibilityState={{ selected: false }}
        >
          <Text style={styles.tabIcon} accessible={false}>📋</Text>
          <Text style={styles.tabLabel}>My Records</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('PatientDoctorsAccess')}
          accessibilityRole="tab"
          accessibilityLabel="Doctors tab"
          accessibilityState={{ selected: false }}
        >
          <Text style={styles.tabIcon} accessible={false}>👨‍⚕️</Text>
          <Text style={styles.tabLabel}>Doctors</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          accessibilityRole="tab"
          accessibilityLabel="Appointments tab, currently selected"
          accessibilityState={{ selected: true }}
        >
          <Text style={styles.tabIcon} accessible={false}>📅</Text>
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Appointments</Text>
          <View style={styles.tabActiveDot} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('PatientProfile')}
          accessibilityRole="tab"
          accessibilityLabel="Profile tab"
          accessibilityState={{ selected: false }}
        >
          <Text style={styles.tabIcon} accessible={false}>👤</Text>
          <Text style={styles.tabLabel}>Profile</Text>
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: Colors.background,
  },

  // ── Header
  header: {
    backgroundColor:   Colors.surface,
    paddingHorizontal: Spacing.xxl,
    paddingTop:        Spacing.lg,
    paddingBottom:     Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize:   22,
    fontWeight: '700',
    color:      Colors.textPrimary,
  },

  // ── Dev switcher
  devSwitcher: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#FFF7ED',
    paddingHorizontal: Spacing.lg,
    paddingVertical:   Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#FED7AA',
    gap:               Spacing.sm,
    flexWrap:          'wrap',
  },
  devLabel: {
    fontSize:   11,
    fontWeight: '600',
    color:      '#92400E',
  },
  devChip: {
    paddingVertical:   4,
    paddingHorizontal: Spacing.sm,
    borderRadius:      12,
    borderWidth:       1,
    borderColor:       '#FED7AA',
    backgroundColor:   '#FFFBEB',
  },
  devChipActive: {
    backgroundColor: '#D97706',
    borderColor:     '#D97706',
  },
  devChipText: {
    fontSize:   11,
    fontWeight: '500',
    color:      '#92400E',
  },
  devChipTextActive: {
    color: '#FFFFFF',
  },

  // ── List
  listContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop:        Spacing.xl,
    paddingBottom:     80,
  },

  // ── Section header
  sectionHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   Spacing.md,
  },
  sectionHeaderText: {
    fontSize:      12,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginRight:   Spacing.sm,
  },
  sectionHeaderLine: {
    flex:            1,
    height:          1,
    backgroundColor: Colors.border,
  },

  // ── Appointment card
  card: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  Colors.surface,
    borderRadius:     14,
    padding:          Spacing.lg,
    marginBottom:     Spacing.md,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 1 },
    shadowOpacity:    0.06,
    shadowRadius:     6,
    elevation:        2,
  },
  dateBlock: {
    width:           52,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  dateDay: {
    fontSize:   28,
    fontWeight: '700',
    color:      Colors.primaryBlue,
    lineHeight: 32,
  },
  dateMonth: {
    fontSize:      12,
    fontWeight:    '600',
    color:         Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardDivider: {
    width:           1,
    height:          56,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.lg,
    flexShrink:      0,
  },
  cardDetails: {
    flex: 1,
  },
  doctorName: {
    fontSize:     16,
    fontWeight:   '600',
    color:        Colors.textPrimary,
    marginBottom: 2,
  },
  clinicName: {
    fontSize:     13,
    color:        Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  cardFooter: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  timeIcon: {
    fontSize: 13,
  },
  timeText: {
    fontSize:   13,
    fontWeight: '500',
    color:      Colors.textPrimary,
  },
  statusBadge: {
    borderRadius:      12,
    paddingVertical:   3,
    paddingHorizontal: 10,
    borderWidth:       1,
  },
  statusConfirmed: {
    backgroundColor: '#F0FDF4',
    borderColor:     '#BBF7D0',
  },
  statusPending: {
    backgroundColor: '#FFFBEB',
    borderColor:     '#FDE68A',
  },
  statusText: {
    fontSize:   11,
    fontWeight: '600',
  },
  statusTextConfirmed: {
    color: Colors.success,
  },
  statusTextPending: {
    color: Colors.warning,
  },

  // ── Centred state blocks (empty / error)
  centreBlock: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 40,
    paddingBottom:     60,
  },
  illustration: {
    width:           100,
    height:          100,
    borderRadius:    50,
    backgroundColor: '#EFF6FF',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing.xxl,
  },
  errorIllustration: {
    backgroundColor: '#FEF2F2',
  },
  illustrationIcon: {
    fontSize: 44,
  },
  stateTitle: {
    fontSize:     20,
    fontWeight:   '700',
    color:        Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign:    'center',
  },
  stateBody: {
    fontSize:   15,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 22,
  },
  retryBtn: {
    marginTop:         Spacing.xxl,
    paddingVertical:   Spacing.md,
    paddingHorizontal: 36,
    borderRadius:      10,
    backgroundColor:   Colors.primaryBlue,
    minHeight:         48,
    justifyContent:    'center',
  },
  retryBtnText: {
    fontSize:   15,
    fontWeight: '600',
    color:      '#FFFFFF',
  },

  // ── Bottom tab bar
  tabBar: {
    flexDirection:   'row',
    backgroundColor: Colors.surface,
    borderTopWidth:  1,
    borderTopColor:  Colors.border,
    paddingBottom:   Spacing.md,
    paddingTop:      Spacing.sm,
  },
  tabItem: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: Spacing.sm,
    minHeight:       48,
    justifyContent:  'center',
  },
  tabIcon: {
    fontSize:     20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize:   11,
    fontWeight: '500',
    color:      Colors.textSecondary,
  },
  tabLabelActive: {
    color:      Colors.primaryBlue,
    fontWeight: '700',
  },
  tabActiveDot: {
    width:           4,
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.primaryBlue,
    marginTop:       3,
  },
});
