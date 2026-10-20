// ===============================================================
// src/screens/vendor/InsightsScreen.tsx
//
// Business Insights, Phase 1 -- same numbers and counting rules as the
// website's Business Insights page (insight/page.tsx):
//   Marketplace Performance, Lead Generation (incl. Video Plays),
//   Catalog Performance, Search Keywords.
// Health Score, Growth Coach, Ranking and Sponsorship stay on the
// website for now (link at the bottom).
// ===============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import { openWebPageSignedIn } from "../../lib/webHandoff";
import { colors } from "../../theme/colors";
import SpotlightMark from "../../components/SpotlightMark";

type Period = "Today" | "This Week" | "This Month" | "This Quarter" | "This Year";
const PERIODS: Period[] = ["Today", "This Week", "This Month", "This Quarter", "This Year"];

type Growth = { growth: number | string; up: boolean };
type Stat = { label: string; value: number } & Growth;
type Lead = { label: string; icon: string; brand?: boolean; color: string; value: number } & Growth;
type CatalogItem = { name: string; views: number };
type KeywordRow = { term: string; searches: number; pct: number };
type Sponsorship = { sponsorship_type: string; tier: string; expires_at: string };
type HealthData = {
  total: number;
  items: { label: string; score: number }[];
  profile: { logo: boolean; cover: boolean; description: boolean; hours: boolean; contact: boolean };
  catalog: { products: number; services: number; total: number; required: number };
  review: { rating: number; count: number };
};
type TaxOption = { kind: "product" | "service"; subcategoryId: string; label: string };
type RankState = { current: number | string; sponsored: number | null; totalPeers: number; failed?: boolean };
type Ranges = { currentStart: Date; previousStart: Date; previousEnd: Date };

/* ---------- Same rules as the website ---------- */

function getPeriodRanges(period: Period): Ranges {
  const now = new Date();
  let currentStart = new Date();
  let previousStart = new Date();
  let previousEnd = new Date();
  switch (period) {
    case "Today":
      currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 1);
      previousEnd = new Date(currentStart);
      break;
    case "This Week":
      currentStart = new Date(now);
      currentStart.setDate(now.getDate() - 6);
      previousEnd = new Date(currentStart);
      previousStart = new Date(currentStart);
      previousStart.setDate(previousStart.getDate() - 7);
      break;
    case "This Month":
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      previousEnd = new Date(currentStart);
      break;
    case "This Quarter": {
      const quarter = Math.floor(now.getMonth() / 3);
      currentStart = new Date(now.getFullYear(), quarter * 3, 1);
      previousStart = new Date(now.getFullYear(), quarter * 3 - 3, 1);
      previousEnd = new Date(currentStart);
      break;
    }
    case "This Year":
      currentStart = new Date(now.getFullYear(), 0, 1);
      previousStart = new Date(now.getFullYear() - 1, 0, 1);
      previousEnd = new Date(currentStart);
      break;
  }
  return { currentStart, previousStart, previousEnd };
}

function calcGrowth(current: number, previous: number): Growth {
  if (!previous) return { growth: current > 0 ? "NEW" : 0, up: true };
  const pct = Math.round(((current - previous) / previous) * 100);
  return { growth: Math.abs(pct), up: pct >= 0 };
}

function bucketRecords(records: { created_at: string }[], period: Period): { labels: string[]; values: number[] } {
  const get = (r: { created_at: string }) => new Date(r.created_at);
  if (period === "Today") {
    const labels = ["12am", "3am", "6am", "9am", "12pm", "3pm", "6pm", "9pm"];
    const values = labels.map(() => 0);
    records.forEach((r) => { values[Math.min(7, Math.floor(get(r).getHours() / 3))]++; });
    return { labels, values };
  }
  if (period === "This Week") {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const values = days.map(() => 0);
    records.forEach((r) => { values[(get(r).getDay() + 6) % 7]++; });
    return { labels: days, values };
  }
  if (period === "This Month") {
    const labels = ["Week 1", "Week 2", "Week 3", "Week 4"];
    const values = [0, 0, 0, 0];
    records.forEach((r) => { const d = get(r).getDate(); values[d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : 3]++; });
    return { labels, values };
  }
  if (period === "This Quarter") {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const qm = Math.floor(new Date().getMonth() / 3) * 3;
    const labels = [monthNames[qm], monthNames[qm + 1], monthNames[qm + 2]];
    const values = [0, 0, 0];
    records.forEach((r) => { const i = get(r).getMonth() - qm; if (i >= 0 && i < 3) values[i]++; });
    return { labels, values };
  }
  const labels = ["Q1", "Q2", "Q3", "Q4"];
  const values = [0, 0, 0, 0];
  records.forEach((r) => { values[Math.floor(get(r).getMonth() / 3)]++; });
  return { labels, values };
}

function healthLabelFor(score: number) {
  if (score >= 80) return "Excellent Visibility";
  if (score >= 60) return "Good Visibility";
  if (score >= 40) return "Fair Visibility";
  return "Needs Improvement";
}

