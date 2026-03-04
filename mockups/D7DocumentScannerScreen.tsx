/**
 * D7DocumentScannerScreen — Static Mockup
 *
 * Spec:         docs/ui-ux-spec.md § D7 Document Scanner
 * Constraints:  docs/project-state.md § Build Constraints — D7
 * PM review:    reviews/D7-pm-preflow.md
 * Checklist:    reviews/D7-VALIDATION-CHECKLIST.md
 *
 * What this screen does:
 *   Full-screen camera capture of physical medical documents (prescriptions,
 *   lab reports, referral letters). Provides a document guide rectangle,
 *   real-time exposure indicator (advisory only — does not block capture),
 *   flash toggle, and a "Use Photo Library" fallback for patients who
 *   already have photos of their records. After capture the doctor sees a
 *   full-screen preview with corner crop handles and either confirms
 *   ("Use This") or discards ("Retake"). On confirmation the image is
 *   compressed, saved to a doctor-scoped local path, OCR is queued
 *   asynchronously, and control returns to the calling screen.
 *
 * Entry points:
 *   D6 (New Visit) — orange camera button "Scan a Document"
 *     navigation.navigate('DocumentScanner', { patientId, visitId })
 *   D4 (Visit Detail) — "Add Scan" button on an open visit
 *     navigation.navigate('DocumentScanner', { patientId, visitId })
 *
 * Exit points:
 *   Confirmed capture →
 *     navigation.navigate('NewVisit' | 'VisitDetail', {
 *       scan: { localPath: string, label: string }
 *     })
 *     Caller (D6/D4) writes localPath + label to visits_draft and
 *     includes scan in enqueueOperation payload. Closes D6 MEDIUM-3.
 *   Cancelled (back before capture, or Retake → back) →
 *     navigation.goBack()  — no file written, no state change in caller
 *
 * State variants (separate named exports):
 *   D7ViewfinderGood        — primary: camera live, exposure OK
 *   D7ViewfinderTooDark     — exposure advisory: Too Dark
 *   D7ViewfinderOverexposed — exposure advisory: Overexposed
 *   D7PreviewState          — post-capture image + crop handles
 *   D7ProcessingState       — "Use This" in flight; spinner; button disabled
 *
 * PM pre-flow requirements (reviews/D7-pm-preflow.md):
 *
 *   PM REQ 1 — Doctor-scoped image directory:
 *     const dir = `${FileSystem.documentDirectory}${doctorId}/scans/`;
 *     await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
 *     const localPath = `${dir}${randomUUID()}.jpg`;
 *     Logout: FileSystem.deleteAsync(dir, { idempotent: true }) in useLogout
 *
 *   PM REQ 2 — Aadhaar strip before SQLite write:
 *     sanitizeOcrText() strips \d{4}\s?\d{4}\s?\d{4} (spaced and unspaced)
 *     Called on raw OCR output before any INSERT into records / visits_draft
 *
 *   PM REQ 3 — Full scan → visits_draft → enqueueOperation path:
 *     { localPath, label } returned to D6/D4 on "Use This"
 *     D6 writes both fields to visits_draft + enqueueOperation payload
 *     Closes D6 MEDIUM-3 (scans silently dropped on save)
 *
 * Rules applied (LESSONS-AND-RUNBOOK.md § 3.4):
 *   Rule 7  — Modal mounted unconditionally; controlled via visible prop only
 *   Rule 9  — Camera parent View: flex:1, backgroundColor:'#000000', explicit dims
 *   Rule 10 — All camera-overlay labels: white text on semi-transparent dark pill
 *             // requires device contrast verification
 *   Tap guard — useRef(false) on capture + "Use This"; no double-fire
 *   Auth guard — if (!token || !user) return null after all hooks, before JSX
 *
 * Placeholder data: realistic Indian clinical context
 * No real camera API calls — mock functions return promises with fake data
 */

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ---------------------------------------------------------------------------
// Design tokens — ui-ux-spec.md
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Shared placeholder data — realistic Indian clinical context
// ---------------------------------------------------------------------------
const PATIENT = {
  name:    'Sunita Ramesh Patil',
  mobile:  '97654 32109',
  localId: 'patient-local-b2c3d4e5',
};

const DOCTOR = {
  id:     'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  name:   'Dr. Priya Nair',
  clinic: 'Arogya Clinic, Nashik',
};

const VISIT = {
  localId: 'visit-local-f6a7b8c9',
  date:    '04/03/2026',
};

