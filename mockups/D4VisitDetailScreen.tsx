/**
 * D4VisitDetailScreen.tsx
 * D4 — Visit Detail
 * Static mockup — implements ui-ux-spec.md § D4
 *
 * Four exported variants:
 *   D4VisitDetailOwnOpenWithRecords      — own visit, status=open, has note + scan records;
 *                                          bottom bar visible with Add Scan / Add Note /
 *                                          Submit Visit buttons; inline note input demo
 *   D4VisitDetailOwnSubmitted            — own visit, status=submitted; bottom bar hidden;
 *                                          all records read-only
 *   D4VisitDetailOtherDoctorConsentGranted — other doctor's visit, consent_granted=true;
 *                                            chief_complaint rendered
 *   D4VisitDetailOtherDoctorNoConsent    — other doctor's visit, consent_granted=false;
 *                                          chief_complaint NOT rendered (D4-H-1 / D3-H-1
 *                                          consent gate must carry into D4)
 *
 * PM build constraints (reviews/D4-pm-review.md):
 *   1. Consent gate: chief_complaint hidden when consent_granted=false AND visit belongs
 *      to another doctor. Must be enforced at render layer — same rule as D3-H-1.
 *   2. Content order: chief_complaint + notes section first; scans section below.
 *      A doctor has ~15 seconds mid-consultation — clinical text must be above the fold.
 *   3. Scan section: non-blocking async placeholder; "View Scan" navigates to D8 (stub).
 *   4. DPDP: visit_viewed audit event stubbed in (actual write in live screen).
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
  Image,
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
  id:           string;
  type:         'scan';
  ocrPreview:   string | null;   // first 2 lines of OCR text (null if OCR pending/failed)
  ocrStatus:    'success' | 'pending' | 'failed' | 'skipped';
  createdAt:    string;           // display string e.g. "18/02/2026 · 10:32 AM"
  hasLocalImage: boolean;         // true → show placeholder thumbnail; false → spinner
}

interface NoteRecord {
  id:          string;
  type:        'note';
  text:        string;
  createdAt:   string;
  isLong:      boolean;          // if true, show collapse toggle after 4 lines
}

type VisitRecord = ScanRecord | NoteRecord;

interface VisitData {
  visitDate:      string;   // DD/MM/YYYY
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
  doctorName:     'Dr. Arvind Krishnamurthy',
  clinicName:     'Sri Dhanvantri Clinic, Bangalore',
  status:         'open',
  chiefComplaint: 'Persistent cough, mild fever for 4 days',
  consentGranted: true,
  isOwnVisit:     true,
  records: [
    {
      id:          'r1',
      type:        'note',
      text:        'Patient reports dry cough worsening at night. No sputum. Temp 99.8°F. SpO2 98%. Throat mildly inflamed. Prescribed Tab. Azithromycin 500mg OD × 5 days and Tab. Cetirizine 10mg HS.',
      createdAt:   '12/04/2026 · 11:15 AM',
      isLong:      false,
    },
    {
      id:           'r2',
      type:         'scan',
      ocrPreview:   'Tab. Azithromycin 500mg — 1 tab daily × 5\nTab. Cetirizine 10mg — 1 tab at night',
      ocrStatus:    'success',
      createdAt:    '12/04/2026 · 11:18 AM',
      hasLocalImage: true,
    },
  ],
};

const OWN_SUBMITTED_VISIT: VisitData = {
  visitDate:      '22/03/2026',
  doctorName:     'Dr. Arvind Krishnamurthy',
  clinicName:     'Sri Dhanvantri Clinic, Bangalore',
  status:         'submitted',
  chiefComplaint: 'Routine checkup — diabetes review',
  consentGranted: true,
  isOwnVisit:     true,
  records: [
    {
      id:          'r3',
      type:        'note',
      text:        'FBS 118 mg/dL — borderline. HbA1c 6.8%. Advised dietary changes. Metformin 500mg BD continued. Review in 3 months.',
      createdAt:   '22/03/2026 · 09:45 AM',
      isLong:      false,
    },
    {
      id:           'r4',
      type:         'scan',
      ocrPreview:   'Fasting Blood Sugar: 118 mg/dL\nHbA1c: 6.8%',
      ocrStatus:    'success',
      createdAt:    '22/03/2026 · 09:47 AM',
      hasLocalImage: true,
    },
    {
      id:           'r5',
      type:         'scan',
      ocrPreview:   null,
      ocrStatus:    'failed',
      createdAt:    '22/03/2026 · 09:50 AM',
      hasLocalImage: true,
    },
  ],
};

const OTHER_DOCTOR_CONSENT_VISIT: VisitData = {
  visitDate:      '05/01/2026',
  doctorName:     'Dr. Meera Sundaram',
  clinicName:     'City Health Clinic, Mysuru',
  status:         'submitted',
  chiefComplaint: 'Lower back pain — L4-L5 disc bulge follow-up',
  consentGranted: true,
  isOwnVisit:     false,
  records: [
    {
      id:          'r6',
      type:        'note',
      text:        'Patient on Etoricoxib 60mg OD. Pain score 4/10 down from 7/10. Physiotherapy x 10 sessions completed. Advised core strengthening exercises. Next review 3 months.',
      createdAt:   '05/01/2026 · 03:20 PM',
      isLong:      false,
    },
    {
      id:           'r7',
      type:         'scan',
      ocrPreview:   'MRI Lumbar Spine (31/12/2025)\nL4-L5 disc bulge — mild, no cord compression',
      ocrStatus:    'success',
      createdAt:    '05/01/2026 · 03:22 PM',
      hasLocalImage: true,
    },
  ],
};

// consent_granted=false — chief_complaint must NOT render (D4-H-1)
const OTHER_DOCTOR_NO_CONSENT_VISIT: VisitData = {
  visitDate:      '11/11/2025',
  doctorName:     'Dr. Rajesh Nair',
  clinicName:     'Apollo Clinic, Kozhikode',
  status:         'submitted',
  chiefComplaint: 'Chest pain — rule out cardiac cause',   // must NOT render in UI
  consentGranted: false,
  isOwnVisit:     false,
  records: [
    {
      id:          'r8',
      type:        'note',
      text:        'ECG and Echo findings available in scan records.',
      createdAt:   '11/11/2025 · 06:40 PM',
      isLong:      false,
    },
    {
      id:           'r9',
      type:         'scan',
      ocrPreview:   'ECG: Normal sinus rhythm. QTc 412ms.',
      ocrStatus:    'success',
      createdAt:    '11/11/2025 · 06:43 PM',
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

/** A single scan record row */
function ScanRecordRow({
  record,
  onViewScan,
}: {
  record: ScanRecord;
  onViewScan: () => void;
}) {
  return (
    <View style={styles.recordCard} accessibilityLabel="Scan record">
      <View style={styles.scanRow}>
        {/* Thumbnail loads async — does not block text content above */}
        <ScanThumbnail hasLocalImage={record.hasLocalImage} />
        <View style={styles.scanMeta}>
          <Text style={styles.recordTimestamp}>{record.createdAt}</Text>
          {record.ocrStatus === 'success' && record.ocrPreview ? (
            <Text style={styles.ocrPreview} numberOfLines={2}>
              {record.ocrPreview}
            </Text>
          ) : record.ocrStatus === 'pending' ? (
            <Text style={styles.ocrStatusText}>OCR processing…</Text>
          ) : record.ocrStatus === 'failed' ? (
            <Text style={[styles.ocrStatusText, { color: C.error }]}>
              OCR unavailable — tap to view image
            </Text>
          ) : (
            <Text style={styles.ocrStatusText}>No extracted text</Text>
          )}
          {/* D8 stub — disabled until D8 is built (PM constraint) */}
          <TouchableOpacity
            onPress={onViewScan}
            accessibilityLabel="View full scan"
            style={styles.viewScanButton}
          >
            <Text style={styles.viewScanText}>View Scan →</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/** A single note record row, with collapse toggle for long notes */
function NoteRecordRow({ record }: { record: NoteRecord }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.recordCard} accessibilityLabel="Note record">
      <Text style={styles.recordTimestamp}>{record.createdAt}</Text>
      <Text
        style={styles.noteText}
        numberOfLines={record.isLong && !expanded ? 4 : undefined}
      >
        {record.text}
      </Text>
      {record.isLong && (
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
    </View>
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

  // D4-H-1: consent gate — only show chief_complaint when this is own visit
  // OR when consent_granted=true for another doctor's visit.
  // When consent_granted=false AND !isOwnVisit → must not render.
  const showChiefComplaint =
    visit.isOwnVisit || visit.consentGranted;

  // Separate note records (render first per PM constraint) from scan records (render below)
  const noteRecords = visit.records.filter((r): r is NoteRecord => r.type === 'note');
  const scanRecords = visit.records.filter((r): r is ScanRecord => r.type === 'scan');

  const hasRecords = visit.records.length > 0;

  function handleSubmitVisit() {
    Alert.alert(
      'Submit Visit?',
      'Once submitted, this visit will be locked. You will not be able to add or edit records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: () => {
            // Mockup — no real action
            Alert.alert('Visit submitted', 'This visit has been submitted.');
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
            <View style={styles.metaRow}>
              <Text style={styles.visitDate}>{visit.visitDate}</Text>
              <StatusBadge status={visit.status} />
            </View>
            <Text style={styles.doctorName}>{visit.doctorName}</Text>
            <Text style={styles.clinicName}>{visit.clinicName}</Text>

            {/* Consent warning banner — shown when viewing another doctor's visit without consent */}
            {!visit.isOwnVisit && !visit.consentGranted && (
              <View style={styles.consentBanner} accessibilityLabel="No consent granted">
                <Text style={styles.consentBannerText}>
                  Patient consent not granted — some clinical content is hidden.
                </Text>
              </View>
            )}
          </View>

          {/* ── Chief complaint (PM constraint: first, above records) ─ */}
          {/*   D4-H-1: hidden when consent_granted=false + other doctor   */}
          {showChiefComplaint && visit.chiefComplaint ? (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Chief Complaint</Text>
              <View style={styles.chiefComplaintBox}>
                <Text style={styles.chiefComplaintText}>{visit.chiefComplaint}</Text>
              </View>
            </View>
          ) : !showChiefComplaint ? (
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
                <NoteRecordRow key={r.id} record={r} />
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
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* ── Bottom action bar (open visits only) ─────────────── */}
        {visit.status === 'open' && (
          <View style={styles.bottomBar}>
            <View style={styles.bottomBarRow}>
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

              {/* Submit Visit — greyed until at least one record exists */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  !hasRecords && styles.submitButtonDisabled,
                ]}
                accessibilityLabel={
                  hasRecords ? 'Submit visit' : 'Submit visit — add a record first'
                }
                onPress={hasRecords ? handleSubmitVisit : undefined}
                disabled={!hasRecords}
              >
                <Text
                  style={[
                    styles.submitButtonText,
                    !hasRecords && styles.submitButtonTextDisabled,
                  ]}
                >
                  Submit Visit
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Exported variants
// ---------------------------------------------------------------------------

/** Own visit, open, has a note + scan — bottom bar visible */
export function D4VisitDetailOwnOpenWithRecords() {
  return <D4VisitDetailScreen visit={OWN_OPEN_VISIT} />;
}

/** Own visit, submitted — all records read-only, bottom bar hidden */
export function D4VisitDetailOwnSubmitted() {
  return <D4VisitDetailScreen visit={OWN_SUBMITTED_VISIT} />;
}

/**
 * Other doctor's visit, consent_granted=true
 * chief_complaint IS visible — consent gate passes
 */
export function D4VisitDetailOtherDoctorConsentGranted() {
  return <D4VisitDetailScreen visit={OTHER_DOCTOR_CONSENT_VISIT} />;
}

/**
 * Other doctor's visit, consent_granted=false
 * chief_complaint must NOT render — D4-H-1 consent gate
 * Consent warning banner shown
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
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 16,
    paddingVertical:  12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    minWidth: 48,
    minHeight: 48,
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
  doctorName: {
    fontSize:   15,
    fontWeight: '600',
    color:      '#1A202C',
    marginBottom: 2,
  },
  clinicName: {
    fontSize:  13,
    color:     '#64748B',
  },

  // Status badge
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    borderRadius:   20,
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
    marginTop:        10,
    backgroundColor:  '#FEF3C7',
    borderRadius:     8,
    padding:          10,
    borderWidth:      1,
    borderColor:      '#FCD34D',
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
    fontSize:     12,
    fontWeight:   '600',
    color:        '#64748B',
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
    marginTop: 6,
    minHeight: 32,
    justifyContent: 'center',
  },
  collapseToggleText: {
    fontSize:   13,
    color:      '#1A6DB5',
    fontWeight: '500',
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
    fontSize:   13,
    color:      '#1A202C',
    lineHeight: 18,
    marginBottom: 6,
  },
  ocrStatusText: {
    fontSize:     12,
    color:        '#64748B',
    fontStyle:    'italic',
    marginBottom:  6,
  },
  viewScanButton: {
    alignSelf:  'flex-start',
    minHeight:  36,
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
    fontSize:     15,
    color:        '#1A202C',
    minHeight:    80,
    textAlignVertical: 'top',
    lineHeight:   22,
  },
  inlineNoteActions: {
    flexDirection:  'row',
    justifyContent: 'flex-end',
    marginTop:      10,
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
    borderRadius:       8,
    minHeight:          44,
    justifyContent:     'center',
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
    alignItems:   'center',
    paddingTop:    48,
    paddingBottom: 32,
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

  // Bottom action bar
  bottomBar: {
    backgroundColor:  '#FFFFFF',
    borderTopWidth:   1,
    borderTopColor:   '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical:   12,
    paddingBottom:     20, // extra clearance for home-indicator bar
  },
  bottomBarRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:             8,
  },
  addScanButton: {
    flex:              1,
    paddingVertical:   12,
    backgroundColor:   '#FFF7ED',
    borderRadius:       8,
    borderWidth:        1,
    borderColor:        '#EA580C',
    alignItems:         'center',
    minHeight:          48,
    justifyContent:     'center',
  },
  addScanButtonText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#EA580C',
  },
  addNoteButton: {
    flex:              1,
    paddingVertical:   12,
    backgroundColor:   '#EFF6FF',
    borderRadius:       8,
    borderWidth:        1,
    borderColor:        '#1A6DB5',
    alignItems:         'center',
    minHeight:          48,
    justifyContent:     'center',
  },
  addNoteButtonText: {
    fontSize:   14,
    fontWeight: '600',
    color:      '#1A6DB5',
  },
  submitButton: {
    flex:              1,
    paddingVertical:   12,
    backgroundColor:   '#16A34A',
    borderRadius:       8,
    alignItems:         'center',
    minHeight:          48,
    justifyContent:     'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#E2E8F0',
  },
  submitButtonText: {
    fontSize:   14,
    fontWeight: '700',
    color:      '#FFFFFF',
  },
  submitButtonTextDisabled: {
    color: '#94A3B8',
  },
});