// Same plan caps as the website (products + services combined).
function recommendedCatalogSize(v: any): number {
  const tier = v.plan_tier || "free";
  if (tier === "custom") return 999999;
  const isTrial = tier === "free" && !!v.trial_started_at && new Date(v.trial_started_at).getTime() > Date.now() - 90 * 24 * 60 * 60 * 1000;
  const cap = v.subscription_status === "active"
    ? (tier === "standard" ? 25 : tier === "enterprise" ? 50 : tier === "elite" ? 100 : 2)
    : (isTrial ? 5 : 2);
  return cap * 2;
}

async function computeHealth(v: any, sponsorships: Sponsorship[]): Promise<HealthData> {
  const profile = {
    logo: !!v.logo_url,
    cover: !!v.cover_url,
    description: !!(v.description && String(v.description).replace(/<[^>]*>/g, "").trim()),
    hours: !!(v.open_time && v.close_time && v.business_days),
    contact: !!((v.whatsapp || v.telephone) && v.email),
  };
  const profileScore = Object.values(profile).filter(Boolean).length * 4;
  const verificationScore = v.verification_status === "blue" ? 20 : v.verification_status === "gray" ? 12 : 0;
  const rating = Number(v.average_rating || 0);
  const count = Number(v.reviews_count || 0);
  const reviewsScore = Math.round((rating / 5) * 12 + Math.min(count / 10, 1) * 8);
  const [pc, sc] = await Promise.all([
    supabase.from("vendor_products").select("*", { count: "exact", head: true }).eq("vendor_id", v.id),
    supabase.from("vendor_services").select("*", { count: "exact", head: true }).eq("vendor_id", v.id),
  ]);
  const products = pc.count || 0;
  const services = sc.count || 0;
  const required = recommendedCatalogSize(v);
  const catalogScore = Math.round(Math.min((products + services) / required, 1) * 20);
  const sponsorScore = sponsorships.length > 0 ? 20 : 0;
  const total = Math.min(100, profileScore + verificationScore + reviewsScore + catalogScore + sponsorScore);
  return {
    total,
    items: [
      { label: "Profile Completeness", score: profileScore },
      { label: "Verification", score: verificationScore },
      { label: "Reviews", score: reviewsScore },
      { label: "Catalog", score: catalogScore },
      { label: "Sponsorship", score: sponsorScore },
    ],
    profile,
    catalog: { products, services, total: products + services, required },
    review: { rating, count },
  };
}

async function loadTaxonomy(vendorId: string): Promise<TaxOption[]> {
  const sel = "subcategory_id, categories:category_id(name), subcategories:subcategory_id(name)";
  const [p, sv2] = await Promise.all([
    supabase.from("vendor_products").select(sel).eq("vendor_id", vendorId).not("category_id", "is", null).not("subcategory_id", "is", null),
    supabase.from("vendor_services").select(sel).eq("vendor_id", vendorId).not("category_id", "is", null).not("subcategory_id", "is", null),
  ]);
  const seen = new Set<string>();
  const out: TaxOption[] = [];
  const one = (x: any) => (Array.isArray(x) ? x[0]?.name : x?.name);
  const add = (rows: any[] | null, kind: "product" | "service") => (rows || []).forEach((r) => {
    const c = one(r.categories), sc = one(r.subcategories);
    const key = `${kind}:${r.subcategory_id}`;
    if (!c || !sc || !r.subcategory_id || seen.has(key)) return;
    seen.add(key);
    out.push({ kind, subcategoryId: r.subcategory_id, label: `${c} / ${sc}` });
  });
  add(p.data as any[], "product");
  add(sv2.data as any[], "service");
  return out;
}

async function loadRank(vendorId: string, sel: TaxOption, r: Ranges): Promise<RankState> {
  try {
    const { data, error } = await supabase.rpc("get_vendor_period_ranking", {
      p_vendor_id: vendorId, p_subcategory_id: sel.subcategoryId, p_kind: sel.kind, p_period_start: r.currentStart.toISOString(),
    });
    if (error) return { current: "—", sponsored: null, totalPeers: 0, failed: true };
    // the database function returns a one-row table; handle both shapes
    const d: any = Array.isArray(data) ? data[0] : data;
    if (!d || !d.total_peers) return { current: "—", sponsored: null, totalPeers: Number(d?.total_peers ?? 0) };
    return { current: d.view_rank != null ? Number(d.view_rank) : "—", sponsored: d.sponsored_rank != null ? Number(d.sponsored_rank) : null, totalPeers: Number(d.total_peers) };
  } catch {
    return { current: "—", sponsored: null, totalPeers: 0, failed: true };
  }
}

async function countEvents(vendorId: string, eventType: string, start: Date, end?: Date): Promise<number> {
  let query = supabase.from("analytics_events").select("*", { count: "exact", head: true })
    .eq("vendor_id", vendorId).eq("event_type", eventType).gte("created_at", start.toISOString());
  if (end) query = query.lt("created_at", end.toISOString());
  const { count } = await query;
  return count || 0;
}

