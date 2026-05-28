/**
 * NewPatientFormScreen.tsx — D5: New Patient Form (live)
 *
 * Screen:   D5 — New Patient Form
 * Spec:     docs/ui-ux-spec.md → D5
 * Mockup:   mockups/D5NewPatientForm.tsx (all persona critique fixes applied)
 *
 * Nav params: { prefillMobile?: string } from D2 PatientSearchScreen
 *
 * Save flow (offline-first — spec: docs/offline-sync-spec.md):
 *   1. insertLocalPatient() → SQLite patients table
 *   2. enqueueOperation()   → sync_queue (entity_type 'patient', op 'create')
 *   3. If online: POST /patients optimistically
 *      - 201 success:    setPatientServerId() writes server_id back to local row
 *      - 409 conflict:   lookupPatient() to get server_id, then setPatientServerId()
 *      - Other error:    ignore — sync worker handles it on reconnect
 *   4. Navigate to NewVisit (D6) with the patient data
 *
 * Back nav guard:
 *   navigation.addListener('beforeRemove') covers iOS swipe, Android hw back, and
 *   the custom back button in one place. savingCompletedRef prevents the discard
 *   dialog from firing when goBack() is called from the save-success path.
 *
 * Auth guard: if (!token || !user) return null — after all hooks (D3-H-3 pattern)
 * Tap guard:  isSavingRef (synchronous ref) prevents double-submit
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useAuthStore } from '../../store/useAuthStore';
import { useNetworkStatus } from '../../utils/useNetworkStatus';
import {
  insertLocalPatient,
  upsertPatientFromServer,
  setPatientServerId,
  logLocalPatientAccess,
} from '../../db/patients';
import { enqueueOperation, markSyncEntrySuccess } from '../../sync/syncQueue';
import { createPatient, lookupPatient, ApiError } from '../../api/patients';
import type { RootStackParamList } from '../../../App';

// ─── Design tokens (ui-ux-spec.md) ────────────────────────────────────────

const C = {
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
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

type NavProp      = NativeStackNavigationProp<RootStackParamList, 'NewPatientForm'>;
type RoutePropTyp = RouteProp<RootStackParamList, 'NewPatientForm'>;
type Gender       = 'male' | 'female' | 'other' | null;

// ─── Helpers ───────────────────────────────────────────────────────────────

/** JS Date → ISO YYYY-MM-DD in local timezone. */
function dateToISO(d: Date): string {
  const yy = d.getFullYear();
  const mm  = String(d.getMonth() + 1).padStart(2, '0');
  const dd  = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/** ISO YYYY-MM-DD → display DD/MM/YYYY (Indian standard — ui-ux-spec.md). */
function isoToDisplay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** ISO YYYY-MM-DD → JS Date at midnight local time (for DateTimePicker). */
function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calculate age in years from ISO YYYY-MM-DD. Returns null for invalid input. */
function calcAge(iso: string): number | null {
  if (!iso) return null;
  const birth = isoToDate(iso);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 && age < 150 ? age : null;
}

/**
 * Returns a Promise that rejects after `ms` milliseconds.
 * Used with Promise.race() to give the optimistic server call a hard deadline —
 * H3: prevents indefinite spinner on 2G/EDGE (common in rural Indian clinics).
 */
function timeoutAfter(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms),
  );
}

/** 150 years ago — oldest plausible date of birth for the date picker minimum. */
function minDob(): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 150);
  return d;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function OfflineBanner() {
  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineBannerText}>
        Offline — patient will be created locally and synced when online
      </Text>
    </View>
  );
}

function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {optional && <Text style={styles.optionalTag}>Optional</Text>}
    </View>
  );
}

