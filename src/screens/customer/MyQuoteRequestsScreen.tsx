// ===============================================================
// src/screens/customer/MyQuoteRequestsScreen.tsx
//
// The customer's OWN quote requests. Mirrors web's customer-profile
// "My Quote Requests" tab. Customer wording: received -> "Sent",
// viewed -> "Viewed by vendor", quoted -> "Quoted", closed -> "Closed".
// Opening this screen clears the "new" badge on the dashboard card.
// ===============================================================

import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "MyQuoteRequests">;

type QuoteRequest = {
  id: string; status: string; service_name: string | null; description: string; timeline: string | null;
  budget_range: string | null; state: string | null; lga: string | null; created_at: string;
  quoted_at: string | null; customer_viewed_at: string | null; vendor_id: string; vendor_name: string; vendor_slug: string;
};

function statusMeta(status: string): { label: string; color: string } {
  if (status === "viewed") return { label: "Viewed by vendor", color: "#60a5fa" };
  if (status === "quoted") return { label: "Quoted", color: colors.success };
  if (status === "closed") return { label: "Closed", color: colors.textSecondary };
  return { label: "Sent", color: "#facc15" };
}

export default function MyQuoteRequestsScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [requests, setRequests] = useState<QuoteRequest[]>([]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError(true); setLoading(false); return; }
    const { data: customer } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { setError(true); setLoading(false); return; }

    const { data, error: fetchError } = await supabase
      .from("quote_requests")
      .select("id, status, service_name, description, timeline, budget_range, state, lga, created_at, quoted_at, customer_viewed_at, vendor_id, vendors(name, slug)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(true);
    } else {
      const list: QuoteRequest[] = (data || [])
        .filter((row: any) => row.vendors)
        .map((row: any) => ({ ...row, vendor_name: row.vendors.name, vendor_slug: row.vendors.slug }));
      setRequests(list);

      const unreadIds = list.filter((r) => r.status === "quoted" && !r.customer_viewed_at).map((r) => r.id);
      if (unreadIds.length) {
        await supabase.from("quote_requests").update({ customer_viewed_at: new Date().toISOString() }).in("id", unreadIds);
      }
    }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  function confirmClose(id: string) {
    Alert.alert("Close this request?", "The vendor will no longer see it as open. You can't reopen it.", [
      { text: "Keep open", style: "cancel" },
      {
        text: "Close request", style: "destructive",
        onPress: async () => {
          const { error: err } = await supabase.from("quote_requests").update({ status: "closed" }).eq("id", id);
          if (err) { Alert.alert("Couldn't close", "Please try again."); return; }
          setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: "closed" } : r)));
        },
      },
    ]);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
      </View>
      <Text style={styles.title}>My Quote Requests</Text>
      <Text style={styles.subtitle}>Quotes you've asked vendors for</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your quote requests right now.</Text>
      ) : requests.length === 0 ? (
        <Text style={styles.empty}>No quote requests sent yet.</Text>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const meta = statusMeta(item.status);
            const isUnread = item.status === "quoted" && !item.customer_viewed_at;
            return (
              <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("VendorProfile", { slug: item.vendor_slug })}>
                <View style={styles.topRow}>
                  <Text style={styles.vendorName}>{item.vendor_name}</Text>
                  <View style={[styles.statusPill, { borderColor: meta.color }]}>
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {isUnread && <View style={styles.unreadDot} />}
                </View>
                {item.service_name && <Text style={styles.service}>{item.service_name}</Text>}
                <Text style={styles.desc} numberOfLines={3}>{item.description}</Text>
                <View style={styles.detailRow}>
                  <FontAwesome6 name="location-dot" size={12} color={colors.textSecondary} />
                  <Text style={styles.detail}>{[item.lga, item.state].filter(Boolean).join(", ")}</Text>
                </View>
                {item.timeline && (
                  <View style={styles.detailRow}>
                    <FontAwesome6 name="clock" size={12} color={colors.textSecondary} />
                    <Text style={styles.detail}>{item.timeline}</Text>
                  </View>
                )}
                {item.budget_range && (
                  <View style={styles.detailRow}>
                    <FontAwesome6 name="wallet" size={12} color={colors.textSecondary} />
                    <Text style={styles.detail}>{item.budget_range}</Text>
                  </View>
                )}
                <Text style={styles.date}>
                  Requested {new Date(item.created_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}
                  {item.status === "quoted" && item.quoted_at && (
                    <> · Quoted {new Date(item.quoted_at).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</>
                  )}
                </Text>
                {item.status !== "closed" && (
                  <TouchableOpacity style={styles.closeBtn} onPress={() => confirmClose(item.id)}>
                    <Text style={styles.closeBtnText}>Close request</Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 20, paddingTop: 50 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  back: { color: colors.primary, fontSize: 15 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: colors.white, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 20 },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 10 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  vendorName: { color: colors.white, fontSize: 14, fontWeight: "600", flex: 1 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  statusText: { fontSize: 11, fontWeight: "700" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  service: { color: colors.primary, fontSize: 12, fontWeight: "600", marginTop: 6 },
  desc: { color: colors.white, fontSize: 13, marginTop: 6 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  detail: { color: colors.textSecondary, fontSize: 12 },
  date: { color: colors.textSecondary, fontSize: 11, marginTop: 8 },
  closeBtn: { alignSelf: "flex-start", marginTop: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 },
  closeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
});
