// ===============================================================
// src/screens/customer/MyVisitRequestsScreen.tsx
//
// The customer's OWN sent visit requests -- distinct from a vendor's
// "Visit Requests received" inbox (that's Vendor Core, not built
// yet). Matches web's customer-profile "Visit Requests" tab: shows
// status (pending/acknowledged/declined) and marks unread replies as
// viewed once the customer opens this screen.
// ===============================================================

import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "MyVisitRequests">;

type VisitRequest = {
  id: string; status: string; location_note: string | null; message: string | null; created_at: string;
  customer_viewed_at: string | null; vendor_id: string; vendor_name: string; vendor_slug: string;
};

function statusMeta(status: string): { label: string; color: string } {
  if (status === "acknowledged") return { label: "Confirmed", color: colors.success };
  if (status === "declined") return { label: "Declined", color: colors.error };
  return { label: "Pending", color: "#facc15" };
}

export default function MyVisitRequestsScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [requests, setRequests] = useState<VisitRequest[]>([]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError(true); setLoading(false); return; }
    const { data: customer } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { setError(true); setLoading(false); return; }

    const { data, error: fetchError } = await supabase
      .from("visit_requests")
      .select("id, status, location_note, message, created_at, customer_viewed_at, vendor_id, vendors(name, slug)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(true);
    } else {
      const list: VisitRequest[] = (data || [])
        .filter((row: any) => row.vendors)
        .map((row: any) => ({ ...row, vendor_name: row.vendors.name, vendor_slug: row.vendors.slug }));
      setRequests(list);

      // Mark replied-to requests as viewed, clearing the "new" badge
      // on the dashboard's Visit Requests card, same as web.
      const unreadIds = list.filter((r) => (r.status === "acknowledged" || r.status === "declined") && !r.customer_viewed_at).map((r) => r.id);
      if (unreadIds.length) {
        await supabase.from("visit_requests").update({ customer_viewed_at: new Date().toISOString() }).in("id", unreadIds);
      }
    }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Visit Requests</Text>
      <Text style={styles.subtitle}>Requests you've sent to vendors</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your visit requests right now.</Text>
      ) : requests.length === 0 ? (
        <Text style={styles.empty}>No visit requests sent yet.</Text>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const meta = statusMeta(item.status);
            const isUnread = (item.status === "acknowledged" || item.status === "declined") && !item.customer_viewed_at;
            return (
              <TouchableOpacity style={styles.card} onPress={() => navigation.navigate("VendorProfile", { slug: item.vendor_slug })}>
                <View style={styles.topRow}>
                  <Text style={styles.vendorName}>{item.vendor_name}</Text>
                  <View style={[styles.statusPill, { borderColor: meta.color }]}>
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  {isUnread && <View style={styles.unreadDot} />}
                </View>
                {item.location_note && <Text style={styles.detail}>📍 {item.location_note}</Text>}
                {item.message && <Text style={styles.detail}>{item.message}</Text>}
                <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString("en-NG", { dateStyle: "medium" })}</Text>
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
  title: { color: colors.white, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 20 },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 10 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  vendorName: { color: colors.white, fontSize: 14, fontWeight: "600", flex: 1 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingVertical: 3, paddingHorizontal: 10 },
  statusText: { fontSize: 11, fontWeight: "700" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  detail: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  date: { color: colors.textSecondary, fontSize: 11, marginTop: 8 },
});
