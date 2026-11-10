// ===============================================================
// src/screens/customer/CustomerDashboardScreen.tsx
//
// The customer-side equivalent of DashboardHomeScreen.tsx for
// vendors -- a real hub with count cards, matching web's "Overview"
// tab on customer-profile/page.tsx. Replaces the old flat button
// list on LoggedInScreen for customers.
// ===============================================================

import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import { resolveActivityItems } from "./RecentlyViewedScreen";
import SpotlightMark from "../../components/SpotlightMark";
import AccountMenu from "../../components/AccountMenu";
import LegalLinks from "../../components/LegalLinks";
import AnalyticsOptOut from "../../components/AnalyticsOptOut";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "CustomerDashboard">;

const CARDS = [
  { key: "Favorites", icon: "heart", label: "Favorite Vendors" },
  { key: "RecentlyViewed", icon: "eye", label: "Recently Viewed" },
  { key: "MyInquiries", icon: "comments", label: "My Inquiries" },
  { key: "MyVisitRequests", icon: "shield-heart", label: "Visit Requests" },
  { key: "MyQuoteRequests", icon: "file-invoice-dollar", label: "Quote Requests" },
  { key: "MyReviews", icon: "star", label: "My Reviews" },
  { key: "SearchHistory", icon: "clock-rotate-left", label: "My Search History" },
] as const;

