/**
 * D4VisitDetailScreen.tsx
 * D4 — Visit Detail
 * Static mockup — implements ui-ux-spec.md § D4
 *
 * Four exported variants:
 *   D4VisitDetailOwnOpenWithRecords      — own visit, status=open, has note + scan records;
 *                                          bottom bar visible with Add Scan / Add Note /
 *                                          Finish Visit buttons; inline note input demo;
 *                                          note edit/delete affordance on long-press
 *   D4VisitDetailOwnSubmitted            — own visit, status=submitted; bottom bar hidden;
 *                                          all records read-only
 *   D4VisitDetailOtherDoctorConsentGranted — other doctor's visit, consent_granted=true;
 *                                            chief_complaint rendered; all records visible
 *   D4VisitDetailOtherDoctorNoConsent    — other doctor's visit, consent_granted=false;
 *                                          chief_complaint NOT rendered (D4-H-1);
 *                                          notes AND scan OCR hidden per consent-layer-spec.md
 *                                          ("View records by other doctors: ❌ without consent")
 *
 * PM build constraints (reviews/D4-pm-review.md):
 *   1. Consent gate: when consent_granted=false AND visit belongs to another doctor,
 *      chief_complaint, notes text, and scan OCR previews must all be hidden.
 *      Only the structural presence of records (count/type) may be indicated.
 *   2. Content order: chief_complaint + notes section first; scans section below.
 *   3. Scan section: non-blocking async placeholder; "View Scan" navigates to D8 (stub).
 *   4. DPDP: visit_viewed audit event stubbed in (actual write in live screen).
 *
 * Persona critique fixes applied (D4 Step 4):
 *   MUST FIX — consent gate extended to notes + scan OCR (consent-layer-spec §§ "Without Consent")
 *   MUST FIX — "Submit Visit" renamed to "Finish Visit"
 *   SHOULD FIX — patient name added to meta card
 *   SHOULD FIX — bottom bar: add-buttons row 1, full-width Finish Visit row 2
 *   SHOULD FIX — note edit/delete on long-press while visit is open
 *
 * No real data wired. All content is static placeholder.
 */

import React, { useState } from 'react';
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
  Platform,
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
  scanOrange:    '#EA580C',
};

// ---------------------------------------------------------------------------
// Placeholder data — Indian names, clinic names, clinical content
// ---------------------------------------------------------------------------
interface ScanRecord {
  id:            string;
  type:          'scan';
  ocrPreview:    string | null;   // first 2 lines of OCR text (null if OCR pending/failed)
  ocrStatus:     'success' | 'pending' | 'failed' | 'skipped';
  createdAt:     string;           // display string e.g. "18/02/2026 · 10:32 AM"
  hasLocalImage: boolean;          // true → show placeholder thumbnail; false → spinner
}

interface NoteRecord {
  id:        string;
  type:      'note';
  text:      string;
  createdAt: string;
  isLong:    boolean;              // if true, show collapse toggle after 4 lines
}

type VisitRecord = ScanRecord | NoteRecord;

interface VisitData {
  visitDate:      string;   // DD/MM/YYYY
  patientName:    string;   // first name + family initial, shown in meta card
  doctorName:     string;
  clinicName:     string;
  status:         'open' | 'submitted';
  chiefComplaint: string | null;
  consentGranted: boolean;
  isOwnVisit:     boolean;
  records:        VisitRecord[];
}

const OWN_OPEN_VISIT: VisitData = {
  visitDate:      '12/04/2026',
  patientName:    'Rekha S.',
  doctorName:     'Dr. Arvind Krishnamurthy',
  clinicName:     'Sri Dhanvantri Clinic, Bangalore',
  status:         'open',
  chiefComplaint: 'Persistent cough, mild fever for 4 days',
  consentGranted: true,
  isOwnVisit:     true,
  records: [
    {
      id:        'r1',
      type:      'note',
      text:      'Patient reports dry cough worsening at night. No sputum. Temp 99.8°F. SpO2 98%. Throat mildly inflamed. Prescribed Tab. Azithromycin 500mg OD × 5 days and Tab. Cetirizine 10mg HS.',
      createdAt: '12/04/2026 · 11:15 AM',
      isLong:    false,
    },
    {
      id:            'r2',
      type:          'scan',
      ocrPreview:    'Tab. Azithromycin 500mg — 1 tab daily × 5\nTab. Cetirizine 10mg — 1 tab at night',
      ocrStatus:     'success',
      createdAt:     '12/04/2026 · 11:18 AM',
      hasLocalImage: true,
    },
  ],
};

