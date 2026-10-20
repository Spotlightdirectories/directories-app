// ===============================================================
// src/lib/offlineCache.ts
//
// Basic offline mode for the whole app, in ONE place: a wrapper around the
// network calls the app makes to Supabase.
//  - Every successful READ (a screen's data) is saved on the phone.
//  - If a read later fails because there is no connection, the last saved
//    copy is shown instead, so screens still show content.
//  - Writes (saving, sending, uploading) are never faked: offline, they fail
//    normally and the person sees an error.
//  - Saved copies belong to one account and are wiped when that person logs out.
// Only data reads are saved: tables (GET/HEAD) and the search_* / get_* functions.
// ===============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "spotlight_cache:";
const INDEX_KEY = "spotlight_cache_index";
const MAX_ENTRIES = 150;
const MAX_BODY_CHARS = 400_000;

type Listener = (offline: boolean) => void;
const listeners = new Set<Listener>();
let offline = false;

export function subscribeOffline(l: Listener) {
  listeners.add(l);
  l(offline);
  return () => { listeners.delete(l); };
}

function setOffline(v: boolean) {
  if (offline === v) return;
  offline = v;
  listeners.forEach((l) => l(v));
}

export function reportOnline() { setOffline(false); }
export function reportOffline() { setOffline(true); }

function isCacheable(url: string, method: string): boolean {
  if (!url.includes("/rest/v1/")) return false;
  if (method === "GET" || method === "HEAD") return true;
  if (method === "POST") return /\/rest\/v1\/rpc\/(search_|get_)/.test(url);
  return false;
}

function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Which account is asking (from the login token), so saved copies never mix between accounts.
function userScope(headers: Headers): string {
  try {
    const auth = headers.get("authorization") || "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.sub || "anon";
  } catch {
    return "anon";
  }
}

let writeChain: Promise<void> = Promise.resolve();
function enqueue(task: () => Promise<void>) {
  writeChain = writeChain.then(task).catch(() => {});
}

async function save(key: string, value: object) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  let index: string[] = raw ? JSON.parse(raw) : [];
  index = [key, ...index.filter((k) => k !== key)];
  if (index.length > MAX_ENTRIES) {
    const drop = index.slice(MAX_ENTRIES);
    index = index.slice(0, MAX_ENTRIES);
    await AsyncStorage.multiRemove(drop);
  }
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export async function clearOfflineCache() {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const index: string[] = raw ? JSON.parse(raw) : [];
    await AsyncStorage.multiRemove([...index, INDEX_KEY]);
  } catch { /* ignore */ }
}

export async function cachedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const req = typeof input === "string" || input instanceof URL ? null : (input as Request);
  const url = req ? req.url : String(input);
  const method = (init?.method || req?.method || "GET").toUpperCase();

  if (!isCacheable(url, method)) {
    try {
      const res = await fetch(input as any, init);
      reportOnline();
      return res;
    } catch (e) {
      reportOffline();
      throw e;
    }
  }

  const headers = new Headers(init?.headers || req?.headers);
  const bodyText = typeof init?.body === "string" ? init.body : "";
  const key = PREFIX + hash(`${userScope(headers)}|${method}|${url}|${bodyText}`);

  try {
    const res = await fetch(input as any, init);
    reportOnline();
    if (res.ok && res.status !== 206) {
      const copy = res.clone();
      copy.text().then((text) => {
        if (text.length > MAX_BODY_CHARS) return;
        enqueue(() => save(key, {
          status: res.status,
          body: text,
          contentType: res.headers.get("content-type") || "application/json",
          contentRange: res.headers.get("content-range") || "",
        }));
      }).catch(() => {});
    }
    return res;
  } catch (e) {
    reportOffline();
    try {
      const raw = await AsyncStorage.getItem(key);
      if (raw) {
        const hit = JSON.parse(raw);
        const h: Record<string, string> = { "content-type": hit.contentType, "x-from-cache": "1" };
        if (hit.contentRange) h["content-range"] = hit.contentRange;
        const noBody = hit.status === 204 || hit.status === 205 || method === "HEAD";
        return new Response(noBody ? null : hit.body, { status: hit.status, headers: h });
      }
    } catch { /* fall through */ }
    throw e;
  }
}