function GenderToggle({
  value,
  onSelect,
}: {
  value: Gender;
  onSelect: (g: Gender) => void;
}) {
  const options: { key: Gender; label: string }[] = [
    { key: 'male',   label: 'M' },
    { key: 'female', label: 'F' },
    { key: 'other',  label: 'Other' },
  ];
  return (
    <View style={styles.genderRow}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <TouchableOpacity
            key={opt.key}
            style={[styles.genderBtn, active && styles.genderBtnActive]}
            onPress={() => onSelect(active ? null : opt.key)}
            accessibilityLabel={`Gender: ${opt.label}`}
            accessibilityRole="button"
          >
            <Text style={[styles.genderBtnText, active && styles.genderBtnTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function NewPatientFormScreen() {
  const db         = useSQLiteContext();
  const navigation = useNavigation<NavProp>();
  const route      = useRoute<RoutePropTyp>();
  const { token, user } = useAuthStore();
  const isOnline   = useNetworkStatus();

  const mobile = route.params?.prefillMobile ?? '';

  // ─── Local state ────────────────────────────────────────────────────────
  const [name,           setName]           = useState('');
  const [dob,            setDob]            = useState<string>('');  // ISO YYYY-MM-DD or ''
  const [gender,         setGender]         = useState<Gender>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSaving,       setIsSaving]       = useState(false);
  const [saveError,      setSaveError]      = useState<string | null>(null);

  // Tap guard: synchronous ref prevents double-submit if the user taps Save twice quickly.
  const isSavingRef = useRef(false);

  // Set to true just before goBack() on save success so beforeRemove doesn't
  // show the discard dialog for the programmatic back navigation.
  const savingCompletedRef = useRef(false);

  // Unsaved changes: any optional field that the doctor has touched.
  const hasUnsavedChanges =
    name.trim().length > 0 || dob !== '' || gender !== null;

  // ─── Back navigation guard ────────────────────────────────────────────
  // Single handler covers: iOS swipe, Android hw button, custom back button.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (savingCompletedRef.current) return;
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      Alert.alert(
        'Discard changes?',
        'Patient details you entered will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.dispatch(e.data.action),
          },
        ],
      );
    });
    return unsubscribe;
  }, [navigation, hasUnsavedChanges]);

  // ─── Auth guard (must appear after all hooks) ─────────────────────────
  if (!token || !user) return null;

  // ─── Handlers ────────────────────────────────────────────────────────

  /** Date picker onChange — platform-aware. */
  function handleDateChange(_event: any, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (!selectedDate) return;
    // Block future dates — DOB cannot be in the future.
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedDate > today) return;
    setDob(dateToISO(selectedDate));
  }

  async function handleSave() {
    // Tap guard — synchronous ref closes the double-submit race window.
    if (isSavingRef.current) return;
    // Auth guard inside async handler — token/user are non-null here because
    // the auth guard before the return-null branch already covers the null case,
    // but TypeScript cannot narrow across the async boundary.
    if (!token || !user) return;
    isSavingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    // Validate mobile before any write. Guards against empty string or
    // malformed number arriving via deep link, test harness, or future nav changes.
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      setSaveError('Invalid mobile number — cannot create patient.');
      isSavingRef.current = false;
      setIsSaving(false);
      return;
    }

    const proposedLocalId = Crypto.randomUUID();
    const trimmedName = name.trim() || null;
    const dobISO = dob || null;

    // Captured inside the transaction callback and read on the outside.
    let actualLocalId = proposedLocalId;
    let wasInserted   = false;

    try {
      // ── Steps 1+2: Atomic SQLite writes (E1 fix — transaction wrapper) ──
      // insertLocalPatient + logLocalPatientAccess + enqueueOperation must all
      // succeed or all fail. Without a transaction, an app-kill between steps
      // leaves a patient row with no sync queue entry (patient never uploaded).
      await db.withTransactionAsync(async () => {
        const insertResult = await insertLocalPatient(db, {
          local_id:      proposedLocalId,
          doctor_id:     user.id,
          mobile_number: mobile,
          name:          trimmedName,
          date_of_birth: dobISO,
          gender,
        });

        // C1+C2 fix: use the DB's actual local_id (may differ from proposedLocalId
        // if INSERT was a no-op because the mobile already existed). Only audit and
        // enqueue if a new row was written — a phantom audit event for a patient that
        // was never inserted would corrupt the DPDP audit log.
        actualLocalId = insertResult.localId;
        wasInserted   = insertResult.wasInserted;

        if (wasInserted) {
          // Audit event for patient creation (DPDP §8). Log only the local entity
          // ID — no PII (no name, no mobile number) in the audit record.
          await logLocalPatientAccess(db, user.id, 'patient_created', {
            entity_local_id: actualLocalId,
          });
          await enqueueOperation(db, {
            doctor_id:       user.id,
            entity_type:     'patient',
            entity_local_id: actualLocalId,
            operation:       'create',
            payload: {
              local_id:      actualLocalId,
              mobile_number: mobile,
              name:          trimmedName,
              date_of_birth: dobISO,
              gender,
            },
          });
        }
      });

      // ── Step 3: Server registration (mandatory when reachable) ──────────
      // BUG-IT-1 fix: always attempt the server call — do not gate on isOnline state.
      // The isOnline hook starts false and lags on first load; gating on it causes
      // the call to be skipped entirely when the doctor saves quickly after opening D5.
      //
      // Error handling:
      //   - 201: patient created on server → update local row with server_id ✅
      //   - 409: race / already exists → look up server_id and update local row ✅
      //   - TypeError (network error): truly offline → proceed without server_id;
      //     patient cannot log in until the sync worker uploads the record (acceptable)
      //   - timeout / ApiError non-409: backend unreachable/slow → BLOCK navigation,
      //     show error, let doctor retry. Patient must exist on server before login.
      let serverPatientId: string | null = null;

      try {
        const res = await Promise.race([
          createPatient(
            {
              localId:      actualLocalId,
              mobileNumber: mobile,
              name:         trimmedName,
              dateOfBirth:  dobISO,
              gender,
            },
            token,
          ),
          timeoutAfter(30_000),
        ]);
        // 201: patient created on server — update local row with server_id
        await setPatientServerId(db, actualLocalId, res.patient.id);
        serverPatientId = res.patient.id;
      } catch (apiErr) {
        if (apiErr instanceof ApiError && apiErr.status === 409) {
          // Race condition: another device registered this patient first.
          // Look up the existing server patient to get their UUID.
          try {
            const existing = await lookupPatient(mobile, token);
            if (existing) {
              await upsertPatientFromServer(db, {
                doctor_id:       user.id,
                server_id:       existing.id,
                mobile_number:   existing.mobile_number,
                name:            existing.name,
                date_of_birth:   existing.date_of_birth,
                gender:          existing.gender,
                consent_granted: existing.consent_granted,
                last_visit_date: existing.last_visit_date,
              });
              serverPatientId = existing.id;
              // H4 fix: mark the pending 'create' queue entry as success so the
              // sync worker doesn't re-attempt a POST that will get another 409.
              if (wasInserted) {
                await markSyncEntrySuccess(db, actualLocalId, 'patient');
              }
            }
          } catch {
            // Lookup also failed — serverPatientId stays null.
          }
        } else if (apiErr instanceof TypeError) {
          // Network error — device is truly offline. The local SQLite row + sync
          // queue entry are the source of truth; sync worker will upload on reconnect.
          // serverPatientId stays null; patient cannot log in until then.
          serverPatientId = null;
        } else {
          // Timeout (Error('timeout')) or other ApiError (non-409, non-network).
          // Patient was saved to SQLite but is NOT on the server yet.
          // Block navigation — the patient cannot log in until they are registered.
          setSaveError(
            'Could not register patient with the server. Check your connection and tap the button to try again.',
          );
          isSavingRef.current = false;
          setIsSaving(false);
          return;
        }
      }

      // ── Step 4: Navigate to New Visit ────────────────────────────────
      // H1 fix: reset isSaving BEFORE marking save complete. If the doctor
      // navigates back from D6, D5 is restored from the stack with isSaving=false,
      // so the Save button is pressable again rather than stuck showing a spinner.
      // BUG-D5-DT1-1 fix: also reset isSavingRef here — the success path never
      // reset it, so returning to D5 from D6 left the ref stuck at true, causing
      // the duplicate-mobile path (wasInserted=false) to bail silently on the
      // next tap.
      isSavingRef.current = false;
      setIsSaving(false);
      savingCompletedRef.current = true;
      navigation.navigate('NewVisit', {
        patientId:       actualLocalId,
        patientServerId: serverPatientId,
        patientName:     trimmedName ?? '',
        patientMobile:   mobile,
        consentGranted:  false,  // new patient — consent not yet established (D9)
      });
    } catch (err) {
      // Local SQLite write or enqueue failed — this is a genuine error.
      setSaveError('Could not save patient. Please try again.');
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  const age = dob ? calcAge(dob) : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backArrow}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Patient</Text>
        <View style={styles.headerSpacer} />
      </View>

      {!isOnline && <OfflineBanner />}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Mobile number (pre-filled, non-editable) ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel label="Mobile Number" />
            <View style={styles.mobileField}>
              <Text style={styles.mobileValue}>{mobile}</Text>
              <Text style={styles.mobileLock} accessible={false}>🔒</Text>
            </View>
            <Text style={styles.fieldHint}>
              This number was not found — you are registering a new patient.
            </Text>
          </View>

          {/* ── Name (optional) ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel label="Patient Name" optional />
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Priya Venkataraman"
              placeholderTextColor={C.textDisabled}
              autoCapitalize="words"
              returnKeyType="done"
              maxLength={100}
              accessibilityLabel="Patient name input"
            />
          </View>

          {/* ── Date of Birth (optional) ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel label="Date of Birth" optional />
            <TouchableOpacity
              style={[styles.textInput, styles.datePickerRow]}
              onPress={() => setShowDatePicker(true)}
              accessibilityLabel={
                dob
                  ? `Date of birth: ${isoToDisplay(dob)}. Tap to change.`
                  : 'Select date of birth'
              }
              accessibilityRole="button"
            >
              <Text style={dob ? styles.dateValueText : styles.datePlaceholder}>
                {dob ? isoToDisplay(dob) : 'DD / MM / YYYY'}
              </Text>
              <Text style={styles.calendarIcon} accessible={false}>📅</Text>
            </TouchableOpacity>
            {/* H2 fix: allow the doctor to undo an accidentally selected date */}
            {dob !== '' && (
              <TouchableOpacity
                onPress={() => setDob('')}
                style={styles.dobClearButton}
                accessibilityLabel="Clear date of birth"
                accessibilityRole="button"
              >
                <Text style={styles.dobClearText}>Clear</Text>
              </TouchableOpacity>
            )}
            {/* iOS: inline compact picker displayed directly below the field */}
            {Platform.OS === 'ios' && showDatePicker && (
              <View style={styles.inlineDatePicker}>
                <DateTimePicker
                  value={dob ? isoToDate(dob) : new Date()}
                  mode="date"
                  display="compact"
                  maximumDate={new Date()}
                  minimumDate={minDob()}
                  onChange={handleDateChange}
                />
                <TouchableOpacity
                  style={styles.datePickerDone}
                  onPress={() => setShowDatePicker(false)}
                  accessibilityLabel="Done selecting date"
                >
                  <Text style={styles.datePickerDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
            )}
            {age !== null && (
              <Text style={styles.fieldHint}>Age: {age} years</Text>
            )}
          </View>

          {/* ── Gender (optional) ── */}
          <View style={styles.fieldBlock}>
            <FieldLabel label="Gender" optional />
            <GenderToggle value={gender} onSelect={setGender} />
          </View>

          {/* ── Add more later note ── */}
          <Text style={styles.addMoreNote}>
            Additional details (blood group, allergies, address) can be added
            from the patient profile.
          </Text>

          {/* ── Save error ── */}
          {saveError !== null && (
            <Text style={styles.saveError}>{saveError}</Text>
          )}

          {/* ── Submit button ── */}
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityLabel={
              isOnline ? 'Save patient and begin visit' : 'Save patient offline and begin visit'
            }
            accessibilityRole="button"
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.submitButtonText}>
                {!isOnline ? 'Save & Begin Visit (Offline)' : 'Save & Begin Visit'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.submitHint}>
            {"You'll be taken directly to a new visit for this patient."}
          </Text>

        </ScrollView>
      </KeyboardAvoidingView>

      {/* Android: native date dialog rendered outside the ScrollView */}
      {Platform.OS === 'android' && showDatePicker && (
        <DateTimePicker
          value={dob ? isoToDate(dob) : new Date()}
          mode="date"
          display="default"
          maximumDate={new Date()}
          minimumDate={minDob()}
          onChange={handleDateChange}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  flex: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backButton: {
    width: 48,
    height: 48,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 22,
    color: C.primaryBlue,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '600',
    color: C.textPrimary,
  },
  headerSpacer: {
    width: 48,
  },

  // Offline banner
  offlineBanner: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#FDE68A',
  },
  offlineBannerText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
  },

  // Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },

  // Field blocks
  fieldBlock: {
    marginBottom: 24,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: C.textPrimary,
  },
  optionalTag: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '400',
    backgroundColor: C.background,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  fieldHint: {
    marginTop: 4,
    fontSize: 12,
    color: C.textSecondary,
  },

  // Mobile field (non-editable display)
  mobileField: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
  },
  mobileValue: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: C.textPrimary,
    letterSpacing: 1,
  },
  mobileLock: {
    fontSize: 14,
  },

  // Text input
  textInput: {
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: C.textPrimary,
    minHeight: 52,
  },

  // Date picker row
  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePlaceholder: {
    fontSize: 16,
    color: C.textDisabled,
  },
  dateValueText: {
    fontSize: 16,
    color: C.textPrimary,
  },
  calendarIcon: {
    fontSize: 18,
  },
  inlineDatePicker: {
    marginTop: 8,
    backgroundColor: C.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
    padding: 8,
    alignItems: 'flex-start',
  },
  datePickerDone: {
    marginTop: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  datePickerDoneText: {
    fontSize: 15,
    color: C.primaryBlue,
    fontWeight: '600',
  },
  dobClearButton: {
    alignSelf: 'flex-end',
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  dobClearText: {
    fontSize: 13,
    color: C.textSecondary,
    textDecorationLine: 'underline',
  },

  // Gender toggle
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderBtn: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  genderBtnActive: {
    borderColor: C.primaryBlue,
    backgroundColor: '#EBF4FF',
  },
  genderBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: C.textSecondary,
  },
  genderBtnTextActive: {
    color: C.primaryBlue,
    fontWeight: '600',
  },

  // Add more later note
  addMoreNote: {
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 20,
    lineHeight: 18,
  },

  // Save error
  saveError: {
    fontSize: 13,
    color: C.error,
    marginBottom: 12,
    textAlign: 'center',
  },

  // Submit button
  submitButton: {
    backgroundColor: C.primaryBlue,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  submitHint: {
    textAlign: 'center',
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 10,
  },
});
