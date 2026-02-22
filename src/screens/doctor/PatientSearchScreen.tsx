/**
 * PatientSearchScreen.tsx — D2: Patient Search / Home (live)
 *
 * Screen:   D2 — Patient Search / Home
 * Spec:     docs/ui-ux-spec.md → D2
 * API:      docs/api-contracts.md → GET /patients/lookup
 * Data:     docs/data-models.md → Patient
 * Sync:     docs/offline-sync-spec.md → Offline SQLite as primary path
 *
 * Build constraint (docs/project-state.md):
 *   SQLite is the PRIMARY search path — it runs on every keystroke.
 *   The network path layers on top, only activating at 10 digits + online.
 *
 * Data flow:
 *   1. Mount   → getRecentPatients() from SQLite
 *   2. Typing  → searchPatientsByMobile() from SQLite on every digit (≥3)
 *   3. 10 digits + online → useQuery fires lookupPatient() via GET /patients/lookup
 *   4. Server hit → upsertPatientFromServer() caches result back to SQLite
 *   5. All writes (New Patient button) go through D5 (NewPatientForm), which
 *      writes to SQLite and calls enqueueOperation() before any server call.
 *
 * Images: S3 deferred — device local storage only (docs/project-state.md).
 *
 * Prerequisite: App.tsx must provide:
 *   <SQLiteProvider databaseName="medrecord.db" onInit={initializeDatabase}>
 *     <QueryClientProvider client={queryClient}>
 *       ...
 *     </QueryClientProvider>
 *   </SQLiteProvider>
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { useSQLiteContext } from 'expo-sqlite';

import { Colors } from '../../constants/theme';
import { formatMobile, initials, formatDateForDisplay } from '../../utils/formatters';
import { useNetworkStatus } from '../../utils/useNetworkStatus';
import { useAuthStore } from '../../store/useAuthStore';
import { lookupPatient } from '../../api/patients';
import {
  LocalPatient,
  getRecentPatients,
  searchPatientsByMobile,
  upsertPatientFromServer,
} from '../../db/patients';

// ─────────────────────────────────────────────────────────────
// Keypad layout
// ─────────────────────────────────────────────────────────────
const KEYPAD_ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['',  '0', '⌫'],
] as const;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────
export default function PatientSearchScreen() {
  const db         = useSQLiteContext();
  const { token, user } = useAuthStore();
  const isOnline   = useNetworkStatus();
  const navigation = useNavigation<any>();

  const [query, setQuery]                   = useState('');
  const [recentPatients, setRecentPatients] = useState<LocalPatient[]>([]);
  const [localResults, setLocalResults]     = useState<LocalPatient[]>([]);

  // ── Load recent patients once on mount ────────────────────
  useEffect(() => {
    getRecentPatients(db, user!.id).then(setRecentPatients);
  }, [db]);

  // ── SQLite search on every query change ──────────────────
  // Fires immediately from 3 digits to give instant local feedback.
  useEffect(() => {
    if (query.length < 3) {
      setLocalResults([]);
      return;
    }
    searchPatientsByMobile(db, query, user!.id).then(setLocalResults);
  }, [db, query, user]);

  // ── Server lookup via React Query ────────────────────────
  // Enabled only at exactly 10 digits while online.
  // retry: false — a 404 is a valid "not found", not a transient failure.
  const { data: serverPatient, isLoading: serverLoading } = useQuery({
    queryKey: ['patient-lookup', query],
    queryFn:  () => lookupPatient(query, token!),
    enabled:  isOnline && query.length === 10 && !!token,
    staleTime: 30_000,
    retry:    false,
  });

  // ── Cache server result back to SQLite ───────────────────
  // Runs after a successful server lookup so the patient is available
  // for future offline searches on this device.
  useEffect(() => {
    if (!serverPatient) return;

    upsertPatientFromServer(db, {
      doctor_id:       user!.id,
      server_id:       serverPatient.id,
      mobile_number:   serverPatient.mobile_number,
      name:            serverPatient.name,
      date_of_birth:   serverPatient.date_of_birth,
      gender:          serverPatient.gender,
      consent_granted: serverPatient.consent_granted,
      last_visit_date: serverPatient.last_visit_date,
    }).then(() => {
      // Refresh local results so the cached patient appears immediately
      searchPatientsByMobile(db, query, user!.id).then(setLocalResults);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPatient]);

  // ── Derived display state ────────────────────────────────
  const isTyping     = query.length > 0;
  const isFullNumber = query.length === 10;
  const hasResults   = localResults.length > 0;
  // Show spinner only when API is in flight and we have no local results yet
  const showLoading  = isFullNumber && serverLoading && !hasResults;
  // Show "no match" only once both local and server have returned nothing
  const showNoMatch  = isFullNumber && !serverLoading && !hasResults;
  // FAB visible when there are no inline results — no-match and empty states
  // use the FAB as the sole create CTA. Has-data hides FAB in favour of the
  // inline "Not the right patient?" card.
  const showFab      = !isTyping || showNoMatch;

  // ── Keypad ───────────────────────────────────────────────
  const handleKeyPress = useCallback(
    (key: string) => {
      if (key === '⌫') {
        setQuery((q) => q.slice(0, -1));
      } else if (query.length < 10) {
        setQuery((q) => q + key);
      }
    },
    [query.length],
  );

  const handleClear = useCallback(() => setQuery(''), []);

  // ── Web keyboard support (Expo web preview only) ─────────
  // The custom keypad replaces the system keyboard on mobile.
  // On web, physical keyboard events must drive the same state.
  // Uses functional setQuery so the effect is stable (runs once).
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setQuery((q) => (q.length < 10 ? q + e.key : q));
      } else if (e.key === 'Backspace') {
        setQuery((q) => q.slice(0, -1));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Navigation ───────────────────────────────────────────
  // D3 (PatientDetail) and D5 (NewPatientForm) are the next screens to build.
  const handlePatientPress = useCallback(
    (patient: LocalPatient) => {
      navigation.navigate('PatientDetail', {
        patientLocalId:  patient.local_id,
        patientServerId: patient.server_id,
        consentGranted:  patient.consent_granted,
      });
    },
    [navigation],
  );

  const handleCreateNew = useCallback(() => {
    navigation.navigate('NewPatientForm', { prefillMobile: query });
  }, [navigation, query]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />

      {/* ── Global offline banner — only visible when offline ── */}
      {!isOnline && <OfflineBanner />}

      <View style={styles.screen}>
        {/* ── Scrollable upper zone ── */}
        <ScrollView
          style={styles.scrollZone}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Header
            greeting={getGreeting()}
            doctorName={user?.name ?? 'Doctor'}
            clinicName={user?.clinic_name ?? null}
          />

          <SearchBar
            query={query}
            isOnline={isOnline}
            onClear={handleClear}
          />

          <ContentArea
            isTyping={isTyping}
            isOnline={isOnline}
            hasResults={hasResults}
            showLoading={showLoading}
            showNoMatch={showNoMatch}
            query={query}
            recentPatients={recentPatients}
            localResults={localResults}
            onPatientPress={handlePatientPress}
            onCreateNew={handleCreateNew}
          />
        </ScrollView>

        {/* ── Numeric keypad — replaces system keyboard ── */}
        <NumericKeypad onKeyPress={handleKeyPress} />
      </View>

      {/* ── FAB — New Patient ── */}
      {/* Shown in empty + no-match states only. Hidden when inline results card */}
      {/* is visible (has-data state) to prevent two create CTAs simultaneously. */}
      {showFab && (
        <TouchableOpacity
          style={styles.fab}
          onPress={handleCreateNew}
          accessibilityLabel="New Patient"
          accessibilityRole="button"
          activeOpacity={0.85}
        >
          <Text style={styles.fabPlus}>+</Text>
          <Text style={styles.fabLabel}>New{'\n'}Patient</Text>
        </TouchableOpacity>
      )}

      {/* ── Bottom tab bar ── */}
      <BottomTabBar />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────
