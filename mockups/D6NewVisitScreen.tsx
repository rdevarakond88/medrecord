/**
 * D6NewVisitScreen — Static Mockup
 *
 * Spec: docs/ui-ux-spec.md § D6 New Visit
 * Constraints: docs/project-state.md § Build Constraints — D6
 *
 * State variants rendered (all self-contained, no navigation required):
 *   1. D6NewVisitEmpty          — initial state; Save disabled; no record added
 *   2. D6NewVisitWithNote       — chief complaint + note typed; Save active
 *   3. D6NewVisitWithScan       — scan thumbnail attached; Save active
 *   4. D6NewVisitOffline        — offline banner; same layout as Empty
 *   5. D6NewVisitNoConsent      — consent not yet established notice (required per project-state.md D6 constraint)
 *   6. D6NewVisitSaving         — Save button in-progress spinner state
 *
 * Design decisions:
 *   - Orange camera CTA (#EA580C) is the primary affordance — scan-first design matches product vision
 *   - Note area is secondary but equally reachable — no more than 1 tap to focus
 *   - "Save Visit" disabled state uses Text Disabled (#CBD5E0) to clearly signal unavailability
 *   - Consent notice is amber / informational only — does not block save
 *   - Date field styled as a tappable pill (not plain text) so tappability is obvious
 *   - Patient name in header — doctor must always know whose visit they are creating
 *   - All touch targets ≥ 48×48px per WCAG AA (ui-ux-spec.md)
 *
 * Placeholder data: realistic Indian clinical context
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Image,
} from 'react-native';

// ---------------------------------------------------------------------------
// Design tokens (ui-ux-spec.md)
// ---------------------------------------------------------------------------
const Colors = {
  primaryBlue: '#1A6DB5',
  primaryDark: '#0F4880',
  surface: '#FFFFFF',
  background: '#F5F7FA',
  border: '#E2E8F0',
  textPrimary: '#1A202C',
  textSecondary: '#64748B',
  textDisabled: '#CBD5E0',
  success: '#16A34A',
  warning: '#D97706',
  error: '#DC2626',
  scanOrange: '#EA580C',
};

// ---------------------------------------------------------------------------
// Shared placeholder data
// ---------------------------------------------------------------------------
const PATIENT = {
  name: 'Rajesh Kumar Mehta',
  mobile: '98765 43210',
  age: 42,
};

const DOCTOR = {
  name: 'Dr. Priya Nair',
  clinic: 'Sunita Clinic, Nagpur',
};

const TODAY = '25/02/2026';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface HeaderProps {
  showBackArrow?: boolean;
}
function ScreenHeader({ showBackArrow = true }: HeaderProps) {
  return (
    <View style={styles.header}>
      {showBackArrow && (
        <TouchableOpacity
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
      )}
      <View style={styles.headerTextGroup}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          New Visit
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {PATIENT.name} · {PATIENT.mobile}
        </Text>
      </View>
    </View>
  );
}

function OfflineBanner() {
  return (
    <View style={styles.offlineBanner}>
      <View style={styles.offlineDot} />
      <Text style={styles.offlineBannerText}>
        Offline — changes will sync when connected
      </Text>
    </View>
  );
}

function ConsentNoticeBanner() {
  return (
    <View style={styles.consentNotice}>
      <Text style={styles.consentNoticeIcon}>ℹ</Text>
      <View style={styles.consentNoticeTextGroup}>
        <Text style={styles.consentNoticeTitle}>Consent not yet established</Text>
        <Text style={styles.consentNoticeBody}>
          This visit will create an implicit consent request. The patient will be
          notified on their next app open.
        </Text>
      </View>
    </View>
  );
}

interface DatePillProps {
  date: string;
}
function DatePill({ date }: DatePillProps) {
  return (
    <TouchableOpacity
      style={styles.datePill}
      accessibilityLabel={`Visit date: ${date}. Tap to change.`}
      accessibilityRole="button"
    >
      <Text style={styles.datePillIcon}>📅</Text>
      <Text style={styles.datePillDate}>{date}</Text>
      <Text style={styles.datePillChevron}>›</Text>
    </TouchableOpacity>
  );
}

interface ScanThumbProps {
  offline?: boolean;
}
function ScanThumbnail({ offline = false }: ScanThumbProps) {
  return (
    <View style={styles.scanThumbContainer}>
      {/* Simulated scan thumbnail — grey placeholder */}
      <View style={styles.scanThumbImage}>
        <Text style={styles.scanThumbPlaceholderText}>📄</Text>
      </View>
      <View style={styles.scanThumbInfo}>
        <Text style={styles.scanThumbLabel}>Prescription (25/02/2026)</Text>
        <Text style={styles.scanThumbStatus}>
          {offline ? '☁ Pending sync' : '✓ Saved locally'}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.scanThumbRemove}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityLabel="Remove scan"
        accessibilityRole="button"
      >
        <Text style={styles.scanThumbRemoveText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

interface SaveButtonProps {
  enabled: boolean;
  saving?: boolean;
  onDisabledPress?: () => void;
}
function SaveButton({ enabled, saving = false, onDisabledPress }: SaveButtonProps) {
  // When disabled but a tap handler is provided, keep the button touchable so
  // the handler fires — but suppress the press-opacity animation (activeOpacity=1)
  // so the disabled visual appearance is unchanged.
  const isInteractiveDisabled = !enabled && !!onDisabledPress;
  return (
    <TouchableOpacity
      style={[styles.saveButton, !enabled && styles.saveButtonDisabled]}
      disabled={!enabled && !onDisabledPress}
      onPress={isInteractiveDisabled ? onDisabledPress : undefined}
      activeOpacity={isInteractiveDisabled ? 1 : 0.8}
      accessibilityLabel={
        saving
          ? 'Saving visit…'
          : enabled
          ? 'Save visit'
          : 'Save visit — add a note or scan first'
      }
      accessibilityRole="button"
    >
      {saving ? (
        <Text style={styles.saveButtonText}>Saving…</Text>
      ) : (
        <Text
          style={[styles.saveButtonText, !enabled && styles.saveButtonTextDisabled]}
        >
          Save Visit
        </Text>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Variant 1 — Empty (no record added)
// ---------------------------------------------------------------------------
export function D6NewVisitEmpty() {
  const [hintHighlighted, setHintHighlighted] = useState(false);

  const handleDisabledPress = () => {
    setHintHighlighted(true);
    setTimeout(() => setHintHighlighted(false), 800);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Visit date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <DatePill date={TODAY} />
        </View>

        {/* Chief complaint */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={styles.chiefComplaintInput}
            placeholder="Why did patient visit? (Optional)"
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={200}
            accessibilityLabel="Chief complaint — optional"
          />
        </View>

        {/* Record entry zone */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Add a Record</Text>

          {/* Orange scan CTA */}
          <TouchableOpacity
            style={styles.scanCta}
            accessibilityLabel="Scan a document"
            accessibilityRole="button"
          >
            <Text style={styles.scanCtaIcon}>📷</Text>
            <Text style={styles.scanCtaText}>Scan a Document</Text>
            <Text style={styles.scanCtaHint}>Prescription, test report, X-ray…</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          {/* Note area */}
          <TextInput
            style={styles.noteInput}
            placeholder="Or type a note…"
            placeholderTextColor={Colors.textDisabled}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            accessibilityLabel="Type a visit note"
          />
        </View>
      </ScrollView>

      {/* Save button anchored at bottom */}
      <View style={styles.bottomBar}>
        <SaveButton enabled={false} onDisabledPress={handleDisabledPress} />
        <Text style={[styles.saveHint, hintHighlighted && styles.saveHintHighlighted]}>
          Add a scan or note to save this visit.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 2 — Has Note (Save active)
// ---------------------------------------------------------------------------
export function D6NewVisitWithNote() {
  const NOTE =
    'Patient presents with mild chest discomfort radiating to left arm. BP 138/88 mmHg. ' +
    'Pulse 82 bpm regular. No fever. ECG shows no acute changes. Advised bed rest, ' +
    'low-salt diet. Follow-up in 5 days.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Visit date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <DatePill date={TODAY} />
        </View>

        {/* Chief complaint — filled */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={[styles.chiefComplaintInput, styles.chiefComplaintFilled]}
            defaultValue="Chest pain and breathlessness since 2 days"
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={200}
            accessibilityLabel="Chief complaint"
          />
        </View>

        {/* Record entry zone — note filled */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Add a Record</Text>

          <TouchableOpacity
            style={styles.scanCtaSecondary}
            accessibilityLabel="Scan a document"
            accessibilityRole="button"
          >
            <Text style={styles.scanCtaSecondaryText}>📷  Add a Scan</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          {/* Note area — filled */}
          <TextInput
            style={[styles.noteInput, styles.noteInputFilled]}
            defaultValue={NOTE}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Visit note"
          />
          <Text style={styles.charCount}>{NOTE.length}/2000</Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <SaveButton enabled={true} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 3 — Has Scan (Save active, thumbnail shown)
// ---------------------------------------------------------------------------
export function D6NewVisitWithScan() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Visit date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <DatePill date={TODAY} />
        </View>

        {/* Chief complaint — filled */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={[styles.chiefComplaintInput, styles.chiefComplaintFilled]}
            defaultValue="Routine follow-up — diabetes management"
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={200}
            accessibilityLabel="Chief complaint"
          />
        </View>

        {/* Record entry zone — scan attached */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Records Added</Text>

          <ScanThumbnail offline={false} />

          {/* Option to add another scan */}
          <TouchableOpacity
            style={styles.addAnotherScan}
            accessibilityLabel="Add another scan"
            accessibilityRole="button"
          >
            <Text style={styles.addAnotherScanText}>+ Add Another Scan</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          <TextInput
            style={styles.noteInput}
            placeholder="Add a note (optional when scan is present)…"
            placeholderTextColor={Colors.textDisabled}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Add a note — optional"
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <SaveButton enabled={true} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 4 — Offline (amber banner; record entry still functional)
// ---------------------------------------------------------------------------
export function D6NewVisitOffline() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <OfflineBanner />
      <ScreenHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Visit date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <DatePill date={TODAY} />
        </View>

        {/* Offline info card */}
        <View style={styles.offlineInfoCard}>
          <Text style={styles.offlineInfoText}>
            You're offline. The visit will be saved to your device and synced
            when you reconnect.
          </Text>
        </View>

        {/* Chief complaint */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={styles.chiefComplaintInput}
            placeholder="Why did patient visit? (Optional)"
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={200}
            accessibilityLabel="Chief complaint — optional"
          />
        </View>

        {/* Record entry zone — shows offline scan indicator */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Add a Record</Text>

          <ScanThumbnail offline={true} />

          <TouchableOpacity
            style={styles.addAnotherScan}
            accessibilityLabel="Add another scan"
            accessibilityRole="button"
          >
            <Text style={styles.addAnotherScanText}>+ Add Another Scan</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          <TextInput
            style={styles.noteInput}
            placeholder="Or type a note…"
            placeholderTextColor={Colors.textDisabled}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Type a visit note"
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <SaveButton enabled={true} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 5 — No Consent (consent not yet established — per D6 project-state constraint)
// ---------------------------------------------------------------------------
export function D6NewVisitNoConsent() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Consent notice — informational, non-blocking */}
        <ConsentNoticeBanner />

        {/* Visit date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <DatePill date={TODAY} />
        </View>

        {/* Chief complaint */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={styles.chiefComplaintInput}
            placeholder="Why did patient visit? (Optional)"
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={200}
            accessibilityLabel="Chief complaint — optional"
          />
        </View>

        {/* Record entry zone — identical to empty variant */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Add a Record</Text>

          <TouchableOpacity
            style={styles.scanCta}
            accessibilityLabel="Scan a document"
            accessibilityRole="button"
          >
            <Text style={styles.scanCtaIcon}>📷</Text>
            <Text style={styles.scanCtaText}>Scan a Document</Text>
            <Text style={styles.scanCtaHint}>Prescription, test report, X-ray…</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          <TextInput
            style={styles.noteInput}
            placeholder="Or type a note…"
            placeholderTextColor={Colors.textDisabled}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            accessibilityLabel="Type a visit note"
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <SaveButton enabled={false} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Save is enabled by the presence of a record.
// Consent status has no effect on Save availability.
// The consent notice is informational only.
// Variant 7 — No Consent, Has Note (Save active)
// ---------------------------------------------------------------------------
export function D6NewVisitNoConsentHasNote() {
  const NOTE =
    'Patient reports persistent headache for 3 days. BP 122/78 mmHg. ' +
    'No fever, no vomiting. Prescribed Paracetamol 500mg TDS for 3 days. ' +
    'Advised rest and hydration. Return if symptoms worsen.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Consent notice — informational, does not block Save */}
        <ConsentNoticeBanner />

        {/* Visit date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <DatePill date={TODAY} />
        </View>

        {/* Chief complaint — filled */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={[styles.chiefComplaintInput, styles.chiefComplaintFilled]}
            defaultValue="Headache for 3 days"
            placeholderTextColor={Colors.textDisabled}
            multiline
            maxLength={200}
            accessibilityLabel="Chief complaint"
          />
        </View>

        {/* Record entry zone — note filled; Save becomes active */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Add a Record</Text>

          <TouchableOpacity
            style={styles.scanCtaSecondary}
            accessibilityLabel="Scan a document"
            accessibilityRole="button"
          >
            <Text style={styles.scanCtaSecondaryText}>📷  Add a Scan</Text>
          </TouchableOpacity>

          <View style={styles.orDivider}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>OR</Text>
            <View style={styles.orLine} />
          </View>

          {/* Note filled — this is what enables Save */}
          <TextInput
            style={[styles.noteInput, styles.noteInputFilled]}
            defaultValue={NOTE}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Visit note"
          />
          <Text style={styles.charCount}>{NOTE.length}/2000</Text>
        </View>
      </ScrollView>

      {/* Save active — consent notice does not disable this */}
      <View style={styles.bottomBar}>
        <SaveButton enabled={true} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 6 — Saving in Progress
// ---------------------------------------------------------------------------
export function D6NewVisitSaving() {
  const NOTE = 'HbA1c: 7.4%. FBS: 128 mg/dL. Continue Metformin 500mg BD. Foot exam normal. Next review in 3 months.';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScreenHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        pointerEvents="none"
      >
        {/* Visit date */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <DatePill date={TODAY} />
        </View>

        {/* Chief complaint — filled */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={[styles.chiefComplaintInput, styles.chiefComplaintFilled]}
            defaultValue="Routine follow-up — diabetes management"
            multiline
            editable={false}
            accessibilityLabel="Chief complaint"
          />
        </View>

        {/* Record — note filled */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Records Added</Text>
          <TextInput
            style={[styles.noteInput, styles.noteInputFilled]}
            defaultValue={NOTE}
            multiline
            textAlignVertical="top"
            editable={false}
            accessibilityLabel="Visit note"
          />
        </View>
      </ScrollView>

      {/* Saving overlay hint */}
      <View style={styles.savingOverlay}>
        <Text style={styles.savingOverlayText}>Saving visit…</Text>
      </View>

      <View style={styles.bottomBar}>
        <SaveButton enabled={true} saving={true} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Default export — scrollable preview of all six variants
// ---------------------------------------------------------------------------
export default function D6AllVariants() {
  return (
    <ScrollView style={styles.previewScroll}>
      <Text style={styles.previewHeading}>D6 — New Visit · All Variants</Text>
      {/* 7 variants total — see variant 7 for Save-enabled-with-consent-notice proof */}

      <Text style={styles.variantLabel}>1 / 7  Empty (Save Disabled)</Text>
      <View style={styles.variantFrame}>
        <D6NewVisitEmpty />
      </View>

      <Text style={styles.variantLabel}>2 / 7  Has Note (Save Active)</Text>
      <View style={styles.variantFrame}>
        <D6NewVisitWithNote />
      </View>

      <Text style={styles.variantLabel}>3 / 7  Has Scan (Save Active)</Text>
      <View style={styles.variantFrame}>
        <D6NewVisitWithScan />
      </View>

      <Text style={styles.variantLabel}>4 / 7  Offline</Text>
      <View style={styles.variantFrame}>
        <D6NewVisitOffline />
      </View>

      <Text style={styles.variantLabel}>5 / 7  Consent Not Yet Established</Text>
      <View style={styles.variantFrame}>
        <D6NewVisitNoConsent />
      </View>

      <Text style={styles.variantLabel}>6 / 7  Consent Notice + Note → Save Active</Text>
      <View style={styles.variantFrame}>
        <D6NewVisitNoConsentHasNote />
      </View>

      <Text style={styles.variantLabel}>7 / 7  Saving In Progress</Text>
      <View style={styles.variantFrame}>
        <D6NewVisitSaving />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  // Preview wrapper
  previewScroll: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  previewHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primaryDark,
    textAlign: 'center',
    paddingVertical: 20,
  },
  variantLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
    backgroundColor: Colors.border,
  },
  variantFrame: {
    height: 720,
    overflow: 'hidden',
    borderBottomWidth: 2,
    borderBottomColor: Colors.primaryBlue,
    marginBottom: 4,
  },

  // Screen shell
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    minHeight: 56,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  backArrow: {
    fontSize: 28,
    color: Colors.primaryBlue,
    fontWeight: '300',
    lineHeight: 32,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.primaryDark,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Offline banner
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.warning,
    marginRight: 8,
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },

  // Offline info card (inside scroll)
  offlineInfoCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  offlineInfoText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },

  // Consent notice banner
  consentNotice: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  consentNoticeIcon: {
    fontSize: 16,
    color: Colors.warning,
    marginRight: 10,
    marginTop: 1,
  },
  consentNoticeTextGroup: {
    flex: 1,
  },
  consentNoticeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#78350F',
    marginBottom: 4,
  },
  consentNoticeBody: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },

  // Section containers
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Date pill
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
  },
  datePillIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  datePillDate: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  datePillChevron: {
    fontSize: 20,
    color: Colors.textSecondary,
    fontWeight: '300',
  },

  // Chief complaint input
  chiefComplaintInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.textPrimary,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  chiefComplaintFilled: {
    borderColor: Colors.primaryBlue,
    color: Colors.textPrimary,
  },

  // Orange scan CTA (primary)
  scanCta: {
    backgroundColor: Colors.scanOrange,
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 110,
  },
  scanCtaIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  scanCtaText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.surface,
    marginBottom: 4,
  },
  scanCtaHint: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
  },

  // Scan CTA — secondary (when a note is present, scan still available)
  scanCtaSecondary: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.scanOrange,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    minHeight: 48,
  },
  scanCtaSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.scanOrange,
  },

  // OR divider
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.border,
  },
  orText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginHorizontal: 12,
  },

  // Note text input
  noteInput: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.textPrimary,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  noteInputFilled: {
    borderColor: Colors.primaryBlue,
    minHeight: 120,
  },
  charCount: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: 4,
  },

  // Scan thumbnail
  scanThumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    minHeight: 64,
  },
  scanThumbImage: {
    width: 48,
    height: 48,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  scanThumbPlaceholderText: {
    fontSize: 24,
  },
  scanThumbInfo: {
    flex: 1,
  },
  scanThumbLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  scanThumbStatus: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  scanThumbRemove: {
    // touch target 48×48px — ui-ux-spec.md compliance
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  scanThumbRemoveText: {
    fontSize: 16,
    color: Colors.error,
    fontWeight: '600',
  },

  // Add another scan link
  addAnotherScan: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    minHeight: 48,
    justifyContent: 'center',
  },
  addAnotherScanText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryBlue,
  },

  // Saving overlay
  savingOverlay: {
    backgroundColor: 'rgba(15,72,128,0.06)',
    paddingVertical: 10,
    alignItems: 'center',
  },
  savingOverlayText: {
    fontSize: 14,
    color: Colors.primaryBlue,
    fontWeight: '500',
  },

  // Bottom bar + Save button
  bottomBar: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  saveButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.surface,
  },
  saveButtonTextDisabled: {
    color: Colors.textDisabled,
  },

  // Save hint (Empty variant only)
  saveHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  saveHintHighlighted: {
    fontWeight: '700',
    color: Colors.warning,
  },
});
