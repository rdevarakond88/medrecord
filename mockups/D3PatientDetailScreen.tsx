/**
 * D3PatientDetailScreen.tsx
 * D3 — Patient Detail / History
 * Static mockup — implements ui-ux-spec.md § D3
 *
 * Three exported variants:
 *   D3PatientDetailHasDataConsentGranted  — visit list visible, green badge
 *                                           (pass offline={true} for offline banner)
 *   D3PatientDetailHasDataNoConsent       — amber badge, history grayed, Request Access
 *   D3PatientDetailEmptyState             — no visits, empty state message
 *
 * No real data wired. All content is static placeholder.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';

// ---------------------------------------------------------------------------
// Colour palette — ui-ux-spec.md
// ---------------------------------------------------------------------------
const C = {
  primaryBlue:   '#1A6DB5',
  primaryDark:   '#0F4880',
  surface:       '#FFFFFF',
  background:    '#F5F7FA',
  border:        '#E2E8F0',
  textPrimary:   '#1A202C',
  textSecondary: '#64748B',
  textDisabled:  '#CBD5E0',
  success:       '#16A34A',
  warning:       '#D97706',
  error:         '#DC2626',
};

// ---------------------------------------------------------------------------
// Placeholder data — Indian names, phone numbers, clinic names
// ---------------------------------------------------------------------------
const PATIENT = {
  name:           'Priya Venkataraman',
  mobileLastFive: '84627',   // full: +91 98765 84627 — masked to last 5 per PII rule
  age:            32,
};

interface Visit {
  id:             string;
  date:           string;          // DD/MM/YYYY
  chiefComplaint: string | null;
  clinicName:     string;
  recordCount:    number;
}

// Ordered newest-first (spec: visit list newest first)
const VISITS: Visit[] = [
  {
    id:             'v1',
    date:           '18/02/2026',
    chiefComplaint: 'Persistent cough and mild fever',
    clinicName:     'Sri Dhanvantri Clinic, Bangalore',
    recordCount:    3,
  },
  {
    id:             'v2',
    date:           '05/11/2025',
    chiefComplaint: 'Routine checkup',
    clinicName:     'Sri Dhanvantri Clinic, Bangalore',
    recordCount:    1,
  },
  {
    id:             'v3',
    date:           '14/07/2025',
    chiefComplaint: null,          // absent — card must look clean without it
    clinicName:     'Rajiv Gandhi PHC, Anekal',
    recordCount:    2,
  },
  {
    id:             'v4',
    date:           '02/03/2025',
    chiefComplaint: 'Knee pain, difficulty walking',
    clinicName:     'Sri Dhanvantri Clinic, Bangalore',
    recordCount:    5,
  },
];

// Short text shown when a visit card is expanded inline (first record preview)
const FIRST_RECORD_PREVIEW =
  'BP: 118/76 mmHg. Pulse: 82/min. Temp: 99.1°F. ' +
  'Patient presents with productive cough × 4 days, mild sore throat. ' +
  'No breathlessness. Chest clear on auscultation.';

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Amber offline banner — shown when device has no connection (spec § Offline State Indicators) */
function OfflineBanner() {
  return (
    <View style={styles.offlineBanner} accessibilityRole="alert">
      <View style={styles.offlineDot} />
      <Text style={styles.offlineBannerText}>
        Offline — showing last synced data
      </Text>
    </View>
  );
}

/** Patient name / mobile / age header — renders immediately from nav params, no API */
function PatientHeader({ hideAge }: { hideAge?: boolean }) {
  return (
    <View style={styles.patientHeader}>
      <Text style={styles.patientName}>{PATIENT.name}</Text>
      <Text style={styles.patientMobile}>
        {/* Last 5 digits only — PII rule from D2 debt, checklist item 2 */}
        {'\u2022\u2022\u2022\u2022\u2022 '}{PATIENT.mobileLastFive}
      </Text>
      {!hideAge && (
        <Text style={styles.patientAge}>{PATIENT.age} years</Text>
      )}
    </View>
  );
}

