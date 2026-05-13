/**
 * D8FullScanViewScreen — Static Mockup
 *
 * Spec:      docs/ui-ux-spec.md § D8 Full Scan View
 * PM review: reviews/D8-pm-preflow.md
 *
 * What this screen does:
 *   Full-resolution view of a scanned document attached to a visit.
 *   Image is zoomable (pinch-to-zoom in live build via ScrollView maximumZoomScale).
 *   A collapsible bottom sheet shows sanitized OCR text or extraction status.
 *
 * Entry point:
 *   D4 (Visit Detail) → "View full image →" on a scan record row
 *     navigation.navigate('FullScanView', {
 *       scanLocalPath: string,   // RELATIVE path — live build calls resolveScanPath()
 *       scanLabel: string,       // e.g. 'Prescription', 'Lab Report'
 *       ocrStatus: string,       // 'deferred' | 'pending' | 'success' | 'failed'
 *       ocrText: string | null,  // visit_records.content_text — already sanitized at D7
 *       visitDate: string,       // ISO 8601 — displayed in header
 *       patientName: string,     // displayed in header
 *     })
 *
 * OCR text safety (reviews/D8-pm-preflow.md — regulatory flag):
 *   D8 reads content_text from the local DB. That field is written by D7's
 *   sanitizeOcrText() which strips Aadhaar patterns before any DB write.
 *   D8 displays content_text as-is — no re-sanitization needed or applied here.
 *   D8 must NEVER read raw OCR output; always read from the DB field.
 *
 * Reuse note:
 *   The image viewer region (ScanImagePlaceholder → live: ScanImageViewer) should be
 *   extracted to src/components/ScanImageViewer.tsx in the wire session so P3
 *   (Patient timeline scan view) can reuse it without duplication.
 *
 * State variants (named exports):
 *   D8ScanViewOcrSuccess  — image + expanded OCR panel with extracted text
 *   D8ScanViewOcrFailed   — image + expanded OCR panel, extraction failed
 *   D8ScanViewOcrPending  — image + expanded OCR panel, extraction in progress
 *   D8ScanViewCollapsed   — image fills screen; OCR panel collapsed to handle strip
 *
 * Placeholder data: realistic Indian clinical context
 * No filesystem or DB calls — all data is static props in the mockup.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
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
  imageBg:       '#111827',
};

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------
const PATIENT = { name: 'Sunita Ramesh Patil' };
const SCAN = {
  label:    'Prescription',
  visitDate: '15 Jan 2026',
  ocrText: `Dr. Priya Nair, MBBS MD
Arogya Clinic, Nashik

Patient: Sunita Ramesh Patil | Age: 62

Dx: Hypertension Stage II, Type 2 Diabetes Mellitus

Rx:
Tab. Amlodipine 5mg — OD morning
Tab. Metformin 500mg — BD with meals
Tab. Telmisartan 40mg — OD evening

Advice: Low-salt diet. Follow-up in 4 weeks.
BP: 148/94 mmHg today.`,
};

// Mock auth — live build: const { token, user } = useAuthStore()
const MOCK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.bW9ja3Rva2Vu.signature';
const MOCK_USER  = { id: 'doc-001', name: 'Dr. Priya Nair' };

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ScanHeader({
  label,
  visitDate,
  patientName,
  onBack,
}: {
  label: string;
  visitDate: string;
  patientName: string;
  onBack: () => void;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        accessibilityLabel="Go back"
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Text style={styles.backArrow}>{'←'}</Text>
      </TouchableOpacity>
      <View style={styles.headerTitle}>
        <Text style={styles.headerLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.headerPatientName} numberOfLines={1}>{patientName}</Text>
        <Text style={styles.headerDate}>{visitDate}</Text>
      </View>
      <View style={styles.headerRight} />
    </View>
  );
}

/**
 * Mockup placeholder for the scan image.
 * Live build: replace with <Image source={{ uri: resolveScanPath(scanLocalPath) }}
 *   resizeMode="contain" style={{ flex: 1 }} />
 * Pinch-to-zoom: wrap Image in <ScrollView minimumZoomScale={1} maximumZoomScale={4}
 *   pinchGestureEnabled centerContent bouncesZoom />
 */
function ScanImagePlaceholder({ label }: { label: string }) {
  return (
    <View style={styles.imagePlaceholder} accessible={false}>
      <View style={styles.documentStub}>
        <Text style={styles.documentStubTopLine} />
        <Text style={styles.documentStubLine} />
        <Text style={styles.documentStubLine} />
        <Text style={styles.documentStubShortLine} />
        <View style={styles.documentStubSpacer} />
        <Text style={styles.documentStubLine} />
        <Text style={styles.documentStubLine} />
        <Text style={styles.documentStubLine} />
        <Text style={styles.documentStubShortLine} />
      </View>
      <Text style={styles.imagePlaceholderLabel}>{label}</Text>
      <Text style={styles.imagePlaceholderHint}>Pinch to zoom</Text>
    </View>
  );
}