// Mock auth — in live build: const { token, user } = useAuthStore()
// Auth guard pattern (applied after all hooks, before JSX in each variant):
//   if (!token || !user) return null
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.bW9ja3Rva2Vu.signature';
const MOCK_USER  = { id: DOCTOR.id, name: DOCTOR.name };

// ---------------------------------------------------------------------------
// PM REQ 2 — Aadhaar strip stub (reviews/D7-pm-preflow.md)
//
// Called at the write boundary before any OCR text reaches SQLite.
// Applied inside the OCR result handler: sanitizeOcrText(rawOcrOutput)
// before INSERT into records table or visits_draft.
// Strips both spaced (xxxx xxxx xxxx) and unspaced (xxxxxxxxxxxx) forms.
// ---------------------------------------------------------------------------
function sanitizeOcrText(rawText: string): string {
  return rawText
    .replace(/\d{4}\s\d{4}\s\d{4}/g, '[REDACTED]') // spaced Aadhaar format
    .replace(/\d{12}/g, '[REDACTED]');               // unspaced 12-digit sequences
}

// ---------------------------------------------------------------------------
// Mock camera functions
// Real build: expo-camera CameraView ref + expo-image-manipulator
// ---------------------------------------------------------------------------

/**
 * PM REQ 1 — Doctor-scoped path (shown in comment; real build below).
 *
 * Real implementation:
 *   import * as FileSystem from 'expo-file-system';
 *   import * as Crypto from 'expo-crypto';
 *   const dir = `${FileSystem.documentDirectory}${doctorId}/scans/`;
 *   await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
 *   const result = await cameraRef.current.takePictureAsync({ quality: 1 });
 *   const localPath = `${dir}${Crypto.randomUUID()}.jpg`;
 *   (compression via expo-image-manipulator happens before final write)
 *
 * Logout cleanup in useLogout hook:
 *   const dir = `${FileSystem.documentDirectory}${doctorId}/scans/`;
 *   await FileSystem.deleteAsync(dir, { idempotent: true });
 */
async function mockCapturePicture(doctorId: string): Promise<string> {
  await new Promise<void>(resolve => setTimeout(resolve, 500)); // shutter delay
  // PM REQ 1: doctor-scoped path pattern
  return `file:///data/user/0/com.medrecord/${doctorId}/scans/raw-capture.jpg`;
}

/**
 * PM REQ 3 — Returns { localPath, label } to the calling screen (D6 or D4).
 *
 * Real implementation:
 *   1. expo-image-manipulator: compress to <1MB (compress: 0.7, format: JPEG)
 *   2. FileSystem.moveAsync: move compressed file to doctor-scoped path
 *   3. Return { localPath, label } — caller writes to visits_draft +
 *      enqueueOperation payload. Closes D6 MEDIUM-3 (scan silently dropped).
 *   4. Queue OCR asynchronously via POST /ocr/queue — never blocks this return.
 *   5. sanitizeOcrText() applied to raw OCR output before any SQLite write.
 *      (PM REQ 2 — Aadhaar strip at the write boundary)
 */
async function mockUseThis(
  _rawPath: string,
  doctorId: string,
): Promise<{ localPath: string; label: string }> {
  await new Promise<void>(resolve => setTimeout(resolve, 1200)); // compress + save
  // PM REQ 1: doctor-scoped final path — live build uses Crypto.randomUUID() (expo-crypto)
  const mockUUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'; // placeholder; live build: randomUUID()
  const localPath = `file:///data/user/0/com.medrecord/${doctorId}/scans/${mockUUID}.jpg`;
  const label = `Document – 04/03/2026`;
  return { localPath, label };
}

// ---------------------------------------------------------------------------
// PM REQ 2 — OCR queue stub: demonstrates sanitizeOcrText() call site
// HIGH-1 fix (reviews/D7-security-audit.md)
//
// Real build: called fire-and-forget after "Use This" saves the image.
// sanitizeOcrText() MUST be applied at the SQLite write boundary —
// before any INSERT/UPDATE to visits_draft — not at display time.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function queueOcrAsync(_localPath: string, _visitId: string): Promise<void> {
  // Real build: POST /ocr/queue — fire-and-forget, never awaited in capture flow.
  // When OCR result arrives (webhook / polling):
  //   const rawOcrText: string = await fetchOcrResult(_localPath);
  //   const safeText = sanitizeOcrText(rawOcrText); // ← strip Aadhaar at write boundary
  //   await db.runAsync(
  //     'UPDATE visits_draft SET ocr_text = ? WHERE id = ?',
  //     [safeText, _visitId]  // ← parameterised — no string concatenation
  //   );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ExposureState = 'too_dark' | 'good' | 'overexposed';
