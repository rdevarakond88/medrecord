/**
 * PatientVisitDetailScreen.tsx — P3: Visit Record Detail (Patient View)
 *
 * Spec:    docs/ui-ux-spec.md § P3 (Visit Record Detail)
 * PM:      reviews/P1-P5-pm-review.md
 *
 * Live screen — wired to real API.
 *   GET /patient/visits/:visitId → full visit with all visible records.
 *   Auth: patient JWT from usePatientAuthStore.
 *   Header (date, doctor, clinic) comes from nav params — already formatted by P2.
 *   Records (scans + notes) fetched from server on mount.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiFetch } from '../../api/apiClient';
import { usePatientAuthStore } from '../../store/usePatientAuthStore';
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

// ─── Server response types ────────────────────────────────────────────────────

interface ServerRecord {
  id:           string;
  type:         'scan' | 'note';
  content_text: string | null;
  ocr_status:   OcrStatus | null;
}

interface ServerVisitDetail {
  id:          string;
  visit_date:  string;
  doctor_name: string;
  clinic_name: string | null;
  summary:     string | null;
  records:     ServerRecord[];
}

function toVisitRecord(r: ServerRecord): VisitRecord {
  if (r.type === 'note') {
    return { id: r.id, type: 'note', text: r.content_text ?? '' };
  }
  return {
    id:        r.id,
    type:      'scan',
    label:     'Scanned Document',
    ocrStatus: r.ocr_status ?? 'pending',
    ocrText:   r.content_text,
  };
}

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

      {/* Neutral document card — tappable. P3-PC-S1: no blue-tinted image frame. */}
      <TouchableOpacity
        style={styles.scanDocCard}
        onPress={handleViewScan}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`${record.label} — tap to view full document`}
      >
        <Text style={styles.scanDocIcon} accessible={false}>📄</Text>
        <Text style={styles.scanDocName}>{record.label}</Text>
        <Text style={styles.scanDocCta}>View full document →</Text>
      </TouchableOpacity>
      {/* P3-PC-S1: hint text outside the tappable area */}
      <Text style={styles.scanHint}>Tap the document to view the original scan</Text>

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

type NavProp      = NativeStackNavigationProp<RootStackParamList, 'PatientVisitDetail'>;
type RouteNavProp = RouteProp<RootStackParamList, 'PatientVisitDetail'>;

export default function PatientVisitDetailScreen() {
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RouteNavProp>();
  const { token }  = usePatientAuthStore();

  const { visitId, date, doctorName, clinicName } = route.params;

  const [records,    setRecords]    = useState<VisitRecord[]>([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      navigation.replace('PatientLogin');
      return;
    }

    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setFetchError(null);
      try {
        const data = await apiFetch<{ visit: ServerVisitDetail }>(
          `/patient/visits/${visitId}`,
          token!,
        );
        if (!cancelled) {
          setRecords(data.visit.records.map(toVisitRecord));
        }
      } catch {
        if (!cancelled) {
          setFetchError('Could not load visit details. Please go back and try again.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [visitId, token]);   // eslint-disable-line react-hooks/exhaustive-deps

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
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Visit info card ── */}
        <View style={styles.visitInfoCard}>
          <Text style={styles.visitDate}>{date}</Text>
          <Text style={styles.visitDoctor}>{doctorName}</Text>
          <Text style={styles.visitClinic}>{clinicName}</Text>
        </View>

        {/* ── Records ── */}
        <Text style={styles.sectionLabel}>RECORDS IN THIS VISIT</Text>

        {isLoading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
          </View>
        ) : fetchError ? (
          <View style={styles.loadingBlock}>
            <Text style={styles.errorText}>{fetchError}</Text>
          </View>
        ) : records.length === 0 ? (
          <View style={styles.loadingBlock}>
            <Text style={styles.errorText}>No records found for this visit.</Text>
          </View>
        ) : (
          records.map((record) =>
            record.type === 'scan'
              ? <ScanCard key={record.id} record={record} />
              : <NoteCard key={record.id} record={record} />,
          )
        )}

        {/* ── "Something wrong?" footer link ── */}
        {!isLoading && !fetchError && (
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
            <Text style={styles.flagLinkText}>⚑  Something wrong? Let us know</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

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

  // ── Section label — P3-PC-S2: 11px → 12px minimum
  sectionLabel: {
    fontSize:      12,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    letterSpacing: 0.8,
    marginBottom:  Spacing.sm,
    marginLeft:    4,
  },

  // ── Loading / error
  loadingBlock: {
    paddingVertical: 40,
    alignItems:      'center',
  },
  errorText: {
    fontSize:   14,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 20,
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

  // ── Scan document card (P3-PC-S1: neutral, not blue-tinted image frame)
  scanDocCard: {
    backgroundColor: '#F8F9FA',
    borderRadius:    10,
    padding:         Spacing.xl,
    alignItems:      'center',
    marginBottom:    Spacing.sm,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  scanDocIcon: {
    fontSize:     40,
    marginBottom: Spacing.sm,
  },
  scanDocName: {
    fontSize:     14,
    fontWeight:   '600',
    color:        Colors.textPrimary,
    marginBottom: 6,
  },
  scanDocCta: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },
  scanHint: {
    fontSize:     12,
    color:        Colors.textSecondary,
    textAlign:    'center',
    marginBottom: Spacing.md,
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
    fontSize:      12,
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
    alignItems:      'center',
    paddingVertical: Spacing.xl,
    minHeight:       48,
    justifyContent:  'center',
  },
  flagLinkText: {
    fontSize:   14,
    color:      'rgba(26, 32, 44, 0.70)',
    fontWeight: '500',
  },
});