function OcrPanelHandle({
  ocrStatus,
  expanded,
  onToggle,
}: {
  ocrStatus: 'success' | 'failed' | 'pending' | 'deferred';
  expanded: boolean;
  onToggle: () => void;
}) {
  const statusNode = (() => {
    switch (ocrStatus) {
      case 'success':
        return <Text style={styles.badgeSuccess}>Text extracted ✓</Text>;
      case 'pending':
        return <Text style={styles.badgePending}>Processing…</Text>;
      case 'failed':
        return <Text style={styles.badgeFailed}>Not extracted</Text>;
      default:
        return <Text style={styles.badgeNeutral}>No text</Text>;
    }
  })();

  return (
    <TouchableOpacity
      style={styles.panelHandle}
      onPress={onToggle}
      accessibilityLabel={expanded ? 'Collapse OCR panel' : 'Expand OCR panel'}
      accessibilityRole="button"
    >
      <View style={styles.panelHandlePill} />
      <View style={styles.panelHandleRow}>
        <Text style={styles.panelTitle}>Scan Text</Text>
        {statusNode}
        <Text style={styles.panelChevron}>{expanded ? '↓' : '↑'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function OcrPanelBody({
  ocrStatus,
  ocrText,
}: {
  ocrStatus: 'success' | 'failed' | 'pending' | 'deferred';
  ocrText: string | null;
}) {
  if (ocrStatus === 'success' && ocrText) {
    return (
      <ScrollView style={styles.ocrScroll} contentContainerStyle={styles.ocrScrollContent}>
        <Text style={styles.ocrText} selectable>{ocrText}</Text>
      </ScrollView>
    );
  }
  if (ocrStatus === 'pending') {
    return (
      <View style={styles.ocrStatusRow}>
        <ActivityIndicator size="small" color={Colors.primaryBlue} />
        <Text style={styles.ocrStatusText}>Text extraction in progress… (usually under a minute)</Text>
      </View>
    );
  }
  if (ocrStatus === 'failed') {
    return (
      <View style={styles.ocrStatusCol}>
        <Text style={[styles.ocrStatusText, { color: Colors.error }]}>
          Image only — text not extracted
        </Text>
        <Text style={styles.ocrRecoveryHint}>Ask staff to rescan if text is needed.</Text>
      </View>
    );
  }
  return (
    <View style={styles.ocrStatusCol}>
      <Text style={styles.ocrStatusText}>No extracted text available</Text>
      <Text style={styles.ocrRecoveryHint}>Ask staff to rescan if text is needed.</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Variant 1 — OCR success, panel expanded
// ---------------------------------------------------------------------------
export function D8ScanViewOcrSuccess() {
  const { token, user } = { token: MOCK_TOKEN, user: MOCK_USER };
  if (!token || !user) return null;

  return (
    <SafeAreaView style={styles.root}>
      <ScanHeader
        label={SCAN.label}
        visitDate={SCAN.visitDate}
        patientName={PATIENT.name}
        onBack={() => {}}
      />
      <ScanImagePlaceholder label={SCAN.label} />
      <View style={styles.panel}>
        <OcrPanelHandle ocrStatus="success" expanded onToggle={() => {}} />
        <OcrPanelBody ocrStatus="success" ocrText={SCAN.ocrText} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 2 — OCR failed, panel expanded
// ---------------------------------------------------------------------------
export function D8ScanViewOcrFailed() {
  const { token, user } = { token: MOCK_TOKEN, user: MOCK_USER };
  if (!token || !user) return null;

  return (
    <SafeAreaView style={styles.root}>
      <ScanHeader
        label="Lab Report"
        visitDate={SCAN.visitDate}
        patientName={PATIENT.name}
        onBack={() => {}}
      />
      <ScanImagePlaceholder label="Lab Report" />
      <View style={styles.panel}>
        <OcrPanelHandle ocrStatus="failed" expanded onToggle={() => {}} />
        <OcrPanelBody ocrStatus="failed" ocrText={null} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 3 — OCR pending, panel expanded
// ---------------------------------------------------------------------------
export function D8ScanViewOcrPending() {
  const { token, user } = { token: MOCK_TOKEN, user: MOCK_USER };
  if (!token || !user) return null;

  return (
    <SafeAreaView style={styles.root}>
      <ScanHeader
        label="Discharge Summary"
        visitDate={SCAN.visitDate}
        patientName={PATIENT.name}
        onBack={() => {}}
      />
      <ScanImagePlaceholder label="Discharge Summary" />
      <View style={styles.panel}>
        <OcrPanelHandle ocrStatus="pending" expanded onToggle={() => {}} />
        <OcrPanelBody ocrStatus="pending" ocrText={null} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 4 — OCR panel collapsed; image fills screen
// ---------------------------------------------------------------------------
export function D8ScanViewCollapsed() {
  const { token, user } = { token: MOCK_TOKEN, user: MOCK_USER };
  if (!token || !user) return null;

  return (
    <SafeAreaView style={styles.root}>
      <ScanHeader
        label={SCAN.label}
        visitDate={SCAN.visitDate}
        patientName={PATIENT.name}
        onBack={() => {}}
      />
      {/* Image takes all remaining space when panel is collapsed */}
      <View style={{ flex: 1, backgroundColor: Colors.imageBg, justifyContent: 'center', alignItems: 'center' }}>
        <View style={styles.documentStub}>
          <Text style={styles.documentStubTopLine} />
          <Text style={styles.documentStubLine} />
          <Text style={styles.documentStubLine} />
          <Text style={styles.documentStubShortLine} />
          <View style={styles.documentStubSpacer} />
          <Text style={styles.documentStubLine} />
          <Text style={styles.documentStubLine} />
          <Text style={styles.documentStubLine} />
          <Text style={styles.documentStubShortLine} />
        </View>
        <Text style={styles.imagePlaceholderHint}>Pinch to zoom</Text>
      </View>
      <View style={styles.panelCollapsed}>
        <OcrPanelHandle ocrStatus="success" expanded={false} onToggle={() => {}} />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Default export — dev review: all 4 variants in a scroll
// ---------------------------------------------------------------------------
export default function D8FullScanViewMockup() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }}>
      <Text style={styles.devLabel}>Variant 1: OCR Success (expanded)</Text>
      <View style={{ height: 600 }}><D8ScanViewOcrSuccess /></View>

      <Text style={styles.devLabel}>Variant 2: OCR Failed (expanded)</Text>
      <View style={{ height: 600 }}><D8ScanViewOcrFailed /></View>

      <Text style={styles.devLabel}>Variant 3: OCR Pending (expanded)</Text>
      <View style={{ height: 600 }}><D8ScanViewOcrPending /></View>

      <Text style={styles.devLabel}>Variant 4: Panel Collapsed</Text>
      <View style={{ height: 600 }}><D8ScanViewCollapsed /></View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.imageBg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    alignItems: 'flex-start',
  },
  backArrow: {
    fontSize: 22,
    color: Colors.surface,
  },
  headerTitle: {
    flex: 1,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.surface,
  },
  headerPatientName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  headerDate: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },

  // Image placeholder (live build: Image + ScrollView zoom)
  imagePlaceholder: {
    flex: 1,
    backgroundColor: Colors.imageBg,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  documentStub: {
    width: 180,
    backgroundColor: Colors.surface,
    borderRadius: 4,
    padding: 16,
    gap: 6,
  },
  documentStubTopLine: {
    height: 10,
    width: '60%',
    backgroundColor: '#CBD5E0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 8,
  },
  documentStubLine: {
    height: 7,
    width: '100%',
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
  },
  documentStubShortLine: {
    height: 7,
    width: '55%',
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
  },
  documentStubSpacer: {
    height: 12,
  },
  imagePlaceholderLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.5,
  },
  imagePlaceholderHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
  },

  // OCR panel — expanded
  panel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },

  // OCR panel — collapsed strip
  panelCollapsed: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8,
  },

  panelHandle: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    paddingTop: 10,
  },
  panelHandlePill: {
    width: 36,
    height: 4,
    backgroundColor: Colors.textDisabled,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 10,
  },
  panelHandleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  panelChevron: {
    fontSize: 16,
    color: Colors.textSecondary,
  },

  badgeSuccess: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.success,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
  },
  badgePending: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.warning,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
  },
  badgeFailed: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.error,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
  },
  badgeNeutral: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    backgroundColor: Colors.background,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
    overflow: 'hidden',
  },

  // OCR body
  ocrScroll: {
    maxHeight: 180,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  ocrScrollContent: {
    padding: 16,
  },
  ocrText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  ocrStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    minHeight: 56,
  },
  ocrStatusCol: {
    flexDirection: 'column',
    padding: 16,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    minHeight: 56,
  },
  ocrStatusText: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  ocrRecoveryHint: {
    fontSize: 13,
    color: Colors.textDisabled,
  },

  // Dev review labels
  devLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.border,
    marginTop: 8,
  },
});