async function statWithGrowth(vendorId: string, eventType: string, r: Ranges): Promise<{ value: number } & Growth> {
  const [cur, prev] = await Promise.all([
    countEvents(vendorId, eventType, r.currentStart),
    countEvents(vendorId, eventType, r.previousStart, r.previousEnd),
  ]);
  return { value: cur, ...calcGrowth(cur, prev) };
}

async function uniqueVisitors(vendorId: string, r: Ranges): Promise<{ value: number } & Growth> {
  const getUnique = async (start: Date, end?: Date) => {
    let query = supabase.from("analytics_events").select("visitor_id").eq("vendor_id", vendorId).gte("created_at", start.toISOString());
    if (end) query = query.lt("created_at", end.toISOString());
    const { data } = await query;
    return new Set((data || []).map((x: any) => x.visitor_id).filter(Boolean)).size;
  };
  const [cur, prev] = await Promise.all([getUnique(r.currentStart), getUnique(r.previousStart, r.previousEnd)]);
  return { value: cur, ...calcGrowth(cur, prev) };
}

const LEAD_TYPES: { label: string; icon: string; brand?: boolean; color: string; event: string }[] = [
  { label: "WhatsApp Chats", icon: "whatsapp", brand: true, color: "#25d366", event: "whatsapp_click" },
  { label: "Phone Calls", icon: "phone", color: "#3b82f6", event: "phone_click" },
  { label: "Directions", icon: "location-dot", color: "#ef4444", event: "direction_click" },
  { label: "Catalog Visits", icon: "book-open", color: "#f59e0b", event: "catalog_visit" },
  { label: "External Visits", icon: "arrow-up-right-from-square", color: "#a78bfa", event: "external_visit" },
  { label: "Video Plays", icon: "circle-play", color: "#f59e0b", event: "video_play" },
];

function growthText(g: Growth) {
  return `${g.up ? "▲" : "▼"} ${g.growth}${g.growth !== "NEW" ? "%" : ""}`;
}

// Half-circle "meter" like the website's, drawn with plain Views (no extra
// native library needed): 36 small bars along a 180-degree arc, coloured
// red -> gold -> green, filled up to the score and grey beyond it.
function lerp(a: number, b: number, t: number) { return Math.round(a + (b - a) * t); }
function gaugeColor(t: number) {
  const red = [217, 48, 37], gold = [230, 184, 0], green = [30, 142, 62];
  const [from, to, k] = t < 0.5 ? [red, gold, t / 0.5] : [gold, green, (t - 0.5) / 0.5];
  return `rgb(${lerp(from[0], to[0], k)},${lerp(from[1], to[1], k)},${lerp(from[2], to[2], k)})`;
}

function HealthGauge({ score }: { score: number }) {
  const W = 230, H = 135, cx = W / 2, cy = 118, r = 98, N = 36, barW = 7, barH = 18;
  const pct = Math.max(0, Math.min(1, score / 100));
  return (
    <View style={{ width: W, height: H, alignSelf: "center" }}>
      {Array.from({ length: N }).map((_, i) => {
        const t = i / (N - 1);
        const theta = Math.PI - t * Math.PI; // 180deg -> 0deg
        const x = cx + r * Math.cos(theta) - barW / 2;
        const y = cy - r * Math.sin(theta) - barH / 2;
        const rot = 90 - (theta * 180) / Math.PI;
        const filled = t <= pct + 0.0001 && score > 0;
        return (
          <View
            key={i}
            style={{
              position: "absolute", left: x, top: y, width: barW, height: barH, borderRadius: 3,
              backgroundColor: filled ? gaugeColor(t) : "#2d2d2d",
              transform: [{ rotate: `${rot}deg` }],
            }}
          />
        );
      })}
      <View style={{ position: "absolute", left: 0, right: 0, top: 56, alignItems: "center" }}>
        <Text style={styles.healthNum}>{score}</Text>
        <Text style={styles.healthOf}>/100</Text>
      </View>
    </View>
  );
}

