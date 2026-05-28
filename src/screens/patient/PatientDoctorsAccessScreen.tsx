/**
 * PatientDoctorsAccessScreen.tsx — P4: Doctors Who Have Access (live)
 *
 * Spec:    docs/ui-ux-spec.md § P4 (Doctors Who Have Access)
 * Consent: docs/consent-layer-spec.md § Flow 4 (Patient Revoking Access)
 * PM:      reviews/P1-P5-pm-review.md
 *
 * Live screen — wired to real API (BUG-IT-3 fix, 2026-05-27).
 *   GET /patient/consents → active grants + pending requests.
 *   DELETE /patient/consents/:id → revoke active consent.
 *   POST /patient/consent-requests/:id/respond → approve or deny pending request.
 *   Auth: patient JWT from usePatientAuthStore.
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiFetch } from '../../api/apiClient';
import { usePatientAuthStore } from '../../store/usePatientAuthStore';

import { Colors, Spacing } from '../../constants/theme';
import type { RootStackParamList } from '../../../App';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveConsent {
  id:         string;
  doctorName: string;
  clinicName: string;
  accessSince: string; // formatted display date, e.g. "15 Jan 2025"
}

interface PendingRequest {
  id:            string;
  doctorName:    string;
  clinicName:    string;
  requestedDate: string; // formatted display date
}

// ─── Server response types ────────────────────────────────────────────────────

interface ServerConsent {
  id:          string;
  doctor_name: string;
  clinic_name: string | null;
  granted_at:  string;
}

interface ServerPendingRequest {
  id:           string;
  doctor_name:  string;
  clinic_name:  string | null;
  requested_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function serverToConsent(c: ServerConsent): ActiveConsent {
  return {
    id:          c.id,
    doctorName:  c.doctor_name,
    clinicName:  c.clinic_name ?? '',
    accessSince: formatDate(c.granted_at),
  };
}

function serverToRequest(r: ServerPendingRequest): PendingRequest {
  return {
    id:            r.id,
    doctorName:    r.doctor_name,
    clinicName:    r.clinic_name ?? '',
    requestedDate: formatDate(r.requested_at),
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConsentCard({
  consent,
  onRevoke,
}: {
  consent: ActiveConsent;
  onRevoke: (id: string, doctorName: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardInfo}>
        <Text style={styles.doctorName}>{consent.doctorName}</Text>
        <Text style={styles.clinicName}>{consent.clinicName}</Text>
        <Text style={styles.scopeNote}>Can view all your health records</Text>
        <Text style={styles.accessSince}>Access since: {consent.accessSince}</Text>
      </View>
      <TouchableOpacity
        style={styles.revokeBtn}
        onPress={() => onRevoke(consent.id, consent.doctorName)}
        accessibilityRole="button"
        accessibilityLabel={`Remove access for ${consent.doctorName}`}
      >
        <Text style={styles.revokeBtnText}>Remove Access</Text>
      </TouchableOpacity>
    </View>
  );
}

function PendingCard({
  request,
  onGrant,
  onDeny,
}: {
  request:  PendingRequest;
  onGrant:  (id: string) => void;
  onDeny:   (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.pendingBadgeRow}>
        <View style={styles.pendingBadge}>
          <Text style={styles.pendingBadgeText}>Pending</Text>
        </View>
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.doctorName}>{request.doctorName}</Text>
        <Text style={styles.clinicName}>{request.clinicName}</Text>
        <Text style={styles.accessSince}>Requested: {request.requestedDate}</Text>
      </View>
      <View style={styles.pendingBtnRow}>
        <TouchableOpacity
          style={styles.grantBtn}
          onPress={() => onGrant(request.id)}
          accessibilityRole="button"
          accessibilityLabel={`Allow access to ${request.doctorName}`}
        >
          <Text style={styles.grantBtnText}>Allow</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.denyBtn}
          onPress={() => onDeny(request.id)}
          accessibilityRole="button"
          accessibilityLabel={`Don't allow access request from ${request.doctorName}`}
        >
          <Text style={styles.denyBtnText}>Don't Allow</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIllustration} accessible={false}>
        <Text style={styles.emptyIcon}>🏥</Text>
      </View>
      <Text style={styles.emptyTitle}>No doctors have access yet</Text>
      <Text style={styles.emptyBody}>
        When a doctor at a clinic adds records for you, they will appear here.
        You can revoke access at any time.
      </Text>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type NavProp = NativeStackNavigationProp<RootStackParamList, 'PatientDoctorsAccess'>;

export default function PatientDoctorsAccessScreen() {
  const navigation = useNavigation<NavProp>();
  const token      = usePatientAuthStore((s) => s.token);

  const [consents,    setConsents]    = useState<ActiveConsent[]>([]);
  const [pendingReqs, setPendingReqs] = useState<PendingRequest[]>([]);
  const [isLoading,   setIsLoading]   = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);

  // Auth guard — redirect to patient login if no token
  useEffect(() => {
    if (!token) {
      navigation.replace('PatientLogin');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadConsents = useCallback(async (isRefresh = false) => {
    if (!token) return;
    if (isRefresh) setRefreshing(true);
    else setIsLoading(true);
    try {
      const data = await apiFetch<{ active: ServerConsent[]; pending: ServerPendingRequest[] }>(
        '/patient/consents',
        token,
      );
      setConsents(data.active.map(serverToConsent));
      setPendingReqs(data.pending.map(serverToRequest));
    } catch {
      // Keep existing state on refresh failure — silent for now
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      loadConsents(false);
    }, [loadConsents]),
  );

  function handleRevoke(id: string, doctorName: string) {
    Alert.alert(
      'Remove Access?',
      `${doctorName} will no longer be able to view your records. Records they created remain visible to you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await apiFetch(`/patient/consents/${id}`, token!, { method: 'DELETE' });
              setConsents((prev) => prev.filter((c) => c.id !== id));
            } catch {
              Alert.alert('Error', 'Could not remove access. Please try again.');
            }
          },
        },
      ],
    );
  }

  async function handleGrant(id: string) {
    const req = pendingReqs.find((r) => r.id === id);
    try {
      await apiFetch(`/patient/consent-requests/${id}/respond`, token!, {
        method: 'POST',
        body:   JSON.stringify({ action: 'approve' }),
      });
      setPendingReqs((prev) => prev.filter((r) => r.id !== id));
      if (req) {
        setConsents((prev) => [
          ...prev,
          {
            id:          id,
            doctorName:  req.doctorName,
            clinicName:  req.clinicName,
            accessSince: 'Just now',
          },
        ]);
      }
    } catch {
      Alert.alert('Error', 'Could not grant access. Please try again.');
    }
  }

  async function handleDeny(id: string) {
    try {
      await apiFetch(`/patient/consent-requests/${id}/respond`, token!, {
        method: 'POST',
        body:   JSON.stringify({ action: 'deny' }),
      });
      setPendingReqs((prev) => prev.filter((r) => r.id !== id));
    } catch {
      Alert.alert('Error', 'Could not deny the request. Please try again.');
    }
  }

  const nothingToShow = consents.length === 0 && pendingReqs.length === 0;

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
        <Text style={styles.navTitle} accessibilityRole="header">
          Doctors Who Have Access
        </Text>
        <View style={styles.navSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={Colors.primaryBlue} />
        </View>
      ) : nothingToShow ? (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadConsents(true)} />}
        >
          <EmptyState />
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadConsents(true)} />}
        >

          {/* ── Active consents ── */}
          {consents.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Your Doctors</Text>
              {consents.map((consent) => (
                <ConsentCard
                  key={consent.id}
                  consent={consent}
                  onRevoke={handleRevoke}
                />
              ))}
            </>
          )}

          {/* ── Pending requests ── */}
          {pendingReqs.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, consents.length > 0 && styles.sectionLabelSpaced]}>
                New Requests
              </Text>
              {pendingReqs.map((req) => (
                <PendingCard
                  key={req.id}
                  request={req}
                  onGrant={handleGrant}
                  onDeny={handleDeny}
                />
              ))}
            </>
          )}

          {/* ── DPDP info note ── */}
          <View style={styles.infoNote}>
            <Text style={styles.infoNoteText}>
              You control who can see your records. Removing access takes effect immediately.
            </Text>
          </View>

        </ScrollView>
      )}

      {/* ── Bottom tab bar (patient app) ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.goBack()}
          accessibilityRole="tab"
          accessibilityLabel="My Records tab"
          accessibilityState={{ selected: false }}
        >
          <Text style={styles.tabIcon} accessible={false}>📋</Text>
          <Text style={styles.tabLabel}>My Records</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          accessibilityRole="tab"
          accessibilityLabel="Doctors tab, currently selected"
          accessibilityState={{ selected: true }}
        >
          <Text style={styles.tabIcon} accessible={false}>👨‍⚕️</Text>
          <Text style={[styles.tabLabel, styles.tabLabelActive]}>Doctors</Text>
          <View style={styles.tabActiveDot} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.tabItem}
          onPress={() => navigation.navigate('PatientProfile')}
          accessibilityRole="tab"
          accessibilityLabel="Profile tab"
          accessibilityState={{ selected: false }}
        >
          <Text style={styles.tabIcon} accessible={false}>👤</Text>
          <Text style={styles.tabLabel}>Profile</Text>
        </TouchableOpacity>
      </View>

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
  navSpacer: {
    minWidth: 60,
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

  // ── Section labels
  sectionLabel: {
    fontSize:     13,
    fontWeight:   '700',
    color:        Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginLeft:   4,
  },
  sectionLabelSpaced: {
    marginTop: Spacing.xl,
  },

  // ── Consent / pending card
  card: {
    backgroundColor:  Colors.surface,
    borderRadius:     14,
    padding:          Spacing.xl,
    marginBottom:     Spacing.md,
    shadowColor:      '#000',
    shadowOffset:     { width: 0, height: 1 },
    shadowOpacity:    0.06,
    shadowRadius:     6,
    elevation:        2,
  },
  cardInfo: {
    marginBottom: Spacing.md,
  },
  doctorName: {
    fontSize:     17,
    fontWeight:   '600',
    color:        Colors.textPrimary,
    marginBottom: 4,
  },
  clinicName: {
    fontSize:     14,
    color:        Colors.textSecondary,
    marginBottom: 4,
  },
  scopeNote: {
    fontSize:     14,
    color:        Colors.textSecondary,
    marginBottom: 4,
  },
  accessSince: {
    fontSize: 14,
    color:    Colors.textSecondary,
  },

  // ── Revoke button
  revokeBtn: {
    borderWidth:       1.5,
    borderColor:       Colors.error,
    borderRadius:      10,
    paddingVertical:   12,
    paddingHorizontal: Spacing.xl,
    alignItems:        'center',
    minHeight:         48,
    justifyContent:    'center',
  },
  revokeBtnText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.error,
  },

  // ── Pending badge
  pendingBadgeRow: {
    flexDirection: 'row',
    marginBottom:  Spacing.sm,
  },
  pendingBadge: {
    backgroundColor:   '#FEF3C7',
    borderRadius:      6,
    paddingVertical:   3,
    paddingHorizontal: 8,
  },
  pendingBadgeText: {
    fontSize:   12,
    fontWeight: '600',
    color:      '#92400E',
  },

  // ── Pending action buttons
  pendingBtnRow: {
    flexDirection: 'row',
    gap:           Spacing.md,
  },
  grantBtn: {
    flex:              1,
    backgroundColor:   Colors.success,
    borderRadius:      10,
    paddingVertical:   12,
    alignItems:        'center',
    minHeight:         48,
    justifyContent:    'center',
  },
  grantBtnText: {
    fontSize:   15,
    fontWeight: '600',
    color:      '#FFFFFF',
  },
  denyBtn: {
    flex:              1,
    borderWidth:       1.5,
    borderColor:       Colors.error,
    borderRadius:      10,
    paddingVertical:   12,
    alignItems:        'center',
    minHeight:         48,
    justifyContent:    'center',
  },
  denyBtnText: {
    fontSize:   15,
    fontWeight: '600',
    color:      Colors.error,
  },

  // ── DPDP info note
  infoNote: {
    backgroundColor:   '#EFF6FF',
    borderRadius:      10,
    padding:           Spacing.lg,
    marginTop:         Spacing.md,
    borderWidth:       1,
    borderColor:       '#BFDBFE',
  },
  infoNoteText: {
    fontSize:   14,
    color:      '#1E40AF',
    lineHeight: 20,
    textAlign:  'center',
  },

  // ── Empty state
  emptyState: {
    flex:            1,
    alignItems:      'center',
    justifyContent:  'center',
    paddingHorizontal: 40,
  },
  emptyIllustration: {
    width:            80,
    height:           80,
    borderRadius:     40,
    backgroundColor:  Colors.background,
    alignItems:       'center',
    justifyContent:   'center',
    marginBottom:     Spacing.xl,
    borderWidth:      1,
    borderColor:      Colors.border,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyTitle: {
    fontSize:     20,
    fontWeight:   '700',
    color:        Colors.textPrimary,
    textAlign:    'center',
    marginBottom: Spacing.md,
  },
  emptyBody: {
    fontSize:   15,
    color:      Colors.textSecondary,
    textAlign:  'center',
    lineHeight: 24,
  },

  // ── Bottom tab bar
  tabBar: {
    flexDirection:     'row',
    backgroundColor:   Colors.surface,
    borderTopWidth:    1,
    borderTopColor:    Colors.border,
    paddingBottom:     Spacing.md,
    paddingTop:        Spacing.sm,
  },
  tabItem: {
    flex:           1,
    alignItems:     'center',
    paddingVertical: Spacing.sm,
    minHeight:       48,
    justifyContent: 'center',
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

  // ── Loading block
  loadingBlock: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
  },
});
