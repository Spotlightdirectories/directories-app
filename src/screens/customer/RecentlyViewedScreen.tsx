// ===============================================================
// src/screens/customer/RecentlyViewedScreen.tsx
//
// Matches web's customer-profile "Recently Viewed" tab. Reads
// analytics_events (product_view/service_view) tagged with this
// customer's id -- already correctly written by ProductDetailScreen/
// ServiceDetailScreen from the start. No FK from analytics_events to
// vendor_products/vendor_services, so events are fetched first, then
// resolved against the product/service tables separately (same
// approach as web).
// ===============================================================

import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "RecentlyViewed">;

type ActivityItem = {
  kind: "product" | "service"; slug: string; name: string; image: string | null;
  price: number | null; vendorName: string; vendorSlug: string; occurredAt: string;
};

export async function resolveActivityItems(events: { product_id: string | null; service_id: string | null; created_at: string }[]): Promise<ActivityItem[]> {
  const seen = new Set<string>();
  const deduped = events.filter((ev) => {
    const key = ev.product_id ? `p:${ev.product_id}` : ev.service_id ? `s:${ev.service_id}` : null;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const productIds = deduped.filter((e) => e.product_id).map((e) => e.product_id as string);
  const serviceIds = deduped.filter((e) => e.service_id).map((e) => e.service_id as string);

  const [{ data: products }, { data: services }] = await Promise.all([
    productIds.length
      ? supabase.from("vendor_products").select("id, slug, product_name, price, primary_image_url, vendors(name, slug)").in("id", productIds).eq("moderation_status", "approved")
      : Promise.resolve({ data: [] as any[] }),
    serviceIds.length
      ? supabase.from("vendor_services").select("id, slug, service_name, starting_price, representative_image_url, vendors(name, slug)").in("id", serviceIds).eq("moderation_status", "approved")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const productMap = new Map((products || []).map((p: any) => [p.id, p]));
  const serviceMap = new Map((services || []).map((s: any) => [s.id, s]));

  const items: ActivityItem[] = [];
  for (const ev of deduped) {
    if (ev.product_id) {
      const p = productMap.get(ev.product_id);
      if (!p || !p.vendors) continue;
      items.push({ kind: "product", slug: p.slug, name: p.product_name, image: p.primary_image_url, price: p.price, vendorName: p.vendors.name, vendorSlug: p.vendors.slug, occurredAt: ev.created_at });
    } else if (ev.service_id) {
      const s = serviceMap.get(ev.service_id);
      if (!s || !s.vendors) continue;
      items.push({ kind: "service", slug: s.slug, name: s.service_name, image: s.representative_image_url, price: s.starting_price, vendorName: s.vendors.name, vendorSlug: s.vendors.slug, occurredAt: ev.created_at });
    }
  }
  return items;
}

export default function RecentlyViewedScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<ActivityItem[]>([]);

  async function load() {
    const { data: { session: __s } } = await supabase.auth.getSession(); const user = __s?.user ?? null;
    if (!user) { setError(true); setLoading(false); return; }
    const { data: customer } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { setError(true); setLoading(false); return; }

    const { data, error: fetchError } = await supabase
      .from("analytics_events")
      .select("product_id, service_id, created_at")
      .eq("customer_id", customer.id)
      .in("event_type", ["product_view", "service_view"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchError) { setError(true); } else { setItems(await resolveActivityItems(data || [])); }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));
  const { refreshControl } = usePullRefresh(load);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
      </View>
      <Text style={styles.title}>Recently Viewed</Text>
      <Text style={styles.subtitle}>Products and services you've looked at</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your recent activity right now.</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No products or services viewed yet — items you look at will show up here.</Text>
      ) : (
        <FlatList
          refreshControl={refreshControl}
          data={items}
          keyExtractor={(item) => `${item.kind}-${item.slug}`}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => item.kind === "product"
                ? navigation.navigate("ProductDetail", { vendorSlug: item.vendorSlug, productSlug: item.slug })
                : navigation.navigate("ServiceDetail", { vendorSlug: item.vendorSlug, serviceSlug: item.slug })}
            >
              <Image source={{ uri: item.image || "https://spotlightdirectories.com/images/spotlightlogo-512.png" }} style={styles.image} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.vendorName}>By {item.vendorName}</Text>
                {item.price != null && <Text style={styles.price}>₦{Number(item.price).toLocaleString()}</Text>}
              </View>
            </TouchableOpacity>
          )}
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
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  image: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.border },
  name: { color: colors.white, fontSize: 14, fontWeight: "600" },
  vendorName: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  price: { color: colors.success, fontSize: 12, fontWeight: "700", marginTop: 4 },
});