export default function InsightsScreen() {
  const navigation = useNavigation();
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [vendorName, setVendorName] = useState("");
  const [vendorRow, setVendorRow] = useState<any>(null);
  const [sponsorships, setSponsorships] = useState<Sponsorship[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [openCoach, setOpenCoach] = useState<number | null>(null);
  const [taxOptions, setTaxOptions] = useState<TaxOption[]>([]);
  const [taxSel, setTaxSel] = useState<TaxOption | null>(null);
  const [rank, setRank] = useState<RankState | null>(null);
  const [showFactors, setShowFactors] = useState(false);
  const [audience, setAudience] = useState<{ total: number; rows: { state: string; count: number; pct: number }[] } | null>(null);
  const [rankTick, setRankTick] = useState(0);
  const [coachBreakdown, setCoachBreakdown] = useState(false);
  const [booting, setBooting] = useState(true);
  const [period, setPeriod] = useState<Period>("This Month");

  const [stats, setStats] = useState<Stat[] | null>(null);
  const [chart, setChart] = useState<{ labels: string[]; values: number[] } | null>(null);
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [catalog, setCatalog] = useState<{ products: CatalogItem[]; services: CatalogItem[] } | null>(null);
  const [keywords, setKeywords] = useState<KeywordRow[] | null>(null);
  const runId = useRef(0); // ignores results from a period you've already switched away from

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: v } = await supabase.from("vendors").select("*").eq("auth_user_id", user.id).maybeSingle();
        if (v) { setVendorId(v.id); setVendorName(v.name || ""); setVendorRow(v); }
      }
      setBooting(false);
    })();
  }, []);

  const loadAll = useCallback(async () => {
    if (!vendorId) return;
    const id = ++runId.current;
    const live = () => id === runId.current;
    const r = getPeriodRanges(period);

    const tasks = [
      (async () => {
        const { data } = await supabase.from("analytics_events").select("visitor_id, visitor_state").eq("vendor_id", vendorId)
          .gte("created_at", r.currentStart.toISOString()).not("visitor_id", "is", null).order("created_at", { ascending: false }).limit(5000);
        // each anonymous visitor counted once; older rows without a visitor_id are left out
        const byVisitor: Record<string, string> = {};
        (data || []).forEach((x: any) => { if (x.visitor_state || !byVisitor[x.visitor_id]) byVisitor[x.visitor_id] = x.visitor_state || ""; });
        const stateMap: Record<string, number> = {};
        Object.values(byVisitor).forEach((st) => { if (st) stateMap[st] = (stateMap[st] || 0) + 1; });
        const known = Object.values(stateMap).reduce((a, n) => a + n, 0);
        const sorted = Object.entries(stateMap).sort((a, b) => b[1] - a[1]);
        const rows = sorted.slice(0, 5).map(([state, count]) => ({ state, count, pct: known ? Math.round((count / known) * 100) : 0 }));
        const others = sorted.slice(5).reduce((a, [, n]) => a + n, 0);
        if (others > 0) rows.push({ state: "Others", count: others, pct: known ? Math.round((others / known) * 100) : 0 });
        if (live()) setAudience({ total: Object.keys(byVisitor).length, rows });
      })(),
      (async () => {
        const { data: sp } = await supabase.from("vendor_sponsorships").select("sponsorship_type, tier, expires_at")
          .eq("vendor_id", vendorId).eq("payment_status", "active").gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: true });
        const active = (sp || []) as Sponsorship[];
        const h = vendorRow ? await computeHealth(vendorRow, active) : null;
        const tax = await loadTaxonomy(vendorId);
        if (!live()) return;
        setSponsorships(active); setHealth(h); setTaxOptions(tax);
        setTaxSel((prev) => prev ?? tax[0] ?? null);
      })(),
      (async () => {
        const [pv, uv, si] = await Promise.all([statWithGrowth(vendorId, "profile_view", r), uniqueVisitors(vendorId, r), statWithGrowth(vendorId, "search_impression", r)]);
        if (live()) setStats([{ label: "Profile Views", ...pv }, { label: "Unique Visitors", ...uv }, { label: "Search Impressions", ...si }]);
      })(),
      (async () => {
        const { data } = await supabase.from("analytics_events").select("created_at").eq("vendor_id", vendorId)
          .eq("event_type", "profile_view").gte("created_at", r.currentStart.toISOString()).order("created_at", { ascending: false }).limit(5000);
        if (live()) setChart(bucketRecords((data || []) as { created_at: string }[], period));
      })(),
      (async () => {
        const rows = await Promise.all(LEAD_TYPES.map(async (lt) => ({ label: lt.label, icon: lt.icon, brand: lt.brand, color: lt.color, ...(await statWithGrowth(vendorId, lt.event, r)) })));
        if (live()) setLeads(rows);
      })(),
      (async () => {
        const [pr, sr] = await Promise.all([
          supabase.from("analytics_events").select("product_id, vendor_products(id, product_name)").eq("vendor_id", vendorId)
            .eq("event_type", "product_view").not("product_id", "is", null).gte("created_at", r.currentStart.toISOString()),
          supabase.from("analytics_events").select("service_id, vendor_services(id, service_name)").eq("vendor_id", vendorId)
            .eq("event_type", "service_view").not("service_id", "is", null).gte("created_at", r.currentStart.toISOString()),
        ]);
        const pm: Record<string, CatalogItem> = {};
        (pr.data || []).forEach((x: any) => { const k = x.product_id; if (!pm[k]) pm[k] = { name: x.vendor_products?.product_name || `Product ${String(k).slice(0, 8)}`, views: 0 }; pm[k].views++; });
        const sm: Record<string, CatalogItem> = {};
        (sr.data || []).forEach((x: any) => { const k = x.service_id; if (!sm[k]) sm[k] = { name: x.vendor_services?.service_name || `Service ${String(k).slice(0, 8)}`, views: 0 }; sm[k].views++; });
        if (live()) setCatalog({ products: Object.values(pm).sort((a, b) => b.views - a.views), services: Object.values(sm).sort((a, b) => b.views - a.views) });
      })(),
      (async () => {
        const { data } = await supabase.from("analytics_events").select("search_keyword").eq("vendor_id", vendorId)
          .eq("event_type", "search_impression").gte("created_at", r.currentStart.toISOString()).order("created_at", { ascending: false }).limit(5000);
        const termMap: Record<string, number> = {};
        const display: Record<string, string> = {};
        (data || []).forEach((x: any) => {
          const raw = (x.search_keyword || "").trim();
          if (!raw) return;
          const key = raw.toLowerCase();
          termMap[key] = (termMap[key] || 0) + 1;
          if (!display[key]) display[key] = raw.replace(/\w\S*/g, (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        });
        const total = Object.values(termMap).reduce((a, n) => a + n, 0) || 1;
        const rows = Object.entries(termMap).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ term: display[k], searches: n, pct: Math.round((n / total) * 100) }));
        if (live()) setKeywords(rows);
      })(),
    ];
    await Promise.all(tasks);
  }, [vendorId, vendorRow, period]);

  // Reload when the period changes (show spinners again for the sections).
  useEffect(() => {
    if (!vendorId) return;
    setStats(null); setAudience(null); setHealth(null); setRank(null); setChart(null); setLeads(null); setCatalog(null); setKeywords(null);
    loadAll();
  }, [vendorId, period, loadAll]);

  // Ranking depends on period + chosen category
  useEffect(() => {
    if (!vendorId || !taxSel) return;
    let cancelled = false;
    setRank(null);
    loadRank(vendorId, taxSel, getPeriodRanges(period)).then((x) => { if (!cancelled) setRank(x); });
    return () => { cancelled = true; };
  }, [vendorId, taxSel, period, rankTick]);

  const { refreshControl } = usePullRefresh(async () => { setRankTick((n) => n + 1); await loadAll(); });

  if (booting) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!vendorId) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.empty}>Couldn't load your insights right now.</Text>
      </View>
    );
  }

  const coach = health ? [
    { title: "Complete Profile", done: health.items[0].score >= 20, impact: health.items[0].score >= 20 ? null : "Recommended",
      lines: [`Score: ${health.items[0].score}/20`, `${health.profile.logo ? "✓" : "✗"} Logo`, `${health.profile.cover ? "✓" : "✗"} Cover image`, `${health.profile.description ? "✓" : "✗"} Business description`, `${health.profile.hours ? "✓" : "✗"} Business hours`, `${health.profile.contact ? "✓" : "✗"} Contact information`],
      action: null as null | { label: string; run: () => void } },
    { title: "Complete Business Verification", done: health.items[1].score >= 20, impact: health.items[1].score >= 20 ? null : "High impact",
      lines: [`Score: ${health.items[1].score}/20`, vendorRow?.verification_status === "blue" ? "✓ Fully verified" : vendorRow?.verification_status === "gray" ? "✓ Partially verified" : "✗ Not verified yet"],
      action: health.items[1].score >= 20 ? null : { label: "Verify on website", run: () => openWebPageSignedIn("/verify-badge") } },
    { title: "Add & Complete Products / Services", done: health.items[3].score >= 20, impact: health.items[3].score >= 20 ? null : "High impact",
      lines: [`Score: ${health.items[3].score}/20`, `Products: ${health.catalog.products} | Services: ${health.catalog.services}`, `Current listings: ${health.catalog.total} / Recommended: ${health.catalog.required}`, health.catalog.total < health.catalog.required ? `${health.catalog.required - health.catalog.total} more listing(s) recommended` : "You've met the recommended catalog size."],
      action: null },
    { title: "Get More Reviews", done: health.items[2].score >= 20, impact: health.items[2].score >= 20 ? null : "Recommended",
      lines: [`Score: ${health.items[2].score}/20`, `Average rating: ${health.review.rating.toFixed(1)} / 5`, `Total reviews: ${health.review.count}`],
      action: null },
    { title: "Sponsor Business / Products / Services", done: sponsorships.length > 0, impact: sponsorships.length > 0 ? null : "High impact",
      lines: [`Score: ${health.items[4].score}/20`, sponsorships.length > 0 ? `Currently sponsoring ${sponsorships.length} item${sponsorships.length > 1 ? "s" : ""}` : "Not currently sponsoring anything"],
      action: sponsorships.length > 0 ? null : { label: "Sponsor Now (website)", run: () => openWebPageSignedIn("/getsponsored") } },
  ] : [];
  const nearest = sponsorships[0];
  const daysLeft = nearest ? Math.max(0, Math.ceil((new Date(nearest.expires_at).getTime() - Date.now()) / 86400000)) : 0;
  const bizSponsor = sponsorships.find((x) => x.sponsorship_type === "business");
  const maxBar = Math.max(1, ...(chart?.values || [0]));
  const Loading = () => <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.dark }} contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <SpotlightMark size={22} />
      </View>
      <Text style={styles.title}>Business Insights</Text>
      <Text style={styles.subtitle}>{vendorName ? `How ${vendorName} is performing on Spotlight` : "How your business is performing on Spotlight"}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        {PERIODS.map((p) => (
          <TouchableOpacity key={p} style={[styles.chip, period === p && styles.chipActive]} onPress={() => setPeriod(p)}>
            <Text style={[styles.chipText, period === p && styles.chipTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* HEALTH SCORE */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Business Health Score</Text>
        {!health ? <Loading /> : (
          <>
            <HealthGauge score={health.total} />
            <View style={{ alignItems: "center", marginTop: 4, marginBottom: 14 }}>
              <Text style={[styles.healthLabel, { color: health.total >= 60 ? colors.success : health.total >= 40 ? colors.primary : colors.error }]}>{healthLabelFor(health.total)}</Text>
              <Text style={styles.healthStars}>{"★".repeat(Math.max(1, Math.min(5, Math.round(health.total / 20))))}<Text style={{ color: "#3a3a3a" }}>{"★".repeat(5 - Math.max(1, Math.min(5, Math.round(health.total / 20))))}</Text></Text>
            </View>
            {health.items.map((it) => (
              <View key={it.label} style={{ marginBottom: 8 }}>
                <View style={styles.listRow}><Text style={styles.listName}>{it.label}</Text><Text style={styles.listValue}>{it.score}/20</Text></View>
                <View style={styles.track}><View style={[styles.fill, { width: `${(it.score / 20) * 100}%` }]} /></View>
              </View>
            ))}
          </>
        )}
      </View>

      {/* GROWTH COACH */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Growth Coach</Text>
        {!health ? <Loading /> : coach.map((c, i) => (
          <View key={c.title} style={styles.coachItem}>
            <TouchableOpacity style={styles.coachHead} onPress={() => setOpenCoach(openCoach === i ? null : i)}>
              <Text style={[styles.coachTick, { color: c.done ? colors.success : colors.textSecondary }]}>{c.done ? "✓" : "○"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.coachTitle}>{c.title}</Text>
                {c.impact ? <Text style={[styles.coachImpact, { color: c.impact === "High impact" ? colors.error : colors.primary }]}>{c.impact}</Text> : <Text style={[styles.coachImpact, { color: colors.success }]}>Done</Text>}
              </View>
              <Text style={styles.coachChevron}>{openCoach === i ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {openCoach === i && (
              <View style={styles.coachBody}>
                {c.lines.map((ln) => <Text key={ln} style={styles.coachLine}>{ln}</Text>)}
                {c.action && (
                  <TouchableOpacity style={styles.webBtn} onPress={c.action.run}><Text style={styles.webBtnText}>{c.action.label}</Text></TouchableOpacity>
                )}
              </View>
            )}
          </View>
        ))}
        {health && (
          <>
            <View style={[styles.listRow, { marginTop: 14 }]}><Text style={styles.listName}>Growth Progress</Text><Text style={styles.listValue}>{health.total}%</Text></View>
            <View style={styles.track}><View style={[styles.fill, { width: `${health.total}%` }]} /></View>
            <TouchableOpacity onPress={() => setCoachBreakdown(!coachBreakdown)} style={{ marginTop: 12 }}>
              <Text style={styles.subHead}>Breakdown {coachBreakdown ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {coachBreakdown && (
              <>
                {health.items.map((it) => (
                  <View key={it.label} style={styles.listRow}><Text style={styles.listName}>{it.label}</Text><Text style={styles.listValue}>{it.score}/20</Text></View>
                ))}
                <View style={[styles.listRow, { borderTopWidth: 1, borderTopColor: "#1f1f1f", marginTop: 4 }]}><Text style={[styles.listName, { fontWeight: "700" }]}>Growth Score</Text><Text style={[styles.listValue, { color: colors.white, fontWeight: "700" }]}>{health.total}/100</Text></View>
              </>
            )}
          </>
        )}
      </View>

      {/* MARKETPLACE PERFORMANCE */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Marketplace Performance</Text>
        {!stats ? <Loading /> : (
          <View style={styles.statRow}>
            {stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value.toLocaleString()}</Text>
                <Text style={[styles.statGrowth, { color: s.up ? colors.success : colors.error }]}>{growthText(s)}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.chartTitle}>Profile views over time</Text>
        {!chart ? <Loading /> : (
          <View style={styles.chart}>
            {chart.values.map((v, i) => (
              <View key={chart.labels[i]} style={styles.barCol}>
                <Text style={styles.barValue}>{v > 0 ? v : ""}</Text>
                <View style={[styles.bar, { height: Math.max(3, Math.round((v / maxBar) * 80)) }]} />
                <Text style={styles.barLabel} numberOfLines={1}>{chart.labels[i]}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* LEAD GENERATION */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lead Generation</Text>
        {!leads ? <Loading /> : leads.map((l) => (
          <View key={l.label} style={styles.leadRow}>
            <View style={[styles.leadIcon, { backgroundColor: l.color + "26" }]}>
              <FontAwesome6 name={l.icon as any} iconStyle={l.brand ? "brand" : "solid"} size={14} color={l.color} />
            </View>
            <Text style={styles.leadLabel}>{l.label}</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.leadValue}>{l.value.toLocaleString()}</Text>
              <Text style={[styles.leadGrowth, { color: l.up ? colors.success : colors.error }]}>{growthText(l)}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* CATALOG PERFORMANCE */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Catalog Performance</Text>
        {!catalog ? <Loading /> : (
          <>
            <Text style={styles.subHead}>Top products</Text>
            {catalog.products.length === 0 ? <Text style={styles.muted}>No product views in this period.</Text> :
              catalog.products.slice(0, 5).map((p, i) => (
                <View key={p.name} style={styles.listRow}><View style={[styles.rankBadge, i === 0 && styles.rankBadgeTop]}><Text style={[styles.rankBadgeText, i === 0 && { color: colors.black }]}>{i + 1}</Text></View><Text style={styles.listName} numberOfLines={1}>{p.name}</Text><Text style={styles.listValue}>{p.views} views</Text></View>
              ))}
            <Text style={[styles.subHead, { marginTop: 14 }]}>Top services</Text>
            {catalog.services.length === 0 ? <Text style={styles.muted}>No service views in this period.</Text> :
              catalog.services.slice(0, 5).map((p, i) => (
                <View key={p.name} style={styles.listRow}><View style={[styles.rankBadge, i === 0 && styles.rankBadgeTop]}><Text style={[styles.rankBadgeText, i === 0 && { color: colors.black }]}>{i + 1}</Text></View><Text style={styles.listName} numberOfLines={1}>{p.name}</Text><Text style={styles.listValue}>{p.views} views</Text></View>
              ))}
          </>
        )}
      </View>

      {/* SEARCH KEYWORDS */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Search Keywords</Text>
        {!keywords ? <Loading /> : keywords.length === 0 ? <Text style={styles.muted}>No search activity in this period.</Text> :
          keywords.slice(0, 10).map((k) => (
            <View key={k.term} style={{ marginBottom: 10 }}>
              <View style={styles.listRow}><Text style={styles.listName} numberOfLines={1}>{k.term}</Text><Text style={styles.listValue}>{k.searches} • {k.pct}%</Text></View>
              <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(3, k.pct)}%` }]} /></View>
            </View>
          ))}
      </View>

      {/* MARKETPLACE RANKING */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Marketplace Ranking</Text>
        {taxOptions.length === 0 ? (
          <Text style={styles.muted}>Add products or services with a category to see how you rank against similar businesses.</Text>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {taxOptions.map((o) => (
                <TouchableOpacity key={o.kind + o.subcategoryId} style={[styles.chip, taxSel?.subcategoryId === o.subcategoryId && taxSel?.kind === o.kind && styles.chipActive]} onPress={() => setTaxSel(o)}>
                  <Text style={[styles.chipText, taxSel?.subcategoryId === o.subcategoryId && taxSel?.kind === o.kind && styles.chipTextActive]}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {!rank ? <Loading /> : rank.failed ? (
              <Text style={styles.muted}>Couldn't load your ranking right now. Pull down to try again.</Text>
            ) : (
              <>
                <View style={styles.statRow}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Current Ranking</Text>
                    <Text style={styles.statValue}>{typeof rank.current === "number" ? `#${rank.current}` : rank.current}</Text>
                    <Text style={styles.muted}>of {rank.totalPeers} in this niche</Text>
                  </View>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>With Sponsorship</Text>
                    <Text style={[styles.statValue, { color: colors.success }]}>{rank.sponsored ? (rank.sponsored <= 5 ? `Top ${rank.sponsored}` : `#${rank.sponsored}`) : "—"}</Text>
                    <Text style={styles.muted}>within this niche</Text>
                  </View>
                </View>
                <Text style={[styles.muted, { marginTop: 10 }]}>
                  {typeof rank.current === "number" && rank.current <= 10 ? "You're doing great! Sponsor your business to reach Top 5." : "Sponsor your business to move up in search results and reach more customers."}
                </Text>
              </>
            )}
            <TouchableOpacity style={styles.webBtn} onPress={() => setShowFactors(!showFactors)}>
              <Text style={styles.webBtnText}>{showFactors ? "Hide ranking factors" : "Ranking factors"}</Text>
            </TouchableOpacity>
            {showFactors && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.muted}>These are the real factors that decide your position in search results, in priority order.</Text>
                <View style={styles.listRow}><Text style={styles.listName}>1. Sponsored status</Text><Text style={styles.listValue}>{bizSponsor ? `Yes (${bizSponsor.tier})` : "No"}</Text></View>
                <View style={styles.listRow}><Text style={styles.listName}>2. Verification status</Text><Text style={styles.listValue}>{vendorRow?.verification_status === "blue" ? "Fully Verified" : vendorRow?.verification_status === "gray" ? "Partially Verified" : "Not Verified"}</Text></View>
                <View style={styles.listRow}><Text style={styles.listName}>3. Average rating</Text><Text style={styles.listValue}>{(health?.review.rating ?? 0).toFixed(1)} / 5</Text></View>
                <View style={styles.listRow}><Text style={styles.listName}>4. Review count</Text><Text style={styles.listValue}>{health?.review.count ?? 0}</Text></View>
              </View>
            )}
          </>
        )}
      </View>

      {/* AUDIENCE */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Audience</Text>
        {!audience ? <Loading /> : (
          <>
            <Text style={styles.statValue}>{audience.total.toLocaleString()}</Text>
            <Text style={[styles.muted, { marginBottom: 10 }]}>Unique visitors this period</Text>
            {audience.rows.length === 0 ? <Text style={styles.muted}>No audience data yet. Locations appear as new visitors arrive.</Text> :
              audience.rows.map((a) => (
                <View key={a.state} style={{ marginBottom: 10 }}>
                  <View style={styles.listRow}><Text style={styles.listName}>{a.state}</Text><Text style={styles.listValue}>{a.count} • {a.pct}%</Text></View>
                  <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(3, a.pct)}%` }]} /></View>
                </View>
              ))}
          </>
        )}
      </View>

      {/* SPONSORSHIP -- payments stay on the website */}
      <View style={styles.card}>
        <View style={[styles.listRow, { marginBottom: 6 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Sponsorship</Text>
          <Text style={[styles.listValue, { color: sponsorships.length > 0 ? colors.success : colors.textSecondary, fontWeight: "700" }]}>{sponsorships.length > 0 ? "Active" : "Not Sponsored"}</Text>
        </View>
        <Text style={styles.muted}>
          {nearest
            ? `${nearest.tier.charAt(0).toUpperCase() + nearest.tier.slice(1)}-tier sponsorship on ${nearest.sponsorship_type === "business" ? "your business" : nearest.sponsorship_type === "product" ? "a product" : "a service"} is active until ${new Date(nearest.expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.${sponsorships.length > 1 ? ` You also have ${sponsorships.length - 1} other active sponsorship${sponsorships.length > 2 ? "s" : ""}.` : ""}`
            : "Sponsor your business to appear first in search results and reach more customers."}
        </Text>
        {nearest && <Text style={[styles.statValue, { marginTop: 8, color: daysLeft <= 7 ? colors.error : colors.white }]}>{daysLeft === 1 ? "1 day left" : `${daysLeft} days left`}</Text>}
        <TouchableOpacity style={styles.webBtn} onPress={() => openWebPageSignedIn("/getsponsored")}>
          <Text style={styles.webBtnText}>{sponsorships.length > 0 ? "Manage Sponsorship (website)" : "Sponsor Now (website)"}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 20, paddingTop: 50 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20, paddingTop: 50, paddingBottom: 60 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  back: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 14 },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 40 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginRight: 8 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.white, fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: colors.black },
  card: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { color: colors.white, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  statRow: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, backgroundColor: "#0a0a0a", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 },
  statLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  statValue: { color: colors.white, fontSize: 20, fontWeight: "700", marginTop: 4 },
  statGrowth: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  chartTitle: { color: colors.textSecondary, fontSize: 12, marginTop: 16, marginBottom: 8 },
  chart: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 120 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: { width: "55%", backgroundColor: colors.primary, borderRadius: 4 },
  barValue: { color: colors.white, fontSize: 10, marginBottom: 2, height: 14 },
  barLabel: { color: colors.textSecondary, fontSize: 10, marginTop: 4 },
  leadRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#1f1f1f" },
  leadIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginRight: 12 },
  leadLabel: { color: colors.white, fontSize: 14, flex: 1 },
  leadValue: { color: colors.white, fontSize: 16, fontWeight: "700" },
  leadGrowth: { fontSize: 11, fontWeight: "700" },
  subHead: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  muted: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  listRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, gap: 10 },
  listName: { color: colors.white, fontSize: 13, flex: 1 },
  listValue: { color: colors.textSecondary, fontSize: 12 },
  track: { height: 5, backgroundColor: "#262626", borderRadius: 3, overflow: "hidden" },
  fill: { height: 5, backgroundColor: colors.primary, borderRadius: 3 },
  healthNum: { color: colors.white, fontSize: 40, fontWeight: "800", lineHeight: 44 },
  healthStars: { color: colors.primary, fontSize: 18, letterSpacing: 2, marginTop: 4 },
  healthOf: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  healthLabel: { fontSize: 14, fontWeight: "700", marginTop: 2 },
  coachItem: { borderBottomWidth: 1, borderBottomColor: "#1f1f1f" },
  coachHead: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  coachTick: { fontSize: 16, width: 18, textAlign: "center" },
  coachTitle: { color: colors.white, fontSize: 13, fontWeight: "600" },
  coachImpact: { fontSize: 11, fontWeight: "700", marginTop: 2 },
  coachChevron: { color: colors.textSecondary, fontSize: 11 },
  coachBody: { paddingBottom: 12, paddingLeft: 28 },
  coachLine: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  rankBadge: { width: 18, height: 18, borderRadius: 5, backgroundColor: "#262626", alignItems: "center", justifyContent: "center" },
  rankBadgeTop: { backgroundColor: colors.primary },
  rankBadgeText: { color: colors.textSecondary, fontSize: 10, fontWeight: "800" },
  webBtn: { borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  webBtnText: { color: colors.primary, fontWeight: "700", fontSize: 13 },
});
