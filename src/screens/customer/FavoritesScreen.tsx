// ===============================================================
// src/screens/customer/FavoritesScreen.tsx
//
// "My Favorites" -- a real list of vendors the customer has saved,
// reading the same customer_favorites table the Save button on
// Vendor Profile already writes to. Includes an unfavorite action
// right from the list, not just view-only.
// ===============================================================

import { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "Favorites">;

type FavoriteVendor = {
  favoriteId: string;
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  category: string;
  subcategory: string;
  verification_status: string;
  average_rating: number;
  reviews_count: number;
};

function Badge({ status }: { status: string }) {
  if (status === "blue") return <FontAwesome6 name="circle-check" size={13} color="#1877F2" />;
  if (status === "gray") return <FontAwesome6 name="circle-check" size={13} color={colors.textSecondary} />;
  return null;
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
        .map((row: any) => ({ favoriteId: row.id, ...row.vendors }));
      setFavorites(list);
    }
    setLoading(false);
  }

  // Refetch every time this screen comes into focus, so removing a
  // favorite from a vendor profile and coming back here stays in sync.
  useFocusEffect(useCallback(() => { load(); }, []));

  async function removeFavorite(favoriteId: string, vendorId: string) {
    setFavorites((prev) => prev.filter((f) => f.favoriteId !== favoriteId));
    await supabase.from("customer_favorites").delete().eq("id", favoriteId);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>
      <Text style={styles.title}>My Favorites</Text>
      <Text style={styles.subtitle}>Vendors you've saved</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your favorites right now.</Text>
      ) : favorites.length === 0 ? (
        <Text style={styles.empty}>No favorites yet — tap the heart on a vendor's profile to save them here.</Text>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.favoriteId}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("VendorProfile", { slug: item.slug })}
            >
              <Image
                source={{ uri: item.logo_url || "https://spotlightdirectories.com/images/spotlightlogo-512.png" }}
                style={styles.logo}
              />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                  <Badge status={item.verification_status} />
                </View>
                <Text style={styles.category}>{item.category}{item.subcategory ? ` • ${item.subcategory}` : ""}</Text>
                <Text style={styles.rating}>★ {Number(item.average_rating || 0).toFixed(1)} ({item.reviews_count || 0})</Text>
              </View>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeFavorite(item.favoriteId, item.id)}
              >
                <FontAwesome6 name="heart" size={18} color={colors.primary} solid />
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
  back: { color: colors.primary, fontSize: 15, marginBottom: 12 },
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
  rating: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  removeBtn: { padding: 8 },
});
