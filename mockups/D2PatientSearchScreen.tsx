/**
 * D2PatientSearchScreen.tsx — Static Mockup
 *
 * Screen:   D2 — Patient Search / Home
 * Spec:     docs/ui-ux-spec.md → D2
 * Constraints: docs/project-state.md → Build Constraints (D2)
 *
 * Three states rendered:
 *   'empty'    — No search query; recent patients visible
 *   'has-data' — Partial phone typed; match found + "not found" create prompt
 *   'offline'  — No network; local SQLite cache only; amber banner active
 *
 * No real API calls. All data is static.
 * Toggle between states with the dev switcher at the top of screen.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
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
  scanOrange:    '#EA580C',
} as const;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type ScreenState = 'empty' | 'has-data' | 'offline';

interface Patient {
  id: string;
  name: string;
  mobile: string;           // 10-digit, starts 6–9
  lastVisitDate: string;    // DD/MM/YYYY
  lastClinic: string;
  syncedToCloud: boolean;   // false = exists in local SQLite only
}

// ─────────────────────────────────────────────────────────────
// Mock data — realistic Indian clinic context
// ─────────────────────────────────────────────────────────────
const RECENT_PATIENTS: Patient[] = [
  {
    id: 'p1',
    name: 'Priya Raghunathan',
    mobile: '9845201234',
    lastVisitDate: '17/02/2026',
    lastClinic: 'Shree Clinic, Hubli',
    syncedToCloud: true,
  },
  {
    id: 'p2',
    name: 'Mohammed Imran Shaikh',
    mobile: '8123409876',
    lastVisitDate: '15/02/2026',
    lastClinic: 'Shree Clinic, Hubli',
    syncedToCloud: true,
  },
  {
    id: 'p3',
    name: 'Kavitha Subramaniam',
    mobile: '7654321098',
    lastVisitDate: '12/02/2026',
    lastClinic: 'Shree Clinic, Hubli',
    syncedToCloud: false, // created offline, not yet uploaded
  },
  {
    id: 'p4',
    name: 'Ramesh Yadav',
    mobile: '9900112233',
    lastVisitDate: '10/02/2026',
    lastClinic: 'Shree Clinic, Hubli',
    syncedToCloud: true,
  },
  {
    id: 'p5',
    name: 'Sunita Devi Patel',
    mobile: '6745098321',
    lastVisitDate: '05/02/2026',
    lastClinic: 'Shree Clinic, Hubli',
    syncedToCloud: true,
  },
];

// Search result shown in 'has-data' state (partial number typed: 7654321)
const SEARCH_MATCH: Patient = RECENT_PATIENTS[2];

// ─────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────
export default function D2PatientSearchScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('empty');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={C.background} />

      {/* ── Dev state switcher — remove before production ── */}
      <DevStateSwitcher active={screenState} onSwitch={setScreenState} />

      {/* ── Global offline banner — visible only when offline ── */}
      {screenState === 'offline' && <OfflineBanner />}

      {/*
        Layout:
          Header
          Search bar
          Search result / recent list   ← scrollable
          Numeric keypad                ← visually anchored below search
          FAB + Tab bar                 ← fixed at bottom
      */}
      <View style={styles.screen}>
        {/* ── Scrollable upper zone ── */}
        <ScrollView
          style={styles.scrollZone}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header />
          <SearchBar screenState={screenState} />
          <ContentArea screenState={screenState} />
        </ScrollView>

        {/* ── Numeric keypad — replaces system keyboard ── */}
        <NumericKeypad />
      </View>

      {/* ── FAB — New Patient ── */}
      <TouchableOpacity
        style={styles.fab}
        accessibilityLabel="New Patient"
        accessibilityRole="button"
        activeOpacity={0.85}
      >
        <Text style={styles.fabPlus}>+</Text>
        <Text style={styles.fabLabel}>New{'\n'}Patient</Text>
      </TouchableOpacity>

      {/* ── Bottom tab bar ── */}
      <BottomTabBar />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────
