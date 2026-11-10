// ===============================================================
// src/screens/vendor/DashboardHomeScreen.tsx
//
// Ported from spotlightwebproject_staging/spotlight-next/src/app/
// (standalone)/vendordashboard/page.tsx's "Overview" section --
// this IS what "Dashboard home" means on web, there's no separately
// named file for it.
//
// Corrected 2026-09-10 per Cyril: the top-right spot was originally
// given to a plain Spotlight mark, but that position is actually
// meant for the vendor's profile icon -- tapping it on web opens a
// dropdown with Preferences / Performance / Logout. Rebuilt to
// match: a real profile icon + dropdown here, with Logout fully
// functional now and Preferences/Performance as clear placeholders
// (Settings and Business Insights are still ahead in the build
// order). The Spotlight mark moved to its own small spot above the
// header instead of being replaced outright -- every screen still
// shows it somewhere.
//
// Same 8-item profile-completion checklist, same plan/trial card,
// same email verification flow (same Edge Function, "swift-task").
//
// Nav tiles for Products/Services/Portfolio/Profile/Visit Requests/
// Settings are present (matching web's sidebar) but show "Coming
// soon" for now -- those are the NEXT items in the locked build
// order, not yet built. Each becomes a real navigation once its own
// turn comes, not silently faked here.
// ===============================================================

import { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Alert, Modal, Image, Animated } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import { openWebPageSignedIn } from "../../lib/webHandoff";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "DashboardHome">;

type Vendor = {
  id: string; name: string | null; email: string | null; spot_id: string | null;
  plan_tier: string | null; trial_started_at: string | null; email_verified: boolean | null;
  subscription_status: string | null; expires_at: string | null; billing_cycle: string | null;
  address: string | null; description: string | null; whatsapp: string | null; telephone: string | null;
  latitude: number | null; longitude: number | null; logo_url: string | null;
};

// Launch offer: 3 free months on any yearly plan paid up to the end of 31 Dec 2026 (Lagos time).
const OFFER_END_MS = new Date("2027-01-01T00:00:00+01:00").getTime();
const PAID_PLANS = ["standard", "enterprise", "elite"];