/** Green (granted) or amber (pending) consent badge */
function ConsentBadge({ granted }: { granted: boolean }) {
  const badgeBg   = granted ? '#DCFCE7' : '#FEF3C7';
  const dotColor  = granted ? C.success  : C.warning;
  const textColor = granted ? '#15803D'  : '#92400E';
  const label     = granted ? 'Access Granted' : 'Pending Consent';

  return (
    <View style={[styles.consentBadge, { backgroundColor: badgeBg }]}
          accessibilityRole="text"
          accessibilityLabel={`Consent status: ${label}`}>
      <View style={[styles.consentDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.consentBadgeText, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
}

/** Single visit card — grayed when consent is not granted */
function VisitCard({
  visit,
  grayed = false,
  expanded = false,
  onPress,
}: {
  visit:     Visit;
  grayed?:   boolean;
  expanded?: boolean;
  onPress?:  () => void;
}) {
  const recordLabel =
    visit.recordCount === 1 ? '1 record' : `${visit.recordCount} records`;

  return (
    <TouchableOpacity
      style={[styles.visitCard, grayed && styles.visitCardGrayed]}
      onPress={onPress}
      activeOpacity={grayed ? 1 : 0.7}
      disabled={grayed}
      accessibilityLabel={
        grayed
          ? 'Visit history hidden — consent required'
          : `Visit on ${visit.date}${visit.chiefComplaint ? ', ' + visit.chiefComplaint : ''}, ${recordLabel}`
      }
    >
      {/* Row: date + record count pill */}
      <View style={styles.visitCardTopRow}>
        <Text style={[styles.visitDate, grayed && styles.textGrayed]}>
          {visit.date}
        </Text>
        <View style={styles.recordCountPill}>
          <Text style={[styles.recordCountText, grayed && styles.textGrayed]}>
            {recordLabel}
          </Text>
        </View>
      </View>

      {/* Chief complaint — omitted cleanly when absent (checklist item 8) */}
      {visit.chiefComplaint ? (
        <Text
          style={[styles.visitComplaint, grayed && styles.textGrayed]}
          numberOfLines={2}
        >
          {visit.chiefComplaint}
        </Text>
      ) : null}

      {/* Clinic name */}
      <Text style={[styles.visitClinic, grayed && styles.textGrayed]}>
        {visit.clinicName}
      </Text>

      {/* Inline expanded preview — shown only when tapped and consent granted */}
      {expanded && !grayed && (
        <View style={styles.inlinePreview}>
          <View style={styles.inlinePreviewDivider} />
          <Text style={styles.inlinePreviewLabel}>FIRST RECORD</Text>
          <Text style={styles.inlinePreviewText} numberOfLines={3}>
            {FIRST_RECORD_PREVIEW}
          </Text>
          {/* "View Full Visit" touch target — min 48px height (checklist item 14) */}
          <TouchableOpacity
            style={styles.viewFullVisitButton}
            accessibilityLabel="View full visit"
          >
            <Text style={styles.viewFullVisitText}>View Full Visit</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Variant 1 — Has data + consent granted
// Shows the full visit list, green badge, inline expand on card tap.
// Pass offline={true} to show the offline banner (checklist item 13).
// ---------------------------------------------------------------------------
export function D3PatientDetailHasDataConsentGranted({
  offline = false,
}: {
  offline?: boolean;
} = {}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleCardPress(id: string) {
    // Toggle expand; second tap collapses (same card) or navigates via "View Full Visit"
    setExpandedId(prev => (prev === id ? null : id));
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      {offline && <OfflineBanner />}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PatientHeader />
        <ConsentBadge granted={true} />

        {/* New Visit — full width, blue, always visible (checklist items 6, 21) */}
        <TouchableOpacity
          style={styles.newVisitButton}
          activeOpacity={0.8}
          accessibilityLabel="New Visit"
          accessibilityRole="button"
        >
          <Text style={styles.newVisitButtonText}>+ New Visit</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>Visit History</Text>

        {VISITS.map(visit => (
          <VisitCard
            key={visit.id}
            visit={visit}
            expanded={expandedId === visit.id}
            onPress={() => handleCardPress(visit.id)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 2 — Has data + no consent
// Amber badge, visit list grayed out, consent gate message, Request Access button.
// "New Visit" remains active — creates implicit consent request (spec § D3 Behaviour).
// ---------------------------------------------------------------------------
export function D3PatientDetailHasDataNoConsent() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <PatientHeader />
        <ConsentBadge granted={false} />

        {/* New Visit — always active even without consent (checklist items 6, 22, 38) */}
        <TouchableOpacity
          style={styles.newVisitButton}
          activeOpacity={0.8}
          accessibilityLabel="New Visit"
          accessibilityRole="button"
        >
          <Text style={styles.newVisitButtonText}>+ New Visit</Text>
        </TouchableOpacity>

        {/* Consent gate — explains why history is grayed + Request Access CTA (checklist items 11, 12, 39, 40) */}
        <View style={styles.consentGateBox}>
          <Text style={styles.consentGateTitle}>Visit History Hidden</Text>
          <Text style={styles.consentGateBody}>
            Request patient consent to view visit history
          </Text>
          <TouchableOpacity
            style={styles.requestAccessButton}
            activeOpacity={0.8}
            accessibilityLabel="Request patient access"
            accessibilityRole="button"
          >
            <Text style={styles.requestAccessButtonText}>Request Access</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Visit History</Text>

        {/* Visit cards grayed — history exists but hidden (checklist item 41) */}
        {VISITS.map(visit => (
          <VisitCard key={visit.id} visit={visit} grayed={true} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 3 — Empty state
// Brand new patient — zero visits anywhere.  Shows empty state message,
// not a grayed consent view (checklist item 42).
// ---------------------------------------------------------------------------
export function D3PatientDetailEmptyState() {
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={C.surface} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Age absent for new patient — header handles it gracefully (checklist item 3) */}
        <PatientHeader hideAge />
        <ConsentBadge granted={true} />

        {/* New Visit — primary action still first and prominent */}
        <TouchableOpacity
          style={styles.newVisitButton}
          activeOpacity={0.8}
          accessibilityLabel="New Visit"
          accessibilityRole="button"
        >
          <Text style={styles.newVisitButtonText}>+ New Visit</Text>
        </TouchableOpacity>

        {/* Empty state — spec exact wording (checklist item 10, 33) */}
        <View style={styles.emptyState}>
          <View style={styles.emptyStateIconBox}>
            <View style={styles.emptyStateIconLine} />
            <View style={[styles.emptyStateIconLine, { width: 40 }]} />
            <View style={[styles.emptyStateIconLine, { width: 32 }]} />
          </View>
          <Text style={styles.emptyStateText}>
            No previous records.{'\n'}Start the first visit.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Default export — variant 1 (online, consent granted)
export default D3PatientDetailHasDataConsentGranted;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: C.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding:       16,
    paddingBottom: 48,
  },

  // --- Offline banner ---
  offlineBanner: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical:   10,
    gap:               8,
  },
  offlineDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
    backgroundColor: C.warning,
  },
  offlineBannerText: {
    fontSize:   14,
    fontWeight: '500',
    color:      '#92400E',
  },

  // --- Patient header ---
  patientHeader: {
    backgroundColor: C.surface,
    borderRadius:    12,
    padding:         16,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     C.border,
  },
  patientName: {
    fontSize:    22,
    fontWeight:  '600',
    color:       C.primaryDark,
    marginBottom: 4,
  },
  patientMobile: {
    fontSize:    14,
    color:       C.textSecondary,
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  patientAge: {
    fontSize: 14,
    color:    C.textSecondary,
  },

  // --- Consent badge ---
  consentBadge: {
    flexDirection:  'row',
    alignItems:     'center',
    alignSelf:      'flex-start',
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderRadius:   20,
    marginBottom:   16,
    gap:             6,
  },
  consentDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  consentBadgeText: {
    fontSize:   13,
    fontWeight: '600',
  },

  // --- New Visit button (full width, 56px height — preferred primary action size) ---
  newVisitButton: {
    backgroundColor: C.primaryBlue,
    borderRadius:    10,
    paddingVertical: 16,
    alignItems:      'center',
    marginBottom:    24,
    minHeight:       56,
    justifyContent:  'center',
  },
  newVisitButtonText: {
    color:      C.surface,
    fontSize:   18,
    fontWeight: '600',
  },

  // --- Section label ---
  sectionLabel: {
    fontSize:      12,
    fontWeight:    '600',
    color:         C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom:   8,
  },

  // --- Visit card ---
  visitCard: {
    backgroundColor: C.surface,
    borderRadius:    10,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     C.border,
    minHeight:       48,
  },
  visitCardGrayed: {
    opacity: 0.4,
  },
  visitCardTopRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:    4,
  },
  visitDate: {
    fontSize:   14,
    fontWeight: '600',
    color:      C.textPrimary,
  },
  recordCountPill: {
    backgroundColor: C.background,
    borderRadius:    10,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  recordCountText: {
    fontSize: 12,
    color:    C.textSecondary,
  },
  visitComplaint: {
    fontSize:     15,
    color:        C.textPrimary,
    marginBottom: 4,
    lineHeight:   20,
  },
  visitClinic: {
    fontSize: 12,
    color:    C.textSecondary,
  },
  textGrayed: {
    color: C.textDisabled,
  },

  // --- Inline expanded preview ---
  inlinePreview: {
    marginTop: 12,
  },
  inlinePreviewDivider: {
    height:          1,
    backgroundColor: C.border,
    marginBottom:    12,
  },
  inlinePreviewLabel: {
    fontSize:      11,
    fontWeight:    '600',
    color:         C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:   4,
  },
  inlinePreviewText: {
    fontSize:     13,
    color:        C.textSecondary,
    lineHeight:   18,
    marginBottom: 8,
  },
  // Touch target min 48px (checklist item 14, WCAG AA)
  viewFullVisitButton: {
    alignSelf:      'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight:      48,
    justifyContent: 'center',
  },
  viewFullVisitText: {
    fontSize:   14,
    fontWeight: '600',
    color:      C.primaryBlue,
  },

  // --- Consent gate box (no-consent variant) ---
  consentGateBox: {
    backgroundColor: '#FFFBEB',
    borderWidth:     1,
    borderColor:     '#FDE68A',
    borderRadius:    10,
    padding:         16,
    marginBottom:    16,
    alignItems:      'center',
  },
  consentGateTitle: {
    fontSize:     15,
    fontWeight:   '600',
    color:        '#78350F',
    marginBottom:  4,
  },
  consentGateBody: {
    fontSize:     14,
    color:        '#92400E',
    textAlign:    'center',
    lineHeight:    20,
    marginBottom: 14,
  },
  // Min 48px height (checklist item 14)
  requestAccessButton: {
    backgroundColor: C.warning,
    borderRadius:    8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    minHeight:       48,
    justifyContent:  'center',
    alignItems:      'center',
  },
  requestAccessButtonText: {
    color:      C.surface,
    fontSize:   15,
    fontWeight: '600',
  },

  // --- Empty state ---
  emptyState: {
    alignItems:     'center',
    justifyContent: 'center',
    paddingVertical: 56,
  },
  // Simple document placeholder icon — three stacked lines
  emptyStateIconBox: {
    alignItems:    'center',
    marginBottom:  20,
    gap:            6,
  },
  emptyStateIconLine: {
    width:           56,
    height:           4,
    borderRadius:     2,
    backgroundColor: C.textDisabled,
  },
  emptyStateText: {
    fontSize:   16,
    color:      C.textSecondary,
    textAlign:  'center',
    lineHeight: 24,
  },
});
