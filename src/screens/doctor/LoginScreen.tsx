/**
 * LoginScreen.tsx — D1 / P1: Phone + OTP Authentication
 *
 * Spec:   docs/ui-ux-spec.md § D1 (Doctor) / P1 (Patient)
 * PM:     reviews/D1-pm-preflow.md
 *
 * Live screen — wired to src/api/auth.ts (sendOtp, verifyOtp).
 * Refresh token written to expo-secure-store after successful verify.
 * Access token kept in Zustand in-memory only (never persisted).
 * Session restoration on cold-start is handled in App.tsx.
 *
 * Security items implemented here (from D1-security-audit.md):
 *   H-1  __DEV__ guard on demo block ✅
 *   H-2  refresh token → expo-secure-store after verify ✅
 *   M-1  Indian mobile prefix (6–9) guard + input filter ✅
 *   M-2  isVerifyingRef double-submit guard ✅
 *   M-3  WhatsApp button disabled during canResend=false ✅
 *   F-1  Refresh token written to REFRESH_TOKEN_KEY in SecureStore ✅
 *   F-2  Access token in Zustand only — never persisted ✅
 *   F-4  TOO_MANY_ATTEMPTS: distinct message + setCanResend(true) ✅
 *   F-5  429 on send-otp: specific "rate limited" message ✅
 *   F-6  All calls via sendOtpApi / verifyOtpApi (pinnedFetch inside) ✅
 *   F-9  login_success / login_failure logged to audit_events (fire-and-forget) ✅
 *   F-10 No phone number, OTP, user ID, or JWT in console.log ✅
 *
 * QA items:
 *   MB-1 Banner cleared when user taps "Change number" ✅
 *   UE-2 TOO_MANY_ATTEMPTS error handled in handleVerifyOtp ✅
 *   UE-3 NetInfo check before send-OTP — immediate offline error ✅
 *
 * QA pre-v1 bug fixes (2026-03-16):
 *   QA-M-1 Network error during verifyOtp now shows distinct no_connection error ✅
 *   QA-M-2 isSendingRef double-submit guard added to handleSendOtp ✅
 *
 * TODO (Android SMS autofill): Android SMS Retriever API auto-populates OTP.
 *      No Expo managed-workflow module exists as of 2026-03.
 *      iOS OTP autofill handled natively via textContentType="oneTimeCode".
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
import { useSQLiteContext } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import NetInfo from '@react-native-community/netinfo';

import { Colors, Spacing } from '../../constants/theme';
import { useAuthStore } from '../../store/useAuthStore';
import { sendOtp as sendOtpApi, verifyOtp as verifyOtpApi } from '../../api/auth';
import type { OtpChannel } from '../../api/auth';
import { ApiError } from '../../api/apiClient';
import { REFRESH_TOKEN_KEY, USER_PROFILE_KEY } from '../../auth/constants';
import type { RootStackParamList } from '../../../App';

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase    = 'phone_entry' | 'loading' | 'otp_entry';
type OtpError = null | 'wrong_otp' | 'otp_expired' | 'too_many_attempts' | 'no_connection';
type SendError = null | 'send_failed' | 'rate_limited' | 'no_connection';

interface LoginScreenProps {
  /** Subtitle below the MedRecord logo. Pass "For Patients" for P1 reuse. */
  subtitle?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const RESEND_SECONDS = 45;

/** User-visible messages for send-OTP errors — avoids repeated JSX branching. */
const SEND_ERROR_MESSAGES: Record<NonNullable<SendError>, string> = {
  no_connection: 'No internet connection. Please check and retry.',
  rate_limited:  'Too many OTP requests. Please wait before trying again.',
  send_failed:   'Couldn\'t send OTP. Please check your connection and try again.',
};

// ─── Audit log helper ────────────────────────────────────────────────────────

/**
 * Write a login audit event to the local audit_events table.
 * Fire-and-forget — never awaited by the caller (F-9).
 * Uses '*' for patient_id (no patient context during login).
 */
