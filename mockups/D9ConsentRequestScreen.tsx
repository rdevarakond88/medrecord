/**
 * D9ConsentRequestScreen — Static Mockup
 *
 * Spec:    docs/ui-ux-spec.md § D9
 * Consent: docs/consent-layer-spec.md § Flow 2 / Sub-flow B (SMS OTP)
 * PM:      reviews/D9-pm-review.md — Sub-flow A (push) deferred to v2
 *
 * State variants rendered (each is a named export for persona review):
 *
 *   DOCTOR-FACING STATES (doctor holds the phone):
 *   1. D9ConsentRequesting       — sending OTP request; spinner
 *   2. D9ConsentWaiting          — SMS sent; countdown to resend; patient-not-available fallback
 *   6. D9ConsentFailure          — OTP wrong / expired; retry or skip options
 *   7. D9ConsentPatientNotAvailable — graceful exit; doctor can still create new visit
 *
 *   PATIENT-FACING STATES (doctor hands phone to patient):
 *   3. D9ConsentOtpInput         — radically simple; large code entry; NO other patient/doctor context
 *   4. D9ConsentVerifying        — brief spinner while server validates OTP
 *   5. D9ConsentSuccess          — "Thank you" message; auto-returns to D3 in ~2s
 *
 * Design decisions:
 *   - Patient-facing states (3, 4, 5) expose ZERO other patient or doctor data.
 *     The screen must be safe to hand to a low-literacy patient for 10 seconds.
 *   - Masked mobile: only last 4 digits shown on all doctor-facing screens.
 *   - Resend countdown: 30 seconds (PM review: SMS can take 30–90s in rural India).
 *   - Fallback exit ("Patient not available") is a first-class option, not a back-button edge case.
 *   - Success auto-exits; patient doesn't need to hand phone back before D3 reloads.
 *   - OTP boxes: 6 individual boxes, auto-advance on digit entry, backspace retreats.
 *
 * Placeholder data: realistic Indian clinical context
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';

// ---------------------------------------------------------------------------
// Design tokens (ui-ux-spec.md)
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
  successLight:  '#DCFCE7',
  warning:       '#D97706',
  warningLight:  '#FEF3C7',
  error:         '#DC2626',
  errorLight:    '#FEE2E2',
};

// ---------------------------------------------------------------------------
// Placeholder data
// ---------------------------------------------------------------------------
const PATIENT = {
  name:         'Sunita Devi Sharma',
  maskedMobile: '•••• 9876',   // only last 4 digits shown
};

const DOCTOR = {
  name:   'Dr. Priya Nair',
  clinic: 'Janata Clinic, Nagpur',
};

const RESEND_SECONDS = 30;

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function DoctorHeader() {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        style={styles.backButton}
        accessibilityLabel="Go back"
        accessibilityRole="button"
      >
        <Text style={styles.backArrow}>‹</Text>
      </TouchableOpacity>
      <View style={styles.headerTextGroup}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Request Consent
        </Text>
        <Text style={styles.headerSubtitle} numberOfLines={1}>
          {PATIENT.name}
        </Text>
      </View>
    </View>
  );
}

interface PatientCardProps {
  maskedMobile: string;
}
function PatientCard({ maskedMobile }: PatientCardProps) {
  return (
    <View style={styles.patientCard}>
      <View style={styles.patientAvatar}>
        <Text style={styles.patientAvatarInitial}>
          {PATIENT.name.charAt(0)}
        </Text>
      </View>
      <View style={styles.patientCardText}>
        <Text style={styles.patientCardName} numberOfLines={1}>
          {PATIENT.name}
        </Text>
        <Text style={styles.patientCardMobile}>{maskedMobile}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Variant 1 — Requesting (doctor-facing)
// ---------------------------------------------------------------------------
export function D9ConsentRequesting() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <DoctorHeader />
      <View style={styles.centeredContent}>
        <PatientCard maskedMobile={PATIENT.maskedMobile} />

        <View style={styles.spinnerBlock}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={styles.spinnerLabel}>Sending consent request…</Text>
          <Text style={styles.spinnerSubLabel}>
            An SMS will be sent to the patient's registered number.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 2 — Waiting (doctor-facing, SMS sent)
// ---------------------------------------------------------------------------
export function D9ConsentWaiting() {
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [canResend,   setCanResend]   = useState(false);
  const endTimeRef = useRef(Date.now() + RESEND_SECONDS * 1000);

  useEffect(() => {
    const timer = setInterval(() => {
      const remaining = Math.ceil((endTimeRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(timer);
        setSecondsLeft(0);
        setCanResend(true);
      } else {
        setSecondsLeft(remaining);
      }
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const handleResend = useCallback(() => {
    endTimeRef.current = Date.now() + RESEND_SECONDS * 1000;
    setSecondsLeft(RESEND_SECONDS);
    setCanResend(false);
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <DoctorHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <PatientCard maskedMobile={PATIENT.maskedMobile} />

        {/* Status block */}
        <View style={styles.waitingCard}>
          <View style={styles.waitingIconRow}>
            <View style={styles.smsIcon}>
              <Text style={styles.smsIconText}>✉</Text>
            </View>
            <View style={styles.waitingTextBlock}>
              <Text style={styles.waitingTitle}>SMS sent</Text>
              <Text style={styles.waitingBody}>
                A 6-digit code has been sent to{' '}
                <Text style={styles.maskedMobile}>{PATIENT.maskedMobile}</Text>.
                Ask your patient to check their phone.
              </Text>
            </View>
          </View>
        </View>

        {/* Instruction */}
        <View style={styles.instructionCard}>
          <Text style={styles.instructionStep}>Step 1</Text>
          <Text style={styles.instructionText}>
            Show your patient this screen and ask them to enter the 6-digit
            code from their SMS message.
          </Text>
          <TouchableOpacity
            style={styles.handOffButton}
            accessibilityLabel="Patient is ready — show OTP entry"
            accessibilityRole="button"
          >
            <Text style={styles.handOffButtonText}>
              Patient is ready — show them the entry screen
            </Text>
          </TouchableOpacity>
        </View>

        {/* Resend section */}
        <View style={styles.resendRow}>
          {canResend ? (
            <TouchableOpacity
              style={styles.resendButton}
              onPress={handleResend}
              accessibilityLabel="Resend SMS"
              accessibilityRole="button"
            >
              <Text style={styles.resendButtonText}>Resend SMS</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.resendCountdown}>
              Resend available in {secondsLeft}s
            </Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Fallback — first-class option, not a back-button edge case */}
        <TouchableOpacity
          style={styles.skipRow}
          accessibilityLabel="Patient is not available — skip consent for now"
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Patient not available right now?</Text>
          <Text style={styles.skipLink}>Skip — start visit without history</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 3 — OTP Input (PATIENT-FACING)
