/**
 * PatientLoginScreen.tsx — P1: Phone + OTP Authentication (Patient)
 *
 * Spec:    docs/ui-ux-spec.md § P1 ("Same as D1 but subtitle: 'For Patients'")
 * PM:      reviews/P1-P5-pm-review.md
 *
 * MOCKUP — all API calls are mocked (no real network requests yet).
 *
 * Wire step will:
 *   1. Replace mockSendOtp / mockVerifyOtp with real sendOtp / verifyOtp
 *      from api/auth.ts (same backend endpoints — POST /auth/send-otp,
 *      POST /auth/verify-otp — once backend issues patient JWTs).
 *   2. Handle patient JWT shape: { id, role: 'patient', name, mobile_number }
 *      Note: no clinic_id — patient user differs from doctor user.
 *   3. Set up patient auth state (extend useAuthStore with role branching,
 *      or create a separate usePatientAuthStore).
 *   4. Write refresh_token to expo-secure-store (same REFRESH_TOKEN_KEY key
 *      or a separate PATIENT_REFRESH_TOKEN_KEY — decide at wire step).
 *   5. Document patient JWT response in api-contracts.md (Step 5b requirement).
 *
 * Patient JWT shape expected from backend (document in api-contracts.md at wire):
 *   POST /auth/verify-otp → {
 *     access_token:  string,
 *     refresh_token: string,
 *     user: {
 *       id:            string,        // server patient_id (UUID)
 *       role:          'patient',
 *       name:          string | null, // from patients table; null if not registered
 *       mobile_number: string,        // 10-digit Indian mobile number
 *     }
 *   }
 *
 * Design note (PM review 2026-05-16):
 *   Primary user is a 25-40 year old family member managing records on behalf
 *   of the patient — not the elderly patient navigating directly. Design for
 *   moderate tech literacy, not beginner.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import NetInfo from '@react-native-community/netinfo';

import { Colors, Spacing } from '../../constants/theme';
import type { RootStackParamList } from '../../../App';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase    = 'phone_entry' | 'loading' | 'otp_entry';
type OtpError = null | 'wrong_otp' | 'otp_expired' | 'too_many_attempts' | 'no_connection';
type SendError = null | 'send_failed' | 'rate_limited' | 'no_connection';

// ─── Mock auth (replace with real api/auth.ts calls at wire step) ─────────────

async function mockSendOtp(
  _phone: string,
): Promise<{ otp_token: string }> {
  await new Promise<void>((r) => setTimeout(r, 800));
  return { otp_token: `mock_otp_token_${Date.now()}` };
}

async function mockVerifyOtp(
  _otpToken: string,
  otp: string,
): Promise<{ access_token: string; refresh_token: string; user: MockPatientUser }> {
  await new Promise<void>((r) => setTimeout(r, 600));
  // Demo error triggers for Persona Critic review (same bypass as D1):
  //   '111111' → wrong OTP
  //   '222222' → OTP expired
  //   '333333' → too many attempts
  //   '000000' → success (mirrors TEST_OTP_BYPASS)
  if (otp === '111111') throw { code: 'WRONG_OTP',          status: 400 };
  if (otp === '222222') throw { code: 'OTP_EXPIRED',        status: 400 };
  if (otp === '333333') throw { code: 'TOO_MANY_ATTEMPTS',  status: 400 };
  return {
    access_token:  'mock_patient_access_token',
    refresh_token: 'mock_patient_refresh_token',
    user: {
      id:            'mock-patient-id-001',
      role:          'patient',
      name:          'Priya Sharma',
      mobile_number: '8884556234',
    },
  };
}

interface MockPatientUser {
  id:            string;
  role:          'patient';
  name:          string | null;
  mobile_number: string;
}

interface MockError {
  code:   string;
  status: number;
}

function isMockError(err: unknown): err is MockError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    'status' in err
  );
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESEND_SECONDS = 45;

const SEND_ERROR_MESSAGES: Record<NonNullable<SendError>, string> = {
  no_connection: 'No internet connection. Please check and retry.',
  rate_limited:  'Too many OTP requests. Please wait before trying again.',
  send_failed:   'Couldn\'t send OTP. Please check your connection and try again.',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatientLoginScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [phase,         setPhase]         = useState<Phase>('phone_entry');
  const [otpError,      setOtpError]      = useState<OtpError>(null);
  const [sendError,     setSendError]     = useState<SendError>(null);
  const [phone,         setPhone]         = useState('');
  const [otp,           setOtp]           = useState('');
  const [otpToken,      setOtpToken]      = useState<string | null>(null);
  const [otpSentBanner, setOtpSentBanner] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(RESEND_SECONDS);
  const [canResend,     setCanResend]     = useState(false);
  const [phoneError,    setPhoneError]    = useState<string | null>(null);
  const [resendError,   setResendError]   = useState<SendError>(null);

  const phoneInputRef   = useRef<TextInput>(null);
  const otpInputRef     = useRef<TextInput>(null);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownEndRef = useRef<number>(0);
  const isVerifyingRef  = useRef(false);
  const isSendingRef    = useRef(false);

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formattedPhone = phone.length > 5
    ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
    : `+91 ${phone}`;

  // ── Resend countdown ───────────────────────────────────────────────────────

  const startResendCountdown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    countdownEndRef.current = Date.now() + RESEND_SECONDS * 1000;
    setResendSeconds(RESEND_SECONDS);
    setCanResend(false);
    timerRef.current = setInterval(() => {
      const remaining = Math.ceil((countdownEndRef.current - Date.now()) / 1000);
      if (remaining <= 0) {
        clearInterval(timerRef.current!);
        setResendSeconds(0);
        setCanResend(true);
      } else {
        setResendSeconds(remaining);
      }
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Send OTP ───────────────────────────────────────────────────────────────

  async function handleSendOtp(isResend = false) {
    const firstDigit = parseInt(phone[0], 10);
    if (phone.length !== 10 || firstDigit < 6) return;

    if (isSendingRef.current) return;
    isSendingRef.current = true;

    const netState = await NetInfo.fetch();
    if (netState.isConnected === false && netState.isInternetReachable === false) {
      isSendingRef.current = false;
      if (isResend) {
        setResendError('no_connection');
      } else {
        setSendError('no_connection');
      }
      return;
    }

    setPhase('loading');
    setOtpError(null);
    if (isResend) {
      setResendError(null);
    } else {
      setSendError(null);
    }

    try {
      const { otp_token } = await mockSendOtp(phone);
      setOtpToken(otp_token);
      setOtp('');
      setOtpSentBanner(true);
      setResendError(null);
      isSendingRef.current = false;
      setPhase('otp_entry');
      startResendCountdown();
      setTimeout(() => otpInputRef.current?.focus(), 300);
    } catch {
      isSendingRef.current = false;
      const errorType: SendError = 'send_failed';
      if (isResend) {
        setPhase('otp_entry');
        setResendError(errorType);
      } else {
        setPhase('phone_entry');
        setSendError(errorType);
      }
    }
  }

  // ── Verify OTP ─────────────────────────────────────────────────────────────

  async function handleVerifyOtp() {
    if (otp.length !== 6 || !otpToken) return;
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setPhase('loading');
    setOtpError(null);

    try {
      await mockVerifyOtp(otpToken, otp);
      if (timerRef.current) clearInterval(timerRef.current);

      // TODO (wire step): store patient refresh_token in expo-secure-store,
      //   set patient auth state, then navigate to PatientTimeline.
      navigation.replace('PatientTimeline');
      // Note: no isVerifyingRef reset on success — screen unmounts
    } catch (err: unknown) {
      isVerifyingRef.current = false;
      const code = isMockError(err) ? err.code : null;

      if (code === null) {
        setOtpError('no_connection');
      } else if (code === 'TOO_MANY_ATTEMPTS') {
        setOtpError('too_many_attempts');
        setOtp('');
        setCanResend(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (code === 'OTP_EXPIRED') {
        setOtpError('otp_expired');
        setCanResend(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setOtpError('wrong_otp');
      }
      setPhase('otp_entry');
    }
  }

  // Auto-submit on 6th digit
  useEffect(() => {
    if (otp.length === 6 && phase === 'otp_entry' && otpError === null) {
      handleVerifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // ── Demo helpers ───────────────────────────────────────────────────────────

  function demoShowOtpEntry(error: OtpError = null) {
    setPhone('8884556234');
    setOtp(error ? '111111' : '');
    setOtpToken('mock_otp_token_demo');
    setOtpSentBanner(false);
    setOtpError(error);
    setPhase('otp_entry');
    if (!error) startResendCountdown();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Logo ──────────────────────────────────────────────────── */}
          <View style={styles.logoBlock}>
            <Text style={styles.logoText} accessibilityRole="header">
              MedRecord
            </Text>
            <Text style={styles.subtitleText}>For Patients</Text>
          </View>

          {/* ── OTP sent banner ────────────────────────────────────────── */}
          {otpSentBanner && (
            <View style={styles.otpSentBanner} accessibilityLiveRegion="polite">
              <Text style={styles.otpSentBannerText}>
                OTP sent to {formattedPhone}
              </Text>
            </View>
          )}

          {/* ── Phone entry ────────────────────────────────────────────── */}
          {phase === 'phone_entry' && (
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Mobile Number</Text>
              <Text style={styles.inputHint}>
                We'll send a 6-digit code to this number.
              </Text>

              {sendError !== null && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    {SEND_ERROR_MESSAGES[sendError]}
                  </Text>
                </View>
              )}

              <View style={styles.phoneRow}>
                <View style={styles.countryCodeBox}>
                  <Text style={styles.countryCodeText}>+91</Text>
                </View>
                <TextInput
                  ref={phoneInputRef}
                  style={styles.phoneInput}
                  value={phone}
                  onChangeText={(t) => {
                    const digits = t.replace(/\D/g, '').slice(0, 10);
                    if (digits.length === 1 && parseInt(digits[0], 10) < 6) {
                      setPhoneError('Mobile numbers start with 6–9');
                      return;
                    }
                    setPhoneError(null);
                    setPhone(digits);
                    if (sendError !== null) setSendError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="88845 56234"
                  placeholderTextColor={Colors.textDisabled}
                  accessibilityLabel="Mobile number"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => handleSendOtp(false)}
                />
              </View>

              {phoneError !== null && (
                <Text style={styles.phoneErrorText} accessibilityLiveRegion="polite">
                  {phoneError}
                </Text>
              )}

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  phone.length < 10 && styles.primaryBtnDisabled,
                ]}
                onPress={() => handleSendOtp(false)}
                disabled={phone.length < 10}
                accessibilityLabel="Send OTP"
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Send OTP</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── OTP entry ──────────────────────────────────────────────── */}
          {phase === 'otp_entry' && (
            <View style={styles.card}>
              <Text style={styles.inputLabel}>
                Enter OTP sent to {formattedPhone}
              </Text>

              {otpError === 'no_connection' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    No internet connection. Please check and retry.
                  </Text>
                </View>
              )}
              {otpError === 'wrong_otp' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    Incorrect OTP. Please check and try again.
                  </Text>
                </View>
              )}
              {otpError === 'otp_expired' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    OTP has expired. Please request a new one.
                  </Text>
                </View>
              )}
              {otpError === 'too_many_attempts' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    Too many attempts. Please request a new OTP.
                  </Text>
                </View>
              )}
              {resendError !== null && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    {SEND_ERROR_MESSAGES[resendError]}
                  </Text>
                </View>
              )}

              <TextInput
                ref={otpInputRef}
                style={[
                  styles.otpInput,
                  otpError !== null && styles.otpInputError,
                ]}
                value={otp}
                onChangeText={(t) => {
                  const digits = t.replace(/\D/g, '').slice(0, 6);
                  setOtp(digits);
                  if (otpSentBanner) setOtpSentBanner(false);
                  if (otpError !== null) setOtpError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="• • • • • •"
                placeholderTextColor={Colors.textDisabled}
                accessibilityLabel="One-time password"
                textContentType="oneTimeCode"
                autoFocus
              />

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  otp.length < 6 && styles.primaryBtnDisabled,
                ]}
                onPress={handleVerifyOtp}
                disabled={otp.length < 6}
                accessibilityLabel="Verify OTP"
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Verify OTP</Text>
              </TouchableOpacity>

              <View style={styles.resendBlock}>
                {canResend ? (
                  <TouchableOpacity
                    onPress={() => handleSendOtp(true)}
                    accessibilityLabel="Resend OTP"
                    accessibilityRole="button"
                  >
                    <Text style={styles.resendLink}>Resend OTP</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.resendCountdown}>
                    Resend in {resendSeconds}s
                  </Text>
                )}
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (timerRef.current) clearInterval(timerRef.current);
                  setOtp('');
                  setOtpError(null);
                  setResendError(null);
                  setOtpSentBanner(false);
                  setPhase('phone_entry');
                }}
                accessibilityLabel="Change mobile number"
                accessibilityRole="button"
                style={styles.changeNumberBtn}
              >
                <Text style={styles.changeNumberLink}>Change number</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Loading ────────────────────────────────────────────────── */}
          {phase === 'loading' && (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={Colors.primaryBlue} />
              <Text style={styles.loadingText}>Please wait…</Text>
            </View>
          )}

          {/* ── Demo state switcher ────────────────────────────────────── */}
          {__DEV__ && (
            <View style={styles.demoBlock}>
              <Text style={styles.demoTitle}>Demo states — mockup only</Text>
              <Text style={styles.demoHint}>
                Mock auth — does not call the real API.
                Enter any 6-digit code to verify. Use 000000 for success,
                111111 for wrong OTP, 222222 for expired, 333333 for too many attempts.
              </Text>
              <View style={styles.demoRow}>
                {(
                  [
                    ['Phone',     () => { setPhase('phone_entry'); setPhone(''); setOtp(''); setOtpError(null); }],
                    ['Sending',   () => { setPhone('8884556234'); setPhase('loading'); }],
                    ['OTP',       () => demoShowOtpEntry(null)],
                    ['Verifying', () => { demoShowOtpEntry(null); setTimeout(() => setPhase('loading'), 50); }],
                    ['Wrong',     () => demoShowOtpEntry('wrong_otp')],
                    ['Expired',   () => demoShowOtpEntry('otp_expired')],
                    ['TooMany',   () => demoShowOtpEntry('too_many_attempts')],
                  ] as [string, () => void][]
                ).map(([label, action]) => (
                  <TouchableOpacity
                    key={label}
                    style={styles.demoBtn}
                    onPress={action}
                    accessibilityLabel={`Demo state: ${label}`}
                  >
                    <Text style={styles.demoBtnText}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xxl,
    paddingBottom: 48,
    justifyContent: 'center',
  },

  logoBlock: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: Spacing.xl,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '700',
    color: Colors.primaryBlue,
    letterSpacing: -0.5,
  },
  subtitleText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 6,
  },

  otpSentBanner: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  otpSentBannerText: {
    color: '#166534',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.xxl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  inputHint: {
    fontSize: 14,
    color: Colors.textDisabled,
    marginBottom: Spacing.md,
    lineHeight: 20,
  },

  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: Spacing.xl,
  },
  countryCodeBox: {
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    borderRightWidth: 1.5,
    borderRightColor: Colors.border,
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  phoneInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: '500',
    color: Colors.textPrimary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 16,
    letterSpacing: 1,
  },

  otpInput: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: 12,
    fontSize: 30,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    paddingVertical: 16,
    letterSpacing: 14,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  otpInputError: {
    borderColor: Colors.error,
    backgroundColor: '#FEF2F2',
  },

  primaryBtn: {
    backgroundColor: Colors.primaryBlue,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  primaryBtnDisabled: {
    backgroundColor: Colors.textDisabled,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  errorText: {
    color: Colors.error,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },

  phoneErrorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: -Spacing.md,
    marginBottom: Spacing.sm,
    marginLeft: 4,
  },

  resendBlock: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  resendCountdown: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  resendLink: {
    fontSize: 14,
    color: Colors.primaryBlue,
    fontWeight: '600',
  },

  changeNumberBtn: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    paddingVertical: Spacing.xs,
  },
  changeNumberLink: {
    fontSize: 13,
    color: Colors.textSecondary,
    textDecorationLine: 'underline',
  },

  loadingBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    gap: Spacing.lg,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },

  demoBlock: {
    marginTop: 40,
    padding: Spacing.lg,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  demoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#92400E',
    textAlign: 'center',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  demoHint: {
    fontSize: 11,
    color: '#92400E',
    textAlign: 'center',
    marginBottom: Spacing.sm,
    fontStyle: 'italic',
  },
  demoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  demoBtn: {
    backgroundColor: '#D97706',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  demoBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
