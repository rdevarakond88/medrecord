/**
 * FullScanViewScreen — D8: Full Scan View (live)
 *
 * Spec:    docs/ui-ux-spec.md § D8 Full Scan View
 * Mockup:  mockups/D8FullScanViewScreen.tsx (Persona Critic v2 score: 3.55/5 — ship as-is)
 *
 * Displays a full-resolution scan image (pinch-to-zoom) with a collapsible OCR text panel.
 * Entry point: D4 VisitDetailScreen → "View full image →" tap on a scan record row.
 *
 * Nav params (RootStackParamList.FullScanView):
 *   scanLocalPath: relative filesystem path — resolveScanPath() called at read time.
 *                  Relative storage prevents Android path drift on APK reinstall (CRITICAL-2/KFM-3).
 *   scanLabel:     document type (Prescription, Lab Report, etc.)
 *   ocrStatus:     'deferred' | 'pending' | 'success' | 'failed'
 *   ocrText:       content_text from visit_records — already sanitised by D7 sanitizeOcrText().
 *                  D8 MUST NOT read raw OCR output (reviews/D8-pm-preflow.md — regulatory flag).
 *   visitDate:     ISO 8601 date — displayed in header
 *   patientName:   displayed as dimmed sub-line in header (D8-PC-M1 fix)
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
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../../App';
import { useAuthStore } from '../../store/useAuthStore';
import { resolveScanPath } from '../../db/scans';
import { formatDateForDisplay } from '../../utils/formatters';
import ScanImageViewer from '../../components/ScanImageViewer';

// ─── Navigation types ──────────────────────────────────────────────────────────

type NavProp   = NativeStackNavigationProp<RootStackParamList, 'FullScanView'>;
type RouteType = RouteProp<RootStackParamList, 'FullScanView'>;
type OcrStatus = 'deferred' | 'pending' | 'success' | 'failed';

// ─── Design tokens (mirror mockup — not exported from theme.ts) ────────────────

const C = {
  primaryDark:   '#0F4880',
  surface:       '#FFFFFF',
  border:        '#E2E8F0',
  background:    '#F5F7FA',
  textPrimary:   '#1A202C',
  textSecondary: '#64748B',
  textDisabled:  '#CBD5E0',
  success:       '#16A34A',
  warning:       '#D97706',
  error:         '#DC2626',
} as const;

// ─── Sub-components ────────────────────────────────────────────────────────────

function ScanHeader({
  label,
  visitDate,
  patientName,
  onBack,
}: {
  label:       string;
  visitDate:   string;
  patientName: string;
  onBack:      () => void;
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
        {/* D8-PC-M1 fix: patient name as dimmed sub-line */}
        <Text style={styles.headerPatientName} numberOfLines={1}>{patientName}</Text>
        <Text style={styles.headerDate}>{visitDate}</Text>
      </View>
      {/* Reserved for share button (NICE TO HAVE — D8 Persona Critic v2) */}
      <View style={styles.headerRight} />
    </View>
  );
}

