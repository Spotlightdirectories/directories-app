// ===============================================================
// src/screens/HomeScreen.tsx
//
// Phase 1, full category-browsing parity with web, per Cyril's
// "complete 100% before moving on" standing instruction:
// - Artisan/Professional expand to real categories (already done)
// - Goods now ALSO expands each sub-group into its real categories
//   (previously jumped straight to broad subgroup results -- a real
//   gap caught while completing this properly, not present before)
// - The 2 categories with a genuine third level (Tailoring & Fashion
//   Designer, Clothing & Fashion) drill one level further into
//   subcategories -> sub-subcategories, matching web exactly
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

const GOODS_SUBGROUPS = [
  "Fashion & Accessories",
  "Electronics & Gadgets",
  "Food, Groceries & Beverages",
  "Home, Furniture & Kitchen",
  "Health, Beauty & Safety",
  "Building, Hardware & Industrial",
  "Agriculture & Animals",
  "Office, Print & Stationery",
  "Gifts, Events & Leisure",
  "Other Goods",
];

// The only 2 of 179 categories confirmed (via direct DB query, not
// assumed) to have a real third level.
const DEEP_CATEGORIES = ["Tailoring & Fashion Designer", "Clothing & Fashion"];

type OpenPill = "artisan" | "goods" | "professional" | null;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [keyword, setKeyword] = useState("");
  const [connected, setConnected] = useState<boolean | null>(null);

  const [openPill, setOpenPill] = useState<OpenPill>(null);
  const [openSubgroup, setOpenSubgroup] = useState<string | null>(null); // Goods only
  const [openCategory, setOpenCategory] = useState<string | null>(null); // the 2 deep categories
  const [openSubcat, setOpenSubcat] = useState<string | null>(null);

  const [artisanCats, setArtisanCats] = useState<string[]>([]);
  const [professionalCats, setProfessionalCats] = useState<string[]>([]);
  const [goodsCatsBySubgroup, setGoodsCatsBySubgroup] = useState<Record<string, string[]>>({});
  const [nestedCats, setNestedCats] = useState<Record<string, Record<string, string[]>>>({});

  useEffect(() => {
    supabase
      .from("categories")
      .select("*", { count: "exact", head: true })
      .then(({ error }) => setConnected(!error));

    supabase
      .from("categories")
      .select("name, audience_type, goods_subgroup")
      .then(({ data }) => {
        if (!data) return;
        setArtisanCats(data.filter((c) => c.audience_type === "Artisan").map((c) => c.name).sort());
        setProfessionalCats(data.filter((c) => c.audience_type === "Professional").map((c) => c.name).sort());

        const grouped: Record<string, string[]> = {};
        for (const c of data) {
          if (c.audience_type !== "Goods" || !c.goods_subgroup) continue;
          if (!grouped[c.goods_subgroup]) grouped[c.goods_subgroup] = [];
          grouped[c.goods_subgroup].push(c.name);
        }
        Object.values(grouped).forEach((arr) => arr.sort());
        setGoodsCatsBySubgroup(grouped);
      });

    supabase
      .from("categories")
      .select("name, subcategories(name, sub_subcategories(name))")
      .in("name", DEEP_CATEGORIES)
      .then(({ data }) => {
        if (!data) return;
        const nested: Record<string, Record<string, string[]>> = {};
        for (const cat of data as any[]) {
          nested[cat.name] = {};
          for (const sub of cat.subcategories || []) {
            nested[cat.name][sub.name] = (sub.sub_subcategories || []).map((ss: any) => ss.name);
          }
        }
        setNestedCats(nested);
      });
  }, []);

  function closeAllExpansions() {
    setOpenPill(null);
    setOpenSubgroup(null);
    setOpenCategory(null);
    setOpenSubcat(null);
  }

  function goToResults(params: { audience?: string; subgroup?: string; category?: string; subcategory?: string; subsubcategory?: string; keyword?: string }) {
    closeAllExpansions();
    navigation.navigate("Results", params);
  }

  function togglePill(pill: OpenPill) {
    setOpenSubgroup(null);
    setOpenCategory(null);
    setOpenSubcat(null);
    setOpenPill((current) => (current === pill ? null : pill));
  }

  // Renders one category row -- plain tap-to-search, UNLESS it's one
  // of the 2 deep categories, in which case it expands into
  // subcategories -> sub-subcategories instead.
  function renderCategoryRow(cat: string) {
    const nested = nestedCats[cat];

    if (!nested) {
      return (
        <TouchableOpacity key={cat} style={styles.subgroupItem} onPress={() => goToResults({ category: cat })}>
          <Text style={styles.subgroupText}>{cat}</Text>
        </TouchableOpacity>
      );
    }

    const isCatOpen = openCategory === cat;
    return (
      <View key={cat}>
        <TouchableOpacity
          style={styles.subgroupItem}
          onPress={() => {
            setOpenSubcat(null);
            setOpenCategory(isCatOpen ? null : cat);
          }}
        >
          <Text style={styles.subgroupText}>{cat} {isCatOpen ? "▾" : "▸"}</Text>
        </TouchableOpacity>

        {isCatOpen && (
          <View style={styles.nestedLevel}>
            {Object.entries(nested).map(([subName, subsubs]) => {
              const isSubOpen = openSubcat === subName;
              return (
                <View key={subName}>
                  <TouchableOpacity
                    style={styles.subgroupItem}
                    onPress={() => setOpenSubcat(isSubOpen ? null : subName)}
                  >
                    <Text style={styles.subgroupText}>{subName} {isSubOpen ? "▾" : "▸"}</Text>
                  </TouchableOpacity>
                  {isSubOpen && (
                    <View style={styles.nestedLevel}>
                      {subsubs.map((ss) => (
                        <TouchableOpacity
                          key={ss}
                          style={styles.subgroupItem}
                          onPress={() => goToResults({ category: cat, subcategory: subName, subsubcategory: ss })}
                        >
                          <Text style={styles.subgroupText}>{ss}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.topRow}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => navigation.navigate("AccountType")}>
          <Text style={styles.loginLink}>Log In</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.logo}>Spotlight</Text>
      <Text style={styles.tagline}>
        <Text style={styles.taglineWord}>FIND</Text>
        <Text style={styles.taglineDot}>.</Text>{" "}
        <Text style={styles.taglineWord}>TRUST</Text>
        <Text style={styles.taglineDot}>.</Text>{" "}
        <Text style={styles.taglineWord}>CONNECT</Text>
        <Text style={styles.taglineDot}>.</Text>
      </Text>

      {connected === false && (
        <Text style={styles.connectionWarning}>⚠ Couldn't reach the database</Text>
      )}

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="What are you looking for?"
          placeholderTextColor={colors.textSecondary}
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={() => goToResults({ keyword })}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={() => goToResults({ keyword })}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Browse by category</Text>

      {/* ARTISAN */}
      <TouchableOpacity style={styles.categoryPill} onPress={() => togglePill("artisan")}>
        <Text style={styles.categoryPillText}>🔨 Artisans {openPill === "artisan" ? "▾" : "▸"}</Text>
      </TouchableOpacity>
      {openPill === "artisan" && (
        <View style={styles.subgroupList}>
          {artisanCats.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            artisanCats.map(renderCategoryRow)
          )}
        </View>
      )}

      {/* GOODS */}
      <TouchableOpacity style={styles.categoryPill} onPress={() => togglePill("goods")}>
        <Text style={styles.categoryPillText}>🛍 Goods {openPill === "goods" ? "▾" : "▸"}</Text>
      </TouchableOpacity>
      {openPill === "goods" && (
        <View style={styles.subgroupList}>
          {GOODS_SUBGROUPS.map((sub) => {
            const isSubOpen = openSubgroup === sub;
            const cats = goodsCatsBySubgroup[sub] || [];
            return (
              <View key={sub}>
                <TouchableOpacity
                  style={styles.subgroupItem}
                  onPress={() => {
                    setOpenCategory(null);
                    setOpenSubcat(null);
                    setOpenSubgroup(isSubOpen ? null : sub);
                  }}
                >
                  <Text style={styles.subgroupText}>{sub} {isSubOpen ? "▾" : "▸"}</Text>
                </TouchableOpacity>
                {isSubOpen && (
                  <View style={styles.nestedLevel}>
                    {cats.length === 0 ? (
                      <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} />
                    ) : (
                      cats.map(renderCategoryRow)
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* PROFESSIONAL */}
      <TouchableOpacity style={styles.categoryPill} onPress={() => togglePill("professional")}>
        <Text style={styles.categoryPillText}>💼 Professionals {openPill === "professional" ? "▾" : "▸"}</Text>
      </TouchableOpacity>
      {openPill === "professional" && (
        <View style={styles.subgroupList}>
          {professionalCats.length === 0 ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : (
            professionalCats.map(renderCategoryRow)
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  topRow: { flexDirection: "row", padding: 16, paddingTop: 50 },
  loginLink: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  logo: { color: colors.white, fontSize: 30, fontWeight: "700", textAlign: "center", marginTop: 8 },
  tagline: { textAlign: "center", marginTop: 6, marginBottom: 24 },
  taglineWord: { color: colors.textSecondary, fontSize: 13, fontWeight: "300", letterSpacing: 1 },
  taglineDot: { color: colors.primary, fontWeight: "900", fontSize: 15 },
  connectionWarning: { color: colors.warning, textAlign: "center", fontSize: 12, marginBottom: 12 },
  searchBar: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 28 },
  searchInput: {
    flex: 1,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.white,
  },
  searchButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 18, justifyContent: "center" },
  searchButtonText: { color: colors.black, fontWeight: "700" },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, marginLeft: 20, marginBottom: 10, textTransform: "uppercase" },
  categoryPill: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 10,
  },
  categoryPillText: { color: colors.white, fontSize: 16, fontWeight: "600" },
  subgroupList: { marginHorizontal: 20, marginBottom: 10 },
  subgroupItem: { paddingVertical: 10, paddingLeft: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  subgroupText: { color: colors.textSecondary, fontSize: 14 },
  nestedLevel: { paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: colors.border, marginLeft: 4 },
});
