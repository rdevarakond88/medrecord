/**
 * VisitDetailScreen.tsx — D4: Visit Detail (live)
 *
 * Screen:    D4 — Visit Detail
 * Spec:      docs/ui-ux-spec.md → D4 Visit Detail
 * Mockup:    mockups/D4VisitDetailScreen.tsx (all persona critique + SHOULD FIX applied)
 * API:       docs/api-contracts.md → GET /visits/:id/records, POST /records, PATCH /visits/:id
 *
 * Build constraints (docs/project-state.md):
 *   Auth guard:    if (!token || !user) return null — after ALL hooks (D3-H-3 pattern)
 *   Consent gate:  showClinicalContent = isOwnVisit || consentGranted
 *                  chief_complaint, note text, and scan OCR all hidden when false (D4-H-1)
 *   Offline-first: records fetched from server (online) and cached in visit_records SQLite;
 *                  getCachedRecords() fallback when offline or on fetch failure
 *   Note writes:   SQLite first → enqueueOperation → POST /records online (if available)
 *   Note edit:     local SQLite only (PATCH /records/:id not yet implemented — MEDIUM debt)
 *   Note delete:   soft-delete locally (server is append-only per data model decision)
 *   Finish visit:  requires online — PATCH /visits/:id; updates SQLite on success
 *   DPDP audit:    visit_viewed logged on mount after records load
 *   Scan adds:     stub alert in v1 — D7 rework required for server visit IDs
 *   View Scan:     stub alert in v1 — D8 (Full Scan View) not yet built
 *   Tap guard:     isSavingRef (useRef, synchronous) prevents double-submit on rapid taps
 *
 * Nav params from D3 PatientDetailScreen (via RootStackParamList.VisitDetail):
 *   visitServerId, visitDate, visitStatus, chiefComplaint, clinicName,
 *   isOwnVisit, consentGranted, patientServerId, patientName
 *
 * SQLite: src/db/records.ts → getCachedRecords, insertLocalNote, etc.
 * API:    src/api/records.ts → getVisitRecords, createNote, finishVisit
 * Sync:   src/sync/syncQueue.ts → enqueueOperation
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

import type { RootStackParamList } from '../../../App';
import { Colors } from '../../constants/theme';
import { formatDateForDisplay, formatTimestamp } from '../../utils/formatters';
import { useNetworkStatus } from '../../utils/useNetworkStatus';
import { useAuthStore } from '../../store/useAuthStore';
import { ApiError } from '../../api/apiClient';
import { getVisitRecords, createNote, finishVisit } from '../../api/records';
import {
  LocalRecord,
  getCachedRecords,
  upsertRecordsFromServer,
  insertLocalNote,
  markRecordSynced,
  updateLocalNoteText,
  deleteLocalRecord,
} from '../../db/records';
import { getPatientByServerId } from '../../db/patients';
import { logVisitViewed, updateVisitStatus } from '../../db/visits';
import { enqueueOperation, markSyncEntrySuccess } from '../../sync/syncQueue';

// ─── Navigation types ──────────────────────────────────────────────────────

type NavProp   = NativeStackNavigationProp<RootStackParamList, 'VisitDetail'>;
type RouteType = RouteProp<RootStackParamList, 'VisitDetail'>;

// ─── Root component ────────────────────────────────────────────────────────

export default function VisitDetailScreen() {
  const db         = useSQLiteContext();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RouteType>();
  const isOnline   = useNetworkStatus();
  const { token, user } = useAuthStore();

  const {
    visitServerId,
    visitDate,
    visitStatus:     initialStatus,
    chiefComplaint,
    clinicName,
    isOwnVisit,
    consentGranted,
    patientServerId,
    patientName,
  } = route.params;

  // ── Component state ────────────────────────────────────────────
  const [records,             setRecords]             = useState<LocalRecord[]>([]);
  const [isLoading,           setIsLoading]           = useState(true);
  const [visitStatus,         setVisitStatus]         = useState<'open' | 'submitted'>(initialStatus);
  const [showNoteInput,       setShowNoteInput]        = useState(false);
  const [isSaving,            setIsSaving]            = useState(false);
  const [isFinishing,         setIsFinishing]         = useState(false);
  // D4-SA-H1: live consent — re-read from SQLite after records load; not nav param alone
  const [consentGrantedLive,  setConsentGrantedLive]  = useState(consentGranted);
  // D4-SA-H2: session expiry banner
  const [sessionExpired,      setSessionExpired]      = useState(false);
  const isSavingRef   = useRef(false);  // synchronous tap guard — prevents double-submit on note saves
  const isFinishingRef = useRef(false); // D4-QA-H4: synchronous tap guard for Finish Visit
  const viewLoggedRef  = useRef(false); // D4-SA-M2: fire logVisitViewed once per mount

  // ── Records data load ─────────────────────────────────────────
  // ALL hooks must be declared before any conditional return (D3-H-3 pattern).
  // The auth check inside loadRecords guards against the null case.
  const loadRecords = useCallback(async () => {
    if (!token || !user) return;

    setIsLoading(true);
    try {
      if (isOnline) {
        // Online: fetch from server and update the local cache
        const response = await getVisitRecords(visitServerId, token);
        await upsertRecordsFromServer(
          db,
          visitServerId,
          user.id,
          response.records.map((r) => ({
            id:              r.id,
            type:            r.type,
            content_text:    r.content_text,
            ocr_status:      r.ocr_status,
            created_by_name: r.created_by?.name ?? null,
            created_at:      r.created_at,
          })),
        );
      }
    } catch (err) {
      // D4-SA-H2: 401 means session expired — show banner and redirect to Login
      if (err instanceof ApiError && err.status === 401) {
        setSessionExpired(true);
        setTimeout(() => navigation.replace('Login'), 2000);
        setIsLoading(false);
        return;
      }
      // Other server fetch failures — fall through to SQLite cache silently.
    }

    // D4-QA-H2: wrap all SQLite reads in try/finally so setIsLoading(false) always
    // runs — a low-storage I/O error from getCachedRecords must not leave an infinite spinner.
    try {
      // Always read from SQLite — includes locally-created pending notes
      const cached = await getCachedRecords(db, visitServerId, user.id);
      setRecords(cached);

      // D4-SA-H1: re-read consent from SQLite to catch revocations that happened
      // while D4 was open (nav param is the initial signal only, not the live gate)
      const freshPatient = await getPatientByServerId(db, patientServerId, user.id);
      if (freshPatient !== null) {
        setConsentGrantedLive(freshPatient.consent_granted);
      }

      // DPDP Act 2023 §8 — log that this doctor viewed the visit records (once per mount)
      if (!viewLoggedRef.current) {
        viewLoggedRef.current = true;
        logVisitViewed(db, user.id, patientServerId, visitServerId).catch(() => {});
      }
    } finally {
      setIsLoading(false);
    }
  }, [token, user, isOnline, visitServerId, db, patientServerId, navigation]);

  // D4-QA-H1: depend on loadRecords (not []) — isOnline starts false by design (D2-H-5),
  // so the effect must re-fire when isOnline transitions to true on mount. loadRecords
  // is recreated by useCallback when isOnline changes, which triggers this effect.
  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  // ── Save note handler ─────────────────────────────────────────
  const handleSaveNote = useCallback(async (text: string) => {
    if (!token || !user) return;
    if (isSavingRef.current) return;  // tap guard
    isSavingRef.current = true;
    setIsSaving(true);
    setShowNoteInput(false);

    const localId = Crypto.randomUUID();

    try {
      // D4-SA-C1: both SQLite writes are atomic — if app is killed between them,
      // neither write commits; the note is never left without a sync queue entry.
      await db.withTransactionAsync(async () => {
        // 1. SQLite write first — note is never lost even if network call fails
        await insertLocalNote(db, visitServerId, user.id, text, localId, user.name);

        // 2. Enqueue for background sync (covers the offline case where sync worker
        //    will pick up the note when connectivity is restored)
        await enqueueOperation(db, {
          doctor_id:       user.id,
          entity_type:     'record',
          entity_local_id: localId,
          operation:       'create',
          payload: {
            type:         'note',
            visit_id:     visitServerId,
            content_text: text,
          },
        });
      });

      // 3. If online, POST immediately and mark as synced (avoids sync worker delay)
      if (isOnline) {
        try {
          const result = await createNote(localId, visitServerId, text, token);
          await markRecordSynced(db, localId, result.record.id);
          // D4-QA-C1: mark sync_queue entry 'success' so the sync worker does not
          // re-POST this note. Without this, the worker re-sends it and the server
          // creates a duplicate note if it does not deduplicate on local_id.
          await markSyncEntrySuccess(db, localId, 'record');
        } catch {
          // Online call failed — note stays pending; sync worker will retry
        }
      }
    } finally {
      // D4-QA-H3: reset tap guard BEFORE the SQLite refresh. If getCachedRecords
      // throws (e.g. low-storage I/O error), the guard must not stay locked — the
      // note was already written, and "+ Note" must remain tappable.
      isSavingRef.current = false;
      setIsSaving(false);
      try {
        const updated = await getCachedRecords(db, visitServerId, user.id);
        setRecords(updated);
      } catch {
        // SQLite read failure — display is stale but tap guard is cleared
      }
    }
  }, [token, user, db, visitServerId, isOnline]);

  // ── Edit note handler (local-only for v1) ─────────────────────
  const handleEditNote = useCallback(async (recordId: string, newText: string) => {
    await updateLocalNoteText(db, recordId, newText, user?.id ?? '');
    const updated = await getCachedRecords(db, visitServerId, user?.id ?? '');
    setRecords(updated);
  }, [db, visitServerId, user]);

  // ── Delete note handler ───────────────────────────────────────
  const handleDeleteNote = useCallback((recordId: string) => {
    Alert.alert(
      'Delete note?',
      'This note will be removed from the visit on this device. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Soft-delete locally — server is append-only (data model decision)
            await deleteLocalRecord(db, recordId, user?.id ?? '');
            const updated = await getCachedRecords(db, visitServerId, user?.id ?? '');
            setRecords(updated);
          },
        },
      ],
    );
  }, [db, visitServerId, user]);

  // ── Finish visit handler ──────────────────────────────────────
  const handleFinishVisit = useCallback(() => {
    if (!token || !user) return;
    // D4-QA-H4: synchronous ref guard — prevents rapid double-tap from opening
    // two Alert dialogs and firing two PATCH /visits/:id calls before isFinishing
    // state has had a chance to re-render.
    if (isFinishingRef.current) return;

    if (!isOnline) {
      Alert.alert(
        'No internet connection',
        'Finishing a visit requires a connection to confirm with the server. Please connect and try again.',
      );
      return;
    }

    Alert.alert(
      'Finish Visit?',
      'Once finished, this visit will be locked. You will not be able to add or edit records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish',
          style: 'destructive',
          onPress: async () => {
            isFinishingRef.current = true;
            setIsFinishing(true);
            try {
              await finishVisit(visitServerId, token);
              await updateVisitStatus(db, visitServerId, 'submitted');
              setVisitStatus('submitted');
            } catch (err) {
              // D4-SA-H2: session expiry must redirect to Login, not show a generic error
              if (err instanceof ApiError && err.status === 401) {
                setSessionExpired(true);
                setTimeout(() => navigation.replace('Login'), 2000);
                return;
              }
              Alert.alert(
                'Could not finish visit',
                'Please check your connection and try again.',
              );
            } finally {
              isFinishingRef.current = false;
              setIsFinishing(false);
            }
          },
        },
      ],
    );
  }, [token, user, isOnline, visitServerId, db]);

  // ── Auth guard — after ALL hooks (D3-H-3 pattern) ─────────────
  // This fires before any JSX renders. Hooks above run unconditionally.
  if (!token || !user) return null;

  // ── Derived display values ─────────────────────────────────────
  const hasRecords        = records.length > 0;
  const noteRecords       = records.filter((r) => r.type === 'note');
  const scanRecords       = records.filter((r) => r.type === 'scan');
  const displayDate       = formatDateForDisplay(visitDate) ?? visitDate;
  const isOpen            = visitStatus === 'open';
  // D4-SA-H1: consent gate uses live SQLite value, not stale nav param.
  // Per consent-layer-spec.md: "View records by other doctors: ❌ without consent"
  const showClinicalContent = isOwnVisit || consentGrantedLive;
  // canEditNotes: note edit/delete affordance only on own open visits
  const canEditNotes = isOwnVisit && isOpen;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          accessibilityLabel="Go back to patient history"
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visit Detail</Text>
        <View style={styles.headerRight} />
      </View>

      {/* D4-SA-H2: session expired — shown on 401; auto-redirects in 2s */}
      {sessionExpired && <SessionExpiredBanner />}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* ── Visit meta card ──────────────────────────────────── */}
            <View style={styles.metaCard}>
              <View style={styles.metaRow}>
                <Text style={styles.visitDate}>{displayDate}</Text>
                <StatusBadge status={visitStatus} />
              </View>

              <Text style={styles.patientName} numberOfLines={1} ellipsizeMode="tail">{patientName}</Text>
              {isOwnVisit && (
                <Text style={styles.doctorName}>{user.name}</Text>
              )}
              <Text style={styles.clinicName}>{clinicName}</Text>

              {!isOwnVisit && !consentGrantedLive && (
                <View style={styles.consentBanner} accessibilityLabel="No consent granted">
                  <Text style={styles.consentBannerText}>
                    Patient consent not granted — clinical content from this visit is hidden.
                  </Text>
                </View>
              )}
            </View>

            {/* ── Chief complaint ───────────────────────────────────── */}
            {showClinicalContent && chiefComplaint ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Chief Complaint</Text>
                <View style={styles.chiefComplaintBox}>
                  <Text style={styles.chiefComplaintText}>{chiefComplaint}</Text>
                </View>
              </View>
            ) : !showClinicalContent ? (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Chief Complaint</Text>
                <View style={[styles.chiefComplaintBox, styles.redactedBox]}>
                  <Text style={styles.redactedText}>Hidden — consent required</Text>
                </View>
              </View>
            ) : null}

            {/* ── Notes (above scans per PM constraint) ─────────────── */}
            {noteRecords.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Notes</Text>
                {noteRecords.map((r) => (
                  <NoteRecordRow
                    key={r.id}
                    record={r}
                    canEdit={canEditNotes}
                    showContent={showClinicalContent}
                    onEdit={handleEditNote}
                    onDelete={handleDeleteNote}
                  />
                ))}
              </View>
            )}

            {/* ── Inline note input ─────────────────────────────────── */}
            {showNoteInput && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>New Note</Text>
                <InlineNoteInput
                  onSave={handleSaveNote}
                  onCancel={() => setShowNoteInput(false)}
                />
              </View>
            )}

            {/* ── Scans (below notes per PM constraint) ─────────────── */}
            {scanRecords.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>Scans</Text>
                {scanRecords.map((r) => (
                  <ScanRecordRow
                    key={r.id}
                    record={r}
                    showContent={showClinicalContent}
                    onViewScan={() =>
                      Alert.alert('Coming soon', 'Full scan view will be available in a future update.')
                    }
                  />
                ))}
              </View>
            )}

            {/* ── Empty state ────────────────────────────────────────── */}
            {!hasRecords && !showNoteInput && (
              <View style={styles.emptyState} accessibilityLabel="No records">
                <Text style={styles.emptyStateTitle}>No records yet</Text>
                <Text style={styles.emptyStateSubtitle}>
                  {isOpen && isOwnVisit
                    ? 'Add a note or scan to start documenting this visit.'
                    : isOnline
                    ? 'This visit has no records.'
                    : 'Connect to load records for this visit.'}
                </Text>
              </View>
            )}

            {/* Bottom padding so content clears the bottom bar */}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* ── Bottom action bar (open own visits only) ─────────────────────── */}
        {/*   Row 1: [+ Scan]  [+ Note]  — additive actions                   */}
        {/*   Row 2: [    Finish Visit   ] — full-width, disabled until first record */}
        {isOpen && isOwnVisit && !isLoading && (
          <View style={styles.bottomBar}>
            <View style={styles.bottomBarAddRow}>
              {/* Add Scan — stub in v1 (adding scans to synced visits requires D7 rework) */}
              <TouchableOpacity
                style={styles.addScanButton}
                accessibilityLabel="Add scan — coming soon"
                onPress={() =>
                  Alert.alert(
                    'Coming soon',
                    'Adding scans to existing visits will be available in a future update.',
                  )
                }
              >
                <Text style={styles.addScanButtonText}>+ Scan</Text>
              </TouchableOpacity>

              {/* Add Note → inline input */}
              <TouchableOpacity
                style={[
                  styles.addNoteButton,
                  (showNoteInput || isSaving) && styles.addNoteButtonDisabled,
                ]}
                accessibilityLabel="Add note"
                onPress={() => { if (!showNoteInput && !isSaving) setShowNoteInput(true); }}
                disabled={showNoteInput || isSaving}
              >
                <Text
                  style={[
                    styles.addNoteButtonText,
                    (showNoteInput || isSaving) && styles.addNoteButtonTextDisabled,
                  ]}
                >
                  + Note
                </Text>
              </TouchableOpacity>
            </View>

            {/* Full-width Finish Visit — disabled until at least one record exists */}
            <TouchableOpacity
              style={[
                styles.finishVisitButton,
                (!hasRecords || isFinishing) && styles.finishVisitButtonDisabled,
              ]}
              accessibilityLabel={hasRecords ? 'Finish visit' : 'Finish visit — add a record first'}
              onPress={hasRecords && !isFinishing ? handleFinishVisit : undefined}
              disabled={!hasRecords || isFinishing}
            >
              {isFinishing ? (
                <ActivityIndicator size="small" color={Colors.surface} />
              ) : (
                <Text
                  style={[
                    styles.finishVisitButtonText,
                    !hasRecords && styles.finishVisitButtonTextDisabled,
                  ]}
                >
                  Finish Visit
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SessionExpiredBanner() {
  return (
    <View style={styles.sessionExpiredBanner} accessibilityRole="alert">
      <Text style={styles.sessionExpiredText}>
        Your session has expired. Redirecting to login…
      </Text>
    </View>
  );
}

function StatusBadge({ status }: { status: 'open' | 'submitted' }) {
  const isOpen = status === 'open';
  return (
    <View style={[styles.badge, { backgroundColor: isOpen ? '#FEF3C7' : '#DCFCE7' }]}>
      <View style={[styles.badgeDot, { backgroundColor: isOpen ? Colors.warning : Colors.success }]} />
      <Text style={[styles.badgeText, { color: isOpen ? Colors.warning : Colors.success }]}>
        {isOpen ? 'Open' : 'Submitted'}
      </Text>
    </View>
  );
}

/**
 * Scan record row.
 * showContent=false when consent not granted — OCR text hidden per D4-H-1.
 * Thumbnail is always a placeholder; S3 image URLs are deferred to v2.
 */
function ScanRecordRow({
  record,
  showContent,
  onViewScan,
}: {
  record: LocalRecord;
  showContent: boolean;
  onViewScan: () => void;
}) {
  const timestamp = formatTimestamp(record.created_at);

  return (
    <View style={styles.recordCard} accessibilityLabel="Scan record">
      <View style={styles.scanRow}>
        {/* S3 image storage deferred to v2 — show labelled placeholder */}
        <View style={styles.thumbnailPlaceholder} accessible={false}>
          <Text style={styles.thumbnailPlaceholderText}>Scan</Text>
        </View>

        <View style={styles.scanMeta}>
          <Text style={styles.recordTimestamp}>{timestamp}</Text>

          {!showContent ? (
            <Text style={styles.redactedText}>Content hidden — consent required</Text>
          ) : record.ocr_status === 'success' && record.content_text ? (
            <Text style={styles.ocrPreview} numberOfLines={2}>
              {record.content_text}
            </Text>
          ) : record.ocr_status === 'pending' ? (
            <Text style={styles.ocrStatusText}>Text extraction in progress…</Text>
          ) : record.ocr_status === 'failed' ? (
            <Text style={[styles.ocrStatusText, { color: Colors.error }]}>
              Image only — text not extracted
            </Text>
          ) : (
            <Text style={styles.ocrStatusText}>No extracted text</Text>
          )}

          {/* D8 stub */}
          <TouchableOpacity
            onPress={onViewScan}
            accessibilityLabel="View full scan image"
            style={styles.viewScanButton}
          >
            <Text style={styles.viewScanText}>View full image →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * Note record row.
 * canEdit=true shows edit/delete affordance on long-press (open own visits only).
 * showContent=false when consent not granted — note text hidden per D4-H-1.
 */
function NoteRecordRow({
  record,
  canEdit,
  showContent,
  onEdit,
  onDelete,
}: {
  record: LocalRecord;
  canEdit: boolean;
  showContent: boolean;
  onEdit: (id: string, newText: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded,       setExpanded] = useState(false);
  const [actionsVisible, setActions]  = useState(false);
  const [editing,        setEditing]  = useState(false);
  const [editText,       setEditText] = useState(record.content_text ?? '');

  const timestamp = formatTimestamp(record.created_at);
  const noteText  = record.content_text ?? '';
  const isLong    = noteText.length > 200;
  const isPending = record.sync_status === 'pending';

  function handleSaveEdit() {
    if (!editText.trim()) return;
    setEditing(false);
    setActions(false);
    onEdit(record.id, editText.trim());
  }

  return (
    <TouchableOpacity
      style={[styles.recordCard, isPending && styles.recordCardPending]}
      accessibilityLabel={isPending ? 'Note — syncing' : 'Note record'}
      onLongPress={() => { if (canEdit) setActions(!actionsVisible); }}
      activeOpacity={canEdit ? 0.7 : 1}
      delayLongPress={400}
    >
      <View style={styles.noteHeaderRow}>
        <Text style={styles.recordTimestamp}>{timestamp}</Text>
        {isPending && <Text style={styles.pendingBadge}>Syncing…</Text>}
      </View>

      {!showContent ? (
        <Text style={styles.redactedText}>Note hidden — consent required</Text>
      ) : editing ? (
        <View>
          <TextInput
            style={styles.inlineEditInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
            maxLength={5000}
            accessibilityLabel="Edit note text"
          />
          <View style={styles.inlineNoteActions}>
            <TouchableOpacity
              onPress={() => { setEditing(false); setEditText(noteText); }}
              style={styles.inlineNoteCancelButton}
              accessibilityLabel="Cancel edit"
            >
              <Text style={styles.inlineNoteCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveEdit}
              style={[styles.inlineNoteSaveButton, !editText.trim() && styles.inlineNoteSaveButtonDisabled]}
              disabled={!editText.trim()}
              accessibilityLabel="Save edited note"
            >
              <Text style={[styles.inlineNoteSaveText, !editText.trim() && styles.inlineNoteSaveTextDisabled]}>
                Save
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <Text
          style={styles.noteText}
          numberOfLines={isLong && !expanded ? 4 : undefined}
        >
          {noteText}
        </Text>
      )}

      {showContent && !editing && isLong && (
        <TouchableOpacity
          onPress={() => setExpanded(!expanded)}
          accessibilityLabel={expanded ? 'Collapse note' : 'Expand note'}
          style={styles.collapseToggle}
        >
          <Text style={styles.collapseToggleText}>
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        </TouchableOpacity>
      )}

      {canEdit && actionsVisible && !editing && (
        <View style={styles.noteActions}>
          <TouchableOpacity
            onPress={() => setEditing(true)}
            style={styles.noteActionButton}
            accessibilityLabel="Edit this note"
          >
            <Text style={styles.noteActionEdit}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setActions(false); onDelete(record.id); }}
            style={styles.noteActionButton}
            accessibilityLabel="Delete this note"
          >
            <Text style={styles.noteActionDelete}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {canEdit && !actionsVisible && !editing && showContent && (
        <Text style={styles.longPressHint}>Hold to edit or delete</Text>
      )}
    </TouchableOpacity>
  );
}

/** Inline note input that appears when "+ Note" is tapped */
function InlineNoteInput({
  onSave,
  onCancel,
}: {
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <View style={styles.inlineNoteContainer}>
      <TextInput
        style={styles.inlineNoteInput}
        placeholder="Type note here…"
        placeholderTextColor={Colors.textDisabled}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
        maxLength={5000}
        accessibilityLabel="Add note text input"
      />
      <View style={styles.inlineNoteActions}>
        <TouchableOpacity
          onPress={onCancel}
          style={styles.inlineNoteCancelButton}
          accessibilityLabel="Cancel note"
        >
          <Text style={styles.inlineNoteCancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => text.trim() && onSave(text.trim())}
          style={[styles.inlineNoteSaveButton, !text.trim() && styles.inlineNoteSaveButtonDisabled]}
          disabled={!text.trim()}
          accessibilityLabel="Save note"
        >
          <Text style={[styles.inlineNoteSaveText, !text.trim() && styles.inlineNoteSaveTextDisabled]}>
            Save Note
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  loadingContainer: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    minWidth:       48,
    minHeight:      48,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize:   16,
    color:      Colors.primaryBlue,
    fontWeight: '500',
  },
  headerTitle: {
    fontSize:   18,
    fontWeight: '600',
    color:      Colors.primaryDark,
  },
  headerRight: {
    minWidth: 48,
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
  },

  // Visit meta card
  metaCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    padding:         16,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  metaRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   6,
  },
  visitDate: {
    fontSize:   22,
    fontWeight: '700',
    color:      Colors.primaryDark,
  },
  patientName: {
    fontSize:     17,
    fontWeight:   '700',
    color:        Colors.textPrimary,
    marginBottom: 6,
  },
  doctorName: {
    fontSize:     14,
    fontWeight:   '500',
    color:        Colors.textSecondary,
    marginBottom: 2,
  },
  clinicName: {
    fontSize: 13,
    color:    '#94A3B8',
  },

  // Status badge
  badge: {
    flexDirection:     'row',
    alignItems:        'center',
    borderRadius:      20,
    paddingHorizontal: 10,
    paddingVertical:    4,
  },
  badgeDot: {
    width:        7,
    height:       7,
    borderRadius: 4,
    marginRight:  6,
  },
  badgeText: {
    fontSize:   12,
    fontWeight: '600',
  },

  // Consent banner
  consentBanner: {
    marginTop:       12,
    backgroundColor: '#FFF7ED',
    borderRadius:    8,
    padding:         10,
    borderWidth:     1,
    borderColor:     '#FED7AA',
  },
  consentBannerText: {
    fontSize: 13,
    color:    Colors.warning,
  },

  // Section
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize:      13,
    fontWeight:    '600',
    color:         Colors.textSecondary,
    marginBottom:  8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Chief complaint
  chiefComplaintBox: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    padding:         14,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  chiefComplaintText: {
    fontSize:   15,
    color:      Colors.textPrimary,
    lineHeight: 22,
  },
  redactedBox: {
    backgroundColor: '#F8FAFF',
  },
  redactedText: {
    fontSize:  13,
    color:     Colors.textDisabled,
    fontStyle: 'italic',
  },

  // Record card (shared by note and scan)
  recordCard: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  recordCardPending: {
    borderColor:     '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  recordTimestamp: {
    fontSize:     12,
    color:        Colors.textSecondary,
    marginBottom: 6,
  },

  // Note header (timestamp + syncing badge)
  noteHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginBottom:   6,
  },
  pendingBadge: {
    fontSize:          11,
    color:             Colors.primaryBlue,
    fontWeight:        '500',
    backgroundColor:   '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical:   2,
    borderRadius:      10,
  },

  // Note content
  noteText: {
    fontSize:   15,
    color:      Colors.textPrimary,
    lineHeight: 22,
  },
  collapseToggle: {
    marginTop:       8,
    alignSelf:       'flex-start',
    paddingVertical: 4,
  },
  collapseToggleText: {
    fontSize:   13,
    color:      Colors.primaryBlue,
    fontWeight: '500',
  },

  // Note action bar (edit / delete)
  noteActions: {
    flexDirection: 'row',
    marginTop:     10,
    gap:           12,
  },
  noteActionButton: {
    paddingVertical:   6,
    paddingHorizontal: 12,
    borderRadius:      6,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  noteActionEdit: {
    fontSize:   14,
    color:      Colors.primaryBlue,
    fontWeight: '500',
  },
  noteActionDelete: {
    fontSize:   14,
    color:      Colors.error,
    fontWeight: '500',
  },
  longPressHint: {
    marginTop: 8,
    fontSize:  11,
    color:     Colors.textDisabled,
    fontStyle: 'italic',
  },

  // Inline edit input (inside a note card)
  inlineEditInput: {
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      8,
    padding:           10,
    fontSize:          15,
    color:             Colors.textPrimary,
    minHeight:         80,
    backgroundColor:   Colors.background,
    textAlignVertical: 'top',
  },

  // Inline note input (new note panel)
  inlineNoteContainer: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    padding:         14,
    borderWidth:     1,
    borderColor:     Colors.primaryBlue,
  },
  inlineNoteInput: {
    borderWidth:       1,
    borderColor:       Colors.border,
    borderRadius:      8,
    padding:           10,
    fontSize:          15,
    color:             Colors.textPrimary,
    minHeight:         100,
    backgroundColor:   Colors.background,
    textAlignVertical: 'top',
    marginBottom:      10,
  },
  inlineNoteActions: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    gap:            10,
  },
  inlineNoteCancelButton: {
    paddingVertical:   10,
    paddingHorizontal: 16,
    borderRadius:      8,
    borderWidth:       1,
    borderColor:       Colors.border,
  },
  inlineNoteCancelText: {
    fontSize:   14,
    color:      Colors.textSecondary,
    fontWeight: '500',
  },
  inlineNoteSaveButton: {
    paddingVertical:   10,
    paddingHorizontal: 16,
    borderRadius:      8,
    backgroundColor:   Colors.primaryBlue,
  },
  inlineNoteSaveButtonDisabled: {
    backgroundColor: Colors.textDisabled,
  },
  inlineNoteSaveText: {
    fontSize:   14,
    color:      Colors.surface,
    fontWeight: '600',
  },
  inlineNoteSaveTextDisabled: {
    color: '#94A3B8',
  },

  // Scan record
  scanRow: {
    flexDirection: 'row',
    gap:           12,
  },
  thumbnailPlaceholder: {
    width:           72,
    height:          72,
    borderRadius:    8,
    backgroundColor: '#E2E8F0',
    justifyContent:  'center',
    alignItems:      'center',
    flexShrink:      0,
  },
  thumbnailPlaceholderText: {
    fontSize:   12,
    color:      Colors.textSecondary,
    fontWeight: '500',
  },
  scanMeta: {
    flex: 1,
  },
  ocrPreview: {
    fontSize:     14,
    color:        Colors.textPrimary,
    lineHeight:   20,
    marginBottom: 8,
  },
  ocrStatusText: {
    fontSize:     13,
    color:        Colors.textSecondary,
    fontStyle:    'italic',
    marginBottom: 8,
  },
  viewScanButton: {
    alignSelf:       'flex-start',
    paddingVertical: 4,
  },
  viewScanText: {
    fontSize:   13,
    color:      Colors.primaryBlue,
    fontWeight: '500',
  },

  // Empty state
  emptyState: {
    alignItems:        'center',
    justifyContent:    'center',
    paddingVertical:   48,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize:     18,
    fontWeight:   '600',
    color:        Colors.textSecondary,
    marginBottom: 8,
    textAlign:    'center',
  },
  emptyStateSubtitle: {
    fontSize:   14,
    color:      Colors.textDisabled,
    textAlign:  'center',
    lineHeight: 20,
  },

  // Bottom action bar
  bottomBar: {
    backgroundColor:   Colors.surface,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
    paddingHorizontal: 16,
    paddingVertical:   12,
    paddingBottom:     20,
    gap:               10,
  },
  bottomBarAddRow: {
    flexDirection: 'row',
    gap:           10,
  },
  addScanButton: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     Colors.textDisabled,
    alignItems:      'center',
    backgroundColor: Colors.background,
  },
  addScanButtonText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.textSecondary,
  },
  addNoteButton: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     Colors.primaryBlue,
    alignItems:      'center',
    backgroundColor: Colors.surface,
  },
  addNoteButtonDisabled: {
    borderColor:     Colors.textDisabled,
    backgroundColor: Colors.background,
  },
  addNoteButtonText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },
  addNoteButtonTextDisabled: {
    color: Colors.textDisabled,
  },
  finishVisitButton: {
    paddingVertical: 16,
    borderRadius:    12,
    backgroundColor: Colors.primaryBlue,
    alignItems:      'center',
    justifyContent:  'center',
  },
  finishVisitButtonDisabled: {
    backgroundColor: Colors.textDisabled,
  },
  finishVisitButtonText: {
    fontSize:   16,
    fontWeight: '700',
    color:      Colors.surface,
  },
  finishVisitButtonTextDisabled: {
    color: '#94A3B8',
  },

  // Session expired banner (D4-SA-H2)
  sessionExpiredBanner: {
    backgroundColor:   '#FEE2E2',
    borderBottomWidth: 1,
    borderBottomColor: '#FCA5A5',
    paddingHorizontal: 16,
    paddingVertical:   10,
  },
  sessionExpiredText: {
    fontSize:   14,
    color:      '#DC2626',
    fontWeight: '500',
    textAlign:  'center',
  },
});
