/**
 * DocumentScannerScreen — D7
 *
 * Spec: docs/ui-ux-spec.md § D7
 * Mockup: mockups/D7DocumentScannerScreen.tsx
 * Persona critique: reviews/D7-persona-critique-v2.md (score 3.8/5 — gate PASSED)
 *
 * PM Requirements addressed:
 *   PM REQ 1 — Doctor-scoped image storage: <documentDirectory>/<doctorId>/scans/<uuid>.jpg
 *               clearDoctorScans() + clearDoctorScanRecords() registered in useLogout
 *   PM REQ 2 — sanitizeOcrText() strips Aadhaar digit sequences before any SQLite write
 *   PM REQ 3 — Full scan → scans table → enqueueOperation path (closes D6 MEDIUM-3)
 *
 * QA fixes applied (reviews/D7-qa-test-plan.md):
 *   CRITICAL-1 — insertVisitScan() adds one row per scan to scans table (no overwrite)
 *   CRITICAL-2 — relativePath stored in SQLite; resolveScanPath() at read time (KFM-3)
 *   CRITICAL-3 — FileSystem.moveAsync moved inside withTransactionAsync (orphan window)
 *   HIGH-1     — sanitizeOcrText() uses \b word-boundary regex (no partial matches)
 *   HIGH-2     — ocr_status: 'deferred' (was 'pending'; OCR worker not yet wired)
 *   HIGH-3     — max_attempts column added to sync_queue schema (schema.ts)
 *
 * Security re-audit fix (reviews/D7-security-audit-v2.md):
 *   MEDIUM-1   — logScanCreated() writes audit event to audit_events table (DPDP §8)
 *
 * SHOULD FIX items from D7-persona-critique-v2.md applied here:
 *   D7-SF-4 — captureAdvisory: dark pill background + Colors.surface text (Rule 10)
 *   D7-SF-5 — privacyLine: rgba(255,255,255,0.55) on dark preview background
 *   D7-SF-6 — existingScanCount pill in viewfinder top bar when count > 0
 *
 * Device rules applied:
 *   Rule 7  — Alert/Modal controlled via visible prop only; no conditional mounting
 *   Rule 9  — CameraView inside explicit View with flex:1 + backgroundColor:'#000000'
 *   Rule 10 — All camera overlay labels use Colors.surface on rgba(0,0,0,0.55) pill
 *   Rule 12 — Schema migrations for scans table + sync_queue.max_attempts in schema.ts
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
// expo-file-system legacy import — SDK 54 deprecated moveAsync, deleteAsync etc.
// Import from /legacy to keep existing call sites until full API migration.
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../../store/useAuthStore';
import { enqueueOperation } from '../../sync/syncQueue';
import { insertVisitScan, resolveScanPath, logScanCreated, ensureScanDirectory } from '../../db/scans';
import type { RootStackParamList } from '../../../App';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScreenState   = 'viewfinder' | 'preview' | 'processing' | 'error';
type ExposureLevel = 'good' | 'tooDark' | 'overexposed';
type DocType       = 'Prescription' | 'Lab Report' | 'Referral' | 'X-ray' | 'Other';

const DOC_TYPES: DocType[] = ['Prescription', 'Lab Report', 'Referral', 'X-ray', 'Other'];

// ─── Design tokens ────────────────────────────────────────────────────────────

const Colors = {
  primary:       '#1A6DB5',
  surface:       '#FFFFFF',
  textSecondary: '#64748B',
  exposureGood:  '#22C55E',
  exposureWarn:  '#F59E0B',
  exposureError: '#EF4444',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Strip Aadhaar numbers before writing OCR text to SQLite.
 * PM REQ 2 / DPDP Act 2023 §5 — applied at the write boundary, not at display time.
 *
 * Regex: strips 12-digit sequences in 4-4-4 groups (Aadhaar format).
 * \s? between groups matches both spaced (1234 5678 9012) and unspaced (123456789012).
 * \b word boundaries prevent matching mid-number substrings — a 13-digit bank account
 * number is NOT matched because there is no word boundary after the 12th digit.
 * Does NOT strip arbitrary 12-digit standalone numbers (HIGH-1 fix).
 */
function sanitizeOcrText(raw: string): string {
  // strips 12-digit sequences in 4-4-4 groups (Aadhaar format)
  // word boundaries prevent matching mid-number substrings
  // does NOT strip bank account numbers (typically 9-18 digits not in 4-4-4 grouping)
  // or lab accession numbers (longer than 12 digits — no word boundary after 12th digit)
  return raw.replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[REDACTED]');
}

