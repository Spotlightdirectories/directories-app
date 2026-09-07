// ===============================================================
// src/screens/customer/SearchHistoryScreen.tsx
//
// "My Search History" -- app side, mirroring the same tab just
// built into customer-profile/page.tsx on the website. Reads the
// same search_logs rows (with customer_id), same 50-row limit, same
// display logic -- kept consistent with web rather than reinvented.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [history, setHistory] = useState<SearchLogRow[]>([]);

  useEffect(() => {
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

    load();
  }, []);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
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
      <Text style={styles.title}>My Search History</Text>
      <Text style={styles.subtitle}>Your last 50 searches on Spotlight</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your search history right now.</Text>
      ) : history.length === 0 ? (
        <Text style={styles.empty}>No searches yet — your past searches will show up here.</Text>
      ) : (
        <FlatList
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
              <TouchableOpacity style={styles.card}>
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
  container: { flex: 1, backgroundColor: colors.dark, padding: 20 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
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
