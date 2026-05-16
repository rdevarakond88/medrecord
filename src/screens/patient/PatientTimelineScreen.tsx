/**
 * PatientTimelineScreen.tsx — P2: My Records Timeline (stub)
 *
 * Spec:    docs/ui-ux-spec.md § P2 (My Records / Timeline)
 *
 * STUB — navigation target for P1 post-login. Full mockup is a separate
 * Builder session (item 10 in project-state.md Recommended Next Session Order).
 */

import React from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import { Colors, Spacing } from '../../constants/theme';

export default function PatientTimelineScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} accessibilityRole="header">
          My Health Records
        </Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.stubText}>P2 mockup coming soon.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stubText: {
    fontSize: 15,
    color: Colors.textSecondary,
  },
});