const OWN_SUBMITTED_VISIT: VisitData = {
  visitDate:      '22/03/2026',
  patientName:    'Meena P.',
  doctorName:     'Dr. Arvind Krishnamurthy',
  clinicName:     'Sri Dhanvantri Clinic, Bangalore',
  status:         'submitted',
  chiefComplaint: 'Routine checkup — diabetes review',
  consentGranted: true,
  isOwnVisit:     true,
  records: [
    {
      id:        'r3',
      type:      'note',
      text:      'FBS 118 mg/dL — borderline. HbA1c 6.8%. Advised dietary changes. Metformin 500mg BD continued. Review in 3 months.',
      createdAt: '22/03/2026 · 09:45 AM',
      isLong:    false,
    },
    {
      id:            'r4',
      type:          'scan',
      ocrPreview:    'Fasting Blood Sugar: 118 mg/dL\nHbA1c: 6.8%',
      ocrStatus:     'success',
      createdAt:     '22/03/2026 · 09:47 AM',
      hasLocalImage: true,
    },
    {
      id:            'r5',
      type:          'scan',
      ocrPreview:    null,
      ocrStatus:     'failed',
      createdAt:     '22/03/2026 · 09:50 AM',
      hasLocalImage: true,
    },
  ],
};

const OTHER_DOCTOR_CONSENT_VISIT: VisitData = {
  visitDate:      '05/01/2026',
  patientName:    'Suresh V.',
  doctorName:     'Dr. Meera Sundaram',
  clinicName:     'City Health Clinic, Mysuru',
  status:         'submitted',
  chiefComplaint: 'Lower back pain — L4-L5 disc bulge follow-up',
  consentGranted: true,
  isOwnVisit:     false,
  records: [
    {
      id:        'r6',
      type:      'note',
      text:      'Patient on Etoricoxib 60mg OD. Pain score 4/10 down from 7/10. Physiotherapy x 10 sessions completed. Advised core strengthening exercises. Next review 3 months.',
      createdAt: '05/01/2026 · 03:20 PM',
      isLong:    false,
    },
    {
      id:            'r7',
      type:          'scan',
      ocrPreview:    'MRI Lumbar Spine (31/12/2025)\nL4-L5 disc bulge — mild, no cord compression',
      ocrStatus:     'success',
      createdAt:     '05/01/2026 · 03:22 PM',
      hasLocalImage: true,
    },
  ],
};

// consent_granted=false — chief_complaint AND notes AND scan OCR must NOT render (D4-H-1)
// Per consent-layer-spec.md: "View records by other doctors: ❌ without consent"
const OTHER_DOCTOR_NO_CONSENT_VISIT: VisitData = {
  visitDate:      '11/11/2025',
  patientName:    'Arjun K.',
  doctorName:     'Dr. Rajesh Nair',
  clinicName:     'Apollo Clinic, Kozhikode',
  status:         'submitted',
  chiefComplaint: 'Chest pain — rule out cardiac cause',  // must NOT render in UI
  consentGranted: false,
  isOwnVisit:     false,
  records: [
    {
      id:        'r8',
      type:      'note',
      // Note text must NOT render when consent_granted=false — shows "Hidden" placeholder
      text:      'ECG and Echo findings available in scan records.',
      createdAt: '11/11/2025 · 06:40 PM',
      isLong:    false,
    },
    {
      id:            'r9',
      type:          'scan',
      // OCR preview must NOT render when consent_granted=false — shows "Hidden" placeholder
      ocrPreview:    'ECG: Normal sinus rhythm. QTc 412ms.',
      ocrStatus:     'success',
      createdAt:     '11/11/2025 · 06:43 PM',
      hasLocalImage: true,
    },
  ],
};

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

/** Status badge — "Open" (amber) or "Submitted" (green) */
function StatusBadge({ status }: { status: 'open' | 'submitted' }) {
  const isOpen = status === 'open';
  return (
    <View style={[styles.badge, { backgroundColor: isOpen ? '#FEF3C7' : '#DCFCE7' }]}>
      <View style={[styles.badgeDot, { backgroundColor: isOpen ? C.warning : C.success }]} />
      <Text style={[styles.badgeText, { color: isOpen ? C.warning : C.success }]}>
        {isOpen ? 'Open' : 'Submitted'}
      </Text>
    </View>
  );
}

