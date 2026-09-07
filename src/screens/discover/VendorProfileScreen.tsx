// ===============================================================
// src/screens/discover/VendorProfileScreen.tsx
//
// Deliberately minimal placeholder for this slice -- exists so
// tapping a result in ResultsScreen goes somewhere real rather than
// a broken navigation target, not because the actual vendor profile
// view is finished. The full version (photos, contact buttons,
// listings, reviews) is the next planned slice of Phase 1.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";

type Route = RouteProp<RootStackParamList, "VendorProfile">;

export default function VendorProfileScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { slug } = route.params;
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("vendors")
        .select("name, category, subcategory, state, lga, average_rating, reviews_count")
        .eq("slug", slug)
        .maybeSingle();
      setVendor(data);
      setLoading(false);
    }
    load();
  }, [slug]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => navigation.goBack()}>
        <Text style={styles.back}>‹ Back</Text>
      </TouchableOpacity>

      {vendor ? (
        <>
          <Text style={styles.name}>{vendor.name}</Text>
          <Text style={styles.category}>{vendor.subcategory || vendor.category}</Text>
          <Text style={styles.location}>{vendor.lga}, {vendor.state}</Text>
          <Text style={styles.rating}>
            ★ {Number(vendor.average_rating || 0).toFixed(1)} ({vendor.reviews_count || 0} reviews)
          </Text>
          <Text style={styles.note}>
            Full profile (photos, listings, contact, reviews) is the next build slice.
          </Text>
        </>
      ) : (
        <Text style={styles.note}>Vendor not found.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 20, paddingTop: 50 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  back: { color: colors.primary, fontSize: 15, marginBottom: 20 },
  name: { color: colors.white, fontSize: 22, fontWeight: "700" },
  category: { color: colors.primary, fontSize: 14, marginTop: 4 },
  location: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  rating: { color: colors.textSecondary, fontSize: 13, marginTop: 8 },
  note: { color: colors.textSecondary, fontSize: 12, marginTop: 24, fontStyle: "italic" },
});