type FlashMode    = 'off' | 'on' | 'auto';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Exposure indicator — advisory only, never blocks the capture button.
 * Rule 10: white text on semi-transparent dark overlay.
 */
interface ExposureIndicatorProps {
  state: ExposureState;
}
function ExposureIndicator({ state }: ExposureIndicatorProps) {
  const config: Record<ExposureState, { label: string; dotColor: string }> = {
    too_dark:    { label: 'Too Dark — move to better light',    dotColor: Colors.error },
    good:        { label: 'Good',                               dotColor: Colors.success },
    overexposed: { label: 'Overexposed — reduce direct light',  dotColor: Colors.warning },
  };
  const { label, dotColor } = config[state];
  return (
    // requires device contrast verification (Rule 10)
    <View style={styles.exposurePill} accessibilityLabel={`Lighting: ${label}`}>
      <View style={[styles.exposureDot, { backgroundColor: dotColor }]} />
      <Text style={styles.exposureText}>{label}</Text>
    </View>
  );
}

/**
 * Document guide rectangle — centred in viewfinder.
 * Corner bracket accents show the four corners of the scan zone.
 */
function GuideRectangle() {
  return (
    <View style={styles.guideRect} pointerEvents="none">
      {/* Corner bracket: top-left */}
      <View style={[styles.corner, styles.cornerTL]} />
      {/* Corner bracket: top-right */}
      <View style={[styles.corner, styles.cornerTR]} />
      {/* Corner bracket: bottom-left */}
      <View style={[styles.corner, styles.cornerBL]} />
      {/* Corner bracket: bottom-right */}
      <View style={[styles.corner, styles.cornerBR]} />
      {/* requires device contrast verification (Rule 10) */}
      <Text style={styles.guideLabel}>Align document within frame</Text>
    </View>
  );
}

/** Crop handles — four corner brackets on the preview image. */
function CropHandles() {
  return (
    <>
      <View style={[styles.cropHandle, styles.cropTL]}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} />
      <View style={[styles.cropHandle, styles.cropTR]}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} />
      <View style={[styles.cropHandle, styles.cropBL]}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} />
      <View style={[styles.cropHandle, styles.cropBR]}
            hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }} />
    </>
  );
}

interface FlashToggleProps {
  mode: FlashMode;
  onPress: () => void;
}
function FlashToggle({ mode, onPress }: FlashToggleProps) {
  const label: Record<FlashMode, string> = {
    off:  'Flash: Off',
    on:   'Flash: On',
    auto: 'Flash: Auto',
  };
  const symbol: Record<FlashMode, string> = {
    off:  '⚡̶',
    on:   '⚡',
    auto: '⚡A',
  };
  return (
    // requires device contrast verification (Rule 10)
    <TouchableOpacity
      style={styles.flashToggle}
      onPress={onPress}
      accessibilityLabel={`${label[mode]}. Tap to change.`}
      accessibilityRole="button"
    >
      <Text style={styles.flashToggleText}>{symbol[mode]}</Text>
    </TouchableOpacity>
  );
}

/**
 * Large orange capture button.
 * Outer ring (white border) + orange filled circle — standard camera affordance.
 * Tap guard: see isCapturingRef in parent — this component receives a guarded onPress.
 */
