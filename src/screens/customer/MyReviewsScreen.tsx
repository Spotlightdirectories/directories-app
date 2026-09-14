// ===============================================================
// src/screens/customer/MyReviewsScreen.tsx
//
// "My Reviews" -- a customer's own past reviews, matched by
// customer_id (not by name/email string matching, which the vendor-
// profile review LIST uses for anonymous reviews -- this screen only
// ever needs the customer's own confirmed reviews).
// ===============================================================

import { useState, useCallback } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "MyReviews">;

type MyReview = {
  id: string;
  review_text: string;
  rating: number;
  created_at: string;
  vendor_slug: string;
  vendor_name: string;
};

export default function MyReviewsScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reviews, setReviews] = useState<MyReview[]>([]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError(true); setLoading(false); return; }

    const { data: customer } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { setError(true); setLoading(false); return; }

    const { data, error: fetchError } = await supabase
      .from("vendor_reviews")
      .select("id, review_text, rating, created_at, vendors(slug, name)")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false });

    if (fetchError) {
      setError(true);
    } else {
      const list: MyReview[] = (data || [])
        .filter((row: any) => row.vendors)
        .map((row: any) => ({
          id: row.id,
          review_text: row.review_text,
          rating: row.rating,
          created_at: row.created_at,
          vendor_slug: row.vendors.slug,
          vendor_name: row.vendors.name,
        }));
      setReviews(list);
    }
    setLoading(false);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
      </View>
      <Text style={styles.title}>My Reviews</Text>
      <Text style={styles.subtitle}>Reviews you've written</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your reviews right now.</Text>
      ) : reviews.length === 0 ? (
        <Text style={styles.empty}>You haven't written any reviews yet.</Text>
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("VendorProfile", { slug: item.vendor_slug })}
            >
              <View style={styles.topRow}>
                <Text style={styles.vendorName}>{item.vendor_name}</Text>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <FontAwesome6
                      key={n}
                      name="star"
                      size={11}
                      color={n <= item.rating ? colors.primary : colors.border}
                      solid={n <= item.rating}
                    />
                  ))}
                </View>
              </View>
              <Text style={styles.reviewText}>{item.review_text}</Text>
              <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString("en-NG", { dateStyle: "medium" })}</Text>
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
  card: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vendorName: { color: colors.white, fontSize: 14, fontWeight: "600" },
  stars: { flexDirection: "row", gap: 2 },
  reviewText: { color: colors.textSecondary, fontSize: 13, marginTop: 8, lineHeight: 19 },
  date: { color: colors.textSecondary, fontSize: 11, marginTop: 8 },
});