function Header() {
  return (
    <View style={styles.header}>
      <Text style={styles.greeting}>Good morning, Dr. Nair</Text>
      <Text style={styles.clinicName}>Shree Clinic, Hubli</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Search bar
// ─────────────────────────────────────────────────────────────
function SearchBar({ screenState }: { screenState: ScreenState }) {
  const isTyping   = screenState === 'has-data';
  const isOffline  = screenState === 'offline';
  const typedValue = '7654321'; // digits typed in "has-data" state

  return (
    <View style={styles.searchWrap}>
      <View style={[
        styles.searchBar,
        isTyping  && styles.searchBarActive,
        isOffline && styles.searchBarOffline,
      ]}>
        <Text style={styles.searchIcon}>🔍</Text>

        {isTyping ? (
          /* Typed digits displayed */
          <Text style={styles.searchTyped}>{typedValue}</Text>
        ) : (
          <Text style={styles.searchPlaceholder}>Search by mobile number</Text>
        )}

        {isTyping && (
          <TouchableOpacity
            style={styles.clearBtn}
            accessibilityLabel="Clear search"
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Content area — switches by state
// ─────────────────────────────────────────────────────────────
function ContentArea({ screenState }: { screenState: ScreenState }) {
  if (screenState === 'empty')    return <EmptyState />;
  if (screenState === 'has-data') return <HasDataState />;
  if (screenState === 'offline')  return <OfflineState />;
  return null;
}

// ── State 1: Empty — no digits typed yet ─────────────────────
function EmptyState() {
  return (
    <View style={styles.section}>
      <SectionLabel>Recent Patients</SectionLabel>
      <View style={styles.patientCard}>
        {RECENT_PATIENTS.map((p, idx) => (
          <PatientRow
            key={p.id}
            patient={p}
            showDivider={idx < RECENT_PATIENTS.length - 1}
          />
        ))}
      </View>
    </View>
  );
}

// ── State 2: Has data — match found while typing ──────────────
function HasDataState() {
  return (
    <View style={styles.section}>
      <SectionLabel>Search Results</SectionLabel>
      <View style={styles.patientCard}>
        <PatientRow patient={SEARCH_MATCH} showDivider={false} />
      </View>

      {/* Prompt if number doesn't match any patient */}
      <View style={styles.notFoundBanner}>
        <View style={styles.notFoundLeft}>
          <Text style={styles.notFoundHeading}>Not the right patient?</Text>
          <Text style={styles.notFoundSub}>
            Finish typing to see more results, or create a new record.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.notFoundBtn}
          accessibilityLabel="Create new patient"
          accessibilityRole="button"
        >
          <Text style={styles.notFoundBtnText}>Create{'\n'}New</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── State 3: Offline — SQLite local search only ───────────────
function OfflineState() {
  return (
    <View style={styles.section}>
      {/* Offline context card — first-class design state per PM constraint */}
      <View style={styles.offlineContextCard}>
        <View style={styles.offlineContextIcon}>
          <Text style={styles.offlineContextIconText}>📶</Text>
        </View>
        <View style={styles.offlineContextBody}>
          <Text style={styles.offlineContextTitle}>Searching local records</Text>
          <Text style={styles.offlineContextDesc}>
            No internet connection. Results show patients cached on this device.
            New registrations will sync when you're back online.
          </Text>
        </View>
      </View>

      <SectionLabel>Recent Patients — Local Cache</SectionLabel>
      <View style={styles.patientCard}>
        {RECENT_PATIENTS.map((p, idx) => (
          <PatientRow
            key={p.id}
            patient={p}
            showDivider={idx < RECENT_PATIENTS.length - 1}
            showSyncStatus    // show cloud/local badge in offline state
          />
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Patient row
// ─────────────────────────────────────────────────────────────
interface PatientRowProps {
  patient: Patient;
  showDivider: boolean;
  showSyncStatus?: boolean;
}

function PatientRow({ patient, showDivider, showSyncStatus = false }: PatientRowProps) {
  return (
    <TouchableOpacity
      style={[styles.patientRow, showDivider && styles.patientRowDivider]}
      accessibilityLabel={
        `${patient.name}, ${formatMobile(patient.mobile)}, ` +
        `last visit ${patient.lastVisitDate}`
      }
      accessibilityRole="button"
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initials(patient.name)}</Text>
      </View>

      {/* Info block */}
      <View style={styles.patientMeta}>
        <View style={styles.patientNameRow}>
          <Text style={styles.patientName} numberOfLines={1}>
            {patient.name}
          </Text>
          {showSyncStatus && !patient.syncedToCloud && (
            <View style={styles.localBadge}>
              <Text style={styles.localBadgeText}>Local only</Text>
            </View>
          )}
          {showSyncStatus && patient.syncedToCloud && (
            <View style={styles.syncedBadge}>
              <Text style={styles.syncedBadgeText}>✓ Synced</Text>
            </View>
          )}
        </View>
        <Text style={styles.patientMobile}>{formatMobile(patient.mobile)}</Text>
        <Text style={styles.patientVisit}>Last visit: {patient.lastVisitDate}</Text>
      </View>

      {/* Chevron */}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// Numeric keypad — replaces system keyboard
// Doctors enter phone numbers using this; reduces friction
// ─────────────────────────────────────────────────────────────
const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['',  '0', '⌫'],
] as const;

function NumericKeypad() {
  return (
    <View style={styles.keypad}>
      {KEYPAD_ROWS.map((row, rIdx) => (
        <View key={rIdx} style={styles.keypadRow}>
          {row.map((key, kIdx) => {
            const isEmpty    = key === '';
            const isBackspace = key === '⌫';
            return (
              <TouchableOpacity
                key={kIdx}
                style={[styles.keypadKey, isEmpty && styles.keypadKeyBlank]}
                disabled={isEmpty}
                activeOpacity={0.6}
                accessibilityLabel={
                  isBackspace ? 'Delete' : isEmpty ? undefined : `Digit ${key}`
                }
                accessibilityRole={isEmpty ? undefined : 'button'}
              >
                <Text style={[
                  styles.keypadKeyText,
                  isBackspace && styles.keypadBackspaceText,
                ]}>
                  {key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Bottom tab bar — Doctor app navigation
// ─────────────────────────────────────────────────────────────
interface TabDef {
  label: string;
  icon:  string;
  active?: boolean;
  orange?: boolean;
}

const TABS: TabDef[] = [
  { label: 'Patients', icon: '👤',  active: true  },
  { label: 'Today',   icon: '📋'                  },
  { label: 'Scan',    icon: '📷',   orange: true  },
  { label: 'Profile', icon: '⚙️'                  },
];

function BottomTabBar() {
  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => (
        <TouchableOpacity
          key={tab.label}
          style={styles.tabItem}
          accessibilityLabel={tab.label}
          accessibilityRole="tab"
          accessibilityState={{ selected: tab.active }}
        >
          <Text style={[
            styles.tabIcon,
            tab.orange && styles.tabIconOrange,
          ]}>
            {tab.icon}
          </Text>
          <Text style={[
            styles.tabLabel,
            tab.active && styles.tabLabelActive,
            tab.orange && styles.tabLabelOrange,
          ]}>
            {tab.label}
          </Text>
          {tab.active && <View style={styles.tabActiveBar} />}
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Offline banner — appears at top when offline
// ─────────────────────────────────────────────────────────────
function OfflineBanner() {
  return (
    <View style={styles.offlineBanner}>
      <View style={styles.offlineDot} />
      <Text style={styles.offlineBannerText}>
        Offline — changes will sync when connected
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Dev state switcher (mockup only — remove in production)
// ─────────────────────────────────────────────────────────────
function DevStateSwitcher({
  active,
  onSwitch,
}: {
  active:    ScreenState;
  onSwitch:  (s: ScreenState) => void;
}) {
  const states: ScreenState[] = ['empty', 'has-data', 'offline'];
  return (
    <View style={styles.devSwitcher}>
      <Text style={styles.devSwitcherLabel}>Mockup state →</Text>
      <View style={styles.devSwitcherRow}>
        {states.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.devBtn, active === s && styles.devBtnActive]}
            onPress={() => onSwitch(s)}
            accessibilityLabel={`Switch to ${s} state`}
          >
            <Text style={[
              styles.devBtnText,
              active === s && styles.devBtnTextActive,
            ]}>
              {s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function formatMobile(mobile: string): string {
  // +91 XXXXX XXXXX  (Indian standard display)
  return `+91 ${mobile.slice(0, 5)} ${mobile.slice(5)}`;
}

// ─────────────────────────────────────────────────────────────
// Styles — React Native StyleSheet (no Tailwind)
// Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32
// Touch targets: minimum 48×48px (WCAG AA)
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // ── Layout ────────────────────────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: C.background,
  },
  screen: {
    flex: 1,
  },
  scrollZone: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },

  // ── Dev switcher (strip before production) ────────────────
  devSwitcher: {
    backgroundColor: '#1A202C',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  devSwitcherLabel: {
    color: '#718096',
    fontSize: 11,
    fontWeight: '500',
    marginRight: 8,
  },
  devSwitcherRow: {
    flexDirection: 'row',
  },
  devBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#4A5568',
    marginRight: 6,
  },
  devBtnActive: {
    backgroundColor: C.primaryBlue,
    borderColor: C.primaryBlue,
  },
  devBtnText: {
    color: '#718096',
    fontSize: 11,
  },
  devBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },

  // ── Offline banner ────────────────────────────────────────
  offlineBanner: {
    backgroundColor: '#FFFBEB',
    borderBottomWidth: 1,
    borderBottomColor: '#FCD34D',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.warning,
    marginRight: 8,
  },
  offlineBannerText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '600',
    color: C.primaryDark,
  },
  clinicName: {
    fontSize: 14,
    color: C.textSecondary,
    marginTop: 2,
  },

  // ── Search bar ────────────────────────────────────────────
  searchWrap: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: C.border,
    height: 54,
    paddingHorizontal: 14,
  },
  searchBarActive: {
    borderColor: C.primaryBlue,
    // Subtle active ring
    shadowColor: C.primaryBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  searchBarOffline: {
    borderColor: '#FCD34D',
    backgroundColor: '#FFFDF5',
  },
  searchIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 16,
    color: C.textDisabled,
  },
  searchTyped: {
    flex: 1,
    fontSize: 22,
    fontWeight: '500',
    color: C.textPrimary,
    letterSpacing: 2,
  },
  clearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearBtnText: {
    fontSize: 12,
    color: C.textSecondary,
    fontWeight: '600',
  },

  // ── Section layout ────────────────────────────────────────
  section: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },

  // ── Patient card container ────────────────────────────────
  patientCard: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
  },

  // ── Patient row ───────────────────────────────────────────
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 72, // touch target
  },
  patientRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primaryBlue,
  },
  patientMeta: {
    flex: 1,
    minWidth: 0,
  },
  patientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  patientName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textPrimary,
    flexShrink: 1,
    marginRight: 6,
  },
  patientMobile: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 2,
  },
  patientVisit: {
    fontSize: 12,
    color: C.textDisabled,
    marginTop: 1,
  },
  chevron: {
    fontSize: 26,
    color: C.textDisabled,
    paddingLeft: 8,
  },

  // ── Sync status badges (offline state) ───────────────────
  localBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  localBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
  },
  syncedBadge: {
    backgroundColor: '#DCFCE7',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  syncedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#15803D',
  },

  // ── Not found prompt (has-data state) ────────────────────
  notFoundBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    padding: 14,
    marginTop: 12,
  },
  notFoundLeft: {
    flex: 1,
    marginRight: 12,
  },
  notFoundHeading: {
    fontSize: 14,
    fontWeight: '600',
    color: C.primaryDark,
  },
  notFoundSub: {
    fontSize: 12,
    color: C.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  notFoundBtn: {
    backgroundColor: C.primaryBlue,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 64,
    minHeight: 48,
    justifyContent: 'center',
  },
  notFoundBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 16,
  },

  // ── Offline context card (offline state) ─────────────────
  offlineContextCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCD34D',
    padding: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  offlineContextIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  offlineContextIconText: {
    fontSize: 18,
  },
  offlineContextBody: {
    flex: 1,
  },
  offlineContextTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  offlineContextDesc: {
    fontSize: 12,
    color: '#A16207',
    marginTop: 3,
    lineHeight: 17,
  },

  // ── Numeric keypad ────────────────────────────────────────
  keypad: {
    backgroundColor: C.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  keypadRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  keypadKey: {
    flex: 1,
    height: 52,
    marginHorizontal: 4,
    backgroundColor: C.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    // Subtle key shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
  },
  keypadKeyBlank: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
  },
  keypadKeyText: {
    fontSize: 22,
    fontWeight: '400',
    color: C.textPrimary,
  },
  keypadBackspaceText: {
    fontSize: 20,
    color: C.textSecondary,
  },

  // ── FAB — New Patient ─────────────────────────────────────
  fab: {
    position: 'absolute',
    // Sits above the keypad, anchored right
    // Bottom = tabBar(72) + keypad(~236) + 12 gap — approximated for mockup
    bottom: 320,
    right: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    // FAB shadow
    shadowColor: C.primaryBlue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  fabPlus: {
    fontSize: 24,
    fontWeight: '300',
    color: '#FFFFFF',
    lineHeight: 26,
    marginBottom: -2,
  },
  fabLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 10,
    letterSpacing: 0.3,
  },

  // ── Bottom tab bar ────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderTopWidth: 1,
    borderTopColor: C.border,
    height: 72,
    paddingBottom: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    position: 'relative',
  },
  tabIcon: {
    fontSize: 22,
  },
  tabIconOrange: {
    color: C.scanOrange,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: C.textSecondary,
    marginTop: 2,
  },
  tabLabelActive: {
    color: C.primaryBlue,
    fontWeight: '700',
  },
  tabLabelOrange: {
    color: C.scanOrange,
    fontWeight: '700',
  },
  tabActiveBar: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: C.primaryBlue,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
