/**
 * Hook that tracks device network reachability.
 * Returns true when the device has an internet connection.
 *
 * Uses @react-native-community/netinfo.
 * isInternetReachable is checked in addition to isConnected because a device
 * can be "connected" to a WiFi router that has no upstream internet (common
 * in rural clinic settings).
 */

import { useState, useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useNetworkStatus(): boolean {
  // Start offline until NetInfo confirms connectivity — avoids false-positive
  // server lookups on captive portals where isInternetReachable is null.
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Require both flags to be explicitly true. null isInternetReachable
      // (unconfirmed — captive portal, no-internet WiFi) is treated as offline.
      const reachable =
        state.isConnected === true && state.isInternetReachable === true;
      setIsOnline(reachable);
    });
    return unsubscribe;
  }, []);

  return isOnline;
}
