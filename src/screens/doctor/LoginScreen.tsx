/**
 * LoginScreen.tsx — D1 / P1: Phone + OTP Authentication
 *
 * Spec:   docs/ui-ux-spec.md § D1 (Doctor) / P1 (Patient)
 * PM:     reviews/D1-pm-preflow.md
 *
 * Static mockup — no real API calls. All network calls are mocked with
 * simulated delays. Wire up src/api/auth.ts when the backend is ready.
 *
 * States modelled:
 *   phone_entry   — Enter mobile number + Send OTP
 *   loading       — API call in flight (send OTP or verify OTP)
 *   otp_entry     — Enter 6-digit OTP (includes "OTP sent" banner on arrival)
 *                   + error_wrong_otp variant
 *                   + error_otp_expired variant
 *
 * PM-required items:
 *   ✅ WhatsApp fallback link (below 45s resend countdown)
 *   ✅ subtitle prop — default "For Doctors & Clinics"; pass "For Patients" for P1
 *   ✅ Distinct wrong-OTP vs expired-OTP error messages
 *   ✅ "OTP sent to +91 XXXXX XXXXX" confirmation banner
 *   TODO (Android SMS autofill): Android SMS Retriever API auto-populates OTP.
 *        No Expo managed-workflow module exists as of 2026-03.
 *        Options: (a) eject to bare workflow + react-native-otp-verify,
 *        (b) wait for an expo-modules-core community module,
 *        (c) ship without it (iOS QuickType covers iOS; Android users type manually).
 *        iOS OTP autofill is handled natively via textContentType="oneTimeCode" — no code needed.
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

import { Colors, Spacing } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import type { RootStackParamList } from '../../../App';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase    = 'phone_entry' | 'loading' | 'otp_entry';
type OtpError = null | 'wrong_otp' | 'otp_expired';
type SendError = null | 'send_failed';
type OtpChannel = 'sms' | 'whatsapp';

interface LoginScreenProps {
  /** Subtitle below the MedRecord logo. Pass "For Patients" for P1 reuse. */
  subtitle?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RESEND_SECONDS = 45;

// ─── Mock API ────────────────────────────────────────────────────────────────
// Replace with real calls to src/api/auth.ts when the backend is ready.
// mockVerifyOtp contract:
//   OTP "000000" → simulates OTP_EXPIRED error
//   OTP "999999" → simulates WRONG_OTP error
//   Any other 6-digit OTP → simulates success

function mockSendOtp(_mobile: string, _channel: OtpChannel): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1100));
}

interface MockVerifySuccess {
  token: string;
  user: {
    id: string;
    role: 'doctor';
    name: string;
    clinic_id: string;
    clinic_name: string;
  };
}