function OcrPanelHandle({
  ocrStatus,
  expanded,
  onToggle,
}: {
  ocrStatus: OcrStatus;
  expanded:  boolean;
  onToggle:  () => void;
}) {
  const badge = (() => {
    switch (ocrStatus) {
      case 'success': return <Text style={styles.badgeSuccess}>Text extracted ✓</Text>;
      case 'pending': return <Text style={styles.badgePending}>Processing…</Text>;
      case 'failed':  return <Text style={styles.badgeFailed}>Not extracted</Text>;
      default:        return <Text style={styles.badgeNeutral}>No text</Text>;
    }
  })();

  return (
    <TouchableOpacity
      style={styles.panelHandle}
      onPress={onToggle}
      accessibilityLabel={expanded ? 'Collapse scan text panel' : 'Expand scan text panel'}
      accessibilityRole="button"
    >
      <View style={styles.panelHandlePill} />
      <View style={styles.panelHandleRow}>
        <Text style={styles.panelTitle}>Scan Text</Text>
        {badge}
        <Text style={styles.panelChevron}>{expanded ? '↓' : '↑'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function OcrPanelBody({
  ocrStatus,
  ocrText,
}: {
  ocrStatus: OcrStatus;
  ocrText:   string | null;
}) {
  if (ocrStatus === 'success' && ocrText) {
    return (
      <ScrollView style={styles.ocrScroll} contentContainerStyle={styles.ocrScrollContent}>
        {/* D8-PC-M2 fix: 15pt system font (was 13pt monospace) */}
        <Text style={styles.ocrText} selectable>{ocrText}</Text>
      </ScrollView>
    );
  }
  if (ocrStatus === 'pending') {
    return (
      <View style={styles.ocrStatusRow}>
        <ActivityIndicator size="small" color="#1A6DB5" />
        {/* D8-PC-S4 fix: "(usually under a minute)" added */}
        <Text style={styles.ocrStatusText}>
          Text extraction in progress… (usually under a minute)
        </Text>
      </View>
    );
  }
  if (ocrStatus === 'failed') {
    return (
      <View style={styles.ocrStatusCol}>
        <Text style={[styles.ocrStatusText, { color: C.error }]}>
          Image only — text not extracted
        </Text>
        {/* D8-PC-S1 fix: recovery hint */}
        <Text style={styles.ocrRecoveryHint}>Ask staff to rescan if text is needed.</Text>
      </View>
    );
  }
  // deferred
  return (
    <View style={styles.ocrStatusCol}>
      <Text style={styles.ocrStatusText}>No extracted text available</Text>
      <Text style={styles.ocrRecoveryHint}>Ask staff to rescan if text is needed.</Text>
    </View>
  );
}

// ─── Root screen ───────────────────────────────────────────────────────────────

export default function FullScanViewScreen() {
  const navigation          = useNavigation<NavProp>();
  const route               = useRoute<RouteType>();
  const { token, user }     = useAuthStore();
  const [expanded, setExpanded] = useState(true);

  const {
    scanLocalPath,
    scanLabel,
    ocrStatus,
    ocrText,
    visitDate,
    patientName,
  } = route.params;

  // Auth guard — after all hooks (D3-H-3 pattern)
  if (!token || !user) return null;

  const absoluteUri = resolveScanPath(scanLocalPath);
  const displayDate = formatDateForDisplay(visitDate) ?? visitDate;
  const typedStatus = (ocrStatus as OcrStatus) ?? 'deferred';
  // D8-QA-M1: treat success+empty-text as 'deferred' so badge and body stay in sync.
  // Backend can set ocr_status='success' with content_text='' on a blank page — the
  // badge must not say "Text extracted ✓" when there is nothing to show.
  const effectiveStatus: OcrStatus =
    typedStatus === 'success' && !ocrText ? 'deferred' : typedStatus;

  return (
    <SafeAreaView style={styles.root}>
      <ScanHeader
        label={scanLabel}
        visitDate={displayDate}
        patientName={patientName}
        onBack={() => navigation.goBack()}
      />

      <ScanImageViewer
        uri={absoluteUri}
        accessibilityLabel={`${scanLabel} scan image`}
      />

      {expanded ? (
        <View style={styles.panel}>
          <OcrPanelHandle
            ocrStatus={effectiveStatus}
            expanded
            onToggle={() => setExpanded(false)}
          />
          <OcrPanelBody ocrStatus={effectiveStatus} ocrText={ocrText} />
        </View>
      ) : (
        <View style={styles.panelCollapsed}>
          <OcrPanelHandle
            ocrStatus={effectiveStatus}
            expanded={false}
            onToggle={() => setExpanded(true)}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#111827',
  },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   C.primaryDark,
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  backButton: {
    width:      40,
    alignItems: 'flex-start',
  },
  backArrow: {
    fontSize: 22,
    color:    C.surface,
  },
  headerTitle: {
    flex:       1,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize:   16,
    fontWeight: '600',
    color:      C.surface,
  },
  headerPatientName: {
    fontSize:  12,
    color:     'rgba(255,255,255,0.5)',
    marginTop: 1,
  },
  headerDate: {
    fontSize:  12,
    color:     'rgba(255,255,255,0.65)',
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },

  // OCR panel — expanded
  panel: {
    backgroundColor:   C.surface,
    borderTopLeftRadius:  16,
    borderTopRightRadius: 16,
    maxHeight:         280,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: -2 },
    shadowOpacity:     0.12,
    shadowRadius:      6,
    elevation:         8,
  },

  // OCR panel — collapsed strip
  panelCollapsed: {
    backgroundColor:      C.surface,
    borderTopLeftRadius:  16,
    borderTopRightRadius: 16,
    shadowColor:          '#000',
    shadowOffset:         { width: 0, height: -2 },
    shadowOpacity:        0.12,
    shadowRadius:         6,
    elevation:            8,
  },

  panelHandle: {
    paddingHorizontal: 16,
    paddingBottom:     8,
    paddingTop:        10,
  },
  panelHandlePill: {
    width:        36,
    height:       4,
    backgroundColor: C.textDisabled,
    borderRadius: 2,
    alignSelf:    'center',
    marginBottom: 10,
  },
  panelHandleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
  },
  panelTitle: {
    flex:       1,
    fontSize:   14,
    fontWeight: '600',
    color:      C.textPrimary,
  },
  panelChevron: {
    fontSize: 16,
    color:    C.textSecondary,
  },

  // OCR status badges
  badgeSuccess: {
    fontSize:          11,
    fontWeight:        '600',
    color:             C.success,
    backgroundColor:   '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      99,
    overflow:          'hidden',
  },
  badgePending: {
    fontSize:          11,
    fontWeight:        '600',
    color:             C.warning,
    backgroundColor:   '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      99,
    overflow:          'hidden',
  },
  badgeFailed: {
    fontSize:          11,
    fontWeight:        '600',
    color:             C.error,
    backgroundColor:   '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      99,
    overflow:          'hidden',
  },
  badgeNeutral: {
    fontSize:          11,
    fontWeight:        '600',
    color:             C.textSecondary,
    backgroundColor:   C.background,
    paddingHorizontal: 8,
    paddingVertical:   2,
    borderRadius:      99,
    overflow:          'hidden',
  },

  // OCR body
  ocrScroll: {
    maxHeight:       180,
    borderTopWidth:  1,
    borderTopColor:  C.border,
  },
  ocrScrollContent: {
    padding: 16,
  },
  ocrText: {
    fontSize:   15,   // D8-PC-M2 fix: min 15pt system font (was 13pt monospace)
    lineHeight: 22,
    color:      C.textPrimary,
  },
  ocrStatusRow: {
    flexDirection:   'row',
    alignItems:      'center',
    padding:         16,
    gap:             8,
    borderTopWidth:  1,
    borderTopColor:  C.border,
    minHeight:       56,
  },
  ocrStatusCol: {
    flexDirection:  'column',
    padding:        16,
    gap:            6,
    borderTopWidth: 1,
    borderTopColor: C.border,
    minHeight:      56,
  },
  ocrStatusText: {
    fontSize: 14,
    color:    C.textSecondary,
  },
  ocrRecoveryHint: {
    fontSize: 13,
    color:    C.textDisabled,
  },
});
