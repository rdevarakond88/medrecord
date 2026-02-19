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
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable can be null when unknown — treat null as online
      // to avoid incorrectly blocking the server path on startup.
      const reachable =
        state.isConnected === true && state.isInternetReachable !== false;
      setIsOnline(reachable);
    });
    return unsubscribe;
  }, []);

  return isOnline;
}
