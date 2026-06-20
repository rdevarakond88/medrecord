/**
 * PatientProfileScreen.tsx — P5: Patient Profile
 *
 * Spec:    docs/ui-ux-spec.md § P5 (Profile)
 * PM:      reviews/P1-P5-pm-review.md
 *
 * Live screen — wired to real API.
 *   GET /patient/profile → load name, mobile, DOB, language on mount.
 *   PATCH /patient/profile → save name, DOB, language on edit.
 *   Logout: clearAuth() + SecureStore cleanup + navigate to PatientLogin.
 *
 * Text sizing: system font scaling (allowFontScaling) — no custom large-text toggle.
 *   The device OS text size setting propagates automatically through all Text components.
 *   Profile shows a read-only "Text Size" row so users know where to change this.
 *
 * DOB wire convention: API stores YYYY-MM-DD; display and edit use DD/MM/YYYY.
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as SecureStore from 'expo-secure-store';

import { apiFetch } from '../../api/apiClient';
import { usePatientAuthStore } from '../../store/usePatientAuthStore';
import { PATIENT_REFRESH_TOKEN_KEY, PATIENT_USER_PROFILE_KEY } from '../../auth/constants';
import { Colors, Spacing } from '../../constants/theme';
import type { RootStackParamList } from '../../../App';

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileState = 'viewing' | 'editing';

type Language = 'English' | 'Hindi' | 'Tamil' | 'Telugu' | 'Kannada' | 'Bengali';

interface PatientProfile {
  name:     string;
  mobile:   string;   // non-editable
  dob:      string;   // display format DD/MM/YYYY; '' if not set
  language: Language;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LANGUAGES: Language[] = [
  'English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Bengali',
];

const LANGUAGE_NATIVE: Record<Language, string> = {
  English: 'English',
  Hindi:   'Hindi — हिन्दी',
  Tamil:   'Tamil — தமிழ்',
  Telugu:  'Telugu — తెలుగు',
  Kannada: 'Kannada — ಕನ್ನಡ',
  Bengali: 'Bengali — বাংলা',
};

// ─── DOB helpers ──────────────────────────────────────────────────────────────

function apiDobToDisplay(apiDob: string | null): string {
  if (!apiDob) return '';
  const [y, m, d] = apiDob.split('-');
  return `${d}/${m}/${y}`;
}

function displayDobToApi(display: string): string | null {
  const parts = display.split('/');
  if (parts.length !== 3 || parts[2].length !== 4) return null;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarCircle({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <View style={styles.avatar} accessible={false}>
      <Text style={styles.avatarInitials}>{initials}</Text>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function InfoRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
      {hint !== undefined && <Text style={styles.infoHint}>{hint}</Text>}
    </View>
  );
}

function EditRow({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  hint,
}: {
  label:          string;
  value:          string;
  onChangeText:   (t: string) => void;
  keyboardType?:  'default' | 'number-pad';
  placeholder?:   string;
  hint?:          string;
}) {
  return (
    <View style={styles.editRow}>
      <Text style={styles.editLabel}>{label}</Text>
      <TextInput
        style={styles.editInput}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType ?? 'default'}
        placeholder={placeholder}
        placeholderTextColor={Colors.textDisabled}
        accessibilityLabel={label}
        returnKeyType="done"
        allowFontScaling
      />
      {hint !== undefined && <Text style={styles.editHint}>{hint}</Text>}
    </View>
  );
}

// ─── Language picker modal ─────────────────────────────────────────────────────

function LanguageModal({
  visible,
  selected,
  onSelect,
  onClose,
}: {
  visible:  boolean;
  selected: Language;
  onSelect: (lang: Language) => void;
  onClose:  () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
        accessibilityLabel="Close language picker"
      />
      <View style={styles.modalSheet}>
        <View style={styles.modalHandle} accessible={false} />
        <Text style={styles.modalTitle} accessibilityRole="header">
          Select Language
        </Text>
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang}
            style={[
              styles.langOption,
              lang === selected && styles.langOptionSelected,
            ]}
            onPress={() => { onSelect(lang); onClose(); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: lang === selected }}
            accessibilityLabel={LANGUAGE_NATIVE[lang]}
          >
            <Text
              style={[
                styles.langOptionText,
                lang === selected && styles.langOptionTextSelected,
              ]}
            >
              {LANGUAGE_NATIVE[lang]}
            </Text>
            {lang === selected && (
              <Text style={styles.langCheckmark} accessible={false}>✓</Text>
            )}
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={styles.modalCancelBtn}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.modalCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PatientProfile'>;

export default function PatientProfileScreen() {
  const navigation              = useNavigation<NavProp>();
  const { token, clearAuth }    = usePatientAuthStore();

  const [profileState,   setProfileState]   = useState<ProfileState>('viewing');
  const [profile,        setProfile]        = useState<PatientProfile | null>(null);
  const [draftName,      setDraftName]      = useState('');
  const [draftDob,       setDraftDob]       = useState('');
  const [draftLanguage,  setDraftLanguage]  = useState<Language>('English');
  const [langModalOpen,  setLangModalOpen]  = useState(false);
  const [isLoading,      setIsLoading]      = useState(true);
  const [fetchError,     setFetchError]     = useState<string | null>(null);
  const [isSaving,       setIsSaving]       = useState(false);
  const isSavingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!token) {
        navigation.replace('PatientLogin');
        return;
      }

      let cancelled = false;

      async function loadProfile() {
        setIsLoading(true);
        setFetchError(null);
        try {
          const data = await apiFetch<{
            profile: {
              id:                 string;
              name:               string | null;
              mobile_number:      string;
              date_of_birth:      string | null;
              preferred_language: Language;
            };
          }>('/patient/profile', token!);

          if (!cancelled) {
            const p: PatientProfile = {
              name:     data.profile.name ?? '',
              mobile:   data.profile.mobile_number,
              dob:      apiDobToDisplay(data.profile.date_of_birth),
              language: data.profile.preferred_language,
            };
            setProfile(p);
          }
        } catch {
          if (!cancelled) {
            setFetchError('Could not load profile. Pull down to retry.');
          }
        } finally {
          if (!cancelled) setIsLoading(false);
        }
      }

      void loadProfile();
      return () => { cancelled = true; };
    }, [token]),  // eslint-disable-line react-hooks/exhaustive-deps
  );

  function handleEditPress() {
    if (!profile) return;
    setDraftName(profile.name);
    setDraftDob(profile.dob);
    setDraftLanguage(profile.language);
    setProfileState('editing');
  }

  function handleCancel() {
    setProfileState('viewing');
  }

  async function handleSave() {
    if (isSavingRef.current) return;
    if (!profile || !token) return;

    const trimmedName = draftName.trim();
    if (trimmedName.length === 0) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const body: Record<string, string> = {
        name:               trimmedName,
        preferred_language: draftLanguage,
      };
      const apiDob = displayDobToApi(draftDob.trim());
      if (apiDob) body.date_of_birth = apiDob;

      const data = await apiFetch<{
        profile: {
          name:               string | null;
          mobile_number:      string;
          date_of_birth:      string | null;
          preferred_language: Language;
        };
      }>('/patient/profile', token, { method: 'PATCH', body: JSON.stringify(body) });

      setProfile({
        name:     data.profile.name ?? trimmedName,
        mobile:   data.profile.mobile_number,
        dob:      apiDobToDisplay(data.profile.date_of_birth),
        language: data.profile.preferred_language,
      });
      setProfileState('viewing');
    } catch {
      Alert.alert('Save failed', 'Could not save your changes. Please try again.');
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  function handleLogout() {
    Alert.alert(
      'Log out?',
      'You will need to enter your mobile number again to log back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text:  'Log out',
          style: 'destructive',
          onPress: async () => {
            await Promise.all([
              SecureStore.deleteItemAsync(PATIENT_REFRESH_TOKEN_KEY).catch(() => {}),
              SecureStore.deleteItemAsync(PATIENT_USER_PROFILE_KEY).catch(() => {}),
            ]);
            clearAuth();
            navigation.replace('PatientLogin');
          },
        },
      ],
    );
  }

  const isEditing = profileState === 'editing';

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Nav header ── */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Go back to My Health Records"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} accessibilityRole="header">Profile</Text>
        {isEditing ? (
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={handleSave}
            disabled={isSaving}
            accessibilityRole="button"
            accessibilityLabel="Save profile changes"
          >
            {isSaving
              ? <ActivityIndicator size="small" color={Colors.primaryBlue} />
              : <Text style={styles.saveBtnText}>Save</Text>
            }
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={handleEditPress}
            disabled={!profile || isLoading}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
          >
            <Text style={[styles.editBtnText, (!profile || isLoading) && styles.editBtnDisabled]}>
              Edit
            </Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {isLoading ? (
          <View style={styles.loadingBlock}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
          </View>
        ) : fetchError ? (
          <View style={styles.loadingBlock}>
            <Text style={styles.errorText}>{fetchError}</Text>
          </View>
        ) : profile ? (
          <>
            {/* ── Avatar + name block ── */}
            <View style={styles.avatarBlock}>
              <AvatarCircle name={profile.name || '?'} />
              <Text style={styles.displayName}>{profile.name || 'No name set'}</Text>
              <Text style={styles.displayMobile}>+91 {profile.mobile}</Text>
            </View>

            {/* ── Personal details ── */}
            <SectionHeader title="Personal Details" />
            <View style={styles.card}>
              {isEditing ? (
                <>
                  <EditRow
                    label="Name"
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Your full name"
                  />
                  <View style={styles.divider} />
                  <InfoRow
                    label="Mobile Number"
                    value={`+91 ${profile.mobile}`}
                    hint="Mobile number cannot be changed"
                  />
                  <View style={styles.divider} />
                  <EditRow
                    label="Date of Birth"
                    value={draftDob}
                    onChangeText={(t) => {
                      // Auto-insert "/" after DD and MM — P5-PC-M1 fix
                      const digits = t.replace(/\D/g, '').slice(0, 8);
                      let formatted = digits;
                      if (digits.length > 4) {
                        formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
                      } else if (digits.length > 2) {
                        formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                      }
                      setDraftDob(formatted);
                    }}
                    keyboardType="default"
                    placeholder="DD/MM/YYYY"
                    hint="Format: DD/MM/YYYY"
                  />
                </>
              ) : (
                <>
                  <InfoRow label="Name"           value={profile.name || '—'} />
                  <View style={styles.divider} />
                  <InfoRow label="Mobile Number"  value={`+91 ${profile.mobile}`} />
                  <View style={styles.divider} />
                  <InfoRow label="Date of Birth"  value={profile.dob || '—'} />
                </>
              )}
            </View>

            {/* ── Preferences ── */}
            <SectionHeader title="Preferences" />
            <View style={styles.card}>

              {/* Language row */}
              {isEditing ? (
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => setLangModalOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Language: ${LANGUAGE_NATIVE[draftLanguage]}. Tap to change.`}
                >
                  <Text style={styles.pickerLabel}>Language</Text>
                  <View style={styles.pickerValueRow}>
                    <Text style={styles.pickerValue}>{LANGUAGE_NATIVE[draftLanguage]}</Text>
                    <Text style={styles.pickerChevron} accessible={false}>›</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <InfoRow label="Language" value={profile.language} />
              )}

              <View style={styles.divider} />

              {/* Text size (read-only — uses device OS setting) */}
              <View style={styles.textSizeRow}>
                <View style={styles.textSizeInfo}>
                  <Text style={styles.infoLabel}>Text Size</Text>
                  <Text style={styles.textSizeNote}>
                    Controlled by your device's Display settings
                  </Text>
                </View>
                <Text style={styles.textSizeDevice} accessible={false}>📱</Text>
              </View>

            </View>

            {/* ── Cancel editing button ── */}
            {isEditing && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
                accessibilityRole="button"
                accessibilityLabel="Cancel editing"
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}

            {/* ── Logout ── */}
            {!isEditing && (
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={handleLogout}
                accessibilityRole="button"
                accessibilityLabel="Log out"
              >
                <Text style={styles.logoutBtnText}>Log out</Text>
              </TouchableOpacity>
            )}
          </>
        ) : null}

        {__DEV__ && (
          <TouchableOpacity
            style={styles.devNavBtn}
            onPress={() => navigation.navigate('PatientAppointments')}
          >
            <Text style={styles.devNavBtnText}>DEV → P9: Upcoming Appointments</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* ── Bottom tab bar (patient app) ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('PatientTimeline')}
          accessibilityRole="tab"
          accessibilityLabel="My Records tab"
          accessibilityState={{ selected: false }}
        >
          <Text style={styles.tabIcon} accessible={false}>📋</Text>
          <Text style={styles.tabLabel}>My Records</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('PatientDoctorsAccess')}
          accessibilityRole="tab"
          accessibilityLabel="Doctors tab"
          accessibilityState={{ selected: false }}
        >
          <Text style={styles.tabIcon} accessible={false}>👨‍⚕️</Text>
          <Text style={styles.tabLabel}>Doctors</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          accessibilityRole="tab"
          accessibilityLabel="Profile tab, currently selected"
          accessibilityState={{ selected: true }}
        >
          <Text style={styles.tabIcon} accessible={false}>👤</Text>
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Profile</Text>
          <View style={styles.tabActiveDot} />
        </TouchableOpacity>
      </View>

      {/* ── Language picker modal ── */}
      <LanguageModal
        visible={langModalOpen}
        selected={draftLanguage}
        onSelect={setDraftLanguage}
        onClose={() => setLangModalOpen(false)}
      />

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: {
    flex:            1,
    backgroundColor: Colors.background,
  },

  // ── Nav header
  navHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.md,
    backgroundColor:   Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    minHeight:         56,
  },
  backBtn: {
    minWidth:       60,
    minHeight:      44,
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize:   16,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },
  navTitle: {
    fontSize:   17,
    fontWeight: '600',
    color:      Colors.textPrimary,
    flexShrink: 1,
    textAlign:  'center',
  },
  editBtn: {
    minWidth:       60,
    minHeight:      44,
    justifyContent: 'center',
    alignItems:     'flex-end',
  },
  editBtnText: {
    fontSize:   16,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },
  editBtnDisabled: {
    color: Colors.textDisabled,
  },
  saveBtn: {
    minWidth:       60,
    minHeight:      44,
    justifyContent: 'center',
    alignItems:     'flex-end',
  },
  saveBtnText: {
    fontSize:   16,
    fontWeight: '700',
    color:      Colors.primaryBlue,
  },

  // ── Loading / error
  loadingBlock: {
    paddingVertical: 60,
    alignItems:      'center',
  },
  errorText: {
    fontSize:   14,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 20,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.xxl,
    paddingTop:        Spacing.xl,
    paddingBottom:     32,
  },

  // ── Avatar block
  avatarBlock: {
    alignItems:   'center',
    marginBottom: Spacing.xxl,
  },
  avatar: {
    width:           80,
    height:          80,
    borderRadius:    40,
    backgroundColor: Colors.primaryBlue,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    Spacing.md,
  },
  avatarInitials: {
    fontSize:   28,
    fontWeight: '700',
    color:      '#FFFFFF',
  },
  displayName: {
    fontSize:     20,
    fontWeight:   '700',
    color:        Colors.textPrimary,
    marginBottom: 4,
    textAlign:    'center',
  },
  displayMobile: {
    fontSize:  15,
    color:     Colors.textSecondary,
    textAlign: 'center',
  },

  // ── Section headers
  sectionHeader: {
    fontSize:      13,
    fontWeight:    '700',
    color:         Colors.textSecondary,
    marginBottom:  Spacing.sm,
    marginLeft:    4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // ── Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius:    14,
    paddingVertical: Spacing.sm,
    marginBottom:    Spacing.xxl,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.06,
    shadowRadius:    6,
    elevation:       2,
  },

  // ── Divider
  divider: {
    height:           StyleSheet.hairlineWidth,
    backgroundColor:  Colors.border,
    marginHorizontal: Spacing.xl,
  },

  // ── Info row (view mode)
  infoRow: {
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.lg,
  },
  infoLabel: {
    fontSize:     13,
    color:        Colors.textSecondary,
    marginBottom: 4,
  },
  infoValue: {
    fontSize:   16,
    fontWeight: '500',
    color:      Colors.textPrimary,
  },
  infoHint: {
    fontSize:  13,
    color:     Colors.textDisabled,
    marginTop: 4,
  },

  // ── Edit row (edit mode)
  editRow: {
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.md,
  },
  editLabel: {
    fontSize:     13,
    color:        Colors.textSecondary,
    marginBottom: 6,
  },
  editInput: {
    fontSize:          16,
    fontWeight:        '500',
    color:             Colors.textPrimary,
    borderWidth:       1.5,
    borderColor:       Colors.primaryBlue,
    borderRadius:      10,
    paddingHorizontal: Spacing.md,
    paddingVertical:   Spacing.sm,
    minHeight:         48,
  },
  editHint: {
    fontSize:  13,
    color:     Colors.textDisabled,
    marginTop: 6,
  },

  // ── Language picker row
  pickerRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.lg,
    minHeight:         56,
  },
  pickerLabel: {
    fontSize: 13,
    color:    Colors.textSecondary,
  },
  pickerValueRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.xs,
  },
  pickerValue: {
    fontSize:   16,
    fontWeight: '500',
    color:      Colors.textPrimary,
  },
  pickerChevron: {
    fontSize: 20,
    color:    Colors.textSecondary,
  },

  // ── Text size row
  textSizeRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: Spacing.xl,
    paddingVertical:   Spacing.lg,
  },
  textSizeInfo: {
    flex: 1,
  },
  textSizeNote: {
    fontSize:  14,
    color:     Colors.textDisabled,
    marginTop: 4,
  },
  textSizeDevice: {
    fontSize: 22,
  },

  // ── Cancel button
  cancelBtn: {
    borderWidth:     1.5,
    borderColor:     Colors.border,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
    minHeight:       52,
    justifyContent:  'center',
    marginBottom:    Spacing.lg,
  },
  cancelBtnText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.textSecondary,
  },

  // ── Logout button
  logoutBtn: {
    borderWidth:     1.5,
    borderColor:     Colors.error,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
    minHeight:       52,
    justifyContent:  'center',
    marginBottom:    Spacing.lg,
  },
  logoutBtnText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.error,
  },

  // ── Dev nav (mockup only — __DEV__)
  devNavBtn: {
    marginHorizontal: Spacing.xxl,
    marginTop:        Spacing.xxl,
    marginBottom:     Spacing.xl,
    paddingVertical:  Spacing.md,
    borderRadius:     8,
    backgroundColor:  '#FFF7ED',
    borderWidth:      1,
    borderColor:      '#FED7AA',
    alignItems:       'center',
    minHeight:        48,
    justifyContent:   'center',
  },
  devNavBtnText: {
    fontSize:   13,
    fontWeight: '600',
    color:      '#92400E',
  },

  // ── Bottom tab bar
  tabBar: {
    flexDirection:    'row',
    backgroundColor:  Colors.surface,
    borderTopWidth:   1,
    borderTopColor:   Colors.border,
    paddingBottom:    Spacing.md,
    paddingTop:       Spacing.sm,
  },
  tabItem: {
    flex:            1,
    alignItems:      'center',
    paddingVertical: Spacing.sm,
    minHeight:       48,
    justifyContent:  'center',
  },
  tabIcon: {
    fontSize:     20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize:   11,
    fontWeight: '500',
    color:      Colors.textSecondary,
  },
  tabLabelActive: {
    color:      Colors.primaryBlue,
    fontWeight: '700',
  },
  tabActiveDot: {
    width:           4,
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.primaryBlue,
    marginTop:       3,
  },

  // ── Language modal
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modalSheet: {
    backgroundColor:      Colors.surface,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingBottom:        40,
    paddingTop:           Spacing.md,
    paddingHorizontal:    Spacing.xxl,
  },
  modalHandle: {
    width:           40,
    height:          4,
    backgroundColor: Colors.border,
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    Spacing.lg,
  },
  modalTitle: {
    fontSize:     18,
    fontWeight:   '700',
    color:        Colors.textPrimary,
    textAlign:    'center',
    marginBottom: Spacing.xl,
  },
  langOption: {
    flexDirection:      'row',
    alignItems:         'center',
    justifyContent:     'space-between',
    paddingVertical:    Spacing.lg,
    borderBottomWidth:  StyleSheet.hairlineWidth,
    borderBottomColor:  Colors.border,
    minHeight:          56,
  },
  langOptionSelected: {
    // checkmark is the indicator — no background change
  },
  langOptionText: {
    fontSize: 17,
    color:    Colors.textPrimary,
  },
  langOptionTextSelected: {
    fontWeight: '700',
    color:      Colors.primaryBlue,
  },
  langCheckmark: {
    fontSize:   18,
    color:      Colors.primaryBlue,
    fontWeight: '700',
  },
  modalCancelBtn: {
    marginTop:       Spacing.xl,
    paddingVertical: Spacing.lg,
    alignItems:      'center',
    minHeight:       52,
    justifyContent:  'center',
  },
  modalCancelText: {
    fontSize:   16,
    color:      Colors.textSecondary,
    fontWeight: '500',
  },
});