function mockVerifyOtp(_mobile: string, otp: string): Promise<MockVerifySuccess> {
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      if (otp === '000000') {
        reject({ code: 'OTP_EXPIRED' });
      } else if (otp === '999999') {
        reject({ code: 'WRONG_OTP' });
      } else {
        resolve({
          token: 'mock-jwt-eyJhbGciOiJIUzI1NiJ9.mockpayload',
          user: {
            id:          'doctor-001',
            role:        'doctor',
            name:        'Dr. Priya Nair',
            clinic_id:   'clinic-mum-001',
            clinic_name: 'Nair Multispeciality Clinic',
          },
        });
      }
    }, 1000),
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LoginScreen({
  subtitle = 'For Doctors & Clinics',
}: LoginScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setAuth    = useAuthStore((s) => s.setAuth);

  const [phase,          setPhase]          = useState<Phase>('phone_entry');
  const [otpError,       setOtpError]       = useState<OtpError>(null);
  const [sendError,      setSendError]      = useState<SendError>(null);
  const [phone,          setPhone]          = useState('');
  const [otp,            setOtp]            = useState('');
  const [otpSentBanner,  setOtpSentBanner]  = useState(false);
  const [resendSeconds,  setResendSeconds]  = useState(RESEND_SECONDS);
  const [canResend,      setCanResend]      = useState(false);

  const phoneInputRef = useRef<TextInput>(null);
  const otpInputRef   = useRef<TextInput>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** "+91 98765 43210" display format from 10-digit raw string */
  const formattedPhone = phone.length > 5
    ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`
    : `+91 ${phone}`;

  // ── Resend countdown ─────────────────────────────────────────────────────

  const startResendCountdown = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setResendSeconds(RESEND_SECONDS);
    setCanResend(false);
    timerRef.current = setInterval(() => {
      setResendSeconds((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          setCanResend(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // ── Send OTP ─────────────────────────────────────────────────────────────

  async function handleSendOtp(channel: OtpChannel = 'sms') {
    if (phone.length !== 10) return;
    setPhase('loading');
    setOtpError(null);
    setSendError(null);
    try {
      await mockSendOtp(phone, channel);
      setOtp('');
      setOtpSentBanner(true);
      setPhase('otp_entry');
      startResendCountdown();
      // Banner stays visible until the user types their first OTP digit (MF-2)
      setTimeout(() => otpInputRef.current?.focus(), 300);
    } catch {
      // MF-1: surface the failure instead of silently resetting
      setPhase('phone_entry');
      setSendError('send_failed');
    }
  }

  // ── Verify OTP ───────────────────────────────────────────────────────────

  async function handleVerifyOtp() {
    if (otp.length !== 6) return;
    setPhase('loading');
    setOtpError(null);
    try {
      const { token, user } = await mockVerifyOtp(phone, otp);
      if (timerRef.current) clearInterval(timerRef.current);
      setAuth(token, user);
      navigation.replace('PatientSearch');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'OTP_EXPIRED') {
        setOtpError('otp_expired');
        // MF-3: bypass remaining countdown — user is told to request a new OTP
        // and must be able to act immediately
        setCanResend(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else {
        setOtpError('wrong_otp');
      }
      setPhase('otp_entry');
    }
  }

  // Auto-submit when 6th digit is entered
  useEffect(() => {
    if (otp.length === 6 && phase === 'otp_entry' && otpError === null) {
      handleVerifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  // ── Demo state helpers (REMOVE BEFORE LAUNCH) ────────────────────────────

  function demoShowOtpEntry(error: OtpError = null) {
    setPhone('9876543210');
    setOtp(error ? '123456' : '');
    setOtpSentBanner(false);
    setOtpError(error);
    setPhase('otp_entry');
    if (!error) startResendCountdown();
  }

  // ── Render ───────────────────────────────────────────────────────────────

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

          {/* ── Logo ─────────────────────────────────────────────────── */}
          <View style={styles.logoBlock}>
            <Text style={styles.logoText} accessibilityRole="header">
              MedRecord
            </Text>
            <Text style={styles.subtitleText}>{subtitle}</Text>
          </View>

          {/* ── OTP sent confirmation banner ─────────────────────────── */}
          {otpSentBanner && (
            <View style={styles.otpSentBanner} accessibilityLiveRegion="polite">
              <Text style={styles.otpSentBannerText}>
                OTP sent to {formattedPhone}
              </Text>
            </View>
          )}

          {/* ── Phone entry ──────────────────────────────────────────── */}
          {phase === 'phone_entry' && (
            <View style={styles.card}>
              <Text style={styles.inputLabel}>Mobile Number</Text>

              {/* SF-1: guidance for first-time and elderly users */}
              <Text style={styles.inputHint}>
                We'll send a 6-digit code to this number.
              </Text>

              {/* MF-1: OTP send failure error */}
              {sendError === 'send_failed' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    Couldn't send OTP. Please check your connection and try again.
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
                    setPhone(t.replace(/\D/g, '').slice(0, 10));
                    if (sendError !== null) setSendError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={10}
                  placeholder="98765 43210"
                  placeholderTextColor={Colors.textDisabled}
                  accessibilityLabel="Mobile number"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => handleSendOtp('sms')}
                  // TODO (Android SMS autofill): phone number hint not available
                  // in Expo managed workflow. See file header for options.
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  phone.length < 10 && styles.primaryBtnDisabled,
                ]}
                onPress={() => handleSendOtp('sms')}
                disabled={phone.length < 10}
                accessibilityLabel="Send OTP"
                accessibilityRole="button"
              >
                <Text style={styles.primaryBtnText}>Send OTP</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── OTP entry ────────────────────────────────────────────── */}
          {phase === 'otp_entry' && (
            <View style={styles.card}>
              <Text style={styles.inputLabel}>
                Enter OTP sent to {formattedPhone}
              </Text>

              {/* Error: wrong OTP */}
              {otpError === 'wrong_otp' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    Incorrect OTP. Please check and try again.
                  </Text>
                </View>
              )}

              {/* Error: OTP expired */}
              {otpError === 'otp_expired' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    OTP has expired. Please request a new one.
                  </Text>
                </View>
              )}

              {/* 6-digit OTP input */}
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
                  // MF-2: dismiss the "OTP sent" banner on first keystroke
                  if (otpSentBanner) setOtpSentBanner(false);
                  // Clear error state as soon as the user starts re-typing
                  if (otpError !== null) setOtpError(null);
                }}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="• • • • • •"
                placeholderTextColor={Colors.textDisabled}
                accessibilityLabel="One-time password"
                // iOS: QuickType bar auto-suggests OTP from SMS — no code needed
                textContentType="oneTimeCode"
                autoFocus
                // TODO (Android SMS autofill): SMS Retriever API not available
                // in Expo managed workflow (2026-03). See file header for options.
              />

              {/* Verify button */}
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

              {/* Resend countdown + WhatsApp fallback */}
              <View style={styles.resendBlock}>
                {canResend ? (
                  <TouchableOpacity
                    onPress={() => handleSendOtp('sms')}
                    accessibilityLabel="Resend OTP via SMS"
                    accessibilityRole="button"
                  >
                    <Text style={styles.resendLink}>Resend OTP</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.resendCountdown}>
                    Resend in {resendSeconds}s
                  </Text>
                )}

                {/* WhatsApp fallback — required per PM review (D1-pm-preflow.md)
                    Triggers POST /auth/send-otp?channel=whatsapp on the backend.
                    Shown below resend countdown as a secondary action. */}
                <TouchableOpacity
                  onPress={() => handleSendOtp('whatsapp')}
                  accessibilityLabel="Didn't receive SMS? Try WhatsApp"
                  accessibilityRole="button"
                  style={styles.whatsappBtn}
                >
                  <Text style={styles.whatsappLink}>
                    Didn't receive SMS? Try WhatsApp
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Change number link */}
              <TouchableOpacity
                onPress={() => {
                  if (timerRef.current) clearInterval(timerRef.current);
                  setOtp('');
                  setOtpError(null);
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

          {/* ── Loading ──────────────────────────────────────────────── */}
          {phase === 'loading' && (
            <View style={styles.loadingBlock}>
              <ActivityIndicator size="large" color={Colors.primaryBlue} />
              <Text style={styles.loadingText}>Please wait…</Text>
            </View>
          )}

          {/* ── Demo state switcher ──────────────────────────────────── */}
          {/* REMOVE THIS BLOCK BEFORE PRODUCTION LAUNCH                 */}
          <View style={styles.demoBlock}>
            <Text style={styles.demoTitle}>⚠ Demo states — remove before launch</Text>
            <Text style={styles.demoHint}>
              Wrong OTP: enter 999999 · Expired OTP: enter 000000 · Any other 6-digit: success
            </Text>
            <View style={styles.demoRow}>
              {(
                [
                  ['Phone',   () => { setPhase('phone_entry'); setPhone(''); setOtp(''); setOtpError(null); }],
                  ['Sending', () => { setPhone('9876543210'); setPhase('loading'); }],
                  ['OTP',     () => demoShowOtpEntry(null)],
                  ['Verifying', () => { demoShowOtpEntry(null); setTimeout(() => setPhase('loading'), 50); }],
                  ['Wrong',   () => demoShowOtpEntry('wrong_otp')],
                  ['Expired', () => demoShowOtpEntry('otp_expired')],
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

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

  // ── Logo ────────────────────────────────────────────────────────────────
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

  // ── OTP sent banner ─────────────────────────────────────────────────────
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

  // ── Card ────────────────────────────────────────────────────────────────
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
    fontSize: 16,   // SF-2: raised from 14 for elderly readability
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

  // ── Phone input ─────────────────────────────────────────────────────────
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

  // ── OTP input ───────────────────────────────────────────────────────────
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

  // ── Primary button ──────────────────────────────────────────────────────
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

  // ── Error box ───────────────────────────────────────────────────────────
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
    fontSize: 14,   // SF-2: raised from 13 for elderly readability
    fontWeight: '500',
    lineHeight: 20,
  },

  // ── Resend + WhatsApp ───────────────────────────────────────────────────
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
  whatsappBtn: {
    paddingVertical: Spacing.xs,
  },
  whatsappLink: {
    fontSize: 13,
    color: '#128C7E',       // WhatsApp brand green (dark variant for readability)
    fontWeight: '500',
    textDecorationLine: 'underline',
  },

  // ── Change number ───────────────────────────────────────────────────────
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

  // ── Loading ─────────────────────────────────────────────────────────────
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

  // ── Demo state switcher (REMOVE BEFORE LAUNCH) ──────────────────────────
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
