// ===============================================================
// src/screens/customer/MyInquiriesScreen.tsx
//
// Matches web's customer-profile "My Inquiries" tab -- products/
// services this customer clicked WhatsApp or Call on. Reuses the
// same resolver as Recently Viewed, just filtered to a different
// event_type set.
// ===============================================================

import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import { resolveActivityItems } from "./RecentlyViewedScreen";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "MyInquiries">;

type InquiryItem = Awaited<ReturnType<typeof resolveActivityItems>>[number];

export default function MyInquiriesScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<InquiryItem[]>([]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError(true); setLoading(false); return; }
    const { data: customer } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { setError(true); setLoading(false); return; }

    const { data, error: fetchError } = await supabase
      .from("analytics_events")
      .select("product_id, service_id, created_at")
      .eq("customer_id", customer.id)
      .in("event_type", ["whatsapp_click", "phone_click"])
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
      <Text style={styles.title}>My Inquiries</Text>
      <Text style={styles.subtitle}>Vendors you've contacted via WhatsApp or call</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your inquiries right now.</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No inquiries yet — vendors you contact will show up here.</Text>
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
                <View style={styles.vendorRow}>
                  <FontAwesome6 name="comments" size={11} color={colors.textSecondary} />
                  <Text style={styles.vendorName}>By {item.vendorName}</Text>
                </View>
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
  vendorRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  vendorName: { color: colors.textSecondary, fontSize: 12 },
});
