// ===============================================================
// src/screens/customer/SearchHistoryScreen.tsx
//
// "My Search History" -- app side, mirroring the same tab just
// built into customer-profile/page.tsx on the website. Reads the
// same search_logs rows (with customer_id), same 50-row limit, same
// display logic -- kept consistent with web rather than reinvented.
//
// Bug fix, 2026-09-09 per Cyril: tapping an entry never actually
// re-ran the search -- the card had no onPress at all, despite the
// comment above claiming parity with web. Genuinely missing, now
// fixed: tapping navigates to Results with the same keyword/category/
// state/lga this entry was originally logged with.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "SearchHistory">;

type SearchLogRow = {
  id: string;
  search_keyword: string | null;
  search_type: string | null;
  category: string | null;
  subcategory: string | null;
  state: string | null;
  lga: string | null;
  created_at: string;
};

export default function SearchHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<SearchLogRow[]>([]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError(true);
      setLoading(false);
      return;
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!customer) {
      setError(true);
      setLoading(false);
      return;
    }

    const { data, error: fetchError } = await supabase
      .from("search_logs")
      .select("id, search_keyword, search_type, category, subcategory, state, lga, created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (fetchError) {
      setError(true);
    } else {
      setHistory(data || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  const { refreshControl } = usePullRefresh(load);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function reRunSearch(item: SearchLogRow) {
    navigation.navigate("Results", {
      keyword: item.search_keyword || undefined,
      category: item.category || undefined,
      subcategory: item.subcategory || undefined,
      state: item.state || undefined,
      lga: item.lga || undefined,
    });
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
      </View>
      <Text style={styles.title}>My Search History</Text>
      <Text style={styles.subtitle}>Your last 50 searches on Spotlight. Tap any of them to search again.</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your search history right now.</Text>
      ) : history.length === 0 ? (
        <Text style={styles.empty}>No searches yet — your past searches will show up here.</Text>
      ) : (
        <FlatList
          refreshControl={refreshControl}
          data={history}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => {
            const filterParts = [
              item.category,
              item.subcategory,
              [item.lga, item.state].filter(Boolean).join(", "),
            ].filter(Boolean);

            return (
              <TouchableOpacity style={styles.card} onPress={() => reRunSearch(item)}>
                <Text style={styles.keyword}>
                  {item.search_keyword ? `"${item.search_keyword}"` : "Browsed with filters"}
                </Text>
                {filterParts.length > 0 && (
                  <Text style={styles.filters}>{filterParts.join(" › ")}</Text>
                )}
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.white, fontSize: 22, fontWeight: "700", marginTop: 12 },
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
  keyword: { color: colors.white, fontSize: 15, fontWeight: "600" },
  filters: { color: colors.primary, fontSize: 12, marginTop: 4 },
  date: { color: colors.textSecondary, fontSize: 11, marginTop: 6 },
});
