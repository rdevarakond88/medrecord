/**
 * PatientDetailScreen.tsx — D3: Patient Detail / History (live)
 *
 * Screen:  D3 — Patient Detail / History
 * Spec:    docs/ui-ux-spec.md → D3
 * API:     docs/api-contracts.md → GET /patients/:serverId/visits
 * Data:    docs/data-models.md → Patient, Visit
 * Consent: docs/consent-layer-spec.md — all consent checks are server-side
 *
 * Build constraints (docs/project-state.md):
 *   D3-H-1: API returns two separate lists — myVisits (always) + otherDoctorVisits
 *           (consent-gated, chiefComplaint excluded at query layer, not just UI).
 *   D3-H-2: Server consent re-fetch completes before visit history renders.
 *           Loading skeleton on mount; offline fallback to SQLite cache only when
 *           isConnected === false. Nav param is the initial signal only, not the gate.
 *   D3-H-3: Synchronous auth guard — if (!token || !user) return null — before JSX.
 *           Same pattern as PatientSearchScreen.tsx line 244.
 *
 * Data flow:
 *   1. Mount → read patient from SQLite by localId (instant — header renders immediately)
 *   2. Every focus → loading skeleton → getPatientVisits() server call
 *      a. Online:  server returns visits + authoritative consentGranted + checkedAt
 *      b. Offline: getCachedVisits() from SQLite; use SQLite consentGranted from nav param
 *   3. Server visits → upsertVisitsFromServer() into SQLite cache
 *   4. Visit history rendered only after server call resolves (D3-H-2)
 *   5. When D9 (consent flow) returns, useFocusEffect fires → re-verifies consent
 *
 * Prerequisite: App.tsx must provide SQLiteProvider + QueryClientProvider (same as D2).
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  Alert,
  AppState,
  AppStateStatus,
  View,
  Text,
  FlatList,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute, RouteProp, useFocusEffect } from '@react-navigation/native';
import { useSQLiteContext } from 'expo-sqlite';

import { Colors } from '../../constants/theme';
import { formatDateForDisplay } from '../../utils/formatters';
import { useNetworkStatus } from '../../utils/useNetworkStatus';
import { useAuthStore } from '../../store/useAuthStore';
import { ApiError } from '../../api/apiClient';
import { getPatientVisits } from '../../api/visits';
import { LocalPatient, getPatientByLocalId } from '../../db/patients';
import {
  LocalVisit,
  getCachedVisits,
  getPendingDraftVisits,
  getSyncedDraftVisitsNotInServer,
  upsertVisitsFromServer,
  logConsentAccess,
} from '../../db/visits';

// ─────────────────────────────────────────────────────────────
// Navigation types
// ─────────────────────────────────────────────────────────────

type PatientDetailParams = {
  PatientDetail: {
    patientLocalId:  string;
    patientServerId: string | null;
    consentGranted:  boolean;   // initial signal only — server re-fetch is the gate (D3-H-2)
  };
};

// ─────────────────────────────────────────────────────────────
// FlatList item types — header rows + visit rows in one list
// ─────────────────────────────────────────────────────────────

type VisitListItem =
  | { kind: 'section_header'; label: string }
  | { kind: 'visit'; visit: LocalVisit; grayed: boolean };

// ─────────────────────────────────────────────────────────────
// Load state
// ─────────────────────────────────────────────────────────────

type LoadState = 'loading' | 'loaded' | 'error';

// ─────────────────────────────────────────────────────────────
// Root component
// ─────────────────────────────────────────────────────────────

export default function PatientDetailScreen() {
  const db         = useSQLiteContext();
  const navigation = useNavigation<any>();
  const route      = useRoute<RouteProp<PatientDetailParams, 'PatientDetail'>>();
  const isOnline   = useNetworkStatus();
  const { token, user } = useAuthStore();

  // consentGranted nav param is the initial signal only (D3-H-2).
  // H-1: offline path reads consent_granted from SQLite via getPatientByLocalId, not this
  // stale nav param — see fetchData offline path below.
  const { patientLocalId, patientServerId } = route.params;

  // ── Component state ─────────────────────────────────────────
  const [patient,             setPatient]             = useState<LocalPatient | null>(null);
  const [loadState,           setLoadState]           = useState<LoadState>('loading');
  const [fetchError,          setFetchError]          = useState<string | null>(null);
  const [consentGranted,      setConsentGranted]      = useState<boolean>(false);
  const [myVisits,            setMyVisits]            = useState<LocalVisit[]>([]);
  const [otherVisits,         setOtherVisits]         = useState<LocalVisit[]>([]);
  const [lastVerifiedAt,      setLastVerifiedAt]      = useState<string | null>(null);
  const [expandedVisitId,     setExpandedVisitId]     = useState<string | null>(null);
  const [consentRequestSent,  setConsentRequestSent]  = useState(false);
  const [sessionExpired,      setSessionExpired]      = useState(false);
  const [visibleCount,        setVisibleCount]        = useState(20);

  // ── Load patient header from SQLite — immediate, no spinner needed ──
  // Reads the patient row the doctor already has cached from D2.
  useEffect(() => {
    if (!patientLocalId) return;
    getPatientByLocalId(db, patientLocalId).then(setPatient);
  }, [db, patientLocalId]);

  // ── Primary data fetch — consent re-verification + visit history ──
  // Runs on every screen focus (mount, return from D4, return from D9).
  // This is the server-side consent gate required by D3-H-2 and consent-layer-spec.md.
  const fetchData = useCallback(async () => {
    if (!token || !user) return;

    setLoadState('loading');
    setFetchError(null);

    try {
      if (isOnline && patientServerId) {
        // ── Online path: server is authoritative ─────────────
        const result = await getPatientVisits(patientServerId, token);

        // Cache both lists to SQLite for offline fallback — doctor-scoped (H-2)
        await upsertVisitsFromServer(db, result.my_visits, true, patientServerId, user.id);
        await upsertVisitsFromServer(db, result.other_doctor_visits, false, patientServerId, user.id);

        // Update local consent in SQLite patients table so D2's cache stays fresh
        // (minor hygiene — not a security gate; the server response is the gate)
        await db.runAsync(
          `UPDATE patients SET consent_granted = ?, updated_at = ? WHERE server_id = ?`,
          [result.consent_granted ? 1 : 0, new Date().toISOString(), patientServerId],
        );

        // H-1: refresh patient state so subsequent offline fetchData reads current consent
        const refreshedPatient = await getPatientByLocalId(db, patientLocalId);
        if (refreshedPatient) setPatient(refreshedPatient);

        setConsentGranted(result.consent_granted);

        // BUG-D3-DT1-1 + BUG-D3-DT1-2 fix: merge draft visits that the server response
        // does not yet include. Two failure modes are covered:
        //
        //   Mode 1 (BUG-D3-DT1-1): createVisit() failed silently → sync_status='pending'.
        //     getPendingDraftVisits returns these rows.
        //
        //   Mode 2 (BUG-D3-DT1-2): createVisit() succeeded, markVisitSynced() called →
        //     sync_status='synced'. But GET /patients/:id/visits does not yet return the
        //     new visit (server propagation delay on Render free tier).
        //     getSyncedDraftVisitsNotInServer returns these rows, filtering by server_id
        //     NOT IN the server response to prevent duplicates.
        const serverMapped = result.my_visits.map(adaptMyVisit);
        const serverIds    = result.my_visits.map((v) => v.id);
        const pendingDrafts = await getPendingDraftVisits(
          db, patientServerId, patientLocalId, user.id,
        );
        const syncedDraftsNotOnServer = await getSyncedDraftVisitsNotInServer(
          db, patientServerId, patientLocalId, user.id, serverIds,
        );
        // Merge all three sources; YYYY-MM-DD strings compare correctly for newest-first sort.
        const mergedMyVisits = [...pendingDrafts, ...syncedDraftsNotOnServer, ...serverMapped].sort(
          (a, b) => b.visit_date.localeCompare(a.visit_date),
        );
        setMyVisits(mergedMyVisits);
        setOtherVisits(result.other_doctor_visits.map(adaptOtherVisit));
        setLastVerifiedAt(result.checked_at);

        // Clear "request sent" state once consent is confirmed granted or denied
        setConsentRequestSent(false);
        setLoadState('loaded');

      } else {
        // ── Offline path: SQLite cache ────────────────────────
        // H-1: read consent_granted from SQLite, not from the stale navConsentGranted nav
        // param which was fixed at D2 navigation time and does not reflect revocations
        // written to SQLite by prior online D3 fetches. Fail secure: false if not found.
        const offlineFreshPatient = await getPatientByLocalId(db, patientLocalId);
        const offlineConsent = offlineFreshPatient?.consent_granted ?? false;

        // H-2: scope cache read to this doctor's rows only.
        // M-5: pass patientLocalId so offline-only patients (patientServerId=null)
        // see their draft visits via the OR branch added to getCachedVisits.
        const cached = await getCachedVisits(db, patientServerId, patientLocalId, user.id);

        setConsentGranted(offlineConsent);
        setMyVisits(cached.myVisits);
        // C-1: strip chief_complaint from otherVisits when offline consent is false.
        // The SQLite cache may hold non-null chief_complaint from a prior consented session.
        // Opacity alone is not access control — enforce at the data level (security audit C-1).
        setOtherVisits(
          offlineConsent
            ? cached.otherVisits
            : cached.otherVisits.map((v) => ({ ...v, chief_complaint: null })),
        );
        setLastVerifiedAt(cached.lastSyncAt);
        setLoadState('loaded');
      }

    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Session expired — redirect to login
        setSessionExpired(true);
        setTimeout(() => navigation.replace('Login'), 2000);
        return;
      }

      // Any other error — fail secure: deny consent, show what SQLite has for own visits
      // consent-layer-spec.md: "Never fail open" (QA H-2, security audit HIGH)
      // H-2 + M-5: scope cache read to this doctor; patientLocalId handles offline-only patients
      const cached = await getCachedVisits(db, patientServerId, patientLocalId, user.id);

      setFetchError(
        err instanceof ApiError
          ? err.message
          : 'Could not verify consent — showing limited view.',
      );
      setConsentGranted(false);       // fail secure — do not show history on ambiguous response
      setMyVisits(cached.myVisits);   // own visits safe to show
      setOtherVisits([]);             // no other-doctor visits without confirmed consent
      setLastVerifiedAt(cached.lastSyncAt);
      setLoadState('error');
    }
  }, [db, token, user, isOnline, patientServerId, patientLocalId, navigation]);

  // Re-run fetchData every time this screen comes into focus:
  //   - Initial mount
  //   - Return from D4 (visit detail)
  //   - Return from D9 (consent flow) → handles dynamic consent transition (QA H-3)
  useFocusEffect(
    useCallback(() => {
      void fetchData();
    }, [fetchData]),
  );

  // Re-validate consent on app foreground restore (security audit HIGH)
  // A doctor who backgrounded the app should not have stale consent state on return.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current !== 'active' && nextState === 'active') {
        void fetchData();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, [fetchData]);

  // Emit DPDP consent_accessed audit event when visit history is first displayed.
  // consent-layer-spec.md: patients can request a log of who accessed their data.
  // Event synced to server on reconnect via POST /sync (H-3 pre-merge blocker).
  useEffect(() => {
    if (loadState === 'loaded' && consentGranted && user && patientServerId) {
      void logConsentAccess(db, user.id, patientServerId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState, consentGranted]);

  // ── D3-H-3: Synchronous auth guard — same pattern as PatientSearchScreen.tsx:244 ──
  // All hooks above run unconditionally (React rules of hooks).
  // This guard fires after hooks, before any JSX, so the screen renders nothing
  // to the display when the token is absent.
  if (!token || !user) return null;

  // ── Derived display variant ──────────────────────────────────
  const hasAnyVisits = myVisits.length + otherVisits.length > 0;

  type Variant = 'loading' | 'empty' | 'consent_granted' | 'own_only' | 'no_consent';

  function deriveVariant(): Variant {
    if (loadState === 'loading') return 'loading';
    if (!hasAnyVisits && loadState !== 'error') return 'empty';
    if (consentGranted) return 'consent_granted';
    if (myVisits.length > 0) return 'own_only';
    return 'no_consent';
  }

  const variant = deriveVariant();

  // ── Patient header data ─────────────────────────────────────
  // Falls back gracefully if the SQLite read hasn't resolved yet.
  const mobileLastFive = patient?.mobile_number?.slice(5) ?? '—';
  const patientName    = patient?.name ?? '—';
  const patientAge     = patient?.date_of_birth
    ? Math.floor(
        (Date.now() - new Date(patient.date_of_birth).getTime()) /
        (1000 * 60 * 60 * 24 * 365.25),
      )
    : null;

  // ── Masked mobile for consent request Alert ──────────────────
  // Shows "••••• XXXXX" so the doctor knows exactly which number the SMS targets.
  const maskedMobile = `\u2022\u2022\u2022\u2022\u2022 ${mobileLastFive}`;

  // ── Request Access handler — with offline guard ──────────────
  // Security audit MEDIUM: do not show "Send Request" option when offline.
  function handleRequestAccess() {
    if (!isOnline) {
      Alert.alert(
        'No Connection',
        'Cannot send consent request — no internet connection. The patient can still enter a consent OTP if they received one previously.',
        [{ text: 'OK' }],
      );
      return;
    }
    Alert.alert(
      'Send Consent Request?',
      `This will send an SMS to the patient's registered mobile (${maskedMobile}). The patient must approve before their visit history becomes visible.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          style: 'default',
          onPress: () => {
            setConsentRequestSent(true);
            // TODO: navigate to D9 (Consent Request Flow) when built.
            // navigation.navigate('ConsentRequest', { patientServerId, patientLocalId });
          },
        },
      ],
    );
  }

  // ── Build FlatList data array ───────────────────────────────

  function buildListData(): VisitListItem[] {
    switch (variant) {
      case 'consent_granted': {
        // Combine and sort all visits newest-first (interleaved chronology)
        const allVisits = [...myVisits, ...otherVisits].sort(
          (a, b) => b.visit_date.localeCompare(a.visit_date),
        );
        return [
          { kind: 'section_header', label: 'Visit History' },
          ...allVisits.map((v) => ({ kind: 'visit' as const, visit: v, grayed: false })),
        ];
      }
      case 'own_only':
        return [
          { kind: 'section_header', label: 'My Visits' },
          ...myVisits.map((v) => ({ kind: 'visit' as const, visit: v, grayed: false })),
          { kind: 'section_header', label: 'Other Visits' },
          ...otherVisits.map((v) => ({ kind: 'visit' as const, visit: v, grayed: true })),
        ];
      case 'no_consent':
        // Cap grayed cards at 5 to avoid rendering 50 grayed cards (QA E-3).
        // A summary card is appended if there are more (see ListFooterComponent).
        return [
          { kind: 'section_header', label: 'Visit History' },
          ...otherVisits.slice(0, 5).map((v) => ({
            kind: 'visit' as const,
            visit: v,
            grayed: true,
          })),
        ];
      default:
        return [];
    }
  }

  const allListData   = buildListData();
  const paginatedData = allListData.slice(0, visibleCount);

  function handleLoadMore() {
    if (visibleCount < allListData.length) {
      setVisibleCount((c) => c + 20);
    }
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.surface} />

      {/* ── Banners (always above fold) ── */}
      {sessionExpired && <SessionExpiredBanner />}
      {!isOnline && !sessionExpired && <OfflineBanner lastVerifiedAt={lastVerifiedAt} />}
      {fetchError && !sessionExpired && (
        <ErrorBanner message={fetchError} onRetry={() => void fetchData()} />
      )}

      {/* ── Navigation header ── */}
      <View style={styles.navHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Text style={styles.backButtonText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle} numberOfLines={1}>
          Patient Details
        </Text>
        {/* Edit affordance — stub; profile-edit screen (D-edit) not yet built.
            Staff correct mobile numbers from this screen (persona critique SHOULD FIX). */}
        <TouchableOpacity
          style={styles.editButton}
          accessibilityLabel="Edit patient profile"
          accessibilityRole="button"
          onPress={() => {
            // TODO: navigate to profile-edit screen when built.
            // navigation.navigate('PatientProfileEdit', { patientLocalId });
          }}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
      </View>

      {/* ── Patient header — renders immediately from SQLite (no server wait) ── */}
      <View style={styles.patientHeader}>
        <Text
          style={styles.patientName}
          numberOfLines={1}          // overflow guard for long Indian names (QA M-4)
          ellipsizeMode="tail"
        >
          {patientName}
        </Text>
        <Text style={styles.patientMobile}>
          {/* Last 5 digits only — PII rule, same as D2 (project-state.md MEDIUM debt) */}
          {'\u2022\u2022\u2022\u2022\u2022 '}{mobileLastFive}
        </Text>
        {patientAge !== null && (
          <Text style={styles.patientAge}>{patientAge} years</Text>
        )}
      </View>

      {/* ── Loading skeleton — shown while consent re-fetch is in flight (D3-H-2) ── */}
      {variant === 'loading' ? (
        <LoadingSkeleton />
      ) : (
        <FlatList
          data={paginatedData}
          keyExtractor={(item) =>
            item.kind === 'section_header'
              ? `header-${item.label}`
              : item.visit.server_id
          }
          renderItem={({ item }) => {
            if (item.kind === 'section_header') {
              return <SectionHeader label={item.label} />;
            }
            return (
              <VisitCard
                visit={item.visit}
                grayed={item.grayed}
                expanded={expandedVisitId === item.visit.server_id}
                onPress={
                  item.grayed
                    ? undefined
                    : () =>
                        setExpandedVisitId((prev) =>
                          prev === item.visit.server_id ? null : item.visit.server_id,
                        )
                }
                onViewFullVisit={
                  item.grayed
                    ? undefined
                    : () => {
                        // TODO: navigate to D4 (Visit Detail) when built.
                        // navigation.navigate('VisitDetail', { visitServerId: item.visit.server_id });
                      }
                }
              />
            );
          }}
          // Performance tuning for 200+ visits on low-end Android (QA H-4)
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={10}
          removeClippedSubviews={true}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={
            <ListHeader
              variant={variant}
              consentGranted={consentGranted}
              consentRequestSent={consentRequestSent}
              isOnline={isOnline}
              otherVisitCount={otherVisits.length}
              onNewVisit={() => {
                navigation.navigate('NewVisit', {
                  patientId:       patientLocalId,
                  patientServerId: patientServerId,
                  patientName:     patient?.name ?? 'Patient',
                  patientMobile:   patient?.mobile_number ?? '',
                  consentGranted:  consentGranted,
                });
              }}
              onRequestAccess={handleRequestAccess}
            />
          }
          ListFooterComponent={
            <ListFooter
              variant={variant}
              totalOtherVisits={otherVisits.length}
              visibleCount={visibleCount}
              allDataLength={allListData.length}
              onLoadMore={handleLoadMore}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────
// adaptApiVisit — converts ApiVisit → LocalVisit shape for state
// Visit comes from the server but we use the LocalVisit type throughout
// the component so both the online and offline paths use the same type.
// ─────────────────────────────────────────────────────────────

function adaptApiVisit(
  v: { id: string; visit_date: string; chief_complaint: string | null; clinic_name: string; record_count: number },
  isOwn: boolean = false,
): LocalVisit {
  return {
    server_id:           v.id,
    patient_server_id:   '',    // not needed for display; populated in DB
    visit_date:          v.visit_date,
    chief_complaint:     v.chief_complaint,
    clinic_name:         v.clinic_name,
    record_count:        v.record_count,
    is_own_visit:        isOwn,
    cached_by_doctor_id: '',    // not used for display; populated in DB via upsertVisitsFromServer
    synced_at:           new Date().toISOString(),
    sync_status:         'synced',
  };
}

// Overloads needed because adaptApiVisit is called from two different map() contexts.
// In consent_granted, both lists exist and we know ownership from which list they came.
// This wrapper is only used for the state update — SQLite caching uses upsertVisitsFromServer.
function adaptMyVisit(v: Parameters<typeof adaptApiVisit>[0]): LocalVisit {
  return adaptApiVisit(v, true);
}
function adaptOtherVisit(v: Parameters<typeof adaptApiVisit>[0]): LocalVisit {
  return adaptApiVisit(v, false);
}

// ─────────────────────────────────────────────────────────────
// ListHeader — consent badge + "New Visit" button + consent gate box
// Rendered above the FlatList items so it scrolls with the content.
// ─────────────────────────────────────────────────────────────

interface ListHeaderProps {
  variant:              string;
  consentGranted:       boolean;
  consentRequestSent:   boolean;
  isOnline:             boolean;
  otherVisitCount:      number;
  onNewVisit:           () => void;
  onRequestAccess:      () => void;
}

function ListHeader({
  variant,
  consentGranted,
  consentRequestSent,
  isOnline,
  otherVisitCount,
  onNewVisit,
  onRequestAccess,
}: ListHeaderProps) {
  const showConsentGate = variant === 'no_consent' || variant === 'own_only';
  const isOwnOnly       = variant === 'own_only';
  // Empty state: no consent badge (QA M-5 — "Access Granted" on empty state is misleading)
  const showBadge       = variant !== 'empty';

  return (
    <View style={styles.listHeader}>
      {showBadge && <ConsentBadge granted={consentGranted} />}

      {/* "New Visit" — always active regardless of consent (spec § D3 Behaviour) */}
      <TouchableOpacity
        style={styles.newVisitButton}
        onPress={onNewVisit}
        activeOpacity={0.8}
        accessibilityLabel="New Visit"
        accessibilityRole="button"
      >
        <Text style={styles.newVisitButtonText}>+ New Visit</Text>
      </TouchableOpacity>

      {/* Empty state message */}
      {variant === 'empty' && <EmptyStateView />}

      {/* Consent gate — shown for no_consent and own_only variants */}
      {showConsentGate && (
        <View style={styles.consentGateBox}>
          <Text style={styles.consentGateTitle}>
            {isOwnOnly ? 'Other Doctors\u2019 Visits Hidden' : 'Visit History Hidden'}
          </Text>
          <Text style={styles.consentGateBody}>
            {isOwnOnly
              ? 'Request patient consent to view records from other doctors'
              : 'Request patient consent to view visit history'}
          </Text>

          {consentRequestSent ? (
            /* Request pending — disable button to prevent duplicate SMS (QA E-8) */
            <View style={styles.requestSentBox}>
              <ActivityIndicator size="small" color={Colors.warning} />
              <Text style={styles.requestSentText}>
                Waiting for patient to approve
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.requestAccessButton}
              onPress={onRequestAccess}
              activeOpacity={0.8}
              accessibilityLabel="Request patient consent"
              accessibilityRole="button"
            >
              <Text style={styles.requestAccessButtonText}>Request Access</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ListFooter — load more / grayed-visits summary
// ─────────────────────────────────────────────────────────────

interface ListFooterProps {
  variant:          string;
  totalOtherVisits: number;
  visibleCount:     number;
  allDataLength:    number;
  onLoadMore:       () => void;
}

function ListFooter({
  variant,
  totalOtherVisits,
  visibleCount,
  allDataLength,
  onLoadMore,
}: ListFooterProps) {
  // "Load more" pagination control (QA H-4 / server-side pagination TODO)
  const hasMore = visibleCount < allDataLength;

  // Summary card for no_consent variant when there are > 5 other-doctor visits (QA E-3)
  const showGraySummary = variant === 'no_consent' && totalOtherVisits > 5;

  return (
    <View style={styles.listFooter}>
      {showGraySummary && (
        <View style={styles.graySummaryCard}>
          <Text style={styles.graySummaryText}>
            +{totalOtherVisits - 5} more visits from other doctors.
            Request consent to see all {totalOtherVisits} visits.
          </Text>
        </View>
      )}
      {hasMore && (
        <TouchableOpacity
          style={styles.loadMoreButton}
          onPress={onLoadMore}
          accessibilityLabel="Load more visits"
          accessibilityRole="button"
        >
          <Text style={styles.loadMoreButtonText}>Load More</Text>
        </TouchableOpacity>
      )}
      {/* Bottom padding so last card clears the screen edge */}
      <View style={{ height: 32 }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// VisitCard
// ─────────────────────────────────────────────────────────────

interface VisitCardProps {
  visit:           LocalVisit;
  grayed:          boolean;
  expanded:        boolean;
  onPress?:        () => void;
  onViewFullVisit?: () => void;
}

function VisitCard({ visit, grayed, expanded, onPress, onViewFullVisit }: VisitCardProps) {
  const label      = recordLabel(visit.record_count);
  const dateStr    = formatVisitDate(visit.visit_date);
  const isDraft    = visit.record_count === 0;
  const isUnsynced = visit.sync_status === 'draft';

  return (
    <TouchableOpacity
      style={[styles.visitCard, grayed && styles.visitCardGrayed]}
      onPress={onPress}
      activeOpacity={grayed ? 1 : 0.7}
      disabled={grayed}
      accessibilityLabel={
        grayed
          ? 'Visit history hidden — consent required'
          : `Visit on ${dateStr}${visit.chief_complaint ? ', ' + visit.chief_complaint : ''}, ${label}`
      }
      accessibilityRole="button"
    >
      {/* Top row: date + record count pill + expand chevron */}
      <View style={styles.visitCardTopRow}>
        <Text style={[styles.visitDate, grayed && styles.textGrayed]}>
          {dateStr}
        </Text>
        <View style={styles.visitCardTopRowRight}>
          {isUnsynced && !grayed && (
            <Text style={styles.unsyncedIcon}>{'☁'}</Text>
          )}
          <View style={[styles.recordCountPill, isDraft && styles.draftPill]}>
            <Text style={[styles.recordCountText, grayed && styles.textGrayed, isDraft && styles.draftText]}>
              {label}
            </Text>
          </View>
          {!grayed && (
            <Text style={[styles.expandChevron, expanded && styles.expandChevronOpen]}>
              {'\u203a'}
            </Text>
          )}
        </View>
      </View>

      {/* Chief complaint — omitted cleanly when null (no consent or absent) */}
      {visit.chief_complaint ? (
        <Text
          style={[styles.visitComplaint, grayed && styles.textGrayed]}
          numberOfLines={expanded ? undefined : 2}
        >
          {visit.chief_complaint}
        </Text>
      ) : null}

      {/* Clinic name */}
      <Text style={[styles.visitClinic, grayed && styles.textGrayed]} numberOfLines={1}>
        {visit.clinic_name}
      </Text>

      {/* Expanded inline detail — "View Full Visit" navigates to D4 */}
      {expanded && !grayed && (
        <View style={styles.inlineDetail}>
          <View style={styles.inlineDetailDivider} />
          {/* Record preview is lazy-fetched in a future build when D4 exists and the
              GET /visits/:id/records?first=true endpoint is available.
              Showing the record count as a summary for now. */}
          <Text style={styles.inlineDetailLabel}>RECORDS</Text>
          <Text style={styles.inlineDetailSummary}>
            {visit.record_count === 0
              ? 'No records attached — this visit is a draft.'
              : `${visit.record_count} record${visit.record_count === 1 ? '' : 's'} attached.`}
          </Text>
          {/* "View Full Visit" — min 48px touch target (WCAG AA) */}
          <TouchableOpacity
            style={[styles.viewFullVisitButton, !onViewFullVisit && styles.viewFullVisitButtonDisabled]}
            onPress={onViewFullVisit}
            disabled={!onViewFullVisit}  // disabled until D4 is built (QA M-1)
            accessibilityLabel="View full visit"
            accessibilityRole="button"
          >
            <Text style={[
              styles.viewFullVisitText,
              !onViewFullVisit && styles.viewFullVisitTextDisabled,
            ]}>
              View Full Visit
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function ConsentBadge({ granted }: { granted: boolean }) {
  const badgeBg   = granted ? '#DCFCE7' : '#FEF3C7';
  const dotColor  = granted ? Colors.success : Colors.warning;
  const textColor = granted ? '#15803D'  : '#92400E';
  const label     = granted ? 'Access Granted' : 'Pending Consent';
  return (
    <View
      style={[styles.consentBadge, { backgroundColor: badgeBg }]}
      accessibilityRole="text"
      accessibilityLabel={`Consent status: ${label}`}
    >
      <View style={[styles.consentDot, { backgroundColor: dotColor }]} />
      <Text style={[styles.consentBadgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function EmptyStateView() {
  return (
    <View style={styles.emptyState}>
      {/* Simple document placeholder icon */}
      <View style={styles.emptyStateIconBox}>
        <View style={styles.emptyStateIconLine} />
        <View style={[styles.emptyStateIconLine, { width: 40 }]} />
        <View style={[styles.emptyStateIconLine, { width: 32 }]} />
      </View>
      <Text style={styles.emptyStateText}>
        No previous records.{'\n'}Start the first visit.
      </Text>
    </View>
  );
}

function LoadingSkeleton() {
  // Neutral skeleton — patient header already rendered above; this covers
  // the consent badge + visit list area while the server call is in flight (D3-H-2).
  return (
    <View style={styles.skeleton}>
      <View style={styles.skeletonBadge} />
      <View style={styles.skeletonButton} />
      <View style={styles.skeletonCard} />
      <View style={styles.skeletonCard} />
      <View style={[styles.skeletonCard, { opacity: 0.5 }]} />
      <View style={styles.skeletonLabel}>
        <ActivityIndicator size="small" color={Colors.primaryBlue} />
        <Text style={styles.skeletonLabelText}>Checking access\u2026</Text>
      </View>
    </View>
  );
}

function OfflineBanner({ lastVerifiedAt }: { lastVerifiedAt: string | null }) {
  // Surface when the consent was last verified so the doctor knows the age of the data.
  // A patient who revoked consent 3 days ago may still appear as "granted" when offline
  // (QA M-6 — acceptable per spec "within one sync cycle" but must be visible).
  const verifiedStr = lastVerifiedAt
    ? formatDateForDisplay(lastVerifiedAt.slice(0, 10))
    : null;
  return (
    <View style={styles.offlineBanner} accessibilityRole="alert">
      <View style={styles.offlineDot} />
      <Text style={styles.offlineBannerText}>
        {verifiedStr
          ? `Offline \u2014 consent verified ${verifiedStr}. Reconnect to update.`
          : 'Offline \u2014 showing last synced data.'}
      </Text>
    </View>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <Text style={styles.errorBannerText} numberOfLines={2}>
        {message}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        style={styles.errorRetryButton}
        accessibilityLabel="Retry"
        accessibilityRole="button"
      >
        <Text style={styles.errorRetryText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}

function SessionExpiredBanner() {
  return (
    <View style={styles.sessionExpiredBanner} accessibilityRole="alert">
      <Text style={styles.sessionExpiredText}>
        Your session has expired. Please log in again.
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Format visit date from server UTC ISO to Indian DD/MM/YYYY display. */
function formatVisitDate(isoDate: string): string {
  return formatDateForDisplay(isoDate.slice(0, 10)) ?? isoDate;
}

/**
 * Record count pill label.
 * 0 → "Draft" (interrupted/incomplete visit — QA M-3)
 * 1 → "1 record"
 * n → "n records"
 */
function recordLabel(count: number): string {
  if (count === 0) return 'Draft';
  if (count === 1) return '1 record';
  return `${count} records`;
}

// ─────────────────────────────────────────────────────────────
// Styles — React Native StyleSheet (no Tailwind)
// Spacing: 4/8/12/16/20/24/32
// Touch targets: minimum 48×48px (WCAG AA — ui-ux-spec.md)
// ─────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // ── Layout ─────────────────────────────────────────────────
  screen: {
    flex:            1,
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  listHeader: {
    paddingTop: 8,
  },
  listFooter: {
    paddingTop: 8,
  },

  // ── Navigation header ───────────────────────────────────────
  navHeader: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical:   12,
    minHeight:         56,
  },
  backButton: {
    marginRight:   8,
    minWidth:      44,
    minHeight:     44,
    justifyContent: 'center',
    alignItems:    'flex-start',
  },
  backButtonText: {
    fontSize:   28,
    color:      Colors.primaryBlue,
    lineHeight: 32,
  },
  navTitle: {
    flex:       1,
    fontSize:   17,
    fontWeight: '600',
    color:      Colors.textPrimary,
    textAlign:  'center',
  },
  editButton: {
    minWidth:      44,
    minHeight:     44,
    justifyContent: 'center',
    alignItems:    'flex-end',
  },
  editButtonText: {
    fontSize:   15,
    fontWeight: '500',
    color:      Colors.primaryBlue,
  },

  // ── Patient header ──────────────────────────────────────────
  patientHeader: {
    backgroundColor:  Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
  patientName: {
    fontSize:    22,
    fontWeight:  '600',
    color:       Colors.primaryDark,
    marginBottom: 3,
    // numberOfLines + ellipsizeMode applied inline (QA M-4 overflow guard)
  },
  patientMobile: {
    fontSize:    14,
    color:       Colors.textSecondary,
    marginBottom: 2,
    fontVariant: ['tabular-nums'],
  },
  patientAge: {
    fontSize: 14,
    color:    Colors.textSecondary,
  },

  // ── Consent badge ───────────────────────────────────────────
  consentBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    alignSelf:         'flex-start',
    paddingHorizontal: 12,
    paddingVertical:    6,
    borderRadius:      20,
    marginTop:         12,
    marginBottom:       8,
    gap:                6,
  },
  consentDot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  consentBadgeText: {
    fontSize:   13,
    fontWeight: '600',
  },

  // ── New Visit button ────────────────────────────────────────
  newVisitButton: {
    backgroundColor: Colors.primaryBlue,
    borderRadius:    10,
    paddingVertical: 16,
    alignItems:      'center',
    marginVertical:  12,
    minHeight:       56,
    justifyContent:  'center',
  },
  newVisitButtonText: {
    color:      Colors.surface,
    fontSize:   18,
    fontWeight: '600',
  },

  // ── Consent gate box ────────────────────────────────────────
  consentGateBox: {
    backgroundColor: '#FFFBEB',
    borderWidth:     1,
    borderColor:     '#FDE68A',
    borderRadius:    10,
    padding:         16,
    marginBottom:    16,
    alignItems:      'center',
  },
  consentGateTitle: {
    fontSize:     15,
    fontWeight:   '600',
    color:        '#78350F',
    marginBottom:  4,
  },
  consentGateBody: {
    fontSize:    14,
    color:       '#92400E',
    textAlign:   'center',
    lineHeight:   20,
    marginBottom: 14,
  },
  requestAccessButton: {
    backgroundColor:  Colors.warning,
    borderRadius:     8,
    paddingVertical:  12,
    paddingHorizontal: 28,
    minHeight:        48,
    justifyContent:   'center',
    alignItems:       'center',
  },
  requestAccessButtonText: {
    color:      Colors.surface,
    fontSize:   15,
    fontWeight: '600',
  },
  requestSentBox: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            8,
    paddingVertical: 8,
  },
  requestSentText: {
    fontSize: 14,
    color:    '#92400E',
    fontStyle: 'italic',
  },

  // ── Section label ───────────────────────────────────────────
  sectionLabel: {
    fontSize:      12,
    fontWeight:    '600',
    color:         Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop:      8,
    marginBottom:   6,
  },

  // ── Visit card ──────────────────────────────────────────────
  visitCard: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     Colors.border,
    minHeight:       48,
  },
  visitCardGrayed: {
    opacity: 0.4,
  },
  visitCardTopRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:    4,
  },
  visitCardTopRowRight: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:            8,
  },
  unsyncedIcon: {
    fontSize: 13,
    color:    Colors.warning,
  },
  visitDate: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.textPrimary,
  },
  recordCountPill: {
    backgroundColor:  Colors.background,
    borderRadius:     10,
    paddingHorizontal: 8,
    paddingVertical:   2,
  },
  draftPill: {
    backgroundColor: '#FEF3C7',
  },
  recordCountText: {
    fontSize: 12,
    color:    Colors.textSecondary,
  },
  draftText: {
    color:      '#92400E',
    fontWeight: '600',
  },
  visitComplaint: {
    fontSize:     15,
    color:        Colors.textPrimary,
    marginBottom:  4,
    lineHeight:   20,
  },
  visitClinic: {
    fontSize: 12,
    color:    Colors.textSecondary,
  },
  textGrayed: {
    color: Colors.textDisabled,
  },
  expandChevron: {
    fontSize:   18,
    color:      '#94A3B8',
    lineHeight: 20,
  },
  expandChevronOpen: {
    transform: [{ rotate: '90deg' }],
  },

  // ── Inline expanded detail ──────────────────────────────────
  inlineDetail: {
    marginTop: 12,
  },
  inlineDetailDivider: {
    height:          1,
    backgroundColor: Colors.border,
    marginBottom:    12,
  },
  inlineDetailLabel: {
    fontSize:      11,
    fontWeight:    '600',
    color:         Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom:   4,
  },
  inlineDetailSummary: {
    fontSize:     13,
    color:        Colors.textSecondary,
    lineHeight:   18,
    marginBottom:  8,
  },
  // Touch target min 48px (WCAG AA)
  viewFullVisitButton: {
    alignSelf:         'flex-start',
    paddingVertical:   12,
    paddingHorizontal:  4,
    minHeight:         48,
    justifyContent:    'center',
  },
  viewFullVisitButtonDisabled: {
    opacity: 0.4,
  },
  viewFullVisitText: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },
  viewFullVisitTextDisabled: {
    color: Colors.textDisabled,
  },

  // ── Empty state ─────────────────────────────────────────────
  emptyState: {
    alignItems:      'center',
    justifyContent:  'center',
    paddingVertical: 56,
  },
  emptyStateIconBox: {
    alignItems:   'center',
    marginBottom: 20,
    gap:           6,
  },
  emptyStateIconLine: {
    width:           56,
    height:           4,
    borderRadius:     2,
    backgroundColor: Colors.textDisabled,
  },
  emptyStateText: {
    fontSize:   16,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 24,
  },

  // ── Loading skeleton ────────────────────────────────────────
  skeleton: {
    flex:              1,
    paddingHorizontal: 16,
    paddingTop:        16,
  },
  skeletonBadge: {
    width:           120,
    height:           28,
    borderRadius:     14,
    backgroundColor: Colors.border,
    marginBottom:    12,
  },
  skeletonButton: {
    height:          56,
    borderRadius:    10,
    backgroundColor: Colors.border,
    marginBottom:    16,
    opacity:         0.6,
  },
  skeletonCard: {
    height:          72,
    borderRadius:    10,
    backgroundColor: Colors.border,
    marginBottom:    10,
    opacity:         0.4,
  },
  skeletonLabel: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    paddingTop:     12,
    gap:             8,
  },
  skeletonLabelText: {
    fontSize: 14,
    color:    Colors.textSecondary,
  },

  // ── Offline banner ──────────────────────────────────────────
  offlineBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#FEF3C7',
    borderBottomWidth:  1,
    borderBottomColor: '#FCD34D',
    paddingHorizontal: 16,
    paddingVertical:   10,
    gap:                8,
  },
  offlineDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: Colors.warning,
    flexShrink:      0,
  },
  offlineBannerText: {
    fontSize:   13,
    fontWeight: '500',
    color:      '#92400E',
    flex:       1,
  },

  // ── Error banner ────────────────────────────────────────────
  errorBanner: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   '#FEF2F2',
    borderBottomWidth:  1,
    borderBottomColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical:   10,
    gap:               12,
  },
  errorBannerText: {
    flex:       1,
    fontSize:   13,
    color:      '#991B1B',
    fontWeight: '500',
  },
  errorRetryButton: {
    backgroundColor:  Colors.error,
    borderRadius:     6,
    paddingHorizontal: 12,
    paddingVertical:   8,
    minHeight:        36,
    justifyContent:   'center',
  },
  errorRetryText: {
    color:      Colors.surface,
    fontSize:   13,
    fontWeight: '600',
  },

  // ── Session expired banner ──────────────────────────────────
  sessionExpiredBanner: {
    backgroundColor:   '#FEF2F2',
    borderBottomWidth:  1,
    borderBottomColor: '#FECACA',
    paddingHorizontal: 16,
    paddingVertical:   12,
  },
  sessionExpiredText: {
    color:      '#991B1B',
    fontSize:   13,
    fontWeight: '500',
    textAlign:  'center',
  },

  // ── Gray summary card (no_consent, > 5 other visits) ───────
  graySummaryCard: {
    backgroundColor: Colors.surface,
    borderRadius:    10,
    padding:         14,
    borderWidth:     1,
    borderColor:     Colors.border,
    marginBottom:    10,
    opacity:         0.6,
    alignItems:      'center',
  },
  graySummaryText: {
    fontSize:   13,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 18,
  },

  // ── Load more button ────────────────────────────────────────
  loadMoreButton: {
    backgroundColor:  Colors.surface,
    borderRadius:     10,
    paddingVertical:  14,
    alignItems:       'center',
    borderWidth:       1,
    borderColor:      Colors.border,
    minHeight:        48,
    justifyContent:   'center',
    marginBottom:     10,
  },
  loadMoreButtonText: {
    fontSize:   14,
    fontWeight: '600',
    color:      Colors.primaryBlue,
  },
});
