/**
 * PatientDoctorsAccessScreen.tsx — P4: Doctors Who Have Access
 *
 * Spec:    docs/ui-ux-spec.md § P4 (Doctors Who Have Access)
 * Consent: docs/consent-layer-spec.md § Flow 4 (Patient Revoking Access)
 * PM:      reviews/P1-P5-pm-review.md
 *
 * MOCKUP — all data is hardcoded. No real API calls.
 *
 * Wire step will:
 *   1. Replace MOCK_CONSENTS / MOCK_REQUESTS with GET /patient/consents
 *      (returns active grants and pending requests).
 *   2. Wire "Revoke Access" to DELETE /patient/consents/:id + confirmation.
 *   3. Wire "Grant" / "Deny" to POST /patient/consent-requests/:id/respond.
 *
 * States: has_active (2 active + 1 pending), empty.
 * Toggle via DEV demo switcher at bottom.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_CONSENTS: ActiveConsent[] = [
  {
    id:          'c-001',
    doctorName:  'Dr. Anand Krishnamurthy',
    clinicName:  'Krishnamurthy Clinic, Pune',
    accessSince: '15 Jan 2025',
  },
  {
    id:          'c-002',
    doctorName:  'Dr. Meenakshi Iyer',
    clinicName:  'Iyer Family Clinic, Pune',
    accessSince: '04 Mar 2024',
  },
];

const MOCK_REQUESTS: PendingRequest[] = [
  {
    id:            'req-001',
    doctorName:    'Dr. Rajesh Sharma',
    clinicName:    'Sharma Medical Centre, Nashik',
    requestedDate: '14 May 2026',
  },
];

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

type DemoState = 'has_active' | 'empty';

export default function PatientDoctorsAccessScreen() {
  const navigation = useNavigation<NavProp>();

  const [demoState,     setDemoState]    = useState<DemoState>('has_active');
  const [consents,      setConsents]     = useState<ActiveConsent[]>(MOCK_CONSENTS);
  const [pendingReqs,   setPendingReqs]  = useState<PendingRequest[]>(MOCK_REQUESTS);

  const isEmpty = demoState === 'empty';

  function handleRevoke(id: string, doctorName: string) {
    Alert.alert(
      'Remove Access?',
      `${doctorName} will no longer be able to view your records. Records they created remain visible to you.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setConsents((prev) => prev.filter((c) => c.id !== id));
          },
        },
      ],
    );
  }

  function handleGrant(id: string) {
    Alert.alert(
      'Access Allowed',
      'This doctor can now view your health records.',
      [{ text: 'OK' }],
    );
    setPendingReqs((prev) => prev.filter((r) => r.id !== id));
  }

  function handleDeny(id: string) {
    Alert.alert(
      'Access Not Allowed',
      "The doctor's request has been declined.",
      [{ text: 'OK' }],
    );
    setPendingReqs((prev) => prev.filter((r) => r.id !== id));
  }

  const displayConsents  = isEmpty ? [] : consents;
  const displayRequests  = isEmpty ? [] : pendingReqs;
  const nothingToShow    = displayConsents.length === 0 && displayRequests.length === 0;

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

      {nothingToShow ? (
        <EmptyState />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Active consents ── */}
          {displayConsents.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Your Doctors</Text>
              {displayConsents.map((consent) => (
                <ConsentCard
                  key={consent.id}
                  consent={consent}
                  onRevoke={handleRevoke}
                />
              ))}
            </>
          )}

          {/* ── Pending requests ── */}
          {displayRequests.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, displayConsents.length > 0 && styles.sectionLabelSpaced]}>
                New Requests
              </Text>
              {displayRequests.map((req) => (
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

      {/* ── DEV demo switcher ── */}
      {__DEV__ && (
        <View style={styles.demoBlock}>
          <Text style={styles.demoTitle}>Demo states — mockup only</Text>
          <View style={styles.demoRow}>
            {(
              [
                ['has_active', 'Has active'],
                ['empty',      'Empty'],
              ] as [DemoState, string][]
            ).map(([state, label]) => (
              <TouchableOpacity
                key={state}
                style={[styles.demoBtn, demoState === state && styles.demoBtnActive]}
                onPress={() => {
                  setDemoState(state);
                  if (state === 'has_active') {
                    setConsents(MOCK_CONSENTS);
                    setPendingReqs(MOCK_REQUESTS);
                  }
                }}
                accessibilityLabel={`Demo state: ${label}`}
              >
                <Text style={styles.demoBtnText}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

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
    fontSize:   13,
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

  // ── DEV demo switcher
  demoBlock: {
    padding:         Spacing.md,
    backgroundColor: '#FFFBEB',
    borderTopWidth:  1,
    borderTopColor:  '#FCD34D',
  },
  demoTitle: {
    fontSize:      11,
    fontWeight:    '700',
    color:         '#92400E',
    textAlign:     'center',
    marginBottom:  6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  demoRow: {
    flexDirection:  'row',
    gap:            Spacing.sm,
    justifyContent: 'center',
  },
  demoBtn: {
    backgroundColor:   '#D97706',
    paddingVertical:   6,
    paddingHorizontal: 12,
    borderRadius:      6,
  },
  demoBtnActive: {
    backgroundColor: '#92400E',
  },
  demoBtnText: {
    color:      '#FFFFFF',
    fontSize:   12,
    fontWeight: '600',
  },
});