async function logAuthAuditEvent(
  db: ReturnType<typeof useSQLiteContext>,
  eventType: 'login_success' | 'login_failure',
  actorId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const id  = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR IGNORE INTO audit_events
       (id, event_type, doctor_id, patient_id, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, eventType, actorId, '*', JSON.stringify(metadata), now],
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function LoginScreen({
  subtitle = 'For Doctors & Clinics',
}: LoginScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const setAuth    = useAuthStore((s) => s.setAuth);
  // F-9: SQLite context for audit logging (LoginScreen is inside SQLiteProvider)
  const db         = useSQLiteContext();

  const [phase,          setPhase]          = useState<Phase>('phone_entry');
  const [otpError,       setOtpError]       = useState<OtpError>(null);
  const [sendError,      setSendError]      = useState<SendError>(null);
  const [phone,          setPhone]          = useState('');
  const [otp,            setOtp]            = useState('');
  const [otpToken,       setOtpToken]       = useState<string | null>(null);
  const [otpSentBanner,  setOtpSentBanner]  = useState(false);
  const [resendSeconds,  setResendSeconds]  = useState(RESEND_SECONDS);
  const [canResend,      setCanResend]      = useState(false);
  const [phoneError,     setPhoneError]     = useState<string | null>(null);

  const phoneInputRef  = useRef<TextInput>(null);
  const otpInputRef    = useRef<TextInput>(null);
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  // M-2 (security): synchronous double-submit guard on verify (useRef, not useState — avoids async race)
  const isVerifyingRef = useRef(false);
  // QA-M-2: synchronous double-submit guard on send — mirrors isVerifyingRef pattern
  const isSendingRef   = useRef(false);

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
    // M-1: reject numbers that don't start with a valid Indian mobile prefix (6–9)
    const firstDigit = parseInt(phone[0], 10);
    if (phone.length !== 10 || firstDigit < 6) return;

    // QA-M-2: synchronous tap guard — prevents rapid double-taps on Send/Resend/WhatsApp
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    // UE-3: Check connectivity before triggering a loading state — shows the
    // "no internet" error immediately without a spinner on airplane-mode devices.
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      isSendingRef.current = false;
      setSendError('no_connection');
      return;
    }

    setPhase('loading');
    setOtpError(null);
    setSendError(null);
    try {
      const { otp_token } = await sendOtpApi(phone, channel);
      setOtpToken(otp_token);   // store for use in handleVerifyOtp
      setOtp('');
      setOtpSentBanner(true);
      isSendingRef.current = false;
      setPhase('otp_entry');
      startResendCountdown();
      // Banner stays visible until the user types their first OTP digit (MF-2)
      setTimeout(() => otpInputRef.current?.focus(), 300);
    } catch (err: unknown) {
      isSendingRef.current = false;
      setPhase('phone_entry');
      // F-5: distinct message when the server's per-mobile rate limit fires
      if (err instanceof ApiError && err.status === 429) {
        setSendError('rate_limited');
      } else {
        setSendError('send_failed');
      }
    }
  }

  // ── Verify OTP ───────────────────────────────────────────────────────────

  async function handleVerifyOtp() {
    if (otp.length !== 6 || !otpToken) return;
    // M-2: synchronous tap guard — prevents double-submit from auto-submit useEffect
    // firing simultaneously with a manual button tap on slow devices
    if (isVerifyingRef.current) return;
    isVerifyingRef.current = true;
    setPhase('loading');
    setOtpError(null);
    try {
      const result = await verifyOtpApi(otpToken, otp);
      if (timerRef.current) clearInterval(timerRef.current);

      // F-1: Write refresh token to SecureStore (never AsyncStorage — spec §At Rest)
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, result.refresh_token);

      // H-3 / cold-start restoration: store user profile so App.tsx can call
      // setAuth() after a successful /auth/refresh without a separate /me call
      await SecureStore.setItemAsync(USER_PROFILE_KEY, JSON.stringify({
        id:          result.user.id,
        role:        result.user.role,
        name:        result.user.name,
        clinic_id:   result.user.clinic_id,
        clinic_name: null,   // fetched lazily post-login; not in verify-otp response
      }));

      // F-2: Access token stays in Zustand in-memory only — never persisted
      setAuth(result.access_token, {
        id:          result.user.id,
        role:        result.user.role,
        name:        result.user.name,
        clinic_id:   result.user.clinic_id,
        clinic_name: null,
      });

      // F-9: log login success — fire-and-forget, never blocks navigation
      void logAuthAuditEvent(db, 'login_success', result.user.id, {});

      navigation.replace('PatientSearch');
      // Note: no isVerifyingRef reset on success — screen unmounts
    } catch (err: unknown) {
      // M-2: reset on failure so the user can retry after a wrong or expired OTP
      isVerifyingRef.current = false;

      const code = err instanceof ApiError ? err.code : null;

      // F-9: log login failure — fire-and-forget
      void logAuthAuditEvent(db, 'login_failure', '*', { reason: code ?? 'network_error' });

      if (code === null) {
        // QA-M-1: err was not an ApiError — no response received (network failure).
        // Show a connectivity error instead of the misleading "Incorrect OTP" message.
        setOtpError('no_connection');
      } else if (code === 'TOO_MANY_ATTEMPTS') {
        // F-4 / UE-2: 3-attempt limit reached — OTP is invalidated on the server.
        // Clear the field and enable resend immediately so the user can get a new OTP.
        setOtpError('too_many_attempts');
        setOtp('');
        setCanResend(true);
        if (timerRef.current) clearInterval(timerRef.current);
      } else if (code === 'OTP_EXPIRED') {
        setOtpError('otp_expired');
        // MF-3: bypass remaining countdown — user must request a new OTP immediately
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

              {/* Send-OTP errors (send_failed, rate_limited, no_connection) */}
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
                    // M-1: reject first digit 0–5 at input layer (same pattern as D2)
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

              {/* M-1: inline error when first digit is not a valid Indian mobile prefix */}
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

              {/* Error: network error during verify — QA-M-1 */}
              {otpError === 'no_connection' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    No internet connection. Please check and retry.
                  </Text>
                </View>
              )}

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

              {/* Error: too many attempts — F-4 / UE-2 */}
              {otpError === 'too_many_attempts' && (
                <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                  <Text style={styles.errorText}>
                    Too many attempts. Please request a new OTP.
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
                    Shown below resend countdown as a secondary action.
                    M-3: disabled during active countdown (same canResend gate as
                    Resend OTP) to prevent draining the server's 5/hr rate limit. */}
                <TouchableOpacity
                  onPress={() => handleSendOtp('whatsapp')}
                  disabled={!canResend}
                  accessibilityLabel="Didn't receive SMS? Try WhatsApp"
                  accessibilityRole="button"
                  style={[styles.whatsappBtn, !canResend && styles.whatsappBtnDisabled]}
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
                  setOtpSentBanner(false);  // MB-1: clear banner when user changes number
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
          {/* H-1: __DEV__ guard — stripped from production builds by Metro  */}
          {__DEV__ && (
            <View style={styles.demoBlock}>
              <Text style={styles.demoTitle}>⚠ Demo states — remove before launch</Text>
              <Text style={styles.demoHint}>
                Sets UI state directly — does not call the real API.
                Use a real device + real phone number to test the live OTP flow.
              </Text>
              <View style={styles.demoRow}>
                {(
                  [
                    ['Phone',    () => { setPhase('phone_entry'); setPhone(''); setOtp(''); setOtpError(null); }],
                    ['Sending',  () => { setPhone('9876543210'); setPhase('loading'); }],
                    ['OTP',      () => demoShowOtpEntry(null)],
                    ['Verifying',() => { demoShowOtpEntry(null); setTimeout(() => setPhase('loading'), 50); }],
                    ['Wrong',    () => demoShowOtpEntry('wrong_otp')],
                    ['Expired',  () => demoShowOtpEntry('otp_expired')],
                    ['TooMany',  () => demoShowOtpEntry('too_many_attempts')],
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

  // ── Phone error (M-1) ───────────────────────────────────────────────────
  phoneErrorText: {
    fontSize: 12,
    color: Colors.error,
    marginTop: -Spacing.md,
    marginBottom: Spacing.sm,
    marginLeft: 4,
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
  // M-3: reduced opacity when disabled during active countdown
  whatsappBtnDisabled: {
    opacity: 0.4,
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
