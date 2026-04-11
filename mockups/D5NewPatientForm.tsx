/**
 * D5NewPatientForm.tsx — Static Mockup
 *
 * Screen:   D5 — New Patient Form
 * Spec:     docs/ui-ux-spec.md → D5
 * Constraints: docs/project-state.md → Build Constraints (D5)
 *
 * Three states rendered:
 *   'empty'      — Mobile pre-filled, all optional fields blank
 *   'filled'     — All optional fields completed; button active
 *   'offline'    — No network; amber banner; submit queued locally
 *
 * No real API calls. All data is static.
 * Toggle between states with the dev switcher at top of screen.
 *
 * Aadhaar field deferred to v2 — when added, hash at form boundary
 * before any state write. Raw Aadhaar must never enter the call stack.
 */

import React, { useState } from 'react';
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
} from 'react-native';

// ─────────────────────────────────────────────────────────────
// Colour tokens — ui-ux-spec.md Design System
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type ScreenState = 'empty' | 'filled' | 'offline';
type Gender = 'male' | 'female' | 'other' | null;

// ─────────────────────────────────────────────────────────────
// Static data per state
// ─────────────────────────────────────────────────────────────
const STATIC: Record<ScreenState, {
  mobile: string;
  name: string;
  dob: string;
  gender: Gender;
}> = {
  empty: {
    mobile: '9876543210',
    name: '',
    dob: '',
    gender: null,
  },
  filled: {
    mobile: '9876543210',
    name: 'Priya Venkataraman',
    dob: '14/03/1985',
    gender: 'female',
  },
  offline: {
    mobile: '9876543210',
    name: 'Suresh Pillay',
    dob: '',
    gender: 'male',
  },
};

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function DevSwitcher({
  current,
  onChange,
}: {
  current: ScreenState;
  onChange: (s: ScreenState) => void;
}) {
  const states: ScreenState[] = ['empty', 'filled', 'offline'];
  return (
    <View style={styles.devSwitcher}>
      {states.map((s) => (
        <TouchableOpacity
          key={s}
          onPress={() => onChange(s)}
          style={[styles.devBtn, current === s && styles.devBtnActive]}
        >
          <Text style={[styles.devBtnText, current === s && styles.devBtnTextActive]}>
            {s}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function OfflineBanner() {
  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineBannerText}>
        Offline — patient will be created locally and synced when online
      </Text>
    </View>
  );
}

interface FieldLabelProps {
  label: string;
  optional?: boolean;
}
function FieldLabel({ label, optional }: FieldLabelProps) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {optional && <Text style={styles.optionalTag}>Optional</Text>}
    </View>
  );
}

interface GenderToggleProps {
  value: Gender;
  onSelect: (g: Gender) => void;
}
function GenderToggle({ value, onSelect }: GenderToggleProps) {
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

// ─────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────
export default function D5NewPatientForm() {
  const [screenState, setScreenState] = useState<ScreenState>('empty');
  const data = STATIC[screenState];

  // In the live build these will be controlled state; here they're display-only.
  const isOffline = screenState === 'offline';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      <DevSwitcher current={screenState} onChange={setScreenState} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backArrow}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Patient</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isOffline && <OfflineBanner />}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Mobile number (pre-filled, non-editable) ── */}
        <View style={styles.fieldBlock}>
          <FieldLabel label="Mobile Number" />
          <View style={styles.mobileField}>
            <Text style={styles.mobileValue}>{data.mobile}</Text>
            <Text style={styles.mobileLock}>🔒</Text>
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
            value={data.name}
            placeholder="e.g. Priya Venkataraman"
            placeholderTextColor={C.textDisabled}
            editable={false}   // mockup — live build will have controlled state
            accessibilityLabel="Patient name input"
          />
        </View>

        {/* ── Date of Birth (optional) ── */}
        <View style={styles.fieldBlock}>
          <FieldLabel label="Date of Birth" optional />
          <TouchableOpacity
            style={[styles.textInput, styles.datePickerRow]}
            accessibilityLabel="Select date of birth"
            accessibilityRole="button"
          >
            <Text style={data.dob ? styles.dateValueText : styles.datePlaceholder}>
              {data.dob || 'DD / MM / YYYY'}
            </Text>
            <Text style={styles.calendarIcon}>📅</Text>
          </TouchableOpacity>
          {/* Age derived from DOB shown inline when filled */}
          {data.dob !== '' && (
            <Text style={styles.fieldHint}>Age: 39 years</Text>
          )}
        </View>

        {/* ── Gender (optional) ── */}
        <View style={styles.fieldBlock}>
          <FieldLabel label="Gender" optional />
          <GenderToggle
            value={data.gender}
            onSelect={() => {/* mockup: no-op */}}
          />
        </View>

        {/* ── Submit button ── */}
        <TouchableOpacity
          style={styles.submitButton}
          accessibilityLabel="Create patient and start visit"
          accessibilityRole="button"
        >
          <Text style={styles.submitButtonText}>
            {isOffline ? 'Create Patient & Start Visit (Offline)' : 'Create Patient & Start Visit'}
          </Text>
        </TouchableOpacity>

        <Text style={styles.submitHint}>
          You'll be taken directly to a new visit for this patient.
        </Text>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },

  // Dev switcher
  devSwitcher: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
    gap: 8,
  },
  devBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
  },
  devBtnActive: {
    backgroundColor: C.primaryBlue,
  },
  devBtnText: {
    fontSize: 12,
    color: C.textSecondary,
  },
  devBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
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