// Friendly plan name: the free plan is called "On the Map".
function planLabel(plan: string | null): string {
  if (!plan) return "—";
  if (plan === "free") return "On the Map (Free)";
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

const NAV_TILES = [
  { key: "products", label: "Products", icon: "box" },
  { key: "services", label: "Services", icon: "briefcase" },
  { key: "portfolio", label: "Portfolio", icon: "layer-group" },
  { key: "profile", label: "Edit Profile", icon: "user" },
  { key: "visitRequests", label: "Visit & Quote Requests", icon: "shield-heart" },
  { key: "settings", label: "Settings", icon: "gear" },
] as const;

export default function DashboardHomeScreen() {
  const navigation = useNavigation<Nav>();
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [mediaCount, setMediaCount] = useState(0);
  const [socialCount, setSocialCount] = useState(0);
  const [categorizedCount, setCategorizedCount] = useState(0);
  const [verifyState, setVerifyState] = useState<"idle" | "sending" | "sent" | "retry">("idle");
  const [trialText, setTrialText] = useState<{ days: string; ended: boolean } | null>(null);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [unreadRequests, setUnreadRequests] = useState(0);
  const [hiddenCounts, setHiddenCounts] = useState({ products: 0, services: 0 });
  const pulse = useRef(new Animated.Value(1)).current;

  async function load() {
    const { data: { session: __s } } = await supabase.auth.getSession(); const user = __s?.user ?? null;
    if (!user) { setLoading(false); return; }

    const { data: v } = await supabase.from("vendors").select("*").eq("auth_user_id", user.id).maybeSingle();
    if (!v) { setLoading(false); return; }
    setVendor(v);

    const [{ count: mCount }, { count: sCount }, { count: pCatCount }, { count: sCatCount }, { count: hpCount }, { count: hsCount }] = await Promise.all([
      supabase.from("vendor_media").select("*", { count: "exact", head: true }).eq("vendor_id", v.id),
      supabase.from("vendor_social_links").select("*", { count: "exact", head: true }).eq("vendor_id", v.id),
      supabase.from("vendor_products").select("*", { count: "exact", head: true }).eq("vendor_id", v.id).not("category_id", "is", null),
      supabase.from("vendor_services").select("*", { count: "exact", head: true }).eq("vendor_id", v.id).not("category_id", "is", null),
      supabase.from("vendor_products").select("*", { count: "exact", head: true }).eq("vendor_id", v.id).eq("hidden_by_plan", true),
      supabase.from("vendor_services").select("*", { count: "exact", head: true }).eq("vendor_id", v.id).eq("hidden_by_plan", true),
    ]);
    setHiddenCounts({ products: hpCount || 0, services: hsCount || 0 });
    setMediaCount(mCount || 0);
    setSocialCount(sCount || 0);
    setCategorizedCount((pCatCount || 0) + (sCatCount || 0));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // Gentle pulse on the launch-bonus card.
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.78, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    if (!vendor || vendor.plan_tier !== "free" || !vendor.trial_started_at) return;
    const start = new Date(vendor.trial_started_at);
    const expiry = new Date(start);
    expiry.setDate(expiry.getDate() + 90);

    function tick() {
      const diff = expiry.getTime() - Date.now();
      if (diff <= 0) {
        setTrialText({ days: "Your trial has ended", ended: true });
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      setTrialText({ days: `${days} Days Left`, ended: false });
    }
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [vendor]);

  // Unread count on the Visit & Quote Requests tile; refreshes every
  // time this screen comes back into focus (e.g. after opening the inbox).
  async function loadUnread() {
    const { data: { session: __s } } = await supabase.auth.getSession(); const user = __s?.user ?? null;
    if (!user) return;
    const { data: v } = await supabase.from("vendors").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!v) return;
    const [{ count: vc }, { count: qc }] = await Promise.all([
      supabase.from("visit_requests").select("*", { count: "exact", head: true }).eq("vendor_id", v.id).is("vendor_viewed_at", null),
      supabase.from("quote_requests").select("*", { count: "exact", head: true }).eq("vendor_id", v.id).is("vendor_viewed_at", null),
    ]);
    setUnreadRequests((vc || 0) + (qc || 0));
  }
  useFocusEffect(useCallback(() => { loadUnread(); }, []));
  const { refreshControl } = usePullRefresh(() => Promise.all([load(), loadUnread()]));

  async function handleVerifyEmail() {
    if (!vendor) return;
    setVerifyState("sending");
    try {
      const { error } = await supabase.functions.invoke("swift-task", {
        body: { vendorId: vendor.id, email: vendor.email },
      });
      setVerifyState(error ? "retry" : "sent");
    } catch {
      setVerifyState("retry");
    }
  }

  function handleTilePress(key: string) {
    if (key === "products") {
      navigation.navigate("Products");
      return;
    }
    if (key === "services") {
      navigation.navigate("Services");
      return;
    }
    if (key === "portfolio") {
      navigation.navigate("Portfolio");
      return;
    }
    if (key === "profile") {
      navigation.navigate("ProfileEdit");
      return;
    }
    if (key === "visitRequests") {
      navigation.navigate("VisitRequestsReceived");
      return;
    }
    if (key === "settings") {
      navigation.navigate("Settings");
      return;
    }
    Alert.alert("Coming soon", "This section is being built next.");
  }

  async function handleLogout() {
    setProfileMenuOpen(false);
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: "Home" }] });
  }

  function handlePlaceholder(label: string) {
    setProfileMenuOpen(false);
    Alert.alert("Coming soon", `${label} is being built next.`);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!vendor) {
    return <View style={styles.center}><Text style={styles.emptyText}>Vendor account not found.</Text></View>;
  }

  const emailVerified = vendor.email_verified === true;
  const hasBasic = !!(vendor.name && vendor.email);
  const hasDetails = !!(vendor.address && vendor.description);
  const hasCategory = categorizedCount > 0;
  const hasContact = !!(vendor.whatsapp && vendor.telephone);
  const hasLocation = !!(vendor.latitude && vendor.longitude);
  const hasMedia = mediaCount > 0;
  const hasSocial = socialCount > 0;

  const checklistItems = [
    { label: "Business name & email", ok: hasBasic },
    { label: "Address & description", ok: hasDetails },
    { label: "At least 1 categorized product or service", ok: hasCategory },
    { label: "WhatsApp & telephone", ok: hasContact },
    { label: "Business location (map)", ok: hasLocation },
    { label: "Email verified", ok: emailVerified },
    { label: "Add at least 1 media", ok: hasMedia },
    { label: "Add at least 1 social link", ok: hasSocial },
  ];
  const score = checklistItems.filter((i) => i.ok).length;
  const percent = Math.round((score / checklistItems.length) * 100);
  const complete = percent === 100;

  const verifyLabel =
    verifyState === "sending" ? "Sending..." :
    verifyState === "sent" ? "Email Sent" :
    verifyState === "retry" ? "Try Again" : "Verify Email";

  return (
    <ScrollView refreshControl={refreshControl} style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.markRow}>
        <SpotlightMark size={20} />
      </View>

      <View style={styles.header}>
        <View>
          <Text style={styles.vendorName}>{vendor.name || "—"}</Text>
          <Text style={styles.spotId}>{vendor.spot_id || "—"}</Text>
        </View>
        <TouchableOpacity style={styles.profileIcon} onPress={() => setProfileMenuOpen(true)}>
          <Image
            source={{ uri: vendor.logo_url || "https://spotlightdirectories.com/images/default-vendor-logo.png" }}
            style={styles.profileImage}
          />
        </TouchableOpacity>
      </View>

      {/* PROFILE STATUS */}
      <View style={styles.card}>
        <View style={styles.statusTop}>
          <View style={[styles.statusIcon, { backgroundColor: complete ? "#dcfce7" : "#fef3c7" }]}>
            <Text style={{ color: complete ? "#166534" : "#92400e", fontWeight: "700" }}>✔</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.cardLabel}>Profile Status</Text>
            <Text style={styles.statusTitle}>{complete ? "Fully Onboarded & Optimized" : "Partially Onboarded"}</Text>
            <Text style={styles.statusSubtext}>Your business listing is {percent}% complete.</Text>
          </View>
        </View>

        {checklistItems.map((item, i) => (
          <View key={i} style={styles.checkRow}>
            <Text style={{ color: item.ok ? colors.success : colors.error }}>{item.ok ? "✔" : "✖"}</Text>
            <Text style={styles.checkLabel}>{item.label}</Text>
          </View>
        ))}

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: complete ? colors.success : "#facc15" }]} />
        </View>
      </View>

      {/* PLAN */}
      {(() => {
        const plan = vendor.plan_tier || "free";
        const isPaid = PAID_PLANS.includes(plan) && vendor.subscription_status === "active" && !!vendor.expires_at;
        const msLeft = isPaid ? new Date(vendor.expires_at as string).getTime() - Date.now() : 0;
        const daysLeft = isPaid ? Math.max(0, Math.ceil(msLeft / 86400000)) : 0;
        const renewSoon = isPaid && daysLeft <= 90;
        const renewUrgent = isPaid && daysLeft <= 30;
        const offerOn = Date.now() < OFFER_END_MS;
        const offerDays = Math.max(0, Math.ceil((OFFER_END_MS - Date.now()) / 86400000));
        const hiddenTotal = hiddenCounts.products + hiddenCounts.services;
        return (
          <>
            <View style={styles.card}>
              <View style={styles.planTop}>
                <FontAwesome6 name="bolt" size={16} color={colors.primary} />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.cardLabel}>Current Plan</Text>
                  <Text style={styles.planName}>{planLabel(vendor.plan_tier)}</Text>
                </View>
              </View>
              {plan === "free" && trialText && (
                <View style={[styles.trialBox, trialText.ended && styles.trialBoxEnded]}>
                  <Text style={styles.trialLabel}>Free Trial</Text>
                  <Text style={styles.trialDays}>{trialText.days}</Text>
                </View>
              )}
              {isPaid && (
                <View style={[styles.trialBox, renewUrgent && styles.trialBoxEnded]}>
                  <Text style={styles.trialLabel}>Valid until</Text>
                  <Text style={styles.trialDays}>{fmtDate(vendor.expires_at as string)}</Text>
                  {renewSoon && (
                    <Text style={styles.planSub}>{daysLeft} {daysLeft === 1 ? "day" : "days"} left{renewUrgent ? " - renew now so nothing is lost" : ""}</Text>
                  )}
                </View>
              )}
              {plan === "free" && (
                <Text style={styles.planSub}>Start free: 2 products and 2 services visible to customers.</Text>
              )}
              <TouchableOpacity style={[styles.upgradeBtn, { backgroundColor: renewUrgent ? "#f59e0b" : "#facc15" }]} onPress={() => openWebPageSignedIn("/getlisted?context=upgrade")}>
                <Text style={styles.upgradeBtnText}>{renewSoon ? "Renew My Plan" : plan === "free" ? "Upgrade" : "Change Plan"}</Text>
              </TouchableOpacity>
            </View>

            {hiddenTotal > 0 && (
              <View style={[styles.card, styles.hiddenCard]}>
                <Text style={styles.hiddenTitle}>Some of your items are hidden</Text>
                <Text style={styles.hiddenText}>
                  {hiddenCounts.products} product(s) and {hiddenCounts.services} service(s) are hidden from customers because they are beyond the limit of your current plan. They are safe and not deleted. Upgrade or renew and they show again. Look for the "Hidden on your plan" tag in your Products and Services lists.
                </Text>
              </View>
            )}

            {offerOn && (
              <Animated.View style={[styles.card, styles.offerCard, { opacity: pulse }]}>
                <Text style={styles.offerTitle}>🎁 Launch bonus: 3 months FREE</Text>
                <Text style={styles.offerText}>
                  Pay for any yearly plan (new or renewal) on or before 31 December 2026 and get 3 extra months on top. {offerDays} {offerDays === 1 ? "day" : "days"} left.
                </Text>
                <TouchableOpacity style={styles.upgradeBtn} onPress={() => openWebPageSignedIn("/getlisted?context=upgrade")}>
                  <Text style={styles.upgradeBtnText}>{isPaid ? "Renew yearly and get 3 months" : "Get my 3 free months"}</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </>
        );
      })()}

      {/* BUSINESS QUICK INFO */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Business Quick Info</Text>
        <Text style={styles.infoLabel}>BUSINESS NAME</Text>
        <Text style={styles.infoValue}>{vendor.name || ""}</Text>
        <Text style={styles.infoLabel}>SPOT ID</Text>
        <Text style={styles.infoValue}>{vendor.spot_id || ""}</Text>
        <Text style={styles.infoLabel}>REGISTERED EMAIL</Text>
        <View style={styles.emailRow}>
          <Text style={styles.infoValue}>{vendor.email || ""}</Text>
          {emailVerified ? (
            <Text style={styles.verifiedTag}>Verified</Text>
          ) : (
            <TouchableOpacity onPress={handleVerifyEmail} disabled={verifyState === "sending" || verifyState === "sent"}>
              <Text style={styles.verifyBtn}>{verifyLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* NAV TILES */}
      <Text style={styles.sectionTitle}>Manage Your Business</Text>
      <View style={styles.tileGrid}>
        {NAV_TILES.map((tile) => (
          <TouchableOpacity key={tile.key} style={styles.tile} onPress={() => handleTilePress(tile.key)}>
            <FontAwesome6 name={tile.icon as any} size={20} color={colors.white} />
            <Text style={styles.tileLabel}>{tile.label}</Text>
            {tile.key === "visitRequests" && unreadRequests > 0 && (
              <View style={styles.tileBadge}><Text style={styles.tileBadgeText}>{unreadRequests}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* BUSINESS INSIGHTS -- one long button; becomes a regular tile if another button is ever added */}
      <TouchableOpacity style={styles.insightsBtn} onPress={() => navigation.navigate("Insights")}>
        <FontAwesome6 name="chart-line" size={16} color={colors.primary} />
        <Text style={styles.insightsBtnText}>Business Insights</Text>
      </TouchableOpacity>

      {/* PROFILE DROPDOWN — Preferences / Performance / Logout */}
      <Modal visible={profileMenuOpen} animationType="fade" transparent onRequestClose={() => setProfileMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setProfileMenuOpen(false)}>
          <View style={styles.menuCard}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setProfileMenuOpen(false); navigation.navigate("Settings"); }}>
              <FontAwesome6 name="sliders" size={14} color={colors.white} />
              <Text style={styles.menuItemText}>Preferences</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setProfileMenuOpen(false); navigation.navigate("Insights"); }}>
              <FontAwesome6 name="chart-line" size={14} color={colors.white} />
              <Text style={styles.menuItemText}>Performance</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.menuItem, styles.menuItemLast]} onPress={handleLogout}>
              <FontAwesome6 name="right-from-bracket" size={14} color={colors.error} />
              <Text style={[styles.menuItemText, { color: colors.error }]}>Log Out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 60 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  markRow: { marginBottom: 16 },
  header: { marginBottom: 20, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  vendorName: { color: colors.white, fontSize: 20, fontWeight: "700" },
  spotId: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  profileIcon: { padding: 4 },
  profileImage: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.border },

  card: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 16 },
  statusTop: { flexDirection: "row", alignItems: "center" },
  statusIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  cardLabel: { color: colors.textSecondary, fontSize: 11, textTransform: "uppercase" },
  statusTitle: { color: colors.white, fontSize: 15, fontWeight: "700", marginTop: 2 },
  statusSubtext: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  checkRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  checkLabel: { color: colors.textSecondary, fontSize: 12, flexShrink: 1 },

  progressTrack: { height: 6, backgroundColor: "#0d0d0d", borderRadius: 3, marginTop: 14, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },

  planTop: { flexDirection: "row", alignItems: "center" },
  planName: { color: colors.white, fontSize: 16, fontWeight: "700", marginTop: 2 },
  trialBox: { backgroundColor: "#0d0d0d", borderRadius: 8, padding: 12, marginTop: 12 },
  trialBoxEnded: { borderWidth: 1, borderColor: colors.warning },
  trialLabel: { color: colors.textSecondary, fontSize: 11 },
  trialDays: { color: colors.primary, fontSize: 15, fontWeight: "700", marginTop: 2 },
  planSub: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  hiddenCard: { borderColor: colors.warning, borderWidth: 1 },
  hiddenTitle: { color: colors.warning, fontSize: 14, fontWeight: "700" },
  hiddenText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 6 },
  offerCard: { borderColor: colors.primary, borderWidth: 1.5 },
  offerTitle: { color: colors.primary, fontSize: 15, fontWeight: "800" },
  offerText: { color: colors.white, fontSize: 12, lineHeight: 18, marginTop: 6 },
  upgradeBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 12 },
  upgradeBtnText: { color: colors.black, fontWeight: "700", fontSize: 13 },

  sectionTitle: { color: colors.white, fontSize: 15, fontWeight: "700", marginBottom: 10 },
  infoLabel: { color: colors.textSecondary, fontSize: 10, textTransform: "uppercase", marginTop: 10 },
  infoValue: { color: colors.white, fontSize: 14, marginTop: 2 },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  verifiedTag: { color: colors.success, fontSize: 12, fontWeight: "700" },
  verifyBtn: { color: colors.primary, fontSize: 12, fontWeight: "700" },

  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 30 },
  tile: { width: "31%", backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 16, alignItems: "center" },
  tileBadge: { position: "absolute", top: 6, right: 8, backgroundColor: colors.primary, borderRadius: 999, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  tileBadgeText: { color: "#000", fontSize: 10, fontWeight: "800" },
  insightsBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.black, borderWidth: 1.5, borderColor: colors.primary, borderRadius: 10, paddingVertical: 14, marginTop: 12 },
  insightsBtnText: { color: colors.white, fontSize: 14, fontWeight: "700" },
  tileLabel: { color: colors.white, fontSize: 11, fontWeight: "600", marginTop: 8, textAlign: "center" },

  menuOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "flex-end", paddingTop: 95, paddingRight: 20 },
  menuCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, width: 180, overflow: "hidden" },
  menuItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  menuItemLast: { borderBottomWidth: 0 },
  menuItemText: { color: colors.white, fontSize: 13, fontWeight: "600" },
});