/** Scan thumbnail placeholder — renders a grey box while image loads */
function ScanThumbnail({ hasLocalImage }: { hasLocalImage: boolean }) {
  if (!hasLocalImage) {
    return (
      <View style={styles.thumbnailPlaceholder} accessibilityLabel="Loading scan image">
        <Text style={styles.thumbnailLoadingText}>Loading…</Text>
      </View>
    );
  }
  // Static mockup: show a labelled grey placeholder instead of a real image
  return (
    <View style={styles.thumbnailPlaceholder} accessible={false}>
      <Text style={styles.thumbnailPlaceholderText}>Scan</Text>
    </View>
  );
}

/**
 * A single scan record row.
 * showContent=false when consent_granted=false + other doctor's visit — OCR hidden per spec.
 */
function ScanRecordRow({
  record,
  showContent,
  onViewScan,
}: {
  record: ScanRecord;
  showContent: boolean;
  onViewScan: () => void;
}) {
  return (
    <View style={styles.recordCard} accessibilityLabel="Scan record">
      <View style={styles.scanRow}>
        {/* Thumbnail loads async — does not block text content above */}
        <ScanThumbnail hasLocalImage={record.hasLocalImage} />
        <View style={styles.scanMeta}>
          <Text style={styles.recordTimestamp}>{record.createdAt}</Text>

          {/* OCR preview — hidden when consent not granted */}
          {!showContent ? (
            <Text style={styles.redactedText}>Content hidden — consent required</Text>
          ) : record.ocrStatus === 'success' && record.ocrPreview ? (
            <Text style={styles.ocrPreview} numberOfLines={2}>
              {record.ocrPreview}
            </Text>
          ) : record.ocrStatus === 'pending' ? (
            <Text style={styles.ocrStatusText}>Text extraction in progress…</Text>
          ) : record.ocrStatus === 'failed' ? (
            <Text style={[styles.ocrStatusText, { color: C.error }]}>
              Image only — text not extracted
            </Text>
          ) : (
            <Text style={styles.ocrStatusText}>No extracted text</Text>
          )}

          {/* D8 stub — disabled until D8 is built (PM constraint) */}
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
 * A single note record row.
 * canEdit=true shows edit/delete affordance on long-press (open visits only).
 * showContent=false when consent_granted=false + other doctor's visit — text hidden per spec.
 */
function NoteRecordRow({
  record,
  canEdit,
  showContent,
  onEdit,
  onDelete,
}: {
  record: NoteRecord;
  canEdit: boolean;
  showContent: boolean;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded]       = useState(false);
  const [actionsVisible, setActions]  = useState(false);
  const [editing, setEditing]         = useState(false);
  const [editText, setEditText]       = useState(record.text);

  function handleLongPress() {
    if (canEdit) setActions(!actionsVisible);
  }

  function handleSaveEdit() {
    setEditing(false);
    setActions(false);
    onEdit(record.id);
    // Mockup — no real action; live screen writes to SQLite + enqueueOperation
    Alert.alert('Note updated', editText.trim());
  }

  return (
    <TouchableOpacity
      style={styles.recordCard}
      accessibilityLabel="Note record"
      onLongPress={handleLongPress}
      activeOpacity={canEdit ? 0.7 : 1}
      delayLongPress={400}
    >
      <Text style={styles.recordTimestamp}>{record.createdAt}</Text>

      {/* Note content — hidden when consent not granted */}
      {!showContent ? (
        <Text style={styles.redactedText}>Note hidden — consent required</Text>
      ) : editing ? (
        /* Inline edit input */
        <View>
          <TextInput
            style={styles.inlineEditInput}
            value={editText}
            onChangeText={setEditText}
            multiline
            autoFocus
            accessibilityLabel="Edit note text"
          />
          <View style={styles.inlineNoteActions}>
            <TouchableOpacity
              onPress={() => { setEditing(false); setEditText(record.text); }}
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
          numberOfLines={record.isLong && !expanded ? 4 : undefined}
        >
          {record.text}
        </Text>
      )}

      {/* Collapse toggle for long notes */}
      {showContent && !editing && record.isLong && (
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

      {/* Edit / Delete actions — revealed on long-press (open visits only) */}
      {canEdit && actionsVisible && !editing && (
        <View style={styles.noteActions}>
          <TouchableOpacity
            onPress={() => { setEditing(true); }}
            style={styles.noteActionButton}
            accessibilityLabel="Edit this note"
          >
            <Text style={styles.noteActionEdit}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setActions(false);
              onDelete(record.id);
            }}
            style={styles.noteActionButton}
            accessibilityLabel="Delete this note"
          >
            <Text style={styles.noteActionDelete}>Delete</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Long-press hint — only shown while visit is open */}
      {canEdit && !actionsVisible && !editing && showContent && (
        <Text style={styles.longPressHint}>Hold to edit or delete</Text>
      )}
    </TouchableOpacity>
  );
}

/** Inline "Add Note" text input that slides up when triggered */
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
        placeholderTextColor={C.textDisabled}
        value={text}
        onChangeText={setText}
        multiline
        autoFocus
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
          style={[
            styles.inlineNoteSaveButton,
            !text.trim() && styles.inlineNoteSaveButtonDisabled,
          ]}
          disabled={!text.trim()}
          accessibilityLabel="Save note"
        >
          <Text
            style={[
              styles.inlineNoteSaveText,
              !text.trim() && styles.inlineNoteSaveTextDisabled,
            ]}
          >
            Save Note
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Core screen component — shared by all four variants
// ---------------------------------------------------------------------------
interface D4Props {
  visit: VisitData;
  /** Called when user taps "View Scan" — stubs D8 navigation */
  onViewScan?: (recordId: string) => void;
  /** Called when user taps "Add Scan" — stubs D7 navigation */
  onAddScan?: () => void;
}

function D4VisitDetailScreen({ visit, onViewScan, onAddScan }: D4Props) {
  const [showNoteInput, setShowNoteInput] = useState(false);

  // D4-H-1: consent gate — controls visibility of clinical content from other doctors.
  // Per consent-layer-spec.md table: "View records by other doctors: ❌ without consent"
  // When false: chief_complaint, notes text, AND scan OCR are all hidden.
  const showClinicalContent = visit.isOwnVisit || visit.consentGranted;

  // canEdit: note edit/delete affordance only on own open visits
  const canEditNotes = visit.isOwnVisit && visit.status === 'open';

  // Separate note records (render first per PM constraint) from scan records (render below)
  const noteRecords = visit.records.filter((r): r is NoteRecord => r.type === 'note');
  const scanRecords = visit.records.filter((r): r is ScanRecord => r.type === 'scan');

  const hasRecords = visit.records.length > 0;

  function handleFinishVisit() {
    Alert.alert(
      'Finish Visit?',
      'Once finished, this visit will be locked. You will not be able to add or edit records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Finish',
          style: 'destructive',
          onPress: () => {
            // Mockup — no real action
            Alert.alert('Visit finished', 'This visit has been closed.');
          },
        },
      ],
    );
  }

  function handleSaveNote(text: string) {
    setShowNoteInput(false);
    // Mockup — no real action; in live screen this writes to SQLite + enqueueOperation
    Alert.alert('Note saved', text);
  }

  function handleEditNote(_id: string) {
    // Mockup — handler wired in live screen; note update to SQLite + enqueueOperation
  }

  function handleDeleteNote(id: string) {
    Alert.alert(
      'Delete note?',
      'This note will be permanently removed from the visit.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Mockup — live screen deletes from SQLite + enqueueOperation (append-only server;
            // local soft-delete flagged for sync)
            Alert.alert('Note deleted', `Note ${id} removed (mockup).`);
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          accessibilityLabel="Go back"
          onPress={() => { /* mockup — no navigation */ }}
        >
          <Text style={styles.backButtonText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Visit Detail</Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Visit meta card ──────────────────────────────────── */}
          <View style={styles.metaCard}>
            {/* Date + status badge row */}
            <View style={styles.metaRow}>
              <Text style={styles.visitDate}>{visit.visitDate}</Text>
              <StatusBadge status={visit.status} />
            </View>

            {/* Patient name — prominently identifies who this visit belongs to */}
            <Text style={styles.patientName}>{visit.patientName}</Text>

            <Text style={styles.doctorName}>{visit.doctorName}</Text>
            <Text style={styles.clinicName}>{visit.clinicName}</Text>

            {/* Consent warning banner — shown when viewing another doctor's visit without consent */}
            {!visit.isOwnVisit && !visit.consentGranted && (
              <View style={styles.consentBanner} accessibilityLabel="No consent granted">
                <Text style={styles.consentBannerText}>
                  Patient consent not granted — clinical content from this visit is hidden.
                </Text>
              </View>
            )}
          </View>

          {/* ── Chief complaint (PM constraint: first, above records) ─ */}
          {/*   D4-H-1: hidden when consent_granted=false + other doctor   */}
          {showClinicalContent && visit.chiefComplaint ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Chief Complaint</Text>
              <View style={styles.chiefComplaintBox}>
                <Text style={styles.chiefComplaintText}>{visit.chiefComplaint}</Text>
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

          {/* ── Notes (PM constraint: above scans) ───────────────── */}
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

          {/* ── Inline note input (slides up when Add Note tapped) ── */}
          {showNoteInput && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>New Note</Text>
              <InlineNoteInput
                onSave={handleSaveNote}
                onCancel={() => setShowNoteInput(false)}
              />
            </View>
          )}

          {/* ── Scans (PM constraint: below notes) ───────────────── */}
          {scanRecords.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Scans</Text>
              {scanRecords.map((r) => (
                <ScanRecordRow
                  key={r.id}
                  record={r}
                  showContent={showClinicalContent}
                  onViewScan={() => {
                    if (onViewScan) {
                      onViewScan(r.id);
                    } else {
                      // D8 stub
                      Alert.alert('D8 stub', 'Full Scan View (D8) not yet built.');
                    }
                  }}
                />
              ))}
            </View>
          )}

          {/* ── Empty state ────────────────────────────────────────── */}
          {!hasRecords && !showNoteInput && (
            <View style={styles.emptyState} accessibilityLabel="No records">
              <Text style={styles.emptyStateTitle}>No records yet</Text>
              <Text style={styles.emptyStateSubtitle}>
                Add a scan or a note to start this visit record.
              </Text>
            </View>
          )}

          {/* Bottom padding so content clears the bottom bar */}
          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ── Bottom action bar (open visits only) ─────────────────────── */}
        {/*   Row 1: [+ Scan]  [+ Note]  — additive actions, equal weight   */}
        {/*   Row 2: [    Finish Visit   ] — full-width, visually distinct   */}
        {visit.status === 'open' && (
          <View style={styles.bottomBar}>
            {/* Row 1 — add-record buttons */}
            <View style={styles.bottomBarAddRow}>
              {/* Add Scan → D7 */}
              <TouchableOpacity
                style={styles.addScanButton}
                accessibilityLabel="Add scan"
                onPress={() => {
                  if (onAddScan) {
                    onAddScan();
                  } else {
                    Alert.alert('D7 stub', 'Document Scanner (D7) navigation stub.');
                  }
                }}
              >
                <Text style={styles.addScanButtonText}>+ Scan</Text>
              </TouchableOpacity>

              {/* Add Note → inline input */}
              <TouchableOpacity
                style={styles.addNoteButton}
                accessibilityLabel="Add note"
                onPress={() => setShowNoteInput(true)}
              >
                <Text style={styles.addNoteButtonText}>+ Note</Text>
              </TouchableOpacity>
            </View>

            {/* Row 2 — finish action, full-width, greyed until at least one record exists */}
            <TouchableOpacity
              style={[
                styles.finishVisitButton,
                !hasRecords && styles.finishVisitButtonDisabled,
              ]}
              accessibilityLabel={
                hasRecords ? 'Finish visit' : 'Finish visit — add a record first'
              }
              onPress={hasRecords ? handleFinishVisit : undefined}
              disabled={!hasRecords}
            >
              <Text
                style={[
                  styles.finishVisitButtonText,
                  !hasRecords && styles.finishVisitButtonTextDisabled,
                ]}
              >
                Finish Visit
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Exported variants
// ---------------------------------------------------------------------------

/** Own visit, open, has a note + scan — bottom bar visible; note edit/delete on long-press */
export function D4VisitDetailOwnOpenWithRecords() {
  return <D4VisitDetailScreen visit={OWN_OPEN_VISIT} />;
}

/** Own visit, submitted — all records read-only, bottom bar hidden */
export function D4VisitDetailOwnSubmitted() {
  return <D4VisitDetailScreen visit={OWN_SUBMITTED_VISIT} />;
}

/**
 * Other doctor's visit, consent_granted=true
 * chief_complaint, notes, and scan OCR are all visible — consent gate passes
 */
export function D4VisitDetailOtherDoctorConsentGranted() {
  return <D4VisitDetailScreen visit={OTHER_DOCTOR_CONSENT_VISIT} />;
}

/**
 * Other doctor's visit, consent_granted=false
 * chief_complaint, notes text, AND scan OCR must NOT render — D4-H-1 consent gate.
 * Per consent-layer-spec.md: "View records by other doctors: ❌ without consent"
 */
export function D4VisitDetailOtherDoctorNoConsent() {
  return <D4VisitDetailScreen visit={OTHER_DOCTOR_NO_CONSENT_VISIT} />;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex:            1,
    backgroundColor: '#F5F7FA',
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   12,
    backgroundColor:   '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    minWidth:       48,
    minHeight:      48,
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize:   16,
    color:      '#1A6DB5',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize:   18,
    fontWeight: '600',
    color:      '#0F4880',
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
    backgroundColor: '#FFFFFF',
    borderRadius:    12,
    padding:         16,
    marginBottom:    12,
    borderWidth:     1,
    borderColor:     '#E2E8F0',
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
    color:      '#0F4880',
  },
  patientName: {
    fontSize:     17,
    fontWeight:   '700',
    color:        '#1A202C',
    marginBottom: 6,
  },
  doctorName: {
    fontSize:     14,
    fontWeight:   '500',
    color:        '#64748B',
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
    marginRight:  5,
  },
  badgeText: {
    fontSize:   12,
    fontWeight: '600',
  },

  // Consent warning banner
  consentBanner: {
    marginTop:       10,
    backgroundColor: '#FEF3C7',
    borderRadius:    8,
    padding:         10,
    borderWidth:     1,
    borderColor:     '#FCD34D',
  },
  consentBannerText: {
    fontSize:   13,
    color:      '#92400E',
    lineHeight: 18,
  },

  // Sections
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize:      12,
    fontWeight:    '600',
    color:         '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:  8,
  },

  // Chief complaint
  chiefComplaintBox: {
    backgroundColor: '#FFFFFF',
    borderRadius:    10,
    padding:         14,
    borderWidth:     1,
    borderColor:     '#E2E8F0',
  },
  chiefComplaintText: {
    fontSize:   15,
    color:      '#1A202C',
    lineHeight: 22,
  },
  redactedBox: {
    backgroundColor: '#F8FAFC',
  },
  redactedText: {
    fontSize:  13,
    color:     '#CBD5E0',
    fontStyle: 'italic',
  },

  // Record cards
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius:    10,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     '#E2E8F0',
  },
  recordTimestamp: {
    fontSize:     12,
    color:        '#64748B',
    marginBottom:  6,
  },

  // Note record
  noteText: {
    fontSize:   15,
    color:      '#1A202C',
    lineHeight: 22,
  },
  collapseToggle: {
    marginTop:      6,
    minHeight:      32,
    justifyContent: 'center',
  },
  collapseToggleText: {
    fontSize:   13,
    color:      '#1A6DB5',
    fontWeight: '500',
  },
  // Note edit/delete actions revealed on long-press
  noteActions: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    marginTop:      10,
    gap:            12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop:     10,
  },
  noteActionButton: {
    minHeight:      36,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  noteActionEdit: {
    fontSize:   13,
    color:      '#1A6DB5',
    fontWeight: '600',
  },
  noteActionDelete: {
    fontSize:   13,
    color:      '#DC2626',
    fontWeight: '600',
  },
  // Subtle hint shown while visit is open
  longPressHint: {
    fontSize:   11,
    color:      '#CBD5E0',
    marginTop:  8,
    fontStyle:  'italic',
  },
  // Inline edit input (reuses note text styling but in an editable field)
  inlineEditInput: {
    fontSize:          15,
    color:             '#1A202C',
    minHeight:         60,
    textAlignVertical: 'top',
    lineHeight:        22,
    borderWidth:       1,
    borderColor:       '#1A6DB5',
    borderRadius:      8,
    padding:           10,
  },

  // Scan record
  scanRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
  },
  thumbnailPlaceholder: {
    width:           72,
    height:          72,
    borderRadius:     8,
    backgroundColor:  '#E2E8F0',
    alignItems:       'center',
    justifyContent:   'center',
    marginRight:      12,
    flexShrink:       0,
  },
  thumbnailLoadingText: {
    fontSize: 11,
    color:    '#64748B',
  },
  thumbnailPlaceholderText: {
    fontSize:   12,
    color:      '#64748B',
    fontWeight: '500',
  },
  scanMeta: {
    flex: 1,
  },
  ocrPreview: {
    fontSize:     13,
    color:        '#1A202C',
    lineHeight:   18,
    marginBottom:  6,
  },
  ocrStatusText: {
    fontSize:     12,
    color:        '#64748B',
    fontStyle:    'italic',
    marginBottom:  6,
  },
  viewScanButton: {
    alignSelf:      'flex-start',
    minHeight:       36,
    justifyContent: 'center',
  },
  viewScanText: {
    fontSize:   13,
    color:      '#1A6DB5',
    fontWeight: '500',
  },

  // Inline note input
  inlineNoteContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius:    10,
    padding:         14,
    borderWidth:     1,
    borderColor:     '#1A6DB5',
  },
  inlineNoteInput: {
    fontSize:          15,
    color:             '#1A202C',
    minHeight:          80,
    textAlignVertical: 'top',
    lineHeight:         22,
  },
  inlineNoteActions: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    marginTop:       10,
    gap:             10,
  },
  inlineNoteCancelButton: {
    paddingHorizontal: 16,
    paddingVertical:    10,
    minHeight:          44,
    justifyContent:     'center',
  },
  inlineNoteCancelText: {
    fontSize:   14,
    color:      '#64748B',
    fontWeight: '500',
  },
  inlineNoteSaveButton: {
    paddingHorizontal: 20,
    paddingVertical:    10,
    backgroundColor:    '#1A6DB5',
    borderRadius:        8,
    minHeight:           44,
    justifyContent:      'center',
  },
  inlineNoteSaveButtonDisabled: {
    backgroundColor: '#CBD5E0',
  },
  inlineNoteSaveText: {
    fontSize:   14,
    color:      '#FFFFFF',
    fontWeight: '600',
  },
  inlineNoteSaveTextDisabled: {
    color: '#94A3B8',
  },

  // Empty state
  emptyState: {
    alignItems:    'center',
    paddingTop:     48,
    paddingBottom:  32,
  },
  emptyStateTitle: {
    fontSize:     18,
    fontWeight:   '600',
    color:        '#64748B',
    marginBottom:  8,
  },
  emptyStateSubtitle: {
    fontSize:   14,
    color:      '#94A3B8',
    textAlign:  'center',
    lineHeight: 20,
  },

  // Bottom action bar — two rows
  bottomBar: {
    backgroundColor:   '#FFFFFF',
    borderTopWidth:    1,
    borderTopColor:    '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop:        12,
    paddingBottom:     20,  // extra clearance for home-indicator bar
    gap:               8,
  },
  // Row 1: additive actions (equal weight)
  bottomBarAddRow: {
    flexDirection: 'row',
    gap:           8,
  },
  addScanButton: {
    flex:            1,
    paddingVertical: 12,
    backgroundColor: '#FFF7ED',
    borderRadius:    8,
    borderWidth:     1,
    borderColor:     '#EA580C',
    alignItems:      'center',
    minHeight:       48,
    justifyContent:  'center',
  },
  addScanButtonText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#EA580C',
  },
  addNoteButton: {
    flex:            1,
    paddingVertical: 12,
    backgroundColor: '#EFF6FF',
    borderRadius:    8,
    borderWidth:     1,
    borderColor:     '#1A6DB5',
    alignItems:      'center',
    minHeight:       48,
    justifyContent:  'center',
  },
  addNoteButtonText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#1A6DB5',
  },
  // Row 2: finish action — full-width, visually distinct from add-buttons
  finishVisitButton: {
    paddingVertical: 14,
    backgroundColor: '#16A34A',
    borderRadius:    8,
    alignItems:      'center',
    minHeight:       52,
    justifyContent:  'center',
  },
  finishVisitButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  finishVisitButtonText: {
    fontSize:   16,
    fontWeight: '700',
    color:      '#FFFFFF',
  },
  finishVisitButtonTextDisabled: {
    color: '#94A3B8',
  },
});