export default function CustomerDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<{ id: string; name: string | null; email: string | null; account_status?: string | null; scheduled_deletion_at?: string | null } | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [hasVendorAccount, setHasVendorAccount] = useState(false);
  const [counts, setCounts] = useState({ favorites: 0, viewed: 0, inquiries: 0, visits: 0, quotes: 0, reviews: 0, searches: 0 });
  const [unreadVisitReplies, setUnreadVisitReplies] = useState(0);
  const [unreadQuotes, setUnreadQuotes] = useState(0);

  async function load() {
    const { data: { session: __s } } = await supabase.auth.getSession(); const user = __s?.user ?? null;
    if (!user) { setLoading(false); return; }
    const { data: c } = await supabase.from("customers").select("id, name, email, account_status, scheduled_deletion_at").eq("auth_user_id", user.id).maybeSingle();
    if (!c) { setLoading(false); return; }
    setCustomer(c);

    const { data: vendorRow } = await supabase.from("vendors").select("id").eq("auth_user_id", user.id).maybeSingle();
    setHasVendorAccount(!!vendorRow);

    // Bug fix, 2026-09-09 per Cyril: counts here used to be raw
    // COUNT(*) queries straight against analytics_events/search_logs --
    // no dedup, no moderation_status filter, no 50-row cap -- which is
    // why they didn't match web at all (web's "count" is the length of
    // the same resolved/deduped/capped list the actual tab displays,
    // not a database count). Matched to web's exact logic now.
    const [{ count: favCount }, { data: viewEvents }, { data: inquiryEvents }, { count: visitCount }, { count: reviewCount }, { data: searchRows }, { data: visitRows }, { data: quoteRows }] = await Promise.all([
      supabase.from("customer_favorites").select("*", { count: "exact", head: true }).eq("customer_id", c.id),
      supabase.from("analytics_events").select("product_id, service_id, created_at").eq("customer_id", c.id).in("event_type", ["product_view", "service_view"]).order("created_at", { ascending: false }).limit(50),
      supabase.from("analytics_events").select("product_id, service_id, created_at").eq("customer_id", c.id).in("event_type", ["whatsapp_click", "phone_click"]).order("created_at", { ascending: false }).limit(50),
      supabase.from("visit_requests").select("*", { count: "exact", head: true }).eq("customer_id", c.id),
      supabase.from("vendor_reviews").select("*", { count: "exact", head: true }).eq("reviewer_email", c.email || ""),
      supabase.from("search_logs").select("id").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(50),
      supabase.from("visit_requests").select("id, status, customer_viewed_at").eq("customer_id", c.id),
      supabase.from("quote_requests").select("id, status, customer_viewed_at").eq("customer_id", c.id),
    ]);

    const [viewedItems, inquiryItems] = await Promise.all([
      resolveActivityItems(viewEvents || []),
      resolveActivityItems(inquiryEvents || []),
    ]);

    setCounts({
      favorites: favCount || 0, viewed: viewedItems.length, inquiries: inquiryItems.length,
      visits: visitCount || 0, quotes: (quoteRows || []).length, reviews: reviewCount || 0, searches: (searchRows || []).length,
    });

    const unread = (visitRows || []).filter((v) => (v.status === "acknowledged" || v.status === "declined") && !v.customer_viewed_at);
    setUnreadVisitReplies(unread.length);
    setUnreadQuotes((quoteRows || []).filter((q) => q.status === "quoted" && !q.customer_viewed_at).length);

    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));
  const { refreshControl } = usePullRefresh(load);

  // Account deletion: 14 days to change your mind, then everything is deleted.
  async function handleCloseAccount() {
    if (!customer?.email || !deletePassword) { setDeleteError("Please enter your password."); return; }
    setDeleteBusy(true); setDeleteError("");
    const { error: pwError } = await supabase.auth.signInWithPassword({ email: customer.email, password: deletePassword });
    if (pwError) { setDeleteError("That password is not correct."); setDeleteBusy(false); return; }
    const { data, error } = await supabase.rpc("close_customer_account");
    setDeleteBusy(false);
    if (error) { setDeleteError("We couldn't start the deletion. Please try again."); return; }
    setCustomer((c) => (c ? { ...c, account_status: "closing", scheduled_deletion_at: (data as string) || null } : c));
    setShowDelete(false); setDeletePassword("");
  }

  async function handleRestoreAccount() {
    setDeleteBusy(true);
    const { error } = await supabase.rpc("restore_customer_account");
    setDeleteBusy(false);
    if (error) { Alert.alert("We couldn't restore your account", "Please contact support."); return; }
    setCustomer((c) => (c ? { ...c, account_status: "active", scheduled_deletion_at: null } : c));
  }

  // Replaces the old "Back to Home" link, which just landed on the
  // login screen (there is no home to go back to once signed in).
  async function handleLogout() {
    await supabase.auth.signOut();
    navigation.reset({ index: 0, routes: [{ name: "Home" }] });
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!customer) return <View style={styles.center}><Text style={styles.emptyText}>Customer account not found.</Text></View>;

  return (
    <ScrollView refreshControl={refreshControl} style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.back}>Log Out</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
        <AccountMenu />
      </View>
      <Text style={styles.name}>{customer.name || "My Account"}</Text>
      <Text style={styles.email}>{customer.email || ""}</Text>

      {customer.account_status === "closing" && (
        <View style={{ backgroundColor: "#141414", borderWidth: 1, borderColor: "#f0b86e", borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <Text style={{ color: colors.white, fontWeight: "700", fontSize: 14 }}>Your account is scheduled for deletion.</Text>
          <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
            On {customer.scheduled_deletion_at ? new Date(customer.scheduled_deletion_at).toLocaleDateString("en-NG", { dateStyle: "long" }) : "the scheduled date"} everything will be permanently deleted. Until then you can change your mind.
          </Text>
          <TouchableOpacity disabled={deleteBusy} onPress={handleRestoreAccount} style={{ backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 10 }}>
            <Text style={{ color: "#000", fontWeight: "700" }}>{deleteBusy ? "Please wait..." : "Keep my account"}</Text>
          </TouchableOpacity>
        </View>
      )}

      {hasVendorAccount && (
        <View style={styles.vendorBanner}>
          <FontAwesome6 name="store" size={14} color={colors.primary} />
          <Text style={styles.vendorBannerText}>You also have a vendor account on Spotlight.</Text>
          <TouchableOpacity onPress={() => navigation.navigate("DashboardHome")}>
            <Text style={styles.vendorBannerLink}>Go to Dashboard</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.grid}>
        {CARDS.map((card) => (
          <TouchableOpacity key={card.key} style={styles.card} onPress={() => navigation.navigate(card.key as any)}>
            <FontAwesome6 name={card.icon as any} size={18} color={colors.primary} />
            <Text style={styles.cardCount}>
              {card.key === "MyVisitRequests" ? counts.visits : card.key === "MyQuoteRequests" ? counts.quotes : card.key === "Favorites" ? counts.favorites
                : card.key === "RecentlyViewed" ? counts.viewed : card.key === "MyInquiries" ? counts.inquiries
                : card.key === "MyReviews" ? counts.reviews : counts.searches}
              {card.key === "MyVisitRequests" && unreadVisitReplies > 0 ? ` (${unreadVisitReplies} new)` : ""}
              {card.key === "MyQuoteRequests" && unreadQuotes > 0 ? ` (${unreadQuotes} new)` : ""}
            </Text>
            <Text style={styles.cardLabel}>{card.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginTop: 14 }}>
        <AnalyticsOptOut />
        <LegalLinks />
        {customer.account_status !== "closing" && (
          <View style={{ marginTop: 18, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 }}>
            <Text style={{ color: colors.white, fontWeight: "700", fontSize: 14 }}>Delete my account</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 6 }}>
              You have 14 days to change your mind. After that, your account and everything in it is permanently deleted: your name, email, phone number, favourites, reviews, requests, photos and search history. We keep nothing that identifies you.
            </Text>
            {!showDelete ? (
              <TouchableOpacity onPress={() => setShowDelete(true)} style={{ borderWidth: 1, borderColor: "#e5484d", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 10 }}>
                <Text style={{ color: "#e5484d", fontWeight: "700" }}>Delete my account</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 6 }}>Enter your password to confirm</Text>
                <TextInput value={deletePassword} onChangeText={setDeletePassword} secureTextEntry autoCapitalize="none" placeholderTextColor="#777"
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.white }} />
                {!!deleteError && <Text style={{ color: "#e5484d", fontSize: 12, marginTop: 6 }}>{deleteError}</Text>}
                <TouchableOpacity disabled={deleteBusy} onPress={handleCloseAccount} style={{ backgroundColor: "#e5484d", borderRadius: 8, paddingVertical: 10, alignItems: "center", marginTop: 10 }}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>{deleteBusy ? "Please wait..." : "Yes, delete my account"}</Text>
                </TouchableOpacity>
                <TouchableOpacity disabled={deleteBusy} onPress={() => { setShowDelete(false); setDeletePassword(""); setDeleteError(""); }} style={{ alignItems: "center", marginTop: 10 }}>
                  <Text style={{ color: colors.textSecondary }}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  scrollContent: { padding: 20, paddingTop: 50, paddingBottom: 60 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  back: { color: colors.primary, fontSize: 15 },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  name: { color: colors.white, fontSize: 20, fontWeight: "700" },
  email: { color: colors.textSecondary, fontSize: 13, marginTop: 2, marginBottom: 20 },

  vendorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 12, marginBottom: 20 },
  vendorBannerText: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  vendorBannerLink: { color: colors.primary, fontSize: 12, fontWeight: "700" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  card: { width: "47%", backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, alignItems: "flex-start" },
  cardCount: { color: colors.white, fontSize: 22, fontWeight: "800", marginTop: 10 },
  cardLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
});
