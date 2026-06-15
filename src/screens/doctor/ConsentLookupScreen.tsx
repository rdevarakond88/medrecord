/**
 * ConsentLookupScreen.tsx — D7 (new): Doctor Consent Request — Patient Lookup
 *
 * Screen:  New D7 — Doctor-initiated cross-provider consent request entry point.
 *          A doctor enters a patient's mobile number to locate them, then
 *          initiates a consent request to access records from other providers.
 *          This is distinct from D9 (ConsentRequestScreen), which is the in-clinic
 *          OTP handoff flow triggered after a patient is already open in D3.
 *
 * MOCKUP — no real API calls. Four states:
 *   idle       — numeric input + keypad + "how it works" hint card
 *   loading    — spinner while mock lookup runs (1.2 s delay)
 *   found      — patient card shown with "Request Consent" CTA
 *   not_found  — error card with options to register or retry
 *
 * Realistic test number: 8888888888 → resolves to Meena Krishnaswamy (found)
 * Any other 10-digit number → not_found state
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../App';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'ConsentLookup'>;

type LookupState = 'idle' | 'loading' | 'found' | 'not_found';

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_PATIENT = {
  name:        'Meena Krishnaswamy',
  age:         52,
  mobile:      '8888888888',
  maskedMobile:'88•••••789',
  lastClinic:  'Apollo Clinic, Hyderabad',
  lastVisit:   '14/03/2026',
  initials:    'MK',
};

// ─── Design tokens (ui-ux-spec.md) ───────────────────────────────────────────

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
  successLight:  '#DCFCE7',
  error:         '#DC2626',
  errorLight:    '#FEE2E2',
  infoLight:     '#EFF6FF',
  infoBorder:    '#BFDBFE',
};

// ─── Keypad layout ────────────────────────────────────────────────────────────

const KEYPAD_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['',  '0', '⌫'],
];

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ConsentLookupScreen({ navigation }: Props) {
  const [digits,      setDigits]      = useState('');
  const [lookupState, setLookupState] = useState<LookupState>('idle');

  // Explicit "Look Up" action — shows spinner, then resolves after 1.2 s mock delay
  const handleLookup = useCallback(() => {
    if (digits.length !== 10) return;
    setLookupState('loading');
    setTimeout(() => {
      setLookupState(digits === MOCK_PATIENT.mobile ? 'found' : 'not_found');
    }, 1200);
  }, [digits]);

  const handleKeyPress = useCallback((key: string) => {
    if (key === '⌫') {
      setDigits(prev => {
        const next = prev.slice(0, -1);
        setLookupState('idle');
        return next;
      });
      return;
    }
    if (key === '' || digits.length >= 10) return;
    setDigits(prev => prev + key);
    setLookupState('idle');
  }, [digits.length]);

  const handleClear = useCallback(() => {
    setDigits('');
    setLookupState('idle');
  }, []);

  // "98765 43210" display format — 5 + space + 5
  function formatDisplay(d: string): string {
    if (d.length === 0) return '';
    return d.length > 5 ? `${d.slice(0, 5)} ${d.slice(5)}` : d;
  }

  // Keypad locks at 10 digits and while loading
  const isAtMax = digits.length === 10 || lookupState === 'loading';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea}>

      {/* ── Header ── */}
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
          <Text style={styles.headerTitle}>Request Records Access</Text>
          <Text style={styles.headerSubtitle}>Enter patient's registered mobile</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── Purpose banner ── */}
        <View style={styles.purposeBanner}>
          <Text style={styles.purposeIcon}>🔒</Text>
          <Text style={styles.purposeText}>
            Request the patient's consent to access their records from other
            clinics and hospitals.
          </Text>
        </View>

        {/* ── Mobile input display ── */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Patient Mobile Number</Text>
          <View style={[
            styles.inputDisplay,
            lookupState === 'loading'   && styles.inputDisplayLoading,
            lookupState === 'found'     && styles.inputDisplaySuccess,
            lookupState === 'not_found' && styles.inputDisplayError,
          ]}>
            <Text style={[
              styles.inputDisplayText,
              digits.length === 0 && styles.inputDisplayPlaceholder,
            ]}>
              {digits.length > 0 ? formatDisplay(digits) : 'Enter 10-digit number'}
            </Text>

            {digits.length > 0 && (
              <TouchableOpacity
                style={styles.clearButton}
                onPress={handleClear}
                accessibilityLabel="Clear mobile number"
                accessibilityRole="button"
              >
                <Text style={styles.clearButtonText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.digitCounter}>{digits.length}/10</Text>
        </View>

        {/* ── Look Up button — enabled only when 10 digits entered and not yet loading ── */}
        {(lookupState === 'idle' || lookupState === 'loading') && digits.length === 10 && (
          <TouchableOpacity
            style={[styles.lookupButton, lookupState === 'loading' && styles.lookupButtonDisabled]}
            onPress={handleLookup}
            disabled={lookupState === 'loading'}
            accessibilityLabel="Look up patient"
            accessibilityRole="button"
          >
            <Text style={styles.lookupButtonText}>Look Up Patient</Text>
          </TouchableOpacity>
        )}

        {/* ── State: Loading ── */}
        {lookupState === 'loading' && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
            <Text style={styles.loadingTitle}>Checking patient records…</Text>
            <Text style={styles.loadingSubtext}>This usually takes a moment</Text>
          </View>
        )}

        {/* ── State: Idle — how it works hint ── */}
        {lookupState === 'idle' && digits.length === 0 && (
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>How it works</Text>
            <View style={styles.hintRow}>
              <View style={styles.hintStepBubble}>
                <Text style={styles.hintStepText}>1</Text>
              </View>
              <Text style={styles.hintText}>
                Enter the patient's 10-digit mobile number
              </Text>
            </View>
            <View style={styles.hintRow}>
              <View style={styles.hintStepBubble}>
                <Text style={styles.hintStepText}>2</Text>
              </View>
              <Text style={styles.hintText}>
                We look up their record across registered clinics
              </Text>
            </View>
            <View style={styles.hintRow}>
              <View style={styles.hintStepBubble}>
                <Text style={styles.hintStepText}>3</Text>
              </View>
              <Text style={styles.hintText}>
                Patient receives an SMS to approve your access
              </Text>
            </View>
          </View>
        )}

        {/* ── State: Found ── */}
        {lookupState === 'found' && (
          <View style={styles.foundCard}>
            <View style={styles.foundBadgeRow}>
              <View style={styles.foundBadge}>
                <Text style={styles.foundBadgeText}>✓  Patient found</Text>
              </View>
            </View>

            <View style={styles.patientRow}>
              <View style={styles.patientAvatar}>
                <Text style={styles.patientAvatarInitials}>{MOCK_PATIENT.initials}</Text>
              </View>
              <View style={styles.patientInfo}>
                <Text style={styles.patientName}>{MOCK_PATIENT.name}</Text>
                <Text style={styles.patientMeta}>
                  {MOCK_PATIENT.age} years · {MOCK_PATIENT.maskedMobile}
                </Text>
              </View>
            </View>

            <View style={styles.foundDivider} />

            <View style={styles.lastSeenRow}>
              <Text style={styles.lastSeenLabel}>Last seen at</Text>
              <Text style={styles.lastSeenValue}>
                {MOCK_PATIENT.lastClinic}
              </Text>
              <Text style={styles.lastSeenDate}>{MOCK_PATIENT.lastVisit}</Text>
            </View>

            <TouchableOpacity
              style={styles.ctaButton}
              onPress={() => { /* mockup — D9 ConsentRequest would launch here */ }}
              accessibilityLabel="Request consent to access patient records"
              accessibilityRole="button"
            >
              <Text style={styles.ctaButtonText}>Request Consent</Text>
            </TouchableOpacity>

            <Text style={styles.ctaHint}>
              An SMS will be sent to the patient's registered number for verification.
            </Text>
          </View>
        )}

        {/* ── State: Not Found ── */}
        {lookupState === 'not_found' && (
          <View style={styles.notFoundCard}>
            <View style={styles.notFoundIconCircle}>
              <Text style={styles.notFoundIconText}>?</Text>
            </View>
            <Text style={styles.notFoundTitle}>Patient not found</Text>
            <Text style={styles.notFoundBody}>
              No patient is registered with{' '}
              <Text style={styles.notFoundNumber}>{formatDisplay(digits)}</Text>.
              {'\n'}Check the number, or register this patient first.
            </Text>

            <TouchableOpacity
              style={styles.registerButton}
              onPress={() => navigation.navigate('NewPatientForm', { prefillMobile: digits })}
              accessibilityLabel="Register this patient"
              accessibilityRole="button"
            >
              <Text style={styles.registerButtonText}>Register This Patient</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleClear}
              accessibilityLabel="Try a different number"
              accessibilityRole="button"
            >
              <Text style={styles.retryButtonText}>Try a Different Number</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Numeric keypad ── */}
        <View style={styles.keypad}>
          {KEYPAD_ROWS.map((row, ri) => (
            <View key={ri} style={styles.keypadRow}>
              {row.map((key, ki) =>
                key === '' ? (
                  <View key={ki} style={styles.keypadEmpty} />
                ) : (
                  <TouchableOpacity
                    key={ki}
                    style={[
                      styles.keypadKey,
                      key === '⌫' && styles.keypadKeyBackspace,
                      (isAtMax && key !== '⌫') && styles.keypadKeyDisabled,
                    ]}
                    onPress={() => handleKeyPress(key)}
                    disabled={isAtMax && key !== '⌫'}
                    accessibilityLabel={key === '⌫' ? 'Delete last digit' : `Digit ${key}`}
                    accessibilityRole="button"
                  >
                    <Text style={[
                      styles.keypadKeyText,
                      key === '⌫'             && styles.keypadBackspaceText,
                      (isAtMax && key !== '⌫') && styles.keypadKeyTextDisabled,
                    ]}>
                      {key}
                    </Text>
                  </TouchableOpacity>
                )
              )}
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // ── Header ────────────────────────────────────────────────────────────────

  header: {
    flexDirection:    'row',
    alignItems:       'center',
    backgroundColor:  Colors.primaryDark,
    paddingHorizontal: 12,
    paddingTop:        12,
    paddingBottom:     14,
    gap: 8,
  },
  backButton: {
    width:           44,
    height:          44,
    justifyContent: 'center',
    alignItems:     'center',
  },
  backArrow: {
    fontSize:   28,
    color:      Colors.surface,
    lineHeight: 32,
  },
  headerTextGroup: { flex: 1 },
  headerTitle: {
    fontSize:   18,
    fontWeight: '600',
    color:      Colors.surface,
  },
  headerSubtitle: {
    fontSize:  13,
    color:     'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  // ── Scroll ────────────────────────────────────────────────────────────────

  scroll: { flex: 1 },
  scrollContent: {
    padding:       16,
    paddingBottom: 48,
    gap:           16,
  },

  // ── Purpose banner ────────────────────────────────────────────────────────

  purposeBanner: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: Colors.infoLight,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.infoBorder,
    padding:         14,
    gap:             10,
  },
  purposeIcon: { fontSize: 18 },
  purposeText: {
    flex:       1,
    fontSize:   14,
    color:      Colors.primaryDark,
    lineHeight: 20,
    fontWeight: '500',
  },

  // ── Mobile input ──────────────────────────────────────────────────────────

  inputCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         16,
    gap:             8,
  },
  inputLabel: {
    fontSize:   12,
    fontWeight: '600',
    color:      Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing:  0.5,
  },
  inputDisplay: {
    flexDirection:  'row',
    alignItems:     'center',
    borderWidth:    2,
    borderColor:    Colors.border,
    borderRadius:   10,
    paddingVertical:  14,
    paddingHorizontal: 16,
    backgroundColor: Colors.background,
  },
  inputDisplayLoading: {
    borderColor:     Colors.primaryBlue,
    borderStyle:     'dashed' as const,
  },
  inputDisplaySuccess: {
    borderColor:     Colors.success,
    backgroundColor: Colors.successLight,
  },
  inputDisplayError: {
    borderColor:     Colors.error,
    backgroundColor: Colors.errorLight,
  },
  inputDisplayText: {
    flex:        1,
    fontSize:    26,
    fontWeight:  '700',
    color:       Colors.textPrimary,
    letterSpacing: 2,
  },
  inputDisplayPlaceholder: {
    fontSize:   18,
    fontWeight: '400',
    color:      Colors.textDisabled,
    letterSpacing: 0,
  },
  clearButton: {
    width:          36,
    height:         36,
    borderRadius:   18,
    backgroundColor: Colors.border,
    justifyContent: 'center',
    alignItems:     'center',
  },
  clearButtonText: {
    fontSize:   14,
    color:      Colors.textSecondary,
    fontWeight: '600',
  },
  digitCounter: {
    fontSize:  12,
    color:     Colors.textSecondary,
    textAlign: 'right',
  },

  // ── Look Up button ────────────────────────────────────────────────────────

  lookupButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius:    12,
    paddingVertical: 16,
    alignItems:      'center',
  },
  lookupButtonDisabled: {
    backgroundColor: Colors.textDisabled,
  },
  lookupButtonText: {
    fontSize:   16,
    fontWeight: '700',
    color:      Colors.surface,
  },

  // ── Loading card ──────────────────────────────────────────────────────────

  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         32,
    alignItems:      'center',
    gap:             14,
  },
  loadingTitle: {
    fontSize:   16,
    fontWeight: '600',
    color:      Colors.textPrimary,
    textAlign:  'center',
  },
  loadingSubtext: {
    fontSize:  13,
    color:     Colors.textSecondary,
    textAlign: 'center',
  },

  // ── Hint card (idle + empty) ──────────────────────────────────────────────

  hintCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         16,
    gap:             12,
  },
  hintTitle: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.textPrimary,
    marginBottom: 4,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           12,
  },
  hintStepBubble: {
    width:           24,
    height:          24,
    borderRadius:    12,
    backgroundColor: Colors.primaryBlue,
    justifyContent: 'center',
    alignItems:     'center',
    flexShrink:      0,
    marginTop:       1,
  },
  hintStepText: {
    fontSize:   12,
    fontWeight: '700',
    color:      Colors.surface,
  },
  hintText: {
    flex:       1,
    fontSize:   14,
    color:      Colors.textSecondary,
    lineHeight: 20,
  },

  // ── Found card ────────────────────────────────────────────────────────────

  foundCard: {
    backgroundColor: Colors.surface,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         16,
    gap:             12,
  },
  foundBadgeRow: {
    flexDirection: 'row',
  },
  foundBadge: {
    backgroundColor: Colors.successLight,
    borderRadius:    20,
    paddingHorizontal: 12,
    paddingVertical:    6,
  },
  foundBadgeText: {
    fontSize:   13,
    fontWeight: '600',
    color:      Colors.success,
  },
  patientRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           12,
  },
  patientAvatar: {
    width:           52,
    height:          52,
    borderRadius:    26,
    backgroundColor: Colors.primaryBlue,
    justifyContent: 'center',
    alignItems:     'center',
    flexShrink:      0,
  },
  patientAvatarInitials: {
    fontSize:   20,
    fontWeight: '700',
    color:      Colors.surface,
  },
  patientInfo: { flex: 1 },
  patientName: {
    fontSize:   17,
    fontWeight: '700',
    color:      Colors.textPrimary,
  },
  patientMeta: {
    fontSize:  14,
    color:     Colors.textSecondary,
    marginTop: 3,
  },
  foundDivider: {
    height:          1,
    backgroundColor: Colors.border,
  },
  lastSeenRow: {
    gap: 2,
  },
  lastSeenLabel: {
    fontSize:  11,
    fontWeight: '600',
    color:      Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lastSeenValue: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.textPrimary,
  },
  lastSeenDate: {
    fontSize: 13,
    color:    Colors.textSecondary,
  },
  ctaButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius:    12,
    paddingVertical: 16,
    alignItems:      'center',
    marginTop:        4,
  },
  ctaButtonText: {
    fontSize:   16,
    fontWeight: '700',
    color:      Colors.surface,
  },
  ctaHint: {
    fontSize:  13,
    color:     Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Not-found card ────────────────────────────────────────────────────────

  notFoundCard: {
    backgroundColor: Colors.errorLight,
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     '#FECACA',
    padding:         20,
    alignItems:      'center',
    gap:             12,
  },
  notFoundIconCircle: {
    width:           56,
    height:          56,
    borderRadius:    28,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems:     'center',
  },
  notFoundIconText: {
    fontSize:   26,
    fontWeight: '700',
    color:      Colors.surface,
  },
  notFoundTitle: {
    fontSize:   18,
    fontWeight: '700',
    color:      Colors.error,
  },
  notFoundBody: {
    fontSize:  14,
    color:     Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  notFoundNumber: {
    fontWeight: '700',
    color:      Colors.textPrimary,
    letterSpacing: 1,
  },
  registerButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius:    12,
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems:      'center',
    width:           '100%',
  },
  registerButtonText: {
    fontSize:   15,
    fontWeight: '700',
    color:      Colors.surface,
  },
  retryButton: {
    borderRadius:    12,
    paddingVertical: 12,
    alignItems:      'center',
    width:           '100%',
    borderWidth:     1,
    borderColor:     Colors.error,
  },
  retryButtonText: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.error,
  },

  // ── Keypad ────────────────────────────────────────────────────────────────

  keypad: {
    gap:            8,
    paddingTop:     4,
  },
  keypadRow: {
    flexDirection: 'row',
    gap:           8,
    justifyContent: 'center',
  },
  keypadKey: {
    flex:            1,
    maxWidth:        110,
    height:          56,
    borderRadius:    12,
    backgroundColor: Colors.surface,
    borderWidth:     1,
    borderColor:     Colors.border,
    justifyContent: 'center',
    alignItems:     'center',
  },
  keypadKeyBackspace: {
    backgroundColor: Colors.background,
  },
  keypadKeyDisabled: {
    backgroundColor: Colors.background,
    borderColor:     Colors.border,
    opacity:         0.4,
  },
  keypadEmpty: {
    flex:     1,
    maxWidth: 110,
    height:   56,
  },
  keypadKeyText: {
    fontSize:   22,
    fontWeight: '600',
    color:      Colors.textPrimary,
  },
  keypadBackspaceText: {
    fontSize: 20,
    color:    Colors.textSecondary,
  },
  keypadKeyTextDisabled: {
    color: Colors.textDisabled,
  },
});