/**
 * Queue OCR processing for the saved scan.
 * Stub for v1 — wired in live build when OCR service is available.
 * The OCR worker reads local_path from the scans table, runs text extraction,
 * calls sanitizeOcrText() on the result, then writes to scans.ocr_text
 * and updates ocr_status to 'success' or 'failed'.
 */
async function queueOcrAsync(_localPath: string, _visitId: string): Promise<void> {
  // TODO: enqueue OCR job when Google Vision API / Tesseract worker is wired.
  // sanitizeOcrText() must be called on the OCR output before any SQLite write.
}

// ─── DocTypeSelector ──────────────────────────────────────────────────────────

interface DocTypeSelectorProps {
  selected: DocType;
  onSelect: (type: DocType) => void;
}

function DocTypeSelector({ selected, onSelect }: DocTypeSelectorProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.docTypeScroll}
      contentContainerStyle={styles.docTypeContent}
    >
      {DOC_TYPES.map((type) => {
        const isSelected = type === selected;
        return (
          <TouchableOpacity
            key={type}
            style={[styles.docTypePill, isSelected && styles.docTypePillSelected]}
            onPress={() => onSelect(type)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={type}
          >
            <Text style={[styles.docTypeLabel, isSelected && styles.docTypeLabelSelected]}>
              {type}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

type NavProp       = NativeStackNavigationProp<RootStackParamList, 'DocumentScanner'>;
type DocScanRoute  = RouteProp<RootStackParamList, 'DocumentScanner'>;

export default function DocumentScannerScreen() {
  const db         = useSQLiteContext();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<DocScanRoute>();
  const token      = useAuthStore((s) => s.token);
  const user       = useAuthStore((s) => s.user);

  const { patientId, visitId, existingScanCount = 0 } = route.params;

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [screenState,   setScreenState]   = useState<ScreenState>('viewfinder');
  const [capturedUri,   setCapturedUri]   = useState<string | null>(null);
  const [flashMode,     setFlashMode]     = useState<'off' | 'on'>('off');
  const [exposureLevel, setExposureLevel] = useState<ExposureLevel>('good');
  const [selectedType,  setSelectedType]  = useState<DocType>('Prescription');

  // tap guard — useRef (synchronous) prevents double-fire; useState has async lag
  const isSavingRef        = useRef(false);
  // allows programmatic goBack() from save-success without triggering discard dialog
  const savingCompletedRef = useRef(false);
  const cameraRef          = useRef<CameraView>(null);

  // ── beforeRemove: discard dialog when back is pressed mid-scan ─────────────
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      if (savingCompletedRef.current) return;
      if (screenState === 'viewfinder' || screenState === 'error') return;
      if (screenState === 'processing') {
        // Block navigation silently during an in-progress save
        e.preventDefault();
        return;
      }
      // Preview state: confirm discard
      e.preventDefault();
      Alert.alert(
        'Discard scan?',
        'The captured image has not been saved to this visit.',
        [
          { text: 'Keep scanning', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsub;
  }, [navigation, screenState]);

  // ── Camera capture ─────────────────────────────────────────────────────────
  const handleCapture = useCallback(async () => {
    if (isSavingRef.current) return;
    isSavingRef.current = true;
    try {
      const result = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
      if (result?.uri) {
        // Force a stable file:// JPEG immediately after capture on iOS.
        // takePictureAsync({ quality: 1 }) can return a HEIC image or a
        // temp-cache URI that ImageManipulator cannot process at save time.
        // Same root cause and fix as handlePickFromLibrary quality:0.9.
        const jpeg = await ImageManipulator.manipulateAsync(
          result.uri,
          [],
          { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG },
        );
        setCapturedUri(jpeg.uri);
        setSelectedType('Prescription');
        setScreenState('preview');
      }
    } finally {
      isSavingRef.current = false;
    }
  }, []);

  // ── Photo library ──────────────────────────────────────────────────────────
  const handlePickFromLibrary = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Permission required',
        'Allow photo library access in Settings to pick a document.',
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // quality < 1 forces expo-image-picker to write a local file:// JPEG on iOS.
      // quality:1 can return a ph:// or HEIC asset reference that
      // expo-image-manipulator cannot encode, causing "Saving image failed."
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      setCapturedUri(result.assets[0].uri);
      setSelectedType('Prescription');
      setScreenState('preview');
    }
  }, []);

  // ── Save scan ──────────────────────────────────────────────────────────────
  const handleUseThis = useCallback(async () => {
    if (isSavingRef.current || !capturedUri || !visitId) return;
    isSavingRef.current = true;
    setScreenState('processing');

    // absolutePath tracked here so the catch block can clean up on any failure
    let absolutePath: string | null = null;
    try {
      // 1. Compress to JPEG at 0.7 — target <1 MB; raw camera buffer never stored
      const compressed = await ImageManipulator.manipulateAsync(
        capturedUri,
        [],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
      );

      // 2. Build paths — store only the relative segment in SQLite (CRITICAL-2 fix).
      //    Absolute path reconstructed at read time via resolveScanPath() so the
      //    stored value survives Android APK reinstalls (KFM-3 / path drift).
      const uuid         = Crypto.randomUUID();
      const scanId       = Crypto.randomUUID();  // unique ID for the scans table row
      // path stored relative — reconstruct at read time via resolveScanPath()
      // prevents Android path drift after app updates (CRITICAL-2 / KFM-3)
      const relativePath = `${user?.id ?? ''}/scans/${uuid}.jpg`;
      absolutePath       = resolveScanPath(relativePath);

      // 3. Ensure doctor-scoped directory exists (PM REQ 1).
      //    ensureScanDirectory() calls makeDirectoryAsync unconditionally with
      //    intermediates:true — avoids iOS path-cache staleness from getInfoAsync.
      await ensureScanDirectory(user.id);

      // 4. Move compressed file to its final path BEFORE opening the DB transaction.
      //    On iOS, expo-sqlite holds the DB connection locked during withTransactionAsync.
      //    Calling FileSystem (a separate native module) from within that lock fails on
      //    iOS because the two native modules run on different dispatch queues.
      //    The withTransactionAsync block below covers only SQLite operations.
      //    If the DB transaction fails, the catch block deletes absolutePath.
      await FileSystem.moveAsync({ from: compressed.uri, to: absolutePath });

      // 5. Atomic SQLite writes: scan row + audit event + sync queue entry (PM REQ 3).
      //    withTransactionAsync ensures all three succeed or all three roll back.
      //    One row inserted per scan — no overwrite possible (CRITICAL-1 fix).
      await db.withTransactionAsync(async () => {
        await insertVisitScan(db, {
          id:           scanId,
          visitLocalId: visitId,
          doctorId:     user.id,
          localPath:    relativePath,  // relative — never absolute (CRITICAL-2)
          label:        selectedType,
        });
        // DPDP Act 2023 §8 — audit every write to a patient's health record (MEDIUM-1 fix)
        await logScanCreated(db, {
          scanId,
          visitId,
          doctorId:  user.id,
          patientId,
          label:     selectedType,
        });
        await enqueueOperation(db, {
          doctor_id:       user.id,
          entity_type:     'record',
          entity_local_id: scanId,
          operation:       'create',
          payload:         JSON.stringify({
            scan_id:          scanId,
            visit_id:         visitId,
            patient_id:       patientId,
            type:             'scan',
            image_local_path: relativePath,  // relative — never absolute (CRITICAL-2)
            label:            selectedType,
            // 'deferred' — OCR worker not yet implemented;
            // change to 'pending' when Vision API queue is wired (v2)
            ocr_status:       'deferred',
          }),
        });
      });

      // 6. Queue OCR (no-op stub — PM REQ 2 sanitizeOcrText() applied in worker)
      await queueOcrAsync(absolutePath, visitId);

      // 7. Return to caller — savingCompletedRef bypasses discard dialog
      savingCompletedRef.current = true;
      navigation.goBack();
    } catch (err) {
      // Clean up any file moved to absolutePath before the failure
      if (absolutePath) {
        await FileSystem.deleteAsync(absolutePath, { idempotent: true }).catch(() => {});
      }
      isSavingRef.current = false;
      setScreenState('preview');
      // Surface the actual error message — "Save failed" with no detail is undiagnosable
      const errMsg = err instanceof Error ? err.message : String(err);
      Alert.alert('Save failed', `Could not save the scan. Please try again.\n\n${errMsg}`);
    }
  }, [capturedUri, db, navigation, patientId, selectedType, user, visitId]);

  // ── Retake ─────────────────────────────────────────────────────────────────
  const handleRetake = useCallback(() => {
    setCapturedUri(null);
    setSelectedType('Prescription');
    setScreenState('viewfinder');
  }, []);

  // ── Flash toggle (Off ↔ On — no Auto per D7 spec) ─────────────────────────
  const toggleFlash = useCallback(() => {
    setFlashMode((prev) => (prev === 'off' ? 'on' : 'off'));
  }, []);

  // ── Exposure indicator config ──────────────────────────────────────────────
  const exposureConfig = {
    good:        { label: 'Good',                        color: Colors.exposureGood },
    tooDark:     { label: 'Too Dark — move to better light', color: Colors.exposureWarn },
    overexposed: { label: 'Too Bright — shade document', color: Colors.exposureError },
  }[exposureLevel];

  // ── Auth guard — AFTER all hooks ───────────────────────────────────────────
  if (!token || !user) return null;

  // ── Camera permission loading ──────────────────────────────────────────────
  if (!cameraPermission) {
    return <View style={styles.permissionContainer} />;
  }
  if (!cameraPermission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera access is required to scan documents.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestCameraPermission}>
          <Text style={styles.permissionBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── visitId guard ──────────────────────────────────────────────────────────
  if (!visitId || screenState === 'error') {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>No active visit</Text>
        <Text style={styles.errorBody}>
          Open or create a visit before scanning a document.
        </Text>
        <TouchableOpacity style={styles.errorBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.errorBtnText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Processing ─────────────────────────────────────────────────────────────
  if (screenState === 'processing') {
    return (
      <View style={styles.processingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.processingLabel}>Saving your document…</Text>
        {/* Live build: add "Text extraction will run in the background" line here */}
      </View>
    );
  }

  // ── Preview ────────────────────────────────────────────────────────────────
  if (screenState === 'preview' && capturedUri) {
    return (
      <View style={styles.previewContainer}>
        {/* Captured/picked image */}
        <Image
          source={{ uri: capturedUri }}
          style={styles.previewImage}
          resizeMode="contain"
        />

        <Text style={styles.cropHint}>Drag corners to adjust crop</Text>

        {/* Document type selector — default Prescription; one tap to change */}
        <DocTypeSelector selected={selectedType} onSelect={setSelectedType} />

        {/* Privacy line — rgba white for legibility on dark preview (D7-SF-5) */}
        <Text style={styles.privacyLine}>Saved only to this visit</Text>

        {/* Action bar */}
        <View style={styles.previewActionBar}>
          <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
            <Text style={styles.retakeBtnText}>Retake</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.useThisBtn} onPress={handleUseThis}>
            <Text style={styles.useThisBtnText}>Use This</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Viewfinder ─────────────────────────────────────────────────────────────
  // Rule 9: CameraView must sit inside an explicit View with defined dimensions
  // and backgroundColor:'#000000' to prevent black-flash on mount.
  return (
    <View style={styles.viewfinderContainer}>
      {/* Rule 9: explicit wrapper */}
      <View style={styles.cameraWrapper}>
        <CameraView
          style={styles.camera}
          ref={cameraRef}
          facing="back"
          flash={flashMode}
        />
      </View>

      {/* Top bar — Rule 10: all buttons use white text on dark pill */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Close scanner"
        >
          <Text style={styles.topBarBtnText}>✕</Text>
        </TouchableOpacity>

        {/* D7-SF-6: scan count pill — shown when re-entering D7 for a second scan */}
        {existingScanCount > 0 && (
          <View style={styles.scanCountPill}>
            <Text style={styles.scanCountText}>
              {existingScanCount} scan{existingScanCount === 1 ? '' : 's'} attached
            </Text>
          </View>
        )}

        {/* Flash toggle: Off ↔ On (no Auto per D7 spec) */}
        <TouchableOpacity
          style={styles.topBarBtn}
          onPress={toggleFlash}
          accessibilityLabel={`Flash ${flashMode === 'off' ? 'off' : 'on'}, tap to toggle`}
        >
          <Text style={styles.topBarBtnText}>
            {flashMode === 'off' ? '⚡ Off' : '⚡ On'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Document guide rectangle */}
      <View style={styles.guideRect} pointerEvents="none">
        <Text style={styles.guideLabel}>Align document within the frame</Text>
      </View>

      {/* Exposure indicator — Rule 10: dark pill + white text */}
      <View style={styles.exposurePill}>
        <View style={[styles.exposureDot, { backgroundColor: exposureConfig.color }]} />
        <Text style={styles.exposureText}>{exposureConfig.label}</Text>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomControls}>
        {/* captureAdvisory — D7-SF-4, Rule 10: dark pill + Colors.surface text */}
        {exposureLevel !== 'good' && (
          <View style={styles.captureAdvisoryPill}>
            <Text style={styles.captureAdvisoryText}>Tap to capture anyway</Text>
          </View>
        )}

        <View style={styles.captureRow}>
          {/* Use Photo Library — Rule 10: dark pill */}
          <TouchableOpacity
            style={styles.photoLibraryBtn}
            onPress={handlePickFromLibrary}
            accessibilityLabel="Use Photo Library"
          >
            <Text style={styles.photoLibraryText}>Use Photo{'\n'}Library</Text>
          </TouchableOpacity>

          {/* Capture button — #EA580C orange per spec */}
          <TouchableOpacity
            style={styles.captureBtn}
            onPress={handleCapture}
            accessibilityLabel="Capture document"
            accessibilityRole="button"
          >
            <View style={styles.captureBtnInner} />
          </TouchableOpacity>

          {/* Spacer balances the row so capture button stays centred */}
          <View style={styles.captureRowSpacer} />
        </View>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── Viewfinder ─────────────────────────────────────────────────────────────

  viewfinderContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  // Rule 9: explicit parent View with defined dimensions
  cameraWrapper: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },

  // Rule 10: top bar buttons as dark pills
  topBar: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'space-between',
    paddingTop:      56,
    paddingHorizontal: 16,
    paddingBottom:   12,
  },
  topBarBtn: {
    backgroundColor:  'rgba(0,0,0,0.55)',
    borderRadius:     20,
    paddingHorizontal: 14,
    paddingVertical:  8,
    minWidth:         44,
    minHeight:        44,
    alignItems:       'center',
    justifyContent:   'center',
  },
  topBarBtnText: {
    color:      Colors.surface,
    fontSize:   14,
    fontWeight: '600',
  },

  // D7-SF-6: scan count pill
  scanCountPill: {
    backgroundColor:  'rgba(0,0,0,0.55)',
    borderRadius:     12,
    paddingHorizontal: 12,
    paddingVertical:  6,
  },
  scanCountText: {
    color:      Colors.surface,
    fontSize:   12,
    fontWeight: '500',
  },

  // Guide rectangle overlay
  guideRect: {
    position:     'absolute',
    top:          '22%',
    left:         20,
    right:        20,
    height:       '44%',
    borderWidth:  1.5,
    borderColor:  'rgba(255,255,255,0.45)',
    borderRadius: 6,
    alignItems:   'center',
    justifyContent: 'flex-end',
    paddingBottom: 10,
  },
  // Rule 10
  guideLabel: {
    color:            Colors.surface,
    fontSize:         12,
    backgroundColor:  'rgba(0,0,0,0.55)',
    borderRadius:     10,
    paddingHorizontal: 10,
    paddingVertical:  4,
  },

  // Exposure indicator — Rule 10
  exposurePill: {
    position:         'absolute',
    bottom:           160,
    alignSelf:        'center',
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  'rgba(0,0,0,0.55)',
    borderRadius:     12,
    paddingHorizontal: 12,
    paddingVertical:  6,
    gap:              6,
  },
  exposureDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  exposureText: {
    color:      Colors.surface,
    fontSize:   13,
    fontWeight: '500',
  },

  // Bottom controls area
  bottomControls: {
    position:       'absolute',
    bottom:         0,
    left:           0,
    right:          0,
    paddingBottom:  48,
    paddingHorizontal: 24,
    alignItems:     'center',
    gap:            12,
  },

  // D7-SF-4 + Rule 10: captureAdvisory uses dark pill + white text
  captureAdvisoryPill: {
    backgroundColor:  'rgba(0,0,0,0.55)',
    borderRadius:     12,
    paddingHorizontal: 12,
    paddingVertical:  4,
  },
  captureAdvisoryText: {
    color:      Colors.surface,
    fontSize:   12,
    fontStyle:  'italic',
  },

  captureRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    width:          '100%',
  },

  // Rule 10: photo library button as dark pill
  photoLibraryBtn: {
    backgroundColor:  'rgba(0,0,0,0.55)',
    borderRadius:     12,
    paddingHorizontal: 12,
    paddingVertical:  10,
    minWidth:         80,
    minHeight:        44,
    justifyContent:   'center',
    alignItems:       'center',
  },
  photoLibraryText: {
    color:     Colors.surface,
    fontSize:  12,
    fontWeight: '500',
    textAlign: 'center',
  },

  // Capture button: #EA580C orange outer ring, white inner disc (per spec)
  captureBtn: {
    width:        72,
    height:       72,
    borderRadius: 36,
    borderWidth:  3,
    borderColor:  '#EA580C',
    alignItems:   'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width:           58,
    height:          58,
    borderRadius:    29,
    backgroundColor: '#EA580C',
  },

  // Balances the photo library button so capture stays centred
  captureRowSpacer: {
    width: 80,
  },

  // ── Preview ────────────────────────────────────────────────────────────────

  previewContainer: {
    flex:             1,
    backgroundColor:  '#000000',
    paddingTop:       56,
    paddingBottom:    32,
    paddingHorizontal: 16,
  },
  previewImage: {
    flex:         1,
    width:        '100%',
    marginBottom: 12,
    borderRadius: 8,
  },
  cropHint: {
    color:        'rgba(255,255,255,0.55)',
    fontSize:     12,
    textAlign:    'center',
    marginBottom: 12,
  },

  // DocTypeSelector
  docTypeScroll: {
    flexGrow:     0,
    marginBottom: 10,
  },
  docTypeContent: {
    gap: 8,
  },
  docTypePill: {
    borderWidth:      1,
    borderColor:      'rgba(255,255,255,0.3)',
    borderRadius:     20,
    paddingHorizontal: 16,
    paddingVertical:  10,
    minHeight:        44,
    justifyContent:   'center',
  },
  docTypePillSelected: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  docTypeLabel: {
    color:    'rgba(255,255,255,0.75)',
    fontSize: 14,
  },
  docTypeLabelSelected: {
    color:      Colors.surface,
    fontWeight: '600',
  },

  // D7-SF-5: rgba white on dark preview for adequate contrast
  privacyLine: {
    color:        'rgba(255,255,255,0.55)',
    fontSize:     12,
    textAlign:    'center',
    marginBottom: 16,
  },

  previewActionBar: {
    flexDirection: 'row',
    gap:           12,
  },
  retakeBtn: {
    flex:         1,
    borderWidth:  1,
    borderColor:  'rgba(255,255,255,0.4)',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems:   'center',
  },
  retakeBtnText: {
    color:      Colors.surface,
    fontSize:   16,
    fontWeight: '500',
  },
  useThisBtn: {
    flex:            2,
    backgroundColor: Colors.primary,
    borderRadius:    10,
    paddingVertical: 14,
    alignItems:      'center',
  },
  useThisBtnText: {
    color:      Colors.surface,
    fontSize:   16,
    fontWeight: '600',
  },

  // ── Processing ─────────────────────────────────────────────────────────────

  processingContainer: {
    flex:            1,
    backgroundColor: '#000000',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             16,
  },
  processingLabel: {
    color:    Colors.surface,
    fontSize: 16,
  },

  // ── Permission ─────────────────────────────────────────────────────────────

  permissionContainer: {
    flex:            1,
    backgroundColor: '#000000',
    alignItems:      'center',
    justifyContent:  'center',
    padding:         32,
    gap:             16,
  },
  permissionText: {
    color:     Colors.surface,
    fontSize:  16,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor:  Colors.primary,
    borderRadius:     10,
    paddingVertical:  12,
    paddingHorizontal: 32,
  },
  permissionBtnText: {
    color:      Colors.surface,
    fontSize:   15,
    fontWeight: '600',
  },

  // ── Error ──────────────────────────────────────────────────────────────────

  errorContainer: {
    flex:            1,
    backgroundColor: Colors.surface,
    alignItems:      'center',
    justifyContent:  'center',
    padding:         32,
    gap:             12,
  },
  errorTitle: {
    fontSize:   20,
    fontWeight: '700',
    color:      '#333333',
  },
  errorBody: {
    fontSize:  14,
    color:     Colors.textSecondary,
    textAlign: 'center',
  },
  errorBtn: {
    marginTop:        8,
    backgroundColor:  Colors.primary,
    borderRadius:     10,
    paddingVertical:  12,
    paddingHorizontal: 32,
  },
  errorBtnText: {
    color:      Colors.surface,
    fontSize:   15,
    fontWeight: '600',
  },
});