//
// This state is handed to the patient. It must expose ZERO surrounding
// doctor or patient context. Optimised for a low-literacy patient reading
// it alone in a 10-second window.
// ---------------------------------------------------------------------------

const OTP_LENGTH = 6;

export function D9ConsentOtpInput() {
  const [digits,    setDigits]    = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [errorMsg,  setErrorMsg]  = useState<string | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));

  const handleDigitChange = useCallback((index: number, value: string) => {
    const digit = value.replace(/[^0-9]/g, '').slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    setErrorMsg(null);
  }, []);

  const handleKeyPress = useCallback((index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  const isComplete = digits.every(d => d !== '');

  return (
    // KeyboardAvoidingView so OTP boxes stay visible above the keyboard
    <KeyboardAvoidingView
      style={styles.patientSafeArea}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <SafeAreaView style={styles.patientSafeArea}>
        {/*
          PATIENT-FACING: absolutely no doctor name, patient name, or clinic visible.
          Only MedRecord branding and the action required.
        */}
        <View style={styles.patientContent}>

          {/* MedRecord wordmark only */}
          <Text style={styles.patientBrandName}>MedRecord</Text>

          {/* Primary instruction — large, clear */}
          <Text style={styles.patientInstruction}>
            Enter your 6-digit code
          </Text>
          <Text style={styles.patientHint}>
            Check the SMS from MedRecord on your phone
          </Text>

          {/* OTP boxes */}
          <View style={styles.otpRow} accessibilityLabel="6-digit code entry">
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={ref => { inputRefs.current[i] = ref; }}
                style={[
                  styles.otpBox,
                  digit     ? styles.otpBoxFilled  : null,
                  errorMsg  ? styles.otpBoxError   : null,
                ]}
                value={digit}
                onChangeText={val => handleDigitChange(i, val)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                textContentType="oneTimeCode"
                returnKeyType="done"
                accessibilityLabel={`Digit ${i + 1} of 6`}
              />
            ))}
          </View>

          {/* Error message */}
          {errorMsg && (
            <Text style={styles.patientErrorText}>{errorMsg}</Text>
          )}

          {/* Confirm button */}
          <TouchableOpacity
            style={[
              styles.patientConfirmButton,
              !isComplete && styles.patientConfirmButtonDisabled,
            ]}
            disabled={!isComplete}
            accessibilityLabel="Confirm code"
            accessibilityRole="button"
          >
            <Text
              style={[
                styles.patientConfirmButtonText,
                !isComplete && styles.patientConfirmButtonTextDisabled,
              ]}
            >
              Confirm
            </Text>
          </TouchableOpacity>

          {/* Didn't receive SMS — minimal option, positioned low */}
          <Text style={styles.patientNoSmsText}>
            Didn't receive a code? Ask your doctor to resend.
          </Text>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Variant 4 — Verifying (PATIENT-FACING, brief)
// ---------------------------------------------------------------------------
export function D9ConsentVerifying() {
  return (
    <SafeAreaView style={styles.patientSafeArea}>
      <View style={styles.patientContent}>
        <Text style={styles.patientBrandName}>MedRecord</Text>
        <View style={styles.verifyingBlock}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
          <Text style={styles.verifyingLabel}>Checking your code…</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 5 — Success (PATIENT-FACING, then auto-returns to D3)
// ---------------------------------------------------------------------------
export function D9ConsentSuccess() {
  return (
    <SafeAreaView style={styles.patientSafeArea}>
      <View style={styles.patientContent}>
        <Text style={styles.patientBrandName}>MedRecord</Text>

        <View style={styles.successCircle}>
          <Text style={styles.successCheck}>✓</Text>
        </View>

        <Text style={styles.successTitle}>Thank you!</Text>
        <Text style={styles.successBody}>
          Your doctor can now view your health records to provide better care.
        </Text>
        <Text style={styles.successFootnote}>
          You can remove this access at any time from the MedRecord app.
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 6 — Failure (doctor-facing, after OTP wrong or expired)
// ---------------------------------------------------------------------------
export function D9ConsentFailure() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <DoctorHeader />
      <View style={styles.centeredContent}>
        <PatientCard maskedMobile={PATIENT.maskedMobile} />

        <View style={styles.failureCard}>
          <View style={styles.failureIconCircle}>
            <Text style={styles.failureIcon}>✕</Text>
          </View>
          <Text style={styles.failureTitle}>Incorrect code</Text>
          <Text style={styles.failureBody}>
            The code entered didn't match. It may have expired (codes are
            valid for 10 minutes). Ask your patient to check the latest SMS
            from MedRecord.
          </Text>
        </View>

        {/* Primary action: try again */}
        <TouchableOpacity
          style={styles.retryButton}
          accessibilityLabel="Try again — resend code"
          accessibilityRole="button"
        >
          <Text style={styles.retryButtonText}>Resend and try again</Text>
        </TouchableOpacity>

        {/* Secondary: give up gracefully */}
        <TouchableOpacity
          style={styles.skipRowCenter}
          accessibilityLabel="Skip consent — start visit without history"
          accessibilityRole="button"
        >
          <Text style={styles.skipLink}>
            Skip — start visit without record history
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Variant 7 — Patient Not Available (doctor-facing fallback exit)
//
// This is a first-class design state, not a back-button edge case.
// Doctor can still start a new visit; they just won't see history.
// ---------------------------------------------------------------------------
export function D9ConsentPatientNotAvailable() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <DoctorHeader />
      <View style={styles.centeredContent}>
        <PatientCard maskedMobile={PATIENT.maskedMobile} />

        <View style={styles.fallbackCard}>
          <Text style={styles.fallbackTitle}>No problem</Text>
          <Text style={styles.fallbackBody}>
            You can still create a new visit for this patient. You won't be
            able to view records created by other doctors until they grant
            access.
          </Text>

          {/* Divider */}
          <View style={styles.fallbackDivider} />

          {/* What changes with consent — brief, informational */}
          <View style={styles.fallbackPermissionRow}>
            <Text style={styles.fallbackPermissionCheck}>✓</Text>
            <Text style={styles.fallbackPermissionText}>
              You can create a new visit and add records
            </Text>
          </View>
          <View style={styles.fallbackPermissionRow}>
            <Text style={styles.fallbackPermissionCross}>✕</Text>
            <Text style={styles.fallbackPermissionTextDim}>
              Records from other doctors are hidden (consent required)
            </Text>
          </View>
        </View>

        {/* Primary CTA: new visit only */}
        <TouchableOpacity
          style={styles.newVisitButton}
          accessibilityLabel="Start a new visit without history"
          accessibilityRole="button"
        >
          <Text style={styles.newVisitButtonText}>Start New Visit</Text>
        </TouchableOpacity>

        {/* Secondary: back to patient detail */}
        <TouchableOpacity
          style={styles.goBackRow}
          accessibilityLabel="Go back to patient detail"
          accessibilityRole="button"
        >
          <Text style={styles.goBackText}>← Back to Patient</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Default export — interactive state navigator for persona review
// ---------------------------------------------------------------------------

type FlowState =
  | 'requesting'
  | 'waiting'
  | 'otp_input'
  | 'verifying'
  | 'success'
  | 'failure'
  | 'patient_not_available';

const STATES: FlowState[] = [
  'requesting',
  'waiting',
  'otp_input',
  'verifying',
  'success',
  'failure',
  'patient_not_available',
];

const STATE_LABELS: Record<FlowState, string> = {
  requesting:           '1 Requesting',
  waiting:              '2 Waiting',
  otp_input:            '3 OTP Input',
  verifying:            '4 Verifying',
  success:              '5 Success',
  failure:              '6 Failure',
  patient_not_available:'7 Not Available',
};

export default function D9ConsentRequestScreen() {
  const [state, setState] = useState<FlowState>('requesting');
  const currentIndex = STATES.indexOf(state);

  function renderState() {
    switch (state) {
      case 'requesting':           return <D9ConsentRequesting />;
      case 'waiting':              return <D9ConsentWaiting />;
      case 'otp_input':            return <D9ConsentOtpInput />;
      case 'verifying':            return <D9ConsentVerifying />;
      case 'success':              return <D9ConsentSuccess />;
      case 'failure':              return <D9ConsentFailure />;
      case 'patient_not_available':return <D9ConsentPatientNotAvailable />;
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>{renderState()}</View>

      {/* Dev-only state navigator */}
      <View style={styles.stateNav}>
        <TouchableOpacity
          style={[styles.stateNavBtn, currentIndex === 0 && styles.stateNavBtnDisabled]}
          disabled={currentIndex === 0}
          onPress={() => setState(STATES[currentIndex - 1])}
          accessibilityLabel="Previous state"
        >
          <Text style={styles.stateNavArrow}>‹</Text>
        </TouchableOpacity>

        <Text style={styles.stateNavLabel}>{STATE_LABELS[state]}</Text>

        <TouchableOpacity
          style={[styles.stateNavBtn, currentIndex === STATES.length - 1 && styles.stateNavBtnDisabled]}
          disabled={currentIndex === STATES.length - 1}
          onPress={() => setState(STATES[currentIndex + 1])}
          accessibilityLabel="Next state"
        >
          <Text style={styles.stateNavArrow}>›</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({

  // ── Shared layout ──────────────────────────────────────────────────────────

  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  centeredContent: {
    flex: 1,
    padding: 16,
    gap: 16,
    alignItems: 'stretch',
  },

  // ── Header ─────────────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 28,
    color: Colors.surface,
    lineHeight: 32,
  },
  headerTextGroup: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.surface,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },

  // ── Patient card ───────────────────────────────────────────────────────────

  patientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  patientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primaryBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
  patientAvatarInitial: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.surface,
  },
  patientCardText: {
    flex: 1,
  },
  patientCardName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  patientCardMobile: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
    letterSpacing: 1,
  },

  // ── Variant 1 — Requesting ─────────────────────────────────────────────────

  spinnerBlock: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 16,
  },
  spinnerLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  spinnerSubLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 20,
  },

  // ── Variant 2 — Waiting ────────────────────────────────────────────────────

  waitingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  waitingIconRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  smsIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  smsIconText: {
    fontSize: 20,
  },
  waitingTextBlock: {
    flex: 1,
  },
  waitingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  waitingBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  maskedMobile: {
    fontWeight: '600',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  instructionCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  instructionStep: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primaryBlue,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  instructionText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  handOffButton: {
    marginTop: 4,
    backgroundColor: Colors.primaryBlue,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  handOffButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.surface,
  },
  resendRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  resendButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primaryBlue,
  },
  resendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primaryBlue,
  },
  resendCountdown: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 4,
  },
  skipRow: {
    paddingVertical: 8,
    gap: 4,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  skipLink: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.warning,
  },

  // ── Variants 3–5 — PATIENT-FACING ─────────────────────────────────────────

  patientSafeArea: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  patientContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 40,
    gap: 0,
  },
  patientBrandName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primaryBlue,
    letterSpacing: 0.5,
    marginBottom: 48,
  },
  patientInstruction: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 36,
    marginBottom: 12,
  },
  patientHint: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 36,
  },

  // OTP boxes
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 32,
  },
  otpBox: {
    width: 48,
    height: 60,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  otpBoxFilled: {
    borderColor: Colors.primaryBlue,
    backgroundColor: '#EFF6FF',
  },
  otpBoxError: {
    borderColor: Colors.error,
    backgroundColor: Colors.errorLight,
  },
  patientErrorText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 16,
  },

  patientConfirmButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    width: '100%',
    marginBottom: 24,
  },
  patientConfirmButtonDisabled: {
    backgroundColor: Colors.border,
  },
  patientConfirmButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.surface,
  },
  patientConfirmButtonTextDisabled: {
    color: Colors.textDisabled,
  },
  patientNoSmsText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Variant 4 — Verifying ──────────────────────────────────────────────────

  verifyingBlock: {
    alignItems: 'center',
    gap: 20,
  },
  verifyingLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  // ── Variant 5 — Success ────────────────────────────────────────────────────

  successCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.successLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successCheck: {
    fontSize: 42,
    color: Colors.success,
    fontWeight: '700',
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
  },
  successBody: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  successFootnote: {
    fontSize: 13,
    color: Colors.textDisabled,
    textAlign: 'center',
    lineHeight: 18,
  },

  // ── Variant 6 — Failure ────────────────────────────────────────────────────

  failureCard: {
    backgroundColor: Colors.errorLight,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 12,
  },
  failureIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  failureIcon: {
    fontSize: 24,
    color: Colors.surface,
    fontWeight: '700',
  },
  failureTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.error,
  },
  failureBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.surface,
  },
  skipRowCenter: {
    paddingVertical: 12,
    alignItems: 'center',
  },

  // ── Variant 7 — Patient Not Available ──────────────────────────────────────

  fallbackCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  fallbackTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 4,
  },
  fallbackBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  fallbackDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  fallbackPermissionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  fallbackPermissionCheck: {
    fontSize: 16,
    color: Colors.success,
    fontWeight: '700',
    width: 20,
  },
  fallbackPermissionCross: {
    fontSize: 16,
    color: Colors.error,
    fontWeight: '700',
    width: 20,
  },
  fallbackPermissionText: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  fallbackPermissionTextDim: {
    flex: 1,
    fontSize: 14,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  newVisitButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  newVisitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.surface,
  },
  goBackRow: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  goBackText: {
    fontSize: 14,
    color: Colors.primaryBlue,
    fontWeight: '500',
  },

  // ── State navigator (dev-only) ─────────────────────────────────────────────

  stateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  stateNavBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stateNavBtnDisabled: {
    opacity: 0.3,
  },
  stateNavArrow: {
    fontSize: 28,
    color: Colors.surface,
    lineHeight: 32,
  },
  stateNavLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.surface,
    textAlign: 'center',
    flex: 1,
  },
});
