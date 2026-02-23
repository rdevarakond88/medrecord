/**
 * App.tsx — Web preview entry point (MOCKUP ONLY — not the production root)
 *
 * ⚠️  This file renders the D2 static mockup directly for browser-based UI
 * validation. It has NO auth guard, NO navigation stack, and NO login flow.
 * This is intentional for web preview purposes only.
 *
 * STRUCTURAL GAP: When D1 (Login screen) is built, App.tsx must be replaced
 * with a proper React Navigation root that:
 *   1. Reads the refresh token from expo-secure-store on launch
 *   2. Shows D1 (Login) as the initial route when no valid token exists
 *   3. Navigates to D2 (PatientSearch) only after setAuth() is called
 *
 * Until then: the live PatientSearchScreen.tsx has its own render guard
 * (`if (!token || !user) return null`) that prevents unauthenticated rendering
 * when wired into a real navigation stack.
 *
 * The mockup's DevStateSwitcher bar lets you cycle through all 4 screen states:
 *   empty → has-data → no-match → offline
 */
import { registerRootComponent } from 'expo';
import D2PatientSearchScreen from './mockups/D2PatientSearchScreen';

registerRootComponent(D2PatientSearchScreen);
