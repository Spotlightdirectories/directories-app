// ===============================================================
// src/lib/supabase.ts
//
// The single shared Supabase client for the whole app — mirrors
// spotlightwebproject_staging/spotlight-next/src/lib/supabase.ts,
// pointed at the exact same Supabase project (gyvzmktavyrevfxnwsay),
// so the app reads/writes the same real data as the website.
//
// Two things this needs that the website's version didn't:
// - react-native-url-polyfill: React Native's JS environment doesn't
//   include a full URL implementation, which Supabase's SDK relies
//   on internally. Without this import, auth/requests fail silently
//   or with confusing errors on-device (works fine in a browser,
//   breaks on a real phone) — must be imported first, before
//   anything else touches supabase-js.
// - AsyncStorage: browsers have localStorage built in for Supabase
//   to persist a session automatically; React Native doesn't have
//   an equivalent, so AsyncStorage has to be explicitly wired in as
//   the storage mechanism, or a user would be logged out every time
//   the app fully closes.
// ===============================================================

import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { cachedFetch, clearOfflineCache } from "./offlineCache";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Check .env for " +
      "EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false, // no browser URL bar on mobile
  },
  // Offline mode: reads fall back to the last saved copy when there is no connection.
  global: { fetch: cachedFetch },
});

// Saved offline copies belong to the account; wipe them when someone logs out.
supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") clearOfflineCache();
});