interface CaptureButtonProps {
  onPress: () => void;
  disabled?: boolean;
}
function CaptureButton({ onPress, disabled = false }: CaptureButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.captureRing, disabled && styles.captureRingDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Capture document"
      accessibilityRole="button"
      accessibilityHint="Takes a photo of the document"
    >
      <View style={styles.captureCore} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// State 1a — Viewfinder: Good Exposure (primary variant)
//
// Rule 9: cameraContainer is the parent View with explicit dimensions +
//         backgroundColor:'#000000'. Real build wraps expo-camera CameraView here.
// Rule 7: Modal for preview mounted unconditionally; visible={false} in this
//         state. In live build, visible={showPreview} transitions to D7PreviewState
//         content after mockCapturePicture() resolves.
// ---------------------------------------------------------------------------
export function D7ViewfinderGood() {
  // Auth guard — in live build: const { token, user } = useAuthStore()
  const token = MOCK_TOKEN;
  const user  = MOCK_USER;

  const [flashMode, setFlashMode] = useState<FlashMode>('off');

  // Tap guard — useRef (synchronous), not useState (async lag creates race window)
  // LESSONS-AND-RUNBOOK.md § 3.3
  const isCapturingRef = useRef(false);

  // Auth guard AFTER all hooks — Rules of Hooks (D2/D3/D6 pattern)
  if (!token || !user) return null;

  const handleCapture = async () => {
    if (isCapturingRef.current) return; // second tap blocked synchronously
    isCapturingRef.current = true;
    try {
      // PM REQ 1: doctor-scoped path used inside mockCapturePicture
      await mockCapturePicture(user.id);
      // Live build: setShowPreview(true) → Modal becomes visible
    } finally {
      isCapturingRef.current = false;
    }
  };

  const cycleFlash = () =>
    setFlashMode(prev => (prev === 'off' ? 'on' : prev === 'on' ? 'auto' : 'off'));

  return (
    <SafeAreaView style={styles.fullScreenSafe}>
      {/*
        Rule 9: Parent View with explicit flex:1 + backgroundColor:'#000000'.
        Real build: replace inner View comment with expo-camera CameraView.
        backgroundColor:'#000000' prevents white flash on camera mount.
      */}
      <View style={styles.cameraContainer}>

        {/* ── Simulated camera feed ──────────────────────────────────────────
            Real build: <CameraView
              style={styles.cameraFeed}
              flash={flashMode}
              ref={cameraRef}
            />
        ──────────────────────────────────────────────────────────────────── */}
        <View style={styles.cameraFeed}>

          {/* Top bar — back button and flash toggle */}
          {/* requires device contrast verification (Rule 10) */}
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.topBarButton}
              accessibilityLabel="Cancel and go back"
              accessibilityRole="button"
            >
              {/* requires device contrast verification (Rule 10) */}
              <Text style={styles.topBarSymbol}>✕</Text>
            </TouchableOpacity>
            <FlashToggle mode={flashMode} onPress={cycleFlash} />
          </View>

          {/* Document guide rectangle — centred in viewfinder */}
          <GuideRectangle />

          {/* Bottom controls: exposure indicator, capture button, photo library */}
          <View style={styles.bottomControls}>
            {/*
              Exposure indicator — advisory only.
              Does NOT disable the capture button. Doctor can always capture.
              project-state.md D7 constraint: "Include a simple
              exposure/readability indicator... Do not rely on OCR feedback."
            */}
            <ExposureIndicator state="good" />

            <CaptureButton onPress={handleCapture} />

            <TouchableOpacity
              style={styles.photoLibraryBtn}
              accessibilityLabel="Choose from photo library"
              accessibilityRole="button"
            >
              {/* requires device contrast verification (Rule 10) */}
              <Text style={styles.photoLibraryText}>Use Photo Library</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/*
        Rule 7: Modal mounted unconditionally in the React tree.
        NEVER: {showPreview && <Modal>} — causes blank screen on iOS
        (native presentation animation fires before content renders).
        Controlled via `visible` prop only.
        Live build: visible={showPreview}
        Mockup: visible={false} — preview shown as separate export D7PreviewState.
        LESSONS-AND-RUNBOOK.md § 3.4 Rule 7.
      */}
      <Modal
        visible={false}
        animationType="slide"
        statusBarTranslucent
        accessibilityViewIsModal
      >
        {/* D7PreviewState / D7ProcessingState content rendered here in live build */}
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// State 1b — Viewfinder: Too Dark
// Exposure indicator shows "Too Dark" warning.
// Capture button remains enabled — advisory only, does not block.
// ---------------------------------------------------------------------------
export function D7ViewfinderTooDark() {
  const token = MOCK_TOKEN;
  const user  = MOCK_USER;

  const isCapturingRef = useRef(false);

  // Auth guard AFTER all hooks — Rules of Hooks (D2/D3/D6 pattern)
  if (!token || !user) return null;

  const handleCapture = async () => {
    // Indicator is advisory — capture proceeds even when "Too Dark"
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    try {
      await mockCapturePicture(user.id);
    } finally {
      isCapturingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.fullScreenSafe}>
      {/* Rule 9: parent View with backgroundColor:'#000000' */}
      <View style={styles.cameraContainer}>
        {/* Darker background simulates poor lighting condition */}
        <View style={[styles.cameraFeed, styles.cameraFeedDark]}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topBarButton} accessibilityLabel="Cancel" accessibilityRole="button">
              <Text style={styles.topBarSymbol}>✕</Text>
            </TouchableOpacity>
            <FlashToggle mode="off" onPress={() => {}} />
          </View>

          <GuideRectangle />

          <View style={styles.bottomControls}>
            {/* Advisory indicator — does NOT disable capture */}
            <ExposureIndicator state="too_dark" />
            <CaptureButton onPress={handleCapture} />
            <TouchableOpacity style={styles.photoLibraryBtn} accessibilityLabel="Choose from photo library" accessibilityRole="button">
              <Text style={styles.photoLibraryText}>Use Photo Library</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Rule 7: Modal unconditionally mounted */}
      <Modal visible={false} animationType="slide" statusBarTranslucent>
        {/* preview content */}
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// State 1c — Viewfinder: Overexposed
// Exposure indicator shows "Overexposed" warning.
// Capture button remains enabled — advisory only.
// ---------------------------------------------------------------------------
export function D7ViewfinderOverexposed() {
  const token = MOCK_TOKEN;
  const user  = MOCK_USER;

  const isCapturingRef = useRef(false);

  // Auth guard AFTER all hooks — Rules of Hooks (D2/D3/D6 pattern)
  if (!token || !user) return null;

  const handleCapture = async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    try {
      await mockCapturePicture(user.id);
    } finally {
      isCapturingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.fullScreenSafe}>
      {/* Rule 9: parent View with backgroundColor:'#000000' */}
      <View style={styles.cameraContainer}>
        {/* Slightly lighter background simulates harsh/direct light condition */}
        <View style={[styles.cameraFeed, styles.cameraFeedBright]}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.topBarButton} accessibilityLabel="Cancel" accessibilityRole="button">
              <Text style={styles.topBarSymbol}>✕</Text>
            </TouchableOpacity>
            <FlashToggle mode="on" onPress={() => {}} />
          </View>

          <GuideRectangle />

          <View style={styles.bottomControls}>
            {/* Advisory indicator — does NOT disable capture */}
            <ExposureIndicator state="overexposed" />
            <CaptureButton onPress={handleCapture} />
            <TouchableOpacity style={styles.photoLibraryBtn} accessibilityLabel="Choose from photo library" accessibilityRole="button">
              <Text style={styles.photoLibraryText}>Use Photo Library</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Rule 7: Modal unconditionally mounted */}
      <Modal visible={false} animationType="slide" statusBarTranslucent>
        {/* preview content */}
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// ErrorState — shown when D7 is entered without a valid visitId.
// CRITICAL-2 fix (reviews/D7-security-audit.md): a scan must never be written
// to disk without a confirmed visitId — orphaned files have no cleanup path
// on logout and no enqueueOperation entry for server sync.
// ---------------------------------------------------------------------------
interface ErrorStateProps { message: string; }
function ErrorState({ message }: ErrorStateProps) {
  return (
    <SafeAreaView style={styles.fullScreenSafe}>
      <View style={styles.errorStateContainer}>
        <Text style={styles.errorStateText}>{message}</Text>
        {/* Live build: onPress={() => navigation.goBack()} */}
        <TouchableOpacity
          style={styles.errorStateButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.errorStateButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// State 2 — Preview: Captured image with crop handles
//
// "Use This" — primary action (Primary Blue #1A6DB5)
// "Retake"   — secondary; returns to viewfinder, no file retained
//
// Tap guard: isProcessingRef on "Use This" prevents double-submit.
// Back/swipe-back during preview: live build uses
//   navigation.addListener('beforeRemove') for discard confirmation.
// ---------------------------------------------------------------------------
export function D7PreviewState() {
  const token = MOCK_TOKEN;
  const user  = MOCK_USER;

  // visitId — in live build: const { visitId } = useRoute<DocumentScannerRouteProp>().params
  const visitId = VISIT.localId;

  // Tap guard on "Use This" — useRef not useState (LESSONS-AND-RUNBOOK.md § 3.3)
  const isProcessingRef = useRef(false);

  // Auth guard AFTER all hooks — Rules of Hooks (D2/D3/D6 pattern)
  if (!token || !user) return null;

  // CRITICAL-2 fix: visitId must be non-null before any scan write.
  // Orphaned file risk: a scan saved without a visitId has no visits_draft row,
  // no enqueueOperation entry, and no cleanup path on logout.
  if (!visitId) {
    return <ErrorState message="No visit context — cannot attach scan." />;
  }

  const handleUseThis = async () => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    try {
      // PM REQ 3: { localPath, label } returned to caller (D6 or D4)
      // Caller writes localPath + label to visits_draft and includes
      // scan in enqueueOperation payload — closes D6 MEDIUM-3.
      const result = await mockUseThis('mock-raw-path.jpg', user.id);
      // Live build:
      //   navigation.navigate('NewVisit', { scan: result });
      //   OR navigation.navigate('VisitDetail', { scan: result });
      // [D7 mockup] result: { localPath, label } — do not log in live build
      void result;
    } finally {
      isProcessingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.fullScreenSafe}>
      <View style={styles.previewContainer}>

        {/* Top bar: Retake (left) + title (centre) */}
        {/* requires device contrast verification (Rule 10) */}
        <View style={styles.previewTopBar}>
          <TouchableOpacity
            style={styles.retakeButton}
            accessibilityLabel="Retake — discard this photo and try again"
            accessibilityRole="button"
          >
            {/* requires device contrast verification (Rule 10) */}
            <Text style={styles.retakeText}>‹  Retake</Text>
          </TouchableOpacity>
          <Text style={styles.previewTitle}>Review Scan</Text>
          {/* Balance spacer so title sits centred */}
          <View style={styles.previewTitleSpacer} />
        </View>

        {/* Captured document image — with crop handles at corners */}
        <View style={styles.previewImageWrapper}>
          {/*
            Real build: <Image source={{ uri: capturedPath }} style={StyleSheet.absoluteFill}
                          resizeMode="contain" accessibilityLabel="Captured document" />
          */}
          <View style={styles.previewImagePlaceholder}>
            <Text style={styles.previewDocIcon}>📄</Text>
            <Text style={styles.previewDocLabel}>
              Lab Report — Sunita Ramesh Patil{'\n'}
              Thyroid Function Test · 04/03/2026{'\n'}
              Dr. R. Krishnaswamy, Nashik Lab
            </Text>
          </View>

          {/* Crop handles — interactive drag targets in live build */}
          <CropHandles />
        </View>

        <Text style={styles.cropHint}>Drag corners to adjust crop</Text>

        {/* Primary action */}
        <View style={styles.previewActionBar}>
          <TouchableOpacity
            style={styles.useThisButton}
            onPress={handleUseThis}
            accessibilityLabel="Use this scan — confirm and attach to visit"
            accessibilityRole="button"
          >
            <Text style={styles.useThisText}>Use This</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// State 3 — Processing: "Use This" in flight
//
// Shows spinner, disables the action button, prevents double-capture.
// This state is entered immediately when doctor taps "Use This".
// Screen returns to caller (D6/D4) when mockUseThis() resolves.
// ---------------------------------------------------------------------------
export function D7ProcessingState() {
  const token = MOCK_TOKEN;
  const user  = MOCK_USER;
  // Auth guard AFTER all hooks — Rules of Hooks (D2/D3/D6 pattern)
  // (D7ProcessingState has no hooks; guard is already in correct position)
  if (!token || !user) return null;
  void user; // consumed via mockUseThis in live build

  return (
    <SafeAreaView style={styles.fullScreenSafe}>
      <View style={styles.previewContainer}>

        {/* Top bar locked — no user action available during processing */}
        {/* requires device contrast verification (Rule 10) */}
        <View style={styles.previewTopBar}>
          <View style={styles.previewTitleSpacer} />
          <Text style={styles.previewTitle}>Saving…</Text>
          <View style={styles.previewTitleSpacer} />
        </View>

        {/* Same image layout as preview — dimmed to show processing */}
        <View style={styles.previewImageWrapper}>
          <View style={[styles.previewImagePlaceholder, styles.previewImageDimmed]}>
            <Text style={styles.previewDocIcon}>📄</Text>
            <Text style={styles.previewDocLabel}>
              Lab Report — Sunita Ramesh Patil{'\n'}
              Thyroid Function Test · 04/03/2026{'\n'}
              Dr. R. Krishnaswamy, Nashik Lab
            </Text>
          </View>
          <CropHandles />

          {/* Processing overlay — spinner centred on image */}
          {/* requires device contrast verification (Rule 10) */}
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="large" color={Colors.surface} />
            <Text style={styles.processingLabel}>Compressing and saving…</Text>
          </View>
        </View>

        <Text style={styles.cropHint}> </Text>

        {/* "Use This" disabled — isProcessingRef blocks any re-tap */}
        <View style={styles.previewActionBar}>
          <View
            style={styles.useThisButtonDisabled}
            accessibilityLabel="Saving in progress"
          >
            <ActivityIndicator size="small" color={Colors.surface} style={{ marginRight: 10 }} />
            <Text style={styles.useThisText}>Saving…</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Default export — primary state for Expo Go preview
// ---------------------------------------------------------------------------
export default function D7DocumentScannerScreen() {
  // Default view renders the primary camera state (Good exposure).
  // Switch export to D7ViewfinderTooDark, D7ViewfinderOverexposed,
  // D7PreviewState, or D7ProcessingState to review other states.
  return <D7ViewfinderGood />;
}

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({

  // ── Shared: full-screen safe area (black — camera context) ────────────────
  fullScreenSafe: {
    flex:            1,
    backgroundColor: '#000000',
  },

  // ── Rule 9: Camera container ───────────────────────────────────────────────
  // Parent View with explicit flex:1 + backgroundColor:'#000000'.
  // Real build: wraps expo-camera CameraView.
  // backgroundColor prevents white flash on native camera mount.
  cameraContainer: {
    flex:            1,
    backgroundColor: '#000000', // Rule 9: explicit background
  },

  // Simulated camera feed (dark slate to suggest camera preview)
  // Real build: replaced by expo-camera CameraView
  cameraFeed: {
    flex:            1,
    backgroundColor: '#1C1C28',
  },
  cameraFeedDark: {
    backgroundColor: '#080810', // "Too Dark" variant
  },
  cameraFeedBright: {
    backgroundColor: '#353548', // "Overexposed" variant (lighter)
  },

  // ── Top bar ────────────────────────────────────────────────────────────────
  topBar: {
    flexDirection:   'row',
    justifyContent:  'space-between',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingTop:      12,
    paddingBottom:   8,
    zIndex:          10,
  },
  topBarButton: {
    width:           48,
    height:          48,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(0,0,0,0.45)', // Rule 10: dark overlay
    borderRadius:    24,
  },
  topBarSymbol: {
    // requires device contrast verification (Rule 10)
    color:           Colors.surface,
    fontSize:        20,
    fontWeight:      '600',
  },

  // ── Flash toggle ───────────────────────────────────────────────────────────
  flashToggle: {
    width:           48,
    height:          48,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: 'rgba(0,0,0,0.45)', // Rule 10: dark overlay
    borderRadius:    24,
  },
  flashToggleText: {
    // requires device contrast verification (Rule 10)
    color:           Colors.surface,
    fontSize:        18,
    fontWeight:      '600',
  },

  // ── Document guide rectangle ───────────────────────────────────────────────
  guideRect: {
    position:        'absolute',
    top:             '18%',
    left:            '8%',
    right:           '8%',
    bottom:          '30%',
    borderWidth:     1,
    borderColor:     'rgba(255,255,255,0.45)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  guideLabel: {
    // requires device contrast verification (Rule 10)
    color:           'rgba(255,255,255,0.75)',
    fontSize:        13,
    fontWeight:      '500',
    textAlign:       'center',
    backgroundColor: 'rgba(0,0,0,0.30)', // Rule 10: dark pill behind text
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius:    12,
  },

  // Corner bracket accents at four corners of guide rectangle
  corner: {
    position:    'absolute',
    width:       22,
    height:      22,
    borderColor: '#FFFFFF',
  },
  cornerTL: {
    top:          -2,
    left:         -2,
    borderTopWidth:  3,
    borderLeftWidth: 3,
  },
  cornerTR: {
    top:           -2,
    right:         -2,
    borderTopWidth:   3,
    borderRightWidth: 3,
  },
  cornerBL: {
    bottom:          -2,
    left:            -2,
    borderBottomWidth: 3,
    borderLeftWidth:   3,
  },
  cornerBR: {
    bottom:           -2,
    right:            -2,
    borderBottomWidth: 3,
    borderRightWidth:  3,
  },

  // ── Bottom controls (exposure + capture + photo library) ──────────────────
  bottomControls: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    paddingBottom:   36,
    alignItems:      'center',
    gap:             16,
  },

  // Exposure indicator pill — Rule 10: white text on dark overlay
  exposurePill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: 'rgba(0,0,0,0.55)', // Rule 10: semi-transparent dark
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius:    20,
  },
  exposureDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  exposureText: {
    // requires device contrast verification (Rule 10)
    color:      Colors.surface,
    fontSize:   14,
    fontWeight: '500',
  },

  // Capture button — orange outer ring + orange filled core
  captureRing: {
    width:           80,
    height:          80,
    borderRadius:    40,
    borderWidth:     4,
    borderColor:     Colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: Colors.scanOrange, // Scan Orange #EA580C per ui-ux-spec.md
  },
  captureCore: {
    width:           62,
    height:          62,
    borderRadius:    31,
    backgroundColor: Colors.scanOrange,
    opacity:         0.9,
  },
  captureRingDisabled: {
    opacity: 0.4,
  },

  // "Use Photo Library" link — secondary action below capture button
  photoLibraryBtn: {
    paddingHorizontal: 20,
    paddingVertical:   10,
    minHeight:         44,
    alignItems:        'center',
    justifyContent:    'center',
  },
  photoLibraryText: {
    // requires device contrast verification (Rule 10)
    color:      Colors.surface,
    fontSize:   15,
    fontWeight: '600',
  },

  // ── Preview container ──────────────────────────────────────────────────────
  previewContainer: {
    flex:            1,
    backgroundColor: '#000000',
  },

  // Preview top bar — dark overlay for legibility (Rule 10)
  previewTopBar: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.65)', // Rule 10: dark overlay
  },
  previewTitle: {
    // requires device contrast verification (Rule 10)
    color:      Colors.surface,
    fontSize:   16,
    fontWeight: '600',
  },
  retakeButton: {
    minHeight:       48,
    justifyContent:  'center',
    paddingRight:    12,
  },
  retakeText: {
    // requires device contrast verification (Rule 10)
    color:      Colors.surface,
    fontSize:   16,
    fontWeight: '500',
  },
  previewTitleSpacer: {
    width: 80, // balances the retake button width so title is centred
  },

  // Preview image area — fills available space between top bar and action bar
  previewImageWrapper: {
    flex:         1,
    marginHorizontal: 20,
    marginVertical:   16,
    // position:'relative' is React Native default — crop handles position within this
  },
  previewImagePlaceholder: {
    flex:            1,
    backgroundColor: '#1E2030', // dark slate — simulates captured document
    borderRadius:    8,
    alignItems:      'center',
    justifyContent:  'center',
  },
  previewImageDimmed: {
    opacity: 0.4, // dimmed during processing
  },
  previewDocIcon: {
    fontSize: 52,
  },
  previewDocLabel: {
    // requires device contrast verification (Rule 10)
    color:      'rgba(255,255,255,0.80)',
    fontSize:   14,
    textAlign:  'center',
    lineHeight: 22,
    marginTop:  12,
  },

  // Crop handles — corner bracket touch targets on the preview image
  // Draggable in live build; visual-only in mockup
  cropHandle: {
    position:    'absolute',
    width:       22,
    height:      22,
    borderColor: Colors.surface,
  },
  cropTL: {
    top:          0,
    left:         0,
    borderTopWidth:  3,
    borderLeftWidth: 3,
  },
  cropTR: {
    top:            0,
    right:          0,
    borderTopWidth:   3,
    borderRightWidth: 3,
  },
  cropBL: {
    bottom:          0,
    left:            0,
    borderBottomWidth: 3,
    borderLeftWidth:   3,
  },
  cropBR: {
    bottom:           0,
    right:            0,
    borderBottomWidth: 3,
    borderRightWidth:  3,
  },

  cropHint: {
    // requires device contrast verification (Rule 10)
    color:     'rgba(255,255,255,0.55)',
    fontSize:  13,
    textAlign: 'center',
    marginBottom: 4,
  },

  // ── Action bar (preview + processing) ────────────────────────────────────
  previewActionBar: {
    paddingHorizontal: 20,
    paddingBottom:     36,
    paddingTop:        8,
  },
  useThisButton: {
    backgroundColor: Colors.primaryBlue, // Primary Blue #1A6DB5
    borderRadius:    12,
    paddingVertical: 17,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    minHeight:       56,
  },
  useThisButtonDisabled: {
    backgroundColor: 'rgba(26,109,181,0.55)',
    borderRadius:    12,
    paddingVertical: 17,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    minHeight:       56,
  },
  useThisText: {
    color:      Colors.surface,
    fontSize:   17,
    fontWeight: '700',
  },

  // Processing overlay — spinner centred on dimmed image
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.50)', // Rule 10: dark overlay for spinner
    alignItems:      'center',
    justifyContent:  'center',
    borderRadius:    8,
  },
  processingLabel: {
    // requires device contrast verification (Rule 10)
    color:      Colors.surface,
    fontSize:   15,
    fontWeight: '500',
    marginTop:  14,
  },

  // ── ErrorState — CRITICAL-2 fix (reviews/D7-security-audit.md) ────────────
  errorStateContainer: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         32,
  },
  errorStateText: {
    color:      Colors.error,
    fontSize:   16,
    fontWeight: '600',
    textAlign:  'center',
    marginBottom: 24,
  },
  errorStateButton: {
    backgroundColor:  Colors.primaryBlue,
    borderRadius:     12,
    paddingHorizontal: 24,
    paddingVertical:  14,
    minHeight:        48,
    alignItems:       'center',
    justifyContent:   'center',
  },
  errorStateButtonText: {
    color:      Colors.surface,
    fontSize:   16,
    fontWeight: '600',
  },
});
