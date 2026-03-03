/**
 * NewVisitScreen.tsx — D6: New Visit (live)
 *
 * Screen:    D6 — New Visit
 * Spec:      docs/ui-ux-spec.md → D6 New Visit
 * Mockup:    mockups/D6NewVisitScreen.tsx (all persona critique fixes applied)
 * Checklist: reviews/D6-VALIDATION-CHECKLIST.md (65 items)
 *
 * Build constraints (docs/project-state.md):
 *   Auth guard:    if (!token || !user) return null — after all hooks (D3-H-3 pattern)
 *   SQLite first:  insertLocalVisit() before createVisit() — visit never lost if server down
 *   Visit scoping: every SQLite write includes doctor_id + patient_id (security requirement)
 *   Offline-first: isConnected === true && isInternetReachable === true
 *   Consent:       displayed as informational notice only — does NOT gate Save
 *   Tap guard:     isSavingRef prevents double-submit on rapid Save taps (checklist #29)
 *   60s rule:      ≤3 taps from D3 to submittable state
 *                  Note path: tap note area (1) → type → tap Save (2). ✓
 *
 * Nav params from D3:
 *   patientId, patientServerId, patientName, patientMobile, consentGranted
 *
 * SQLite:  src/db/visits.ts → insertLocalVisit()  (writes to visits_draft table)
 * API:     src/api/visits.ts → createVisit()       (POST /visits, online-only)
 * Sync:    src/sync/syncQueue.ts → enqueueOperation() (offline queue)
 *
 * Back navigation guard:
 *   navigation.addListener('beforeRemove') intercepts:
 *     • iOS swipe-back gesture
 *     • Android hardware back button
 *     • Custom back-button press (which calls navigation.goBack())
 *   If the doctor has typed a note, shows "Discard this visit?" dialog.
 *   savingCompletedRef prevents the discard dialog from firing when goBack()
 *   is called from the save-success path.
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useAuthStore } from '../../store/useAuthStore';
import { useNetworkStatus } from '../../utils/useNetworkStatus';
import { insertLocalVisit, markVisitSynced, logVisitCreated } from '../../db/visits';
import { createVisit } from '../../api/visits';
import { enqueueOperation } from '../../sync/syncQueue';
import { ApiError } from '../../api/apiClient';
import type { RootStackParamList } from '../../../App';

// ─── Design tokens (ui-ux-spec.md) ────────────────────────────────────────

const Colors = {
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
  scanOrange:    '#EA580C',
};

// ─── Date helpers ──────────────────────────────────────────────────────────

/** Today's date as YYYY-MM-DD in local timezone. */
function todayISO(): string {
  const d  = new Date();
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** YYYY-MM-DD → DD/MM/YYYY for display (Indian standard — ui-ux-spec.md). */
function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** YYYY-MM-DD → JS Date object at midnight local time (for DateTimePicker). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** JS Date → YYYY-MM-DD (local timezone). */
function dateToISO(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// ─── Types ─────────────────────────────────────────────────────────────────

type NavProp      = NativeStackNavigationProp<RootStackParamList, 'NewVisit'>;
type RoutePropTyp = RouteProp<RootStackParamList, 'NewVisit'>;

interface AttachedScan {
  localPath: string;
  label:     string;   // e.g. "Prescription (25/02/2026)"
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function NewVisitScreen() {
  const db         = useSQLiteContext();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePropTyp>();
  const { token, user } = useAuthStore();
  const isOnline   = useNetworkStatus();

  // Nav params from D3
  const {
    patientId,
    patientServerId,
    patientName,
    patientMobile,
    consentGranted,
  } = route.params;

  // Pre-generate a stable local visit ID for this session.
  // Passed to D7 so scans can reference this visit before Save.
  // NOT written to SQLite until Save is pressed — no orphan records on back-nav.
  const visitLocalId = useRef<string>(Crypto.randomUUID()).current;

  // ─── Local state ────────────────────────────────────────────────────────
  const [visitDate,       setVisitDate]       = useState<string>(todayISO());
  const [showDatePicker,  setShowDatePicker]   = useState(false);
  const [chiefComplaint,  setChiefComplaint]   = useState('');
  const [noteText,        setNoteText]         = useState('');
  const [scan,            setScan]             = useState<AttachedScan | null>(null);
  const [isSaving,        setIsSaving]         = useState(false);
  const [saveError,       setSaveError]        = useState<string | null>(null);
  const [hintHighlighted, setHintHighlighted]  = useState(false);

  // Tap guard: synchronously prevents second tap while save is in flight.
  // State setter is async; ref is synchronous — required for double-tap guard.
  const isSavingRef = useRef(false);

  // Set to true just before goBack() on save success so beforeRemove doesn't
  // show the discard dialog for the programmatic back navigation.
  const savingCompletedRef = useRef(false);

  const hasRecord = noteText.trim().length > 0 || scan !== null;
  const hasNote   = noteText.trim().length > 0;

  // ─── Back navigation guard (checklist #30, #31, #54) ─────────────────
  // Single handler covers: iOS swipe, Android hw button, custom back button.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // Allow programmatic back after save completes
      if (savingCompletedRef.current) return;
      // Allow silent back when no note has been typed
      if (!hasNote) return;
      e.preventDefault();
      Alert.alert(
        'Discard this visit?',
        'Your note will be lost.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, hasNote]);

  // ─── Auth guard (D3-H-3 pattern — must appear after all hooks) ────────
  if (!token || !user) return null;

  // ─── Handlers ───────────────────────────────────────────────────────────

  /** Amber hint flash (800 ms) when doctor taps disabled Save (checklist #29). */
  function handleDisabledSaveTap() {
    if (hintHighlighted) return;
    setHintHighlighted(true);
    setTimeout(() => setHintHighlighted(false), 800);
  }

  /** Date picker onChange — handles both iOS spinner and Android dialog. */
  function handleDateChange(event: any, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      // Android picker is a native dialog; close it regardless of outcome
      setShowDatePicker(false);
    }
    if (event.type === 'dismissed' || !selectedDate) return;
    // Future dates blocked — checklist #27
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedDate > today) return;
    setVisitDate(dateToISO(selectedDate));
  }

  /** Navigate to D7 Document Scanner with this visit's context. */
  function handleScanTap() {
    // D7 stub navigation — passes patientId + visitId so scan is associated.
    // When D7 is built, it returns the scan to D6 via navigation.navigate back
    // and D6 calls setScan({ localPath, label }).
    navigation.navigate('DocumentScanner', {
      patientId,
      visitId: visitLocalId,
    });
  }

  /** Remove the attached scan — Save returns to disabled state. */
  function handleRemoveScan() {
    setScan(null);
  }

  /**
   * Save the visit.
   *
   * Sequence (SQLite first — locked decision):
   *   1. insertLocalVisit()  → visits_draft (always, even offline)
   *   2. enqueueOperation()  → sync_queue   (always, even when online)
   *   3. createVisit()       → POST /visits (only when online + server ID available)
   *   4. navigation.goBack() → D3 refreshes via useFocusEffect
   */
  async function handleSave() {
    if (!hasRecord) return;
    // Synchronous tap guard — state setter lag can't race condition this ref
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    const trimmedNote      = noteText.trim() || null;
    const trimmedComplaint = chiefComplaint.trim() || null;

    try {
      // ── 1. SQLite write FIRST — visit survives any server outage ────────
      await insertLocalVisit(db, {
        localId:         visitLocalId,
        doctorId:        user.id,
        patientId,
        patientServerId,
        visitDate,
        chiefComplaint:  trimmedComplaint,
        noteText:        trimmedNote,
        consentGranted,
      });

      // ── 1b. DPDP audit event — personal health data written (HIGH-3) ────
      // Fires for both online and offline saves — audit trail is always complete.
      await logVisitCreated(db, user.id, patientId, visitLocalId);

      // ── 2. Enqueue for background sync ──────────────────────────────────
      await enqueueOperation(db, {
        doctor_id:       user.id,
        entity_type:     'visit',
        entity_local_id: visitLocalId,
        operation:       'create',
        payload: {
          localId:         visitLocalId,
          doctorId:        user.id,
          patientId,
          patientServerId,
          visitDate,
          chiefComplaint:  trimmedComplaint,
          noteText:        trimmedNote,
          consentGranted,
        },
      });

      // ── 3. Online server call ────────────────────────────────────────────
      // Only attempted when patientServerId is available — offline-only patients
      // (no server ID yet) are sync-queued and uploaded when their patient record syncs.
      if (isOnline && patientServerId) {
        try {
          const serverVisit = await createVisit({
            patientId:      patientServerId,
            doctorId:       user.id,
            visitDate,
            chiefComplaint: trimmedComplaint,
            noteText:       trimmedNote,
            consentGranted,
          }, token);
          // Mark draft row as synced so the sync worker does not re-POST (HIGH-2).
          await markVisitSynced(db, visitLocalId, serverVisit.visitId);
          // Mark sync_queue entry as done — prevents duplicate upload by the worker.
          await db.runAsync(
            `UPDATE sync_queue SET status = 'success'
             WHERE entity_local_id = ? AND doctor_id = ?`,
            [visitLocalId, user.id],
          );
        } catch (apiErr) {
          // Server error after SQLite write — visit is safely persisted.
          // Sync queue will retry. Swallow silently: offline save must feel
          // identical to online save (offline-first design principle).
          if (apiErr instanceof ApiError && apiErr.status === 401) {
            // Session expired mid-save. Local record is written.
            // Navigate back; D3/D2 auth guard will redirect to login.
          }
        }
      }

      // ── 4. Navigate back — D3's useFocusEffect refreshes the visit list ─
      // savingCompletedRef prevents the beforeRemove discard guard from firing
      // on this programmatic goBack() call.
      savingCompletedRef.current = true;
      navigation.goBack();

    } catch (err) {
      // SQLite write failed — surface to doctor so they can retry (checklist #40)
      setSaveError('Could not save the visit. Please try again.');
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }

  // ─── Derived values ──────────────────────────────────────────────────────
  const clinicLine = `${user.clinic_name ?? 'Your Clinic'} · ${user.name}`;

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* Offline banner — amber dot + message (checklist #13) */}
      {!isOnline && (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineBannerText}>
            Offline — changes will sync when connected
          </Text>
        </View>
      )}

      {/* Header — patient name, mobile, clinic + doctor attribution (checklist #20) */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerTextGroup}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            New Visit
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {patientName} · {patientMobile}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {clinicLine}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Consent notice — informational only, does NOT block Save (checklist #14, #15, #45) */}
        {!consentGranted && (
          <View style={styles.consentNotice}>
            <Text style={styles.consentNoticeIcon}>ℹ</Text>
            <View style={styles.consentNoticeTextGroup}>
              <Text style={styles.consentNoticeTitle}>
                Consent not yet established
              </Text>
              <Text style={styles.consentNoticeBody}>
                This patient hasn't set up record sharing yet. This visit will
                be saved to your device. They will be asked to approve sharing
                the next time they open the app. If they don't have the app,
                ask them to download it or request their consent in person.
              </Text>
            </View>
          </View>
        )}

        {/* Offline info card — additional context when offline */}
        {!isOnline && (
          <View style={styles.offlineInfoCard}>
            <Text style={styles.offlineInfoText}>
              You're offline. The visit will be saved to your device and synced
              when you reconnect.
            </Text>
          </View>
        )}

        {/* Save error banner — shown on SQLite failure; allows retry (checklist #40) */}
        {saveError !== null && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{saveError}</Text>
          </View>
        )}

        {/* ── Visit Date (checklist #1, #2) ─────────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Visit Date</Text>
          <TouchableOpacity
            style={styles.datePill}
            onPress={() => setShowDatePicker(true)}
            accessibilityLabel={`Visit date: ${displayDate(visitDate)}. Tap to change.`}
            accessibilityRole="button"
          >
            <Text style={styles.datePillIcon}>📅</Text>
            <Text style={styles.datePillDate}>{displayDate(visitDate)}</Text>
            <Text style={styles.datePillChevron}>›</Text>
            <Text style={styles.datePillChange}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* ── Chief Complaint (optional) (checklist #3, #4, #24, #25) ───── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Chief Complaint (optional)</Text>
          <TextInput
            style={[
              styles.chiefComplaintInput,
              chiefComplaint.length > 0 && styles.chiefComplaintFilled,
            ]}
            placeholder="Why did patient visit? (Optional)"
            placeholderTextColor={Colors.textDisabled}
            value={chiefComplaint}
            onChangeText={setChiefComplaint}
            multiline
            maxLength={200}
            textAlignVertical="top"
            accessibilityLabel="Chief complaint — optional"
          />
        </View>

        {/* ── Record entry zone (checklist #5, #6, #7, #11, #12, #16) ──── */}
        <View style={styles.section}>
          {scan !== null ? (
            /* ── Has scan: thumbnail + option to add another or type note ── */
            <>
              <Text style={styles.sectionLabel}>Records Added</Text>

              {/* Scan thumbnail with remove button (touch target 48×48px — checklist #16) */}
              <View style={styles.scanThumbContainer}>
                <View style={styles.scanThumbImage}>
                  <Text style={styles.scanThumbPlaceholderText}>📄</Text>
                </View>
                <View style={styles.scanThumbInfo}>
                  <Text style={styles.scanThumbLabel}>{scan.label}</Text>
                  {/* Cloud icon shown when offline — checklist #12 */}
                  <Text style={styles.scanThumbStatus}>
                    {!isOnline ? '☁ Pending sync' : '✓ Saved locally'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.scanThumbRemove}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  onPress={handleRemoveScan}
                  accessibilityLabel="Remove scan"
                  accessibilityRole="button"
                >
                  <Text style={styles.scanThumbRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.addAnotherScan}
                onPress={handleScanTap}
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
                style={[styles.noteInput, hasNote && styles.noteInputFilled]}
                placeholder="Add a note (optional when scan is present)…"
                placeholderTextColor={Colors.textDisabled}
                value={noteText}
                onChangeText={setNoteText}
                multiline
                maxLength={2000}
                textAlignVertical="top"
                accessibilityLabel="Add a note — optional"
              />
              {noteText.length > 0 && (
                <Text style={styles.charCount}>{noteText.length}/2000</Text>
              )}
            </>
          ) : hasNote ? (
            /* ── Has note: camera demoted to secondary, note input expanded ─ */
            <>
              <Text style={styles.sectionLabel}>Add a Record</Text>

              {/* Camera CTA — secondary (outline) when note is present (checklist #7) */}
              <TouchableOpacity
                style={styles.scanCtaSecondary}
                onPress={handleScanTap}
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

              <TextInput
                style={[styles.noteInput, styles.noteInputFilled]}
                placeholder="Or type a note…"
                placeholderTextColor={Colors.textDisabled}
                value={noteText}
                onChangeText={setNoteText}
                multiline
                maxLength={2000}
                textAlignVertical="top"
                accessibilityLabel="Type a visit note"
              />
              <Text style={styles.charCount}>{noteText.length}/2000</Text>
            </>
          ) : (
            /* ── Empty: primary orange camera CTA + note area (checklist #5, #6) */
            <>
              <Text style={styles.sectionLabel}>Add a Record</Text>

              {/* Primary orange camera button — #EA580C (checklist #5, #18) */}
              <TouchableOpacity
                style={styles.scanCta}
                onPress={handleScanTap}
                accessibilityLabel="Scan a document"
                accessibilityRole="button"
              >
                <Text style={styles.scanCtaIcon}>📷</Text>
                <Text style={styles.scanCtaText}>Scan a Document</Text>
                <Text style={styles.scanCtaHint}>
                  Prescription, test report, X-ray…
                </Text>
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
                value={noteText}
                onChangeText={setNoteText}
                multiline
                numberOfLines={4}
                maxLength={2000}
                textAlignVertical="top"
                accessibilityLabel="Type a visit note"
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Date picker — platform-aware (checklist #26, #27) ──────────── */}

      {/* iOS: spinner inside a bottom sheet Modal.
          Always mounted — controlled by visible prop only.
          Conditional mounting causes a blank-screen flash on iOS before
          the native presentation animation completes. */}
      {Platform.OS === 'ios' && (
        <Modal
          transparent
          animationType="slide"
          visible={showDatePicker}
          onRequestClose={() => setShowDatePicker(false)}
        >
          <TouchableOpacity
            style={styles.datePickerBackdrop}
            activeOpacity={1}
            onPress={() => setShowDatePicker(false)}
          />
          <View style={styles.datePickerSheet}>
            <View style={styles.datePickerHeader}>
              <TouchableOpacity
                onPress={() => setShowDatePicker(false)}
                style={styles.datePickerDoneButton}
                accessibilityLabel="Done selecting date"
                accessibilityRole="button"
              >
                <Text style={styles.datePickerDoneText}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={isoToDate(visitDate)}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              onChange={handleDateChange}
            />
          </View>
        </Modal>
      )}

      {/* Android: native date dialog rendered conditionally */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={isoToDate(visitDate)}
          mode="date"
          display="default"
          maximumDate={new Date()}
          onChange={handleDateChange}
        />
      )}

      {/* ── Bottom bar — Save button + hint text ───────────────────────── */}
      <View style={styles.bottomBar}>
        {isSaving ? (
          /* Saving spinner state — fully non-interactive (checklist #38) */
          <View style={[styles.saveButton, styles.saveButtonSaving]}>
            <ActivityIndicator color={Colors.surface} size="small" />
            <Text style={[styles.saveButtonText, styles.saveButtonSavingText]}>
              Saving…
            </Text>
          </View>
        ) : (
          /* Save button: active (#1A6DB5) or disabled (grey) (checklist #8, #9, #10) */
          <TouchableOpacity
            style={[
              styles.saveButton,
              !hasRecord && styles.saveButtonDisabled,
            ]}
            disabled={isSaving}
            onPress={hasRecord ? handleSave : handleDisabledSaveTap}
            activeOpacity={hasRecord ? 0.8 : 1}
            accessibilityLabel={
              hasRecord
                ? 'Save visit'
                : 'Save visit — add a note or scan first'
            }
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.saveButtonText,
                !hasRecord && styles.saveButtonTextDisabled,
              ]}
            >
              Save Visit
            </Text>
          </TouchableOpacity>
        )}

        {/* Hint text — always visible when disabled; amber flash on disabled tap (checklist #29) */}
        {!hasRecord && !isSaving && (
          <Text
            style={[
              styles.saveHint,
              hintHighlighted && styles.saveHintHighlighted,
            ]}
          >
            Add a scan or note to save this visit.
          </Text>
        )}
      </View>

    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Shell
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

  // Consent notice
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

  // Offline info card
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

  // Error banner
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  errorBannerText: {
    fontSize: 13,
    color: Colors.error,
    fontWeight: '500',
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
  datePillChange: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginLeft: 4,
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
  },

  // Primary orange scan CTA (#EA580C — ui-ux-spec.md)
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

  // Secondary scan CTA (outline — when note is present)
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
  // Touch target 48×48px — WCAG AA (ui-ux-spec.md) / checklist #16
  scanThumbRemove: {
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

  // Date picker — iOS bottom sheet
  datePickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  datePickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  datePickerDoneButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  datePickerDoneText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primaryBlue,
  },

  // Bottom bar
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
    flexDirection: 'row',
  },
  saveButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  saveButtonSaving: {
    backgroundColor: Colors.primaryBlue,
    opacity: 0.85,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.surface,
  },
  saveButtonTextDisabled: {
    color: Colors.textDisabled,
  },
  saveButtonSavingText: {
    marginLeft: 8,
  },

  // Save hint (disabled state)
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
