/**
 * ScanImageViewer — reusable pinch-to-zoom scan image component.
 *
 * Extracted from D8 so P3 (Patient timeline scan view) can reuse without duplication.
 * Uses ScrollView zoom: iOS-native pinch via maximumZoomScale. Android does not support
 * maximumZoomScale natively on ScrollView; tap-to-zoom via double-tap is not included in v1.
 *
 * Usage:
 *   import ScanImageViewer from '../../components/ScanImageViewer';
 *   <ScanImageViewer uri={absoluteUri} accessibilityLabel="Prescription scan" />
 *
 * uri MUST be an absolute filesystem path. Call resolveScanPath() before passing.
 */

import React, { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

interface ScanImageViewerProps {
  uri: string;
  accessibilityLabel?: string;
}

export default function ScanImageViewer({ uri, accessibilityLabel }: ScanImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const [hintVisible, setHintVisible] = useState(true);

  return (
    <View style={styles.root}>
      {/* ScrollView zoom is iOS-native. On Android, pinch gesture events are
          dispatched but maximumZoomScale is not honoured — image displays at 1x
          without crashing. Full Android zoom requires react-native-gesture-handler
          (deferred to v2 alongside S3 image hosting). */}
      <ScrollView
        contentContainerStyle={{ width, height }}
        minimumZoomScale={1}
        maximumZoomScale={4}
        pinchGestureEnabled
        centerContent
        bouncesZoom
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => setHintVisible(false)}
      >
        <Image
          source={{ uri }}
          style={{ width, height }}
          resizeMode="contain"
          accessibilityLabel={accessibilityLabel ?? 'Scan image'}
        />
      </ScrollView>
      {hintVisible && (
        <View pointerEvents="none" style={styles.hintOverlay}>
          <Text style={styles.hintText}>Pinch to zoom</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex:            1,
    backgroundColor: '#111827',
  },
  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems:     'center',
    paddingBottom:  16,
  },
  hintText: {
    fontSize: 11,
    color:    'rgba(255,255,255,0.6)',
  },
});
