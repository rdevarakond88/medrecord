/**
 * PatientVisitDetailScreen.tsx — P3: Visit Record Detail (Patient View)
 *
 * Spec:    docs/ui-ux-spec.md § P3 (Visit Record Detail)
 * PM:      reviews/P1-P5-pm-review.md
 *
 * MOCKUP — all data is hardcoded. No real API calls.
 *
 * Wire step will:
 *   1. Load visit records from SQLite cache or GET /patient/visits/:id/records.
 *   2. Wire scan thumbnail to real image path / S3 signed URL.
 *   3. Wire "View full document →" to patient-facing full scan viewer.
 *   4. Wire "Something wrong?" to POST /patient/flag (v2 feature — stub for now).
 *
 * States shown: normal (scan + note), scan pending OCR, scan OCR failed, note only.
 * Toggle via DEV demo switcher at bottom.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Colors, Spacing } from '../../constants/theme';
import type { RootStackParamList } from '../../../App';

// ─── Types ────────────────────────────────────────────────────────────────────

type OcrStatus = 'success' | 'pending' | 'failed';

interface ScanRecord {
  id:        string;
  type:      'scan';
  label:     string;
  ocrStatus: OcrStatus;
  ocrText:   string | null;
}

interface NoteRecord {
  id:   string;
  type: 'note';
  text: string;
}

type VisitRecord = ScanRecord | NoteRecord;

interface MockVisitDetail {
  date:       string;
  doctorName: string;
  clinicName: string;
  records:    VisitRecord[];
}

// ─── Mock data ────────────────────────────────────────────────────────────────

type DemoState = 'normal' | 'scan_pending' | 'scan_failed' | 'note_only';

const MOCK_VISITS: Record<DemoState, MockVisitDetail> = {
  normal: {
    date:       '10 May 2026',
    doctorName: 'Dr. Anand Krishnamurthy',
    clinicName: 'Krishnamurthy Clinic, Pune',
    records: [
      {
        id:        'r-001a',
        type:      'scan',
        label:     'Prescription',
        ocrStatus: 'success',
        ocrText:
          'Tab. Paracetamol 500mg — twice daily × 5 days.\n' +
          'Tab. Cetirizine 10mg — at night × 3 days.\n' +
          'Syp. Benadryl 10ml — at night if needed.\n\n' +
          'Advice: Bed rest. Plenty of fluids. Avoid cold food.',
      },
      {
        id:   'r-001b',
        type: 'note',
        text: 'Patient reports fever since 3 days, maximum 101°F. No cough or cold. Throat slightly inflamed. No rash. Advised bed rest and increased fluids. Review after 5 days if fever persists.',
      },
    ],
  },
  scan_pending: {
    date:       '22 Nov 2025',
    doctorName: 'Dr. Meenakshi Iyer',
    clinicName: 'Iyer Family Clinic, Pune',
    records: [
      {
        id:        'r-003a',
        type:      'scan',
        label:     'Lab Report',
        ocrStatus: 'pending',
        ocrText:   null,
      },
    ],
  },
  scan_failed: {
    date:       '04 Aug 2025',
    doctorName: 'Dr. Anand Krishnamurthy',
    clinicName: 'Krishnamurthy Clinic, Pune',
    records: [
      {
        id:        'r-fail-a',
        type:      'scan',
        label:     'X-Ray Report',
        ocrStatus: 'failed',
        ocrText:   null,
      },
      {
        id:   'r-fail-b',
        type: 'note',
        text: 'Mild osteoarthritis Grade I in right knee. Prescribed physiotherapy — 10 sessions over 5 weeks. Avoid climbing stairs for 2 weeks. Review in 6 weeks.',
      },
    ],
  },
  note_only: {
    date:       '13 Mar 2024',
    doctorName: 'Dr. Meenakshi Iyer',
    clinicName: 'Iyer Family Clinic, Pune',
    records: [
      {
        id:   'r-004a',
        type: 'note',
        text: 'Streptococcal pharyngitis confirmed on examination. Tab. Amoxicillin 500mg — thrice daily × 7 days. Gargle with warm salt water 3 times a day. Avoid cold drinks. Review in 3 days if not improving.',
      },
    ],
  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScanCard({ record }: { record: ScanRecord }) {
  function handleViewScan() {
    Alert.alert(
      'View Full Document',
      'Full document viewer will be available in the next update.',
      [{ text: 'OK' }],
    );
  }

  return (
    <View style={styles.recordCard}>
      <View style={styles.recordCardHeader}>
        <Text style={styles.recordTypeIcon} accessible={false}>📄</Text>
        <Text style={styles.recordTypeName}>{record.label}</Text>
      </View>

      {/* Large document thumbnail — tappable */}
      <TouchableOpacity
        style={styles.scanThumbnail}
        onPress={handleViewScan}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${record.label} — tap to view full document`}
      >
        <Text style={styles.scanThumbnailIcon}>📄</Text>
        <Text style={styles.scanViewLabel}>View full document →</Text>
      </TouchableOpacity>

      {record.ocrStatus === 'success' && record.ocrText !== null && (
        <View style={styles.ocrBlock}>
          <Text style={styles.ocrSectionLabel}>DOCUMENT TEXT</Text>
          <Text
            style={styles.ocrText}
            accessibilityLabel={`Document text: ${record.ocrText}`}
          >
            {record.ocrText}
          </Text>
        </View>
      )}

      {record.ocrStatus === 'pending' && (
        <Text style={styles.ocrStatusPending}>
          Text being extracted — usually under a minute
        </Text>
      )}

      {record.ocrStatus === 'failed' && (
        <Text style={styles.ocrStatusFailed}>
          Text extraction was not successful. Ask clinic staff to rescan if text is needed.
        </Text>
      )}
    </View>
  );
}

function NoteCard({ record }: { record: NoteRecord }) {
  return (
    <View style={styles.recordCard}>
      <View style={styles.recordCardHeader}>
        <Text style={styles.recordTypeIcon} accessible={false}>✏</Text>
        <Text style={styles.recordTypeName}>Doctor's Note</Text>
      </View>
      <Text
        style={styles.noteText}
        accessibilityLabel={`Doctor's note: ${record.text}`}
      >
        {record.text}
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type NavProp       = NativeStackNavigationProp<RootStackParamList, 'PatientVisitDetail'>;
type RouteNavProp  = RouteProp<RootStackParamList, 'PatientVisitDetail'>;

