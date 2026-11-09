// ===============================================================
// src/screens/customer/FavoritesScreen.tsx
//
// "My Favorites" -- a real list of vendors the customer has saved,
// reading the same customer_favorites table the Save button on
// Vendor Profile already writes to. Includes an unfavorite action
// right from the list, not just view-only.
// ===============================================================

import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image, Alert } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import SpotlightMark from "../../components/SpotlightMark";
import AccountMenu from "../../components/AccountMenu";
import VerifiedBadge from "../../components/VerifiedBadge";
import FounderBadge from "../../components/FounderBadge";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "Favorites">;

type FavoriteVendor = {
  favoriteId: string;
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  categoryLine: string;
  verification_status: string;
  average_rating: number;
  reviews_count: number;
};

function Badge({ status }: { status: string }) {
  return <VerifiedBadge status={status} size={16} />;
}

export default function FavoritesScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [favorites, setFavorites] = useState<FavoriteVendor[]>([]);
  const [customerId, setCustomerId] = useState<string | null>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError(true); setLoading(false); return; }

    const { data: customer } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { setError(true); setLoading(false); return; }
    setCustomerId(customer.id);

    const { data, error: fetchError } = await supabase
      .from("customer_favorites")
      .select("id, vendors(id, slug, name, logo_url, category, subcategory, verification_status, average_rating, reviews_count)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(true);
    } else {
      const list: FavoriteVendor[] = (data || [])
        .filter((row: any) => row.vendors)
        .map((row: any) => ({ favoriteId: row.id, ...row.vendors, categoryLine: "" }));

      // Categories come from what each vendor actually lists (same logic as web).
      if (list.length > 0) {
        const { data: catRows } = await supabase.rpc("get_vendor_display_categories", { p_vendor_ids: list.map((f) => f.id) });
        const catMap: Record<string, { categories: string[]; total_count: number }> = {};
        (catRows || []).forEach((r: any) => { catMap[r.vendor_id] = r; });
        list.forEach((f) => {
          const r = catMap[f.id];
          if (!r || !r.categories || r.categories.length === 0) return;
          const shown = r.categories.slice(0, 2).join(" • ");
          const more = (r.total_count || r.categories.length) - 2;
          f.categoryLine = more > 0 ? `${shown} • +${more} more` : shown;
        });
      }
      setFavorites(list);
    }
    setLoading(false);
  }

  // Refetch every time this screen comes into focus, so removing a
  // favorite from a vendor profile and coming back here stays in sync.
  useFocusEffect(useCallback(() => { load(); }, []));
  const { refreshControl } = usePullRefresh(load);

  async function doRemove(favoriteId: string) {
    setFavorites((prev) => prev.filter((f) => f.favoriteId !== favoriteId));
    await supabase.from("customer_favorites").delete().eq("id", favoriteId);
  }

  // Ask first, so an accidental tap never silently removes a vendor.
  function removeFavorite(favoriteId: string, vendorName: string) {
    Alert.alert(
      "Remove from favorites?",
      `${vendorName} will be removed from your favorites. You can save it again from the vendor's profile.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => doRemove(favoriteId) },
      ]
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
        <AccountMenu />
      </View>
      <Text style={styles.title}>My Favorites</Text>
      <Text style={styles.subtitle}>Vendors you've saved</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your favorites right now.</Text>
      ) : favorites.length === 0 ? (
        <Text style={styles.empty}>No favorites yet — tap the heart on a vendor's profile to save them here.</Text>
      ) : (
        <FlatList
          refreshControl={refreshControl}
          data={favorites}
          keyExtractor={(item) => item.favoriteId}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("VendorProfile", { slug: item.slug })}
            >
              <Image
                source={{ uri: item.logo_url || "https://spotlightdirectories.com/images/default-vendor-logo.png" }}
                style={styles.logo}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <FounderBadge slug={item.slug} size={14} />
                  <Badge status={item.verification_status} />
                </View>
                {item.categoryLine ? <Text style={styles.category} numberOfLines={2}>{item.categoryLine}</Text> : null}
                <Text style={styles.rating}>★ {Number(item.average_rating || 0).toFixed(1)} ({item.reviews_count || 0})</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeFavorite(item.favoriteId, item.name)}
              >
                <FontAwesome6 name="heart-crack" size={13} color={colors.textSecondary} />
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
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
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: colors.white, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 20 },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  logo: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.border },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: colors.white, fontSize: 14, fontWeight: "600", flexShrink: 1 },
  category: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  rating: { color: colors.primary, fontSize: 11, marginTop: 4, fontWeight: "600" },
  removeBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginLeft: 10, paddingVertical: 7, paddingHorizontal: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  removeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
});