function Header({
  greeting,
  doctorName,
  clinicName,
}: {
  greeting:   string;
  doctorName: string;
  clinicName: string | null;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.greeting}>{greeting}, {doctorName}</Text>
      {clinicName !== null && (
        <Text style={styles.clinicName}>{clinicName}</Text>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Search bar
// ─────────────────────────────────────────────────────────────
function SearchBar({
  query,
  isOnline,
  onClear,
}: {
  query:    string;
  isOnline: boolean;
  onClear:  () => void;
}) {
  const isTyping = query.length > 0;

  return (
    <View style={styles.searchWrap}>
      <View style={[
        styles.searchBar,
        isTyping  && styles.searchBarActive,
        !isOnline && styles.searchBarOffline,
      ]}>
        <Text style={styles.searchIcon}>🔍</Text>

        {isTyping ? (
          <Text style={styles.searchTyped}>{query}</Text>
        ) : (
          <Text style={styles.searchPlaceholder}>Search by mobile number</Text>
        )}

        {isTyping && (
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={onClear}
            accessibilityLabel="Clear search"
            accessibilityRole="button"
          >
            <Text style={styles.clearBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Content area — switches on derived state
// ─────────────────────────────────────────────────────────────
interface ContentAreaProps {
  isTyping:       boolean;
  isOnline:       boolean;
  hasResults:     boolean;
  showLoading:    boolean;
  showNoMatch:    boolean;
  query:          string;
  recentPatients: LocalPatient[];
  localResults:   LocalPatient[];
  onPatientPress: (p: LocalPatient) => void;
  onCreateNew:    () => void;
}

function ContentArea(props: ContentAreaProps) {
  const {
    isTyping, isOnline, hasResults, showLoading, showNoMatch,
    query, recentPatients, localResults, onPatientPress, onCreateNew,
  } = props;

  if (!isTyping) {
    return (
      <RecentPatientsSection
        patients={recentPatients}
        isOnline={isOnline}
        onPatientPress={onPatientPress}
      />
    );
  }

  if (showLoading) {
    return <SearchLoadingSection />;
  }

  if (showNoMatch) {
    return <NoMatchSection mobile={query} />;
  }

  // Results found (from local SQLite, possibly updated from server cache)
  return (
    <SearchResultsSection
      results={localResults}
      isOnline={isOnline}
      onPatientPress={onPatientPress}
      onCreateNew={onCreateNew}
    />
  );
}

// ── Section: recent patients (no query typed) ─────────────────
function RecentPatientsSection({
  patients,
  isOnline,
  onPatientPress,
}: {
  patients:       LocalPatient[];
  isOnline:       boolean;
  onPatientPress: (p: LocalPatient) => void;
}) {
  return (
    <View style={styles.section}>
      {!isOnline && <OfflineContextCard />}
      <SectionLabel>
        {isOnline ? 'Recent Patients' : 'Recent Patients — Local Cache'}
      </SectionLabel>

      {patients.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No patients yet. Tap + to add the first one.
          </Text>
        </View>
      ) : (
        <View style={styles.patientCard}>
          {patients.map((p, idx) => (
            <PatientRow
              key={p.local_id}
              patient={p}
              showDivider={idx < patients.length - 1}
              showSyncStatus={!isOnline}
              maskMobile
              onPress={() => onPatientPress(p)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Section: search results (typing, has local matches) ────────
function SearchResultsSection({
  results,
  isOnline,
  onPatientPress,
  onCreateNew,
}: {
  results:        LocalPatient[];
  isOnline:       boolean;
  onPatientPress: (p: LocalPatient) => void;
  onCreateNew:    () => void;
}) {
  return (
    <View style={styles.section}>
      {!isOnline && <OfflineContextCard compact />}
      <SectionLabel>Search Results</SectionLabel>

      <View style={styles.patientCard}>
        {results.map((p, idx) => (
          <PatientRow
            key={p.local_id}
            patient={p}
            showDivider={idx < results.length - 1}
            showSyncStatus={!isOnline}
            onPress={() => onPatientPress(p)}
          />
        ))}
      </View>

      {/* Prompt shown while typing — doctor may still be mid-number */}
      <View style={styles.notFoundBanner}>
        <View style={styles.notFoundLeft}>
          <Text style={styles.notFoundHeading}>Not the right patient?</Text>
          <Text style={styles.notFoundSub}>
            Finish typing to see more results, or create a new record.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.notFoundBtn}
          onPress={onCreateNew}
          accessibilityLabel="Create new patient"
          accessibilityRole="button"
        >
          <Text style={styles.notFoundBtnText}>Create{'\n'}New</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Section: loading (10 digits, API in flight, no local hit yet) ──
function SearchLoadingSection() {
  return (
    <View style={styles.section}>
      <View style={styles.loadingCard}>
        <ActivityIndicator size="small" color={Colors.primaryBlue} />
        <Text style={styles.loadingText}>Searching…</Text>
      </View>
    </View>
  );
}

// ── Section: no match (10 digits, local + server both empty) ───
// Create CTA is the FAB — do not add a second button here.
function NoMatchSection({ mobile }: { mobile: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.noMatchCard}>
        <Text style={styles.noMatchIcon}>🔍</Text>
        <Text style={styles.noMatchHeading}>No patient found</Text>
        <Text style={styles.noMatchSub}>
          No record matches {formatMobile(mobile)}.{'\n'}
          Is this a new patient? Tap + to create a new record.
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Patient row
// ─────────────────────────────────────────────────────────────
interface PatientRowProps {
  patient:         LocalPatient;
  showDivider:     boolean;
  showSyncStatus?: boolean;
  maskMobile?:     boolean;
  onPress:         () => void;
}

function PatientRow({
  patient,
  showDivider,
  showSyncStatus = false,
  maskMobile = false,
  onPress,
}: PatientRowProps) {
  const isSynced      = patient.synced_at !== null;
  // Fall back to formatted mobile if no name — some patients decline to share
  const displayName   = patient.name ?? formatMobile(patient.mobile_number);
  const displayDate   = formatDateForDisplay(patient.last_visit_date);
  const avatarInitials = patient.name ? initials(patient.name) : '?';

  return (
    <TouchableOpacity
      style={[styles.patientRow, showDivider && styles.patientRowDivider]}
      onPress={onPress}
      accessibilityLabel={
        `${displayName}, ${formatMobile(patient.mobile_number)}, ` +
        (displayDate ? `last visit ${displayDate}` : 'no previous visit')
      }
      accessibilityRole="button"
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{avatarInitials}</Text>
      </View>

      {/* Info block */}
      <View style={styles.patientMeta}>
        <View style={styles.patientNameRow}>
          <Text style={styles.patientName} numberOfLines={1}>
            {displayName}
          </Text>
          {showSyncStatus && !isSynced && (
            <View style={styles.localBadge}>
              <Text style={styles.localBadgeText}>Local only</Text>
            </View>
          )}
          {showSyncStatus && isSynced && (
            <View style={styles.syncedBadge}>
              <Text style={styles.syncedBadgeText}>✓ Synced</Text>
            </View>
          )}
        </View>

        <Text style={styles.patientMobile}>
          {formatMobile(patient.mobile_number, maskMobile)}
        </Text>

        {displayDate !== null && (
          <Text style={styles.patientVisit}>Last visit: {displayDate}</Text>
        )}
      </View>

      {/* Chevron */}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// Numeric keypad — replaces system keyboard
// Doctors enter phone numbers using this; reduces friction on
// shared clinic devices that may have IME issues.
// ─────────────────────────────────────────────────────────────
function NumericKeypad({ onKeyPress }: { onKeyPress: (key: string) => void }) {
  return (
    <View style={styles.keypad}>
      {KEYPAD_ROWS.map((row, rIdx) => (
        <View key={rIdx} style={styles.keypadRow}>
          {row.map((key, kIdx) => {
            const isEmpty     = key === '';
            const isBackspace = key === '⌫';
            return (
              <TouchableOpacity
                key={kIdx}
                style={[styles.keypadKey, isEmpty && styles.keypadKeyBlank]}
                disabled={isEmpty}
                onPress={() => !isEmpty && onKeyPress(key)}
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
  label:   string;
  icon:    string;
  active?: boolean;
  orange?: boolean;
}

const TABS: TabDef[] = [
  { label: 'Patients', icon: '👤', active: true },
  { label: 'Today',   icon: '📋'               },
  { label: 'Scan',    icon: '📷', orange: true  },
  { label: 'Profile', icon: '⚙️'               },
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
          <Text style={[styles.tabIcon, tab.orange && styles.tabIconOrange]}>
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
// Offline banner — amber bar at top of screen
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
// Offline context card — inline reminder within content sections
// compact=true omits the explanatory paragraph (used in search results)
// ─────────────────────────────────────────────────────────────
function OfflineContextCard({ compact = false }: { compact?: boolean }) {
  return (
    <View style={[styles.offlineContextCard, compact && styles.offlineContextCardCompact]}>
      <View style={styles.offlineContextIcon}>
        <Text style={styles.offlineContextIconText}>📶</Text>
      </View>
      <View style={styles.offlineContextBody}>
        <Text style={styles.offlineContextTitle}>Searching local records</Text>
        {!compact && (
          <Text style={styles.offlineContextDesc}>
            No internet connection. Results show patients cached on this device.
            New registrations will sync when you're back online.
          </Text>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// ─────────────────────────────────────────────────────────────
// Styles — React Native StyleSheet (no Tailwind)
// Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32
// Touch targets: minimum 48×48px (WCAG AA — ui-ux-spec.md)
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // ── Layout ────────────────────────────────────────────────
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
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
    backgroundColor: Colors.warning,
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
    color: Colors.primaryDark,
  },
  clinicName: {
    fontSize: 14,
    color: Colors.textSecondary,
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
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.border,
    height: 54,
    paddingHorizontal: 14,
  },
  searchBarActive: {
    borderColor: Colors.primaryBlue,
    shadowColor: Colors.primaryBlue,
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
    color: Colors.textDisabled,
  },
  searchTyped: {
    flex: 1,
    fontSize: 22,
    fontWeight: '500',
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  clearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  clearBtnText: {
    fontSize: 12,
    color: Colors.textSecondary,
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
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 4,
  },

  // ── Patient card container ────────────────────────────────
  patientCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },

  // ── Patient row ───────────────────────────────────────────
  patientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 72,
  },
  patientRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
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
    color: Colors.primaryBlue,
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
    color: Colors.textPrimary,
    flexShrink: 1,
    marginRight: 6,
  },
  patientMobile: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  patientVisit: {
    fontSize: 12,
    color: Colors.textDisabled,
    marginTop: 1,
  },
  chevron: {
    fontSize: 26,
    color: Colors.textDisabled,
    paddingLeft: 8,
  },

  // ── Sync status badges ────────────────────────────────────
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

  // ── Empty state ───────────────────────────────────────────
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },

  // ── Loading state ─────────────────────────────────────────
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginLeft: 12,
  },

  // ── "Not the right patient?" prompt ──────────────────────
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
    color: Colors.primaryDark,
  },
  notFoundSub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 17,
  },
  notFoundBtn: {
    backgroundColor: Colors.primaryBlue,
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

  // ── No match state ────────────────────────────────────────
  noMatchCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  noMatchIcon: {
    fontSize: 32,
    marginBottom: 12,
  },
  noMatchHeading: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 6,
  },
  noMatchSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  noMatchCreateBtn: {
    backgroundColor: Colors.primaryBlue,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    minWidth: 200,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  noMatchCreateBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ── Offline context card ──────────────────────────────────
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
  offlineContextCardCompact: {
    marginBottom: 12,
    padding: 10,
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
    backgroundColor: Colors.background,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  keypadRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  keypadKey: {
    flex: 1,
    height: 52,
    marginHorizontal: 4,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: Colors.textPrimary,
  },
  keypadBackspaceText: {
    fontSize: 20,
    color: Colors.textSecondary,
  },

  // ── FAB — New Patient ─────────────────────────────────────
  fab: {
    position: 'absolute',
    // TODO (SHOULD FIX — project-state.md tech debt):
    // bottom: 320 is fragile across device heights.
    // Needs flex-based positioning before production build.
    bottom: 320,
    right: 16,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primaryBlue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.primaryBlue,
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
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 12,
    letterSpacing: 0.3,
  },

  // ── Bottom tab bar ────────────────────────────────────────
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
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
    color: Colors.scanOrange,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondary,
    marginTop: 2,
  },
  tabLabelActive: {
    color: Colors.primaryBlue,
    fontWeight: '700',
  },
  tabLabelOrange: {
    color: Colors.scanOrange,
    fontWeight: '700',
  },
  tabActiveBar: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    height: 2,
    backgroundColor: Colors.primaryBlue,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
});