export default function PatientVisitDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RouteNavProp>();

  // Production: use nav params. DEV mockup: override with mock data per demoState.
  const { date, doctorName, clinicName } = route.params;

  const [demoState, setDemoState] = useState<DemoState>('normal');

  const mockVisit      = MOCK_VISITS[demoState];
  const displayDate    = __DEV__ ? mockVisit.date       : date;
  const displayDoctor  = __DEV__ ? mockVisit.doctorName : doctorName;
  const displayClinic  = __DEV__ ? mockVisit.clinicName : clinicName;
  const records        = mockVisit.records;

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Nav header ── */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back to My Health Records"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} accessibilityRole="header">
          Visit Details
        </Text>
        {/* Spacer keeps title centred */}
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Visit info card ── */}
        <View style={styles.visitInfoCard}>
          <Text style={styles.visitDate}>{displayDate}</Text>
          <Text style={styles.visitDoctor}>{displayDoctor}</Text>
          <Text style={styles.visitClinic}>{displayClinic}</Text>
        </View>

        {/* ── Records ── */}
        <Text style={styles.sectionLabel}>RECORDS IN THIS VISIT</Text>

        {records.map((record) =>
          record.type === 'scan'
            ? <ScanCard key={record.id} record={record} />
            : <NoteCard key={record.id} record={record} />,
        )}

        {/* ── "Something wrong?" footer link ── */}
        <TouchableOpacity
          style={styles.flagLink}
          onPress={() =>
            Alert.alert(
              'Something wrong?',
              'You can flag an issue with this record. This feature will be available in an upcoming update.',
              [{ text: 'OK' }],
            )
          }
          accessibilityRole="button"
          accessibilityLabel="Report an issue with this visit record"
        >
          <Text style={styles.flagLinkText}>Something wrong? Let us know →</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* ── DEV demo switcher ── */}
      {__DEV__ && (
        <View style={styles.demoBlock}>
          <Text style={styles.demoTitle}>Demo states — mockup only</Text>
          <View style={styles.demoRow}>
            {(
              [
                ['normal',       'Normal'],
                ['scan_pending', 'Scan pending'],
                ['scan_failed',  'Scan failed'],
                ['note_only',    'Note only'],
              ] as [DemoState, string][]
            ).map(([state, label]) => (
              <TouchableOpacity
                key={state}
                style={[styles.demoBtn, demoState === state && styles.demoBtnActive]}
                onPress={() => setDemoState(state)}
                accessibilityLabel={`Demo state: ${label}`}
              >
                <Text style={styles.demoBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: Colors.background,
  },

  // ── Nav header
  navHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.md,
    backgroundColor:   Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    minHeight:         56,
  },
  backBtn: {
    minWidth:       60,
    minHeight:      44,
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize:   16,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },
  navTitle: {
    fontSize:   17,
    fontWeight: '600',
    color:      Colors.textPrimary,
  },
  navSpacer: {
    minWidth: 60,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop:        Spacing.xl,
    paddingBottom:     48,
  },

  // ── Visit info card
  visitInfoCard: {
    backgroundColor:  Colors.surface,
    borderRadius:     14,
    padding:          Spacing.xxl,
    marginBottom:     Spacing.xl,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 1 },
    shadowOpacity:    0.06,
    shadowRadius:     6,
    elevation:        2,
  },
  visitDate: {
    fontSize:     22,
    fontWeight:   '700',
    color:        Colors.primaryBlue,
    marginBottom: 6,
  },
  visitDoctor: {
    fontSize:     17,
    fontWeight:   '600',
    color:        Colors.textPrimary,
    marginBottom: 3,
  },
  visitClinic: {
    fontSize: 14,
    color:    Colors.textSecondary,
  },

  // ── Section label
  sectionLabel: {
    fontSize:      11,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom:  Spacing.sm,
    marginLeft:    4,
  },

  // ── Record card (shared base)
  recordCard: {
    backgroundColor:  Colors.surface,
    borderRadius:     14,
    padding:          Spacing.xxl,
    marginBottom:     Spacing.md,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 1 },
    shadowOpacity:    0.06,
    shadowRadius:     6,
    elevation:        2,
  },
  recordCardHeader: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.sm,
    marginBottom:  Spacing.md,
  },
  recordTypeIcon: {
    fontSize: 20,
  },
  recordTypeName: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.textPrimary,
  },

  // ── Scan thumbnail (large, tappable)
  scanThumbnail: {
    height:          160,
    borderRadius:    10,
    backgroundColor: '#EFF6FF',
    borderWidth:     1.5,
    borderColor:     '#BFDBFE',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing.md,
  },
  scanThumbnailIcon: {
    fontSize:     48,
    marginBottom: Spacing.sm,
  },
  scanViewLabel: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },

  // ── OCR text block
  ocrBlock: {
    backgroundColor: '#F8FAFF',
    borderRadius:    8,
    padding:         Spacing.md,
    borderWidth:     1,
    borderColor:     '#E0EAFF',
  },
  ocrSectionLabel: {
    fontSize:      11,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom:  Spacing.sm,
  },
  ocrText: {
    fontSize:   15,
    color:      Colors.textPrimary,
    lineHeight: 24,
  },

  // ── OCR status messages
  ocrStatusPending: {
    fontSize:   14,
    color:      Colors.warning,
    lineHeight: 20,
  },
  ocrStatusFailed: {
    fontSize:   14,
    color:      Colors.textSecondary,
    lineHeight: 20,
  },

  // ── Note card body
  noteText: {
    fontSize:   15,
    color:      Colors.textPrimary,
    lineHeight: 24,
  },

  // ── "Something wrong?" footer link
  flagLink: {
    alignItems:     'center',
    paddingVertical: Spacing.xl,
    minHeight:      48,
    justifyContent: 'center',
  },
  flagLinkText: {
    fontSize:           14,
    color:              Colors.textSecondary,
    textDecorationLine: 'underline',
  },

  // ── DEV demo switcher
  demoBlock: {
    padding:         Spacing.md,
    backgroundColor: '#FFFBEB',
    borderTopWidth:  1,
    borderTopColor:  '#FCD34D',
  },
  demoTitle: {
    fontSize:      11,
    fontWeight:    '700',
    color:         '#92400E',
    textAlign:     'center',
    marginBottom:  6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  demoRow: {
    flexDirection:  'row',
    gap:            Spacing.sm,
    justifyContent: 'center',
    flexWrap:       'wrap',
  },
  demoBtn: {
    backgroundColor:   '#D97706',
    paddingVertical:   6,
    paddingHorizontal: 12,
    borderRadius:      6,
  },
  demoBtnActive: {
    backgroundColor: '#92400E',
  },
  demoBtnText: {
    color:      '#FFFFFF',
    fontSize:   12,
    fontWeight: '600',
  },
});
