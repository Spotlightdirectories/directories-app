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

// Opens a website page with the person ALREADY signed in. Asks the backend
// (app-web-handoff) for a one-time sign-in token and opens the website's
// /app-login page with it. If anything goes wrong (offline, not logged in,
// page not allowed), it quietly falls back to a plain openWebPage(), so the
// person at worst has to log in on the website as before.
export async function openWebPageSignedIn(path: string) {
  try {
    const { supabase } = await import("./supabase");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return openWebPage(path);
    const res = await fetch("https://gyvzmktavyrevfxnwsay.supabase.co/functions/v1/app-web-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ next: path }),
    });
    const body = await res.json();
    if (!res.ok || !body?.token_hash) return openWebPage(path);
    return openWebPage(`/app-login?token_hash=${encodeURIComponent(body.token_hash)}&next=${encodeURIComponent(body.next)}`);
  } catch {
    return openWebPage(path);
  }
}
