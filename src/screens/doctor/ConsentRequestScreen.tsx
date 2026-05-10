/**
 * ConsentRequestScreen — D9 Live Screen
 *
 * Spec:    docs/ui-ux-spec.md § D9
 * Consent: docs/consent-layer-spec.md § Flow 2 / Sub-flow B (SMS OTP)
 * API:     docs/api-contracts.md § Consent Endpoints
 * QA:      reviews/D9-qa-test-plan.md
 *
 * QA fixes applied in this build:
 *   C-1  iOS autofill distributes across all 6 OTP boxes (handleDigitChange)
 *   C-2  Resend calls POST /consent/request and replaces otp_token (handleResend)
 *   H-1  State 2b removed — "Patient is ready" → State 3 directly
 *   H-2  Distinct rate-limit state (State 8) for 429 responses
 *   H-3  Back from State 3 → State 2 (not D3); otp_token preserved
 *   H-4  Success footnote updated per consent-layer-spec §Flow 4
 *   M-1  isSubmittingRef tap guard on handleConfirm (sync ref, not useState)
 *   M-2  OTP expiry countdown shown in State 3 (patient-facing)
 *   M-3  Distinct failure messages for 400 (wrong) vs 410 (exhausted/expired)
 *   M-4  DPDP audit event logged on POST /consent/request
 *   E-5  State 7 "Start New Visit" navigates to D6 with consentGranted: false
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
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
  Alert,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../App';
import { useAuthStore } from '../../store/useAuthStore';
import {
  requestConsent,
  verifyConsent,
  ConsentRateLimitError,
} from '../../api/consent';
import { logConsentRequested } from '../../db/visits';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = NativeStackScreenProps<RootStackParamList, 'ConsentRequest'>;

type FlowState =
  | 'requesting'            // State 1 — spinner; calling POST /consent/request
  | 'waiting'               // State 2 — SMS sent; resend countdown; handoff button
  | 'otp_input'             // State 3 — patient-facing; large OTP entry
  | 'verifying'             // State 4 — spinner; calling POST /consent/verify
  | 'success'               // State 5 — granted; auto-returns to D3 after 2s
  | 'failure'               // State 6 — wrong OTP or exhausted (see failureReason)
  | 'patient_not_available' // State 7 — graceful exit; can start visit without history
  | 'rate_limited';         // State 8 — 429 from /consent/request or resend

// ─── Constants ────────────────────────────────────────────────────────────────

const OTP_LENGTH      = 6;
const RESEND_SECONDS  = 30;
const OTP_EXPIRY_SECS = 600;   // 10 minutes — PM confirmed 2026-05-09
const AUTO_RETURN_MS  = 2000;  // State 5 auto-return to D3

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
  warning:       '#D97706',
  warningLight:  '#FEF3C7',
  error:         '#DC2626',
  errorLight:    '#FEE2E2',
};

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ConsentRequestScreen({ route, navigation }: Props) {
  const db              = useSQLiteContext();
  const { token, user } = useAuthStore();

  const {
    patientLocalId,
    patientServerId,
    patientName,
    maskedMobile,
    patientMobile,
  } = route.params;

  // ── Flow state ────────────────────────────────────────────────
  const [flowState, setFlowState] = useState<FlowState>('requesting');
  // Ref mirrors state for use inside event listeners (avoids stale closure)
  const flowStateRef = useRef<FlowState>('requesting');

  function transition(next: FlowState) {
    flowStateRef.current = next;
    setFlowState(next);
  }

  // ── Consent token (C-2: replaced on every resend) ────────────
  const [otpToken, setOtpToken] = useState<string | null>(null);

  // ── OTP entry (State 3) ───────────────────────────────────────
  const [digits, setDigits]         = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [otpErrorMsg, setOtpErrorMsg] = useState<string | null>(null);
  const inputRefs    = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  const isSubmittingRef = useRef(false);   // M-1: synchronous tap guard

  // ── Failure state ─────────────────────────────────────────────
  const [failureReason, setFailureReason]       = useState<'invalid_otp' | 'exhausted' | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // ── Resend countdown (State 2) ────────────────────────────────
  const [resendSecondsLeft, setResendSecondsLeft] = useState(RESEND_SECONDS);
  const [canResend,         setCanResend]         = useState(false);
  const resendEndTimeRef = useRef(Date.now() + RESEND_SECONDS * 1000);

  // ── OTP expiry countdown (State 3 — M-2) ─────────────────────
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(OTP_EXPIRY_SECS);
  const otpExpiresAtRef  = useRef(Date.now() + OTP_EXPIRY_SECS * 1000);

  // ── Rate-limit countdown (State 8 — H-2) ─────────────────────
  const [rateLimitSecondsLeft, setRateLimitSecondsLeft] = useState(0);
  const rateLimitEndsAtRef = useRef(Date.now());

  // ── Request error (State 1 on failure) ───────────────────────
  const [requestError, setRequestError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // Timers — all run continuously; each state renders relevant one
  // ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      const rem = Math.ceil((resendEndTimeRef.current - Date.now()) / 1000);
      if (rem <= 0) { setResendSecondsLeft(0); setCanResend(true); }
      else          { setResendSecondsLeft(rem); }
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setOtpSecondsLeft(
        Math.max(0, Math.ceil((otpExpiresAtRef.current - Date.now()) / 1000)),
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setRateLimitSecondsLeft(
        Math.max(0, Math.ceil((rateLimitEndsAtRef.current - Date.now()) / 1000)),
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // ─────────────────────────────────────────────────────────────
  // Back navigation interception — H-3
  // State 3 (otp_input): intercept → restore State 2, clear OTP boxes
  // All other states: natural back → pops to D3 (triggering D3 useFocusEffect)
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (flowStateRef.current === 'otp_input') {
        e.preventDefault();
        setDigits(Array(OTP_LENGTH).fill(''));
        setOtpErrorMsg(null);
        isSubmittingRef.current = false;
        transition('waiting');
      }
    });
    return unsubscribe;
  }, [navigation]);

  // ─────────────────────────────────────────────────────────────
  // Initial consent request — fires on mount
  // ─────────────────────────────────────────────────────────────
  useEffect(() => {
    void sendConsentRequest();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────────────────────────────
  // Auth guard — after all hooks
  // ─────────────────────────────────────────────────────────────
  if (!token || !user) return null;

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────

  async function sendConsentRequest() {
    if (!patientServerId) {
      setRequestError(
        'Cannot request consent — patient not yet synced. Connect to the network and try again.',
      );
      return;
    }

    transition('requesting');
    setRequestError(null);

    // M-4: DPDP audit event — non-blocking
    try { await logConsentRequested(db, user!.id, patientServerId); } catch { /* non-blocking */ }

    try {
      const result = await requestConsent(patientServerId, token!);
      setOtpToken(result.otp_token);
      otpExpiresAtRef.current  = Date.now() + result.expires_in * 1000;
      setOtpSecondsLeft(result.expires_in);
      resendEndTimeRef.current = Date.now() + RESEND_SECONDS * 1000;
      setResendSecondsLeft(RESEND_SECONDS);
      setCanResend(false);
      transition('waiting');
    } catch (err) {
      if (err instanceof ConsentRateLimitError) {
        rateLimitEndsAtRef.current = Date.now() + err.retryAfterSeconds * 1000;
        setRateLimitSecondsLeft(err.retryAfterSeconds);
        transition('rate_limited');
      } else {
        setRequestError('Something went wrong — please try again.');
      }
    }
  }

  // C-2: handleResend calls POST /consent/request and replaces otp_token
  const handleResend = useCallback(async () => {
    if (!patientServerId) return;
    setCanResend(false);

    // M-4: DPDP audit event — non-blocking
    try { await logConsentRequested(db, user!.id, patientServerId); } catch { /* non-blocking */ }

    try {
      const result = await requestConsent(patientServerId, token!);
      setOtpToken(result.otp_token);                       // C-2: replace stale token
      otpExpiresAtRef.current  = Date.now() + result.expires_in * 1000;
      setOtpSecondsLeft(result.expires_in);
      resendEndTimeRef.current = Date.now() + RESEND_SECONDS * 1000;
      setResendSecondsLeft(RESEND_SECONDS);
      setFailureReason(null);
      setAttemptsRemaining(null);
      transition('waiting');
    } catch (err) {
      if (err instanceof ConsentRateLimitError) {
        rateLimitEndsAtRef.current = Date.now() + err.retryAfterSeconds * 1000;
        setRateLimitSecondsLeft(err.retryAfterSeconds);
        transition('rate_limited');
      } else {
        Alert.alert('Error', 'Could not send SMS — please check your connection and try again.');
        setCanResend(true);
      }
    }
  }, [patientServerId, token, db, user]);

  // H-1: "Patient is ready" → State 3 directly (no State 2b in v1)
  const handlePatientReady = useCallback(() => {
    setDigits(Array(OTP_LENGTH).fill(''));
    setOtpErrorMsg(null);
    isSubmittingRef.current = false;
    transition('otp_input');
  }, []);

  // C-1: distribute paste or iOS SMS autofill across OTP boxes
  const handleDigitChange = useCallback((index: number, value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');

    if (cleaned.length > 1) {
      // Paste or iOS autofill — fill boxes starting from index
      setDigits(prev => {
        const next = [...prev];
        let lastFilled = index;
        for (let i = 0; i < cleaned.length && index + i < OTP_LENGTH; i++) {
          next[index + i] = cleaned[i];
          lastFilled = index + i;
        }
        // Focus next unfilled box (or last box if all filled)
        inputRefs.current[Math.min(lastFilled + 1, OTP_LENGTH - 1)]?.focus();
        return next;
      });
      setOtpErrorMsg(null);
      return;
    }

    const digit = cleaned.slice(-1);
    setDigits(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
    setOtpErrorMsg(null);
  }, []);

  const handleKeyPress = useCallback((index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  }, [digits]);

  // M-1: tap guard via isSubmittingRef (synchronous — no race window unlike useState)
  const handleConfirm = useCallback(async () => {
    const isComplete = digits.every(d => d !== '');

    if (!isComplete) {
      setOtpErrorMsg('Please enter all 6 digits.');
      return;
    }
    if (isSubmittingRef.current || !otpToken) return;

    isSubmittingRef.current = true;
    setOtpErrorMsg(null);
    transition('verifying');

    try {
      const result = await verifyConsent(otpToken, digits.join(''), token!);

      if (result.ok) {
        transition('success');
        setTimeout(() => navigation.goBack(), AUTO_RETURN_MS);
      } else if (result.reason === 'invalid_otp') {
        setFailureReason('invalid_otp');
        setAttemptsRemaining(result.attemptsRemaining);
        transition('failure');
      } else {
        // exhausted — 410
        setFailureReason('exhausted');
        setAttemptsRemaining(null);
        transition('failure');
      }
    } catch {
      setOtpErrorMsg('Connection error — please try again.');
      transition('otp_input');
    } finally {
      isSubmittingRef.current = false;
    }
  }, [digits, otpToken, token, navigation]);

  const handleSkip = useCallback(() => transition('patient_not_available'), []);

  // H-3: wrong number → go back to D3 without firing a new consent request
  const handleWrongNumber = useCallback(() => navigation.goBack(), [navigation]);

  // E-5: start visit from State 7 — consent_granted must be false
  const handleStartNewVisit = useCallback(() => {
    navigation.navigate('NewVisit', {
      patientId:       patientLocalId,
      patientServerId: patientServerId ?? null,
      patientName,
      patientMobile,
      consentGranted:  false,
    });
  }, [navigation, patientLocalId, patientServerId, patientName, patientMobile]);

  // ─────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────

  function formatMMSS(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─────────────────────────────────────────────────────────────
  // Sub-components — defined inside render for simplicity (no prop drilling)
  // ─────────────────────────────────────────────────────────────

  function DoctorHeader() {
    return (
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
          <Text style={styles.headerTitle} numberOfLines={1}>Request Consent</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>{patientName}</Text>
        </View>
      </View>
    );
  }

  function PatientCard() {
    return (
      <View style={styles.patientCard}>
        <View style={styles.patientAvatar}>
          <Text style={styles.patientAvatarInitial}>{patientName.charAt(0)}</Text>
        </View>
        <View style={styles.patientCardText}>
          <Text style={styles.patientCardName} numberOfLines={1}>{patientName}</Text>
          <Text style={styles.patientCardMobile}>{maskedMobile}</Text>
        </View>
      </View>
    );
  }

  // ─── State 1: Requesting ──────────────────────────────────────
  if (flowState === 'requesting') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <DoctorHeader />
        <View style={styles.centeredContent}>
          <PatientCard />
          {requestError ? (
            <View style={styles.errorBlock}>
              <Text style={styles.errorBlockText}>{requestError}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => void sendConsentRequest()}
                accessibilityLabel="Retry sending consent request"
                accessibilityRole="button"
              >
                <Text style={styles.retryButtonText}>Try Again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.spinnerBlock}>
              <ActivityIndicator size="large" color={Colors.primaryBlue} />
              <Text style={styles.spinnerLabel}>Sending consent request…</Text>
              <Text style={styles.spinnerSubLabel}>
                An SMS will be sent to the patient's registered number.
              </Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ─── State 2: Waiting ─────────────────────────────────────────
  if (flowState === 'waiting') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <DoctorHeader />
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <PatientCard />

          <View style={styles.waitingCard}>
            <View style={styles.waitingIconRow}>
              <View style={styles.smsIcon}>
                <Text style={styles.smsIconText}>✉</Text>
              </View>
              <View style={styles.waitingTextBlock}>
                <Text style={styles.waitingTitle}>SMS sent</Text>
                <Text style={styles.waitingBody}>
                  A 6-digit code has been sent to{' '}
                  <Text style={styles.maskedMobileText}>{maskedMobile}</Text>.
                  Ask your patient to check their phone.
                </Text>
                <TouchableOpacity
                  style={styles.wrongNumberRow}
                  onPress={handleWrongNumber}
                  accessibilityLabel="Wrong number — go back to edit patient"
                  accessibilityRole="button"
                >
                  <Text style={styles.wrongNumberText}>Wrong number? Go back to edit</Text>
                </TouchableOpacity>
              </View>
            </View>
            <Text style={styles.consentFramingText}>
              Unlocks full patient history — one-time setup for new patients.
            </Text>
          </View>

          <View style={styles.instructionCard}>
            <Text style={styles.instructionStep}>Step 1</Text>
            <Text style={styles.instructionText}>
              Ask your patient to enter the 6-digit code from their SMS message,
              then hand them the phone.
            </Text>
            <TouchableOpacity
              style={styles.handOffButton}
              onPress={handlePatientReady}
              accessibilityLabel="Patient is ready — show OTP entry screen"
              accessibilityRole="button"
            >
              <Text style={styles.handOffButtonText}>
                Patient is ready — show them the entry screen
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.resendRow}>
            {canResend ? (
              <TouchableOpacity
                style={styles.resendButton}
                onPress={() => void handleResend()}
                accessibilityLabel="Resend SMS"
                accessibilityRole="button"
              >
                <Text style={styles.resendButtonText}>Resend SMS</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.resendCountdown}>
                Resend available in {resendSecondsLeft}s
              </Text>
            )}
          </View>

          <View style={styles.divider} />

          <TouchableOpacity
            style={styles.skipRow}
            onPress={handleSkip}
            accessibilityLabel="Patient not available — skip consent for now"
            accessibilityRole="button"
          >
            <Text style={styles.skipText}>Patient not available right now?</Text>
            <Text style={styles.skipLink}>Skip — start visit without history</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ─── State 3: OTP Input (PATIENT-FACING) ─────────────────────
  if (flowState === 'otp_input') {
    const isComplete    = digits.every(d => d !== '');
    const expiryMinutes = Math.ceil(otpSecondsLeft / 60);
    const expiryExpired = otpSecondsLeft === 0;

    return (
      <KeyboardAvoidingView
        style={styles.patientSafeArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <SafeAreaView style={styles.patientSafeArea}>
          {/*
            PATIENT-FACING: zero doctor name, patient name, or clinic visible.
            Safe to hand to a low-literacy patient for 10 seconds.
          */}
          <View style={styles.patientContent}>
            <Text style={styles.patientBrandName}>MedRecord</Text>

            <Text style={styles.patientInstruction}>Enter your 6-digit code</Text>
            <Text style={styles.patientInstructionHindi}>
              अपना 6-अंकों का कोड डालें
            </Text>
            <Text style={styles.patientHint}>Check the SMS from MedRecord on your phone</Text>
            <Text style={styles.patientHintHindi}>
              MedRecord के SMS से कोड देखें
            </Text>

            {/* OTP boxes */}
            <View style={styles.otpRow} accessibilityLabel="6-digit code entry">
              {digits.map((digit, i) => (
                <TextInput
                  key={i}
                  ref={ref => { inputRefs.current[i] = ref; }}
                  style={[
                    styles.otpBox,
                    digit    ? styles.otpBoxFilled : null,
                    otpErrorMsg ? styles.otpBoxError : null,
                  ]}
                  value={digit}
                  onChangeText={val => handleDigitChange(i, val)}
                  onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}   // allow paste of full code into first box (C-1)
                  textContentType="oneTimeCode"
                  returnKeyType="done"
                  accessibilityLabel={`Digit ${i + 1} of 6`}
                />
              ))}
            </View>

            {otpErrorMsg && (
              <Text style={styles.patientErrorText}>{otpErrorMsg}</Text>
            )}

            {/* M-2: OTP expiry hint */}
            <Text style={[styles.otpExpiryText, expiryExpired && styles.otpExpiryExpired]}>
              {expiryExpired
                ? 'Code expired — ask your doctor to resend'
                : `Code expires in ${formatMMSS(otpSecondsLeft)}`
              }
            </Text>

            <TouchableOpacity
              style={[
                styles.patientConfirmButton,
                !isComplete && styles.patientConfirmButtonDisabled,
              ]}
              onPress={() => void handleConfirm()}
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

            <Text style={styles.patientNoSmsText}>
              Didn't receive a code? Ask your doctor to resend.
            </Text>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    );
  }

  // ─── State 4: Verifying ───────────────────────────────────────
  if (flowState === 'verifying') {
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

  // ─── State 5: Success ─────────────────────────────────────────
  if (flowState === 'success') {
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
          {/* H-4: per consent-layer-spec §Flow 4 — patients revoke via Patient app (P4), not clinic */}
          <Text style={styles.successFootnote}>
            To manage or remove access later, use the MedRecord app.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── State 6: Failure ─────────────────────────────────────────
  if (flowState === 'failure') {
    // M-3: distinct messaging for 400 (wrong OTP) vs 410 (exhausted/expired)
    const isWrongOtp = failureReason === 'invalid_otp';
    const failureTitle = isWrongOtp ? 'Incorrect code' : 'Code expired or used up';
    const failureBody = isWrongOtp
      ? `Your patient has ${attemptsRemaining ?? 0} attempt(s) remaining — ask them to re-check the SMS from MedRecord.`
      : 'The code can no longer be used. Tap below to send a new code to your patient.';

    return (
      <SafeAreaView style={styles.safeArea}>
        <DoctorHeader />
        <View style={styles.centeredContent}>
          <PatientCard />

          <View style={styles.failureCard}>
            <View style={styles.failureIconCircle}>
              <Text style={styles.failureIcon}>✕</Text>
            </View>
            <Text style={styles.failureTitle}>{failureTitle}</Text>
            <Text style={styles.failureBody}>{failureBody}</Text>
          </View>

          {isWrongOtp && attemptsRemaining != null && attemptsRemaining > 0 ? (
            <>
              <TouchableOpacity
                style={styles.retryOtpButton}
                onPress={handlePatientReady}
                accessibilityLabel="Let patient try again"
                accessibilityRole="button"
              >
                <Text style={styles.retryOtpButtonText}>Let patient try again</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.resendOutlineButton}
                onPress={() => void handleResend()}
                accessibilityLabel="Send a new code"
                accessibilityRole="button"
              >
                <Text style={styles.resendOutlineButtonText}>Send a new code instead</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.retryOtpButton}
              onPress={() => void handleResend()}
              accessibilityLabel="Resend and try again"
              accessibilityRole="button"
            >
              <Text style={styles.retryOtpButtonText}>Resend and try again</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.skipRowCenter}
            onPress={handleSkip}
            accessibilityLabel="Skip consent — start visit without history"
            accessibilityRole="button"
          >
            <Text style={styles.skipLink}>Skip — start visit without record history</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── State 7: Patient Not Available ──────────────────────────
  if (flowState === 'patient_not_available') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <DoctorHeader />
        <View style={styles.centeredContent}>
          <PatientCard />

          <View style={styles.fallbackCard}>
            <Text style={styles.fallbackTitle}>No problem</Text>
            <Text style={styles.fallbackBody}>
              You can still create a new visit for this patient. You won't see
              records from other doctors until they grant access.
            </Text>
            <View style={styles.fallbackDivider} />
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

          {/* E-5: navigate to D6 with consentGranted: false */}
          <TouchableOpacity
            style={styles.newVisitButton}
            onPress={handleStartNewVisit}
            accessibilityLabel="Start a new visit without history"
            accessibilityRole="button"
          >
            <Text style={styles.newVisitButtonText}>Start New Visit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.goBackRow}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back to patient detail"
            accessibilityRole="button"
          >
            <Text style={styles.goBackText}>← Back to Patient</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ─── State 8: Rate Limited (H-2) ─────────────────────────────
  // flowState === 'rate_limited'
  const rateLimitMinutes = Math.ceil(rateLimitSecondsLeft / 60);

  return (
    <SafeAreaView style={styles.safeArea}>
      <DoctorHeader />
      <View style={styles.centeredContent}>
        <PatientCard />

        <View style={styles.rateLimitCard}>
          <Text style={styles.rateLimitTitle}>Too many requests</Text>
          <Text style={styles.rateLimitBody}>
            You have sent too many consent requests for this patient. Please
            wait{' '}
            <Text style={styles.rateLimitHighlight}>
              {rateLimitSecondsLeft > 0
                ? `${rateLimitMinutes} minute${rateLimitMinutes === 1 ? '' : 's'}`
                : 'a moment'}
            </Text>{' '}
            before requesting a new code.
          </Text>
          {rateLimitSecondsLeft > 0 && (
            <Text style={styles.rateLimitCountdown}>
              {formatMMSS(rateLimitSecondsLeft)}
            </Text>
          )}
        </View>

        {rateLimitSecondsLeft === 0 && (
          <TouchableOpacity
            style={styles.retryOtpButton}
            onPress={() => void sendConsentRequest()}
            accessibilityLabel="Try sending consent request again"
            accessibilityRole="button"
          >
            <Text style={styles.retryOtpButtonText}>Try Again</Text>
          </TouchableOpacity>
        )}

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.skipRow}
          onPress={handleSkip}
          accessibilityLabel="Patient not available — skip consent for now"
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Patient not available right now?</Text>
          <Text style={styles.skipLink}>Skip — start visit without history</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  // ── Shared layout ─────────────────────────────────────────────────────────

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

  // ── Header ────────────────────────────────────────────────────────────────

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
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrow: {
    fontSize: 28,
    color: Colors.surface,
    lineHeight: 32,
  },
  headerTextGroup: { flex: 1 },
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

  // ── Patient card ──────────────────────────────────────────────────────────

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
  patientCardText: { flex: 1 },
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

  // ── State 1: Requesting ───────────────────────────────────────────────────

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
  errorBlock: {
    backgroundColor: Colors.errorLight,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 16,
  },
  errorBlockText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── State 2: Waiting ──────────────────────────────────────────────────────

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
  smsIconText: { fontSize: 20 },
  waitingTextBlock: { flex: 1 },
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
  maskedMobileText: {
    fontWeight: '600',
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  wrongNumberRow: { marginTop: 8 },
  wrongNumberText: {
    fontSize: 13,
    color: Colors.primaryBlue,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  consentFramingText: {
    fontSize: 13,
    color: Colors.primaryBlue,
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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

  // ── State 3: OTP Input (PATIENT-FACING) ───────────────────────────────────

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
    marginBottom: 6,
  },
  patientInstructionHindi: {
    fontSize: 20,
    fontWeight: '600',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 18,
  },
  patientHint: {
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },
  patientHintHindi: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 36,
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 16,
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
    marginBottom: 8,
  },
  otpExpiryText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  otpExpiryExpired: {
    color: Colors.error,
    fontWeight: '500',
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

  // ── State 4: Verifying ────────────────────────────────────────────────────

  verifyingBlock: {
    alignItems: 'center',
    gap: 20,
  },
  verifyingLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
  },

  // ── State 5: Success ──────────────────────────────────────────────────────

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

  // ── State 6: Failure ──────────────────────────────────────────────────────

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
  retryOtpButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    width: '100%',
  },
  retryOtpButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.surface,
  },
  resendOutlineButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: Colors.primaryBlue,
  },
  resendOutlineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primaryBlue,
  },
  skipRowCenter: {
    paddingVertical: 12,
    alignItems: 'center',
  },

  // ── State 7: Patient Not Available ────────────────────────────────────────

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

  // ── State 8: Rate Limited ─────────────────────────────────────────────────

  rateLimitCard: {
    backgroundColor: Colors.warningLight,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 10,
  },
  rateLimitTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.warning,
    textAlign: 'center',
  },
  rateLimitBody: {
    fontSize: 14,
    color: Colors.textPrimary,
    textAlign: 'center',
    lineHeight: 22,
  },
  rateLimitHighlight: {
    fontWeight: '700',
    color: Colors.warning,
  },
  rateLimitCountdown: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.warning,
    textAlign: 'center',
    letterSpacing: 2,
  },
});

