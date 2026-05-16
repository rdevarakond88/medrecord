/**
 * PatientTimelineScreen.tsx — P2: My Records Timeline
 *
 * Spec:    docs/ui-ux-spec.md § P2 (My Records / Timeline)
 * PM:      reviews/P1-P5-pm-review.md
 *
 * MOCKUP — all data is hardcoded. No real API calls.
 *
 * Wire step will:
 *   1. Replace MOCK_TIMELINE_DATA with a React Query hook calling
 *      GET /patient/timeline (patient-facing endpoint — not yet built).
 *   2. Pass real patientId from patient auth state.
 *   3. Implement thumbnail lazy-loading from local filesystem / S3.
 *   4. Wire "By Doctor" / "By Clinic" filter to server-side params or
 *      client-side filter over cached data.
 *
 * States shown: has-data (grouped by year / doctor / clinic), empty state.
 * Toggle via DEV demo switcher at bottom.
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

type FilterOption = 'all' | 'by_doctor' | 'by_clinic';

interface ScanRecord {
  id:           string;
  type:         'scan';
  thumbnailUri: string | null;
  ocrPreview:   string | null;
}

interface NoteRecord {
  id:      string;
  type:    'note';
  preview: string;
}

type VisitRecord = ScanRecord | NoteRecord;

interface VisitEntry {
  id:          string;
  date:        string; // DD/MM/YYYY
  year:        string; // for section grouping
  doctorName:  string;
  clinicName:  string;
  summary:     string | null; // chief complaint / visit summary
  records:     VisitRecord[];
}

type ListItem =
  | { kind: 'year_header';  year: string }
  | { kind: 'group_header'; label: string }
  | { kind: 'visit';        entry: VisitEntry };

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_TIMELINE: VisitEntry[] = [
  {
    id:         'v-2026-001',
    date:       '10/05/2026',
    year:       '2026',
    doctorName: 'Dr. Anand Krishnamurthy',
    clinicName: 'Krishnamurthy Clinic, Pune',
    summary:    'Fever and body ache — 3 days',
    records: [
      {
        id:           'r-001a',
        type:         'scan',
        thumbnailUri: null,
        ocrPreview:   'Tab. Paracetamol 500mg — twice daily × 5 days. Tab. Cetirizine 10mg — at night.',
      },
      {
        id:           'r-001b',
        type:         'note',
        preview:      'Patient reports fever since 3 days, max 101°F. No cough. Advised rest and fluids.',
      },
    ],
  },
  {
    id:         'v-2025-003',
    date:       '22/11/2025',
    year:       '2025',
    doctorName: 'Dr. Meenakshi Iyer',
    clinicName: 'Iyer Family Clinic, Pune',
    summary:    'Annual health check-up',
    records: [
      {
        id:           'r-003a',
        type:         'scan',
        thumbnailUri: null,
        ocrPreview:   'Blood pressure: 118/76 mmHg. Blood glucose (fasting): 92 mg/dL. Haemoglobin: 13.2 g/dL.',
      },
    ],
  },
  {
    id:         'v-2025-002',
    date:       '04/08/2025',
    year:       '2025',
    doctorName: 'Dr. Anand Krishnamurthy',
    clinicName: 'Krishnamurthy Clinic, Pune',
    summary:    'Knee pain — right knee',
    records: [
      {
        id:           'r-002a',
        type:         'note',
        preview:      'Mild osteoarthritis Grade I. Prescribed physiotherapy — 10 sessions. Avoid stairs for 2 weeks.',
      },
      {
        id:           'r-002b',
        type:         'scan',
        thumbnailUri: null,
        ocrPreview:   'X-Ray Right Knee: Mild joint space narrowing. No fracture or effusion.',
      },
    ],
  },
  {
    id:         'v-2024-001',
    date:       '13/03/2024',
    year:       '2024',
    doctorName: 'Dr. Meenakshi Iyer',
    clinicName: 'Iyer Family Clinic, Pune',
    summary:    'Throat infection',
    records: [
      {
        id:           'r-004a',
        type:         'note',
        preview:      'Streptococcal pharyngitis. Tab. Amoxicillin 500mg — thrice daily × 7 days. Gargle with warm salt water.',
      },
    ],
  },
];

// ─── Helpers: build flat list items ──────────────────────────────────────────

function buildListItems(visits: VisitEntry[], filter: FilterOption): ListItem[] {
  if (filter === 'by_doctor') return buildGroupedItems(visits, 'by_doctor');
  if (filter === 'by_clinic') return buildGroupedItems(visits, 'by_clinic');

  // 'all': group by year
  const items: ListItem[] = [];
  let currentYear = '';
  for (const entry of visits) {
    if (entry.year !== currentYear) {
      items.push({ kind: 'year_header', year: entry.year });
      currentYear = entry.year;
    }
    items.push({ kind: 'visit', entry });
  }
  return items;
}

function buildGroupedItems(
  visits: VisitEntry[],
  groupBy: 'by_doctor' | 'by_clinic',
): ListItem[] {
  const groups = new Map<string, VisitEntry[]>();
  for (const entry of visits) {
    const key = groupBy === 'by_doctor' ? entry.doctorName : entry.clinicName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(entry);
  }

  const items: ListItem[] = [];
  for (const [label, groupVisits] of groups) {
    items.push({ kind: 'group_header', label });
    for (const entry of groupVisits) {
      items.push({ kind: 'visit', entry });
    }
  }
  return items;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function YearHeader({ year }: { year: string }) {
  return (
    <View style={styles.yearHeaderRow}>
      <Text style={styles.yearHeaderText}>{year}</Text>
      <View style={styles.yearHeaderLine} />
    </View>
  );
}

function GroupHeader({ label }: { label: string }) {
  return (
    <View style={styles.groupHeaderRow}>
      <View style={styles.groupHeaderLine} />
      <Text style={styles.groupHeaderText} numberOfLines={1}>{label}</Text>
      <View style={styles.groupHeaderLine} />
    </View>
  );
}

function RecordRow({ record }: { record: VisitRecord }) {
  if (record.type === 'scan') {
    return (
      <View style={styles.recordRow}>
        <View
          style={styles.scanThumbPlaceholder}
          accessible
          accessibilityLabel="Scanned document thumbnail"
        >
          <Text style={styles.scanThumbIcon}>📄</Text>
        </View>
        <Text
          style={styles.recordPreview}
          numberOfLines={2}
          accessibilityLabel={`Document text: ${record.ocrPreview ?? 'No text extracted'}`}
        >
          {record.ocrPreview ?? 'Text not yet extracted'}
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.recordRow}>
      <View style={styles.noteIcon} accessible={false}>
        <Text style={styles.noteIconText}>✏</Text>
      </View>
      <Text
        style={styles.recordPreview}
        numberOfLines={2}
        accessibilityLabel={`Doctor's note: ${record.preview}`}
      >
        {record.preview}
      </Text>
    </View>
  );
}

interface VisitCardProps {
  entry:          VisitEntry;
  expanded:       boolean;
  onToggle:       () => void;
  onViewDetails:  () => void;
}

function VisitCard({ entry, expanded, onToggle, onViewDetails }: VisitCardProps) {
  const scanCount  = entry.records.filter((r) => r.type === 'scan').length;
  const noteCount  = entry.records.filter((r) => r.type === 'note').length;
  const countParts: string[] = [];
  if (scanCount > 0) countParts.push(`${scanCount} Document${scanCount > 1 ? 's' : ''}`);
  if (noteCount > 0) countParts.push(`${noteCount} Doctor's note${noteCount > 1 ? 's' : ''}`);
  const recordSummary = countParts.join(', ');

  return (
    <TouchableOpacity
      style={styles.visitCard}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Visit on ${entry.date} at ${entry.clinicName}. ${entry.summary ?? 'No summary'}. ${recordSummary}. Tap to ${expanded ? 'hide records' : 'view records'}.`}
      accessibilityState={{ expanded }}
    >
      {/* ── Card header ── */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.visitDate}>{entry.date}</Text>
          <Text style={styles.doctorName}>{entry.doctorName}</Text>
          <Text style={styles.clinicName}>{entry.clinicName}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <Text style={styles.expandChevron}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </View>

      {/* ── Visit summary ── */}
      {entry.summary !== null && (
        <Text style={styles.visitSummary}>{entry.summary}</Text>
      )}

      {/* ── Record count pill ── */}
      <View style={styles.recordCountRow}>
        <View style={styles.recordCountPill}>
          <Text style={styles.recordCountText}>{recordSummary}</Text>
        </View>
      </View>

      {/* ── Expand / collapse tap cue ── */}
      <Text style={styles.expandLink}>
        {expanded ? 'Hide records ▲' : 'View records →'}
      </Text>

      {/* ── Expanded records ── */}
      {expanded && (
        <View style={styles.recordList}>
          <View style={styles.recordDivider} />
          {entry.records.map((record) => (
            <RecordRow key={record.id} record={record} />
          ))}
          <TouchableOpacity
            style={styles.viewDetailsBtn}
            onPress={onViewDetails}
            accessibilityRole="button"
            accessibilityLabel={`View full details for visit on ${entry.date}`}
          >
            <Text style={styles.viewDetailsBtnText}>View full details →</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIllustration} accessible={false}>
        <Text style={styles.emptyIllustrationIcon}>🏥</Text>
      </View>
      <Text style={styles.emptyTitle}>No records yet</Text>
      <Text style={styles.emptyBody}>
        Your health records will appear here after your first clinic visit.
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PatientTimelineScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [filter,       setFilter]       = useState<FilterOption>('all');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [showEmpty,    setShowEmpty]    = useState(false);

  const visits    = showEmpty ? [] : MOCK_TIMELINE;
  const listItems = buildListItems(visits, filter);

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  function handleViewDetails(entry: VisitEntry) {
    navigation.navigate('PatientVisitDetail', {
      visitId:    entry.id,
      date:       entry.date,
      doctorName: entry.doctorName,
      clinicName: entry.clinicName,
    });
  }

  function renderItem({ item }: { item: ListItem }) {
    if (item.kind === 'year_header')  return <YearHeader year={item.year} />;
    if (item.kind === 'group_header') return <GroupHeader label={item.label} />;
    return (
      <VisitCard
        entry={item.entry}
        expanded={expandedId === item.entry.id}
        onToggle={() => handleToggle(item.entry.id)}
        onViewDetails={() => handleViewDetails(item.entry)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          My Health Records
        </Text>
      </View>

      {/* ── Filter bar ── */}
      <View style={styles.filterBar} accessibilityRole="tablist">
        {(
          [
            ['all',       'All'],
            ['by_doctor', 'By Doctor'],
            ['by_clinic', 'By Clinic'],
          ] as [FilterOption, string][]
        ).map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[
              styles.filterChip,
              filter === value && styles.filterChipActive,
            ]}
            onPress={() => { setFilter(value); setExpandedId(null); }}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: filter === value }}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === value && styles.filterChipTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Timeline list / empty state ── */}
      {visits.length === 0 ? (
        <EmptyState />
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => {
            if (item.kind === 'year_header')  return `year-${item.year}`;
            if (item.kind === 'group_header') return `group-${item.label}`;
            return item.entry.id;
          }}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── DEV demo switcher ── */}
      {__DEV__ && (
        <View style={styles.demoBlock}>
          <Text style={styles.demoTitle}>Demo states — mockup only</Text>
          <View style={styles.demoRow}>
            <TouchableOpacity
              style={[styles.demoBtn, !showEmpty && styles.demoBtnActive]}
              onPress={() => { setShowEmpty(false); setExpandedId(null); }}
              accessibilityLabel="Demo state: Has data"
            >
              <Text style={styles.demoBtnText}>Has data</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.demoBtn, showEmpty && styles.demoBtnActive]}
              onPress={() => setShowEmpty(true)}
              accessibilityLabel="Demo state: Empty"
            >
              <Text style={styles.demoBtnText}>Empty</Text>
            </TouchableOpacity>
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

  // ── Filter bar
  filterBar: {
    flexDirection:     'row',
    paddingHorizontal: Spacing.xxl,
    paddingVertical:   Spacing.md,
    backgroundColor:   Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap:               Spacing.sm,
  },
  filterChip: {
    paddingVertical:   7,
    paddingHorizontal: Spacing.lg,
    borderRadius:      20,
    borderWidth:       1.5,
    borderColor:       Colors.border,
    backgroundColor:   Colors.background,
    minHeight:         36,
    justifyContent:    'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primaryBlue,
    borderColor:     Colors.primaryBlue,
  },
  filterChipText: {
    fontSize:   14,
    fontWeight: '500',
    color:      Colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // ── Timeline list
  listContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop:        Spacing.xl,
    paddingBottom:     80,
  },

  // ── Year header
  yearHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   Spacing.md,
    marginTop:      Spacing.lg,
  },
  yearHeaderText: {
    fontSize:      13,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    marginRight:   Spacing.sm,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  yearHeaderLine: {
    flex:            1,
    height:          1,
    backgroundColor: Colors.border,
  },

  // ── Group header (By Doctor / By Clinic)
  groupHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    marginBottom:   Spacing.md,
    marginTop:      Spacing.lg,
    gap:            Spacing.sm,
  },
  groupHeaderText: {
    fontSize:      13,
    fontWeight:    '600',
    color:         Colors.textSecondary,
    flexShrink:    1,
    letterSpacing: 0.2,
  },
  groupHeaderLine: {
    flex:            1,
    height:          1,
    backgroundColor: Colors.border,
  },

  // ── Visit card
  visitCard: {
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
  cardHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardHeaderRight: {
    paddingLeft: Spacing.sm,
    paddingTop:  2,
  },
  // P2-PC-M1: chevron is now visible (was 11px textDisabled)
  expandChevron: {
    fontSize: 14,
    color:    Colors.textSecondary,
  },
  visitDate: {
    fontSize:     13,
    fontWeight:   '600',
    color:        Colors.primaryBlue,
    marginBottom: 3,
  },
  doctorName: {
    fontSize:     16,
    fontWeight:   '600',
    color:        Colors.textPrimary,
    marginBottom: 2,
  },
  clinicName: {
    fontSize: 13,
    color:    Colors.textSecondary,
  },
  // P2-PC-S4: no italic; regular weight with dimmed colour
  visitSummary: {
    fontSize:   14,
    color:      Colors.textSecondary,
    marginTop:  Spacing.sm,
    lineHeight: 20,
  },
  recordCountRow: {
    flexDirection: 'row',
    marginTop:     Spacing.sm,
  },
  recordCountPill: {
    backgroundColor:  Colors.background,
    borderRadius:     12,
    paddingVertical:  3,
    paddingHorizontal: Spacing.sm,
    borderWidth:      1,
    borderColor:      Colors.border,
  },
  recordCountText: {
    fontSize:   12,
    color:      Colors.textSecondary,
    fontWeight: '500',
  },
  // P2-PC-M1: prominent tap cue below pill
  expandLink: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.primaryBlue,
    marginTop:  Spacing.sm,
  },

  // ── Expanded records
  recordList: {
    marginTop: Spacing.sm,
  },
  recordDivider: {
    height:          1,
    backgroundColor: Colors.border,
    marginBottom:    Spacing.md,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    marginBottom:  Spacing.sm,
    gap:           Spacing.sm,
  },
  scanThumbPlaceholder: {
    width:           52,
    height:          52,
    borderRadius:    8,
    backgroundColor: '#EFF6FF',
    borderWidth:     1,
    borderColor:     '#BFDBFE',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  // P2-PC-S1: document emoji replaces "IMG" text
  scanThumbIcon: {
    fontSize: 22,
  },
  noteIcon: {
    width:           52,
    height:          52,
    borderRadius:    8,
    backgroundColor: '#F0FDF4',
    borderWidth:     1,
    borderColor:     '#BBF7D0',
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  noteIconText: {
    fontSize: 20,
  },
  recordPreview: {
    flex:       1,
    fontSize:   14,
    color:      Colors.textSecondary,
    lineHeight: 20,
    paddingTop: 2,
  },
  viewDetailsBtn: {
    alignSelf:      'flex-start',
    marginTop:      Spacing.sm,
    minHeight:      44,
    justifyContent: 'center',
  },
  viewDetailsBtnText: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },

  // ── Empty state
  emptyState: {
    flex:              1,
    alignItems:        'center',
    justifyContent:    'center',
    paddingHorizontal: 40,
    paddingBottom:     60,
  },
  emptyIllustration: {
    width:           100,
    height:          100,
    borderRadius:    50,
    backgroundColor: '#EFF6FF',
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing.xxl,
  },
  emptyIllustrationIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize:     20,
    fontWeight:   '700',
    color:        Colors.textPrimary,
    marginBottom: Spacing.sm,
    textAlign:    'center',
  },
  emptyBody: {
    fontSize:   15,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 22,
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
  },
  demoBtn: {
    backgroundColor:  '#D97706',
    paddingVertical:  6,
    paddingHorizontal: 16,
    borderRadius:     6,
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
