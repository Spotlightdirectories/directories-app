// ===============================================================
// src/lib/webHandoff.ts
//
// Per the locked mobile-app architecture: Admin, Partner, vendor
// signup, Subscription/payment, Verification, and Branches all stay
// web-only. Whenever the app needs to send someone to one of these,
// it opens the phone's own default browser (Linking.openURL) — no
// shared login session carries over, so the person will need to log
// in again there. That's a known, accepted trade-off, not a bug.
// ===============================================================

import { Linking } from "react-native";

export const SITE_URL = "https://spotlightdirectories.com";

export function openWebPage(path: string) {
  const url = path.startsWith("http") ? path : `${SITE_URL}${path}`;
  Linking.openURL(url);
}
