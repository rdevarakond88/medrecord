/**
 * App.tsx — Web preview entry point
 *
 * Renders the D2 mockup for browser-based UI validation.
 * The live PatientSearchScreen uses expo-sqlite which has no web support,
 * so the mockup (self-contained, static data) is the correct target here.
 *
 * The mockup's DevStateSwitcher bar lets you cycle through all 4 screen states:
 *   empty → has-data → no-match → offline
 */
import { registerRootComponent } from 'expo';
import D2PatientSearchScreen from './mockups/D2PatientSearchScreen';

registerRootComponent(D2PatientSearchScreen);
