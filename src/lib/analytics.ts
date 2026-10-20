// ===============================================================
// src/lib/analytics.ts
//
// App-side mirror of the website's src/lib/analytics.ts. Every
// analytics_events row carries an anonymous visitor_id (random code
// kept on this phone) and the visitor's state (from the visitor-geo
// function; the IP address is never stored).
// ===============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

const ID_KEY = "spotlight_vid";
const STATE_KEY = "spotlight_vstate";
const OPT_KEY = "spotlight_analytics_off";
const STATE_TTL = 24 * 60 * 60 * 1000;
const GEO_URL = "https://spotlightdirectories.com/api/visitor-geo";

export async function isAnalyticsOptedOut(): Promise<boolean> {
  try { return (await AsyncStorage.getItem(OPT_KEY)) === "1"; } catch { return false; }
}

export async function setAnalyticsOptOut(off: boolean) {
  try {
    if (off) {
      await AsyncStorage.setItem(OPT_KEY, "1");
      await AsyncStorage.multiRemove([ID_KEY, STATE_KEY]);
      idPromise = null;
    } else {
      await AsyncStorage.removeItem(OPT_KEY);
    }
  } catch { /* ignore */ }
}

function makeId() {
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `app-${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`;
}

let idPromise: Promise<string | null> | null = null;
function getVisitorId(): Promise<string | null> {
  if (!idPromise) {
    idPromise = (async () => {
      try {
        let id = await AsyncStorage.getItem(ID_KEY);
        if (!id) { id = makeId(); await AsyncStorage.setItem(ID_KEY, id); }
        return id;
      } catch { return null; }
    })();
  }
  return idPromise;
}

let statePromise: Promise<string | null> | null = null;
async function getVisitorState(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(STATE_KEY);
    if (raw) {
      const { state, at } = JSON.parse(raw);
      if (state && Date.now() - at < STATE_TTL) return state;
    }
  } catch { /* ignore */ }
  if (!statePromise) {
    statePromise = (async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(GEO_URL, { signal: ctrl.signal });
        clearTimeout(t);
        const { state } = await res.json();
        if (state) { try { await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ state, at: Date.now() })); } catch { /* ignore */ } }
        return (state as string | null) || null;
      } catch { return null; }
      finally { statePromise = null; }
    })();
  }
  return statePromise;
}

// Drop-in replacement for supabase.from("analytics_events").insert(rows)
export async function insertAnalytics(rows: Record<string, unknown> | Record<string, unknown>[]) {
  let meta: Record<string, unknown> = {};
  try {
    // Opted out: the event still counts toward the business's totals,
    // but carries no visitor code and no location.
    if (await isAnalyticsOptedOut()) throw new Error("opted out");
    const [id, state] = await Promise.all([getVisitorId(), getVisitorState()]);
    meta = { visitor_id: id, visitor_state: state };
  } catch { /* analytics must never break a screen */ }
  const withMeta = Array.isArray(rows) ? rows.map((r) => ({ ...meta, ...r })) : { ...meta, ...rows };
  return supabase.from("analytics_events").insert(withMeta);
}
