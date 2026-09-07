// ===============================================================
// src/screens/discover/ResultsScreen.tsx
//
// Phase 1, search logic 100% complete per Cyril's "finish it fully"
// instruction: now includes state/LGA location filtering and a
// verified-only toggle, on top of keyword + category/audience/
// subgroup/subcategory/subsubcategory from the earlier slice.
// Same RPC functions, same parameters as web -- just actually
// wiring the state/lga/verified_only ones through now, which were
// previously always sent as null.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Switch, Modal } from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { logSearch } from "../../lib/logSearch";
import { nigeriaData } from "../../lib/nigeria-data";
import { colors } from "../../theme/colors";

type Route = RouteProp<RootStackParamList, "Results">;
type Nav = NativeStackNavigationProp<RootStackParamList, "Results">;

type ResultItem = {
  key: string;
  name: string;
  vendorName: string;
  vendorSlug: string;
  price: number | null;
  kind: "product" | "service" | "vendor";
};

const STATES = Object.keys(nigeriaData);

export default function ResultsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { audience, subgroup, category, subcategory, subsubcategory, keyword: initialKeyword } = route.params || {};

  const [keyword, setKeyword] = useState(initialKeyword || "");
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<ResultItem[]>([]);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [lga, setLga] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [lgaPickerOpen, setLgaPickerOpen] = useState(false);

  const lgaOptions = state ? nigeriaData[state] : [];

  async function runSearch(kw?: string) {
    setLoading(true);

    const params = {
      p_keyword: kw || null,
      p_category: category || null,
      p_subcategory: subcategory || null,
      p_state: state || null,
      p_lga: lga || null,
      p_verified_only: verifiedOnly,
      p_subsubcategory: subsubcategory || null,
      p_audience_type: audience || null,
      p_goods_subgroup: subgroup || null,
    };

    const [productsRes, servicesRes, vendorsRes] = await Promise.all([
      supabase.rpc("search_products", params),
      supabase.rpc("search_services", params),
      supabase.rpc("search_vendors", params),
    ]);

    const items: ResultItem[] = [
      ...(productsRes.data || []).map((p: any) => ({
        key: `product-${p.id}`,
        name: p.product_name,
        vendorName: p.vendor_name,
        vendorSlug: p.vendor_slug,
        price: p.price,
        kind: "product" as const,
      })),
      ...(servicesRes.data || []).map((s: any) => ({
        key: `service-${s.id}`,
        name: s.service_name,
        vendorName: s.vendor_name,
        vendorSlug: s.vendor_slug,
        price: s.starting_price,
        kind: "service" as const,
      })),
      ...(vendorsRes.data || []).map((v: any) => ({
        key: `vendor-${v.id}`,
        name: v.name,
        vendorName: v.name,
        vendorSlug: v.slug,
        price: null,
        kind: "vendor" as const,
      })),
    ];

    setResults(items);
    setLoading(false);

    logSearch({
      keyword: kw,
      category,
      subcategory,
      state: state || undefined,
      lga: lga || undefined,
      verifiedOnly,
    });
  }

  useEffect(() => {
    runSearch(initialKeyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyFilters() {
    setFiltersOpen(false);
    runSearch(keyword);
  }

  function clearFilters() {
    setState(null);
    setLga(null);
    setVerifiedOnly(false);
  }

  const activeFilterCount = [state, lga, verifiedOnly || null].filter(Boolean).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {audience ? audience : category ? category : "Search Results"}
          {subgroup ? ` › ${subgroup}` : ""}
          {subcategory ? ` › ${subcategory}` : ""}
          {subsubcategory ? ` › ${subsubcategory}` : ""}
        </Text>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="What are you looking for?"
          placeholderTextColor={colors.textSecondary}
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={() => runSearch(keyword)}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={() => runSearch(keyword)}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.filterToggle} onPress={() => setFiltersOpen(true)}>
        <Text style={styles.filterToggleText}>
          🔧 Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
        </Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : results.length === 0 ? (
        <Text style={styles.empty}>No results found. Try a different search or filters.</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.key}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate("VendorProfile", { slug: item.vendorSlug })}
            >
              <Text style={styles.itemName}>{item.name}</Text>
              {item.kind !== "vendor" && <Text style={styles.itemVendor}>By {item.vendorName}</Text>}
              {item.price != null && (
                <Text style={styles.itemPrice}>₦{Number(item.price).toLocaleString()}</Text>
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* FILTERS MODAL */}
      <Modal visible={filtersOpen} animationType="slide" transparent onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Filters</Text>

            <Text style={styles.filterLabel}>State</Text>
            <TouchableOpacity style={styles.filterField} onPress={() => setStatePickerOpen(true)}>
              <Text style={styles.filterFieldText}>{state || "Any state"}</Text>
            </TouchableOpacity>

            {state && (
              <>
                <Text style={styles.filterLabel}>LGA</Text>
                <TouchableOpacity style={styles.filterField} onPress={() => setLgaPickerOpen(true)}>
                  <Text style={styles.filterFieldText}>{lga || "Any LGA"}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.switchRow}>
              <Text style={styles.filterLabel}>Verified vendors only</Text>
              <Switch
                value={verifiedOnly}
                onValueChange={setVerifiedOnly}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={applyFilters}>
                <Text style={styles.applyButtonText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* STATE PICKER */}
      <Modal visible={statePickerOpen} animationType="slide" transparent onRequestClose={() => setStatePickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select State</Text>
            <FlatList
              data={STATES}
              keyExtractor={(s) => s}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setState(item);
                    setLga(null);
                    setStatePickerOpen(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setStatePickerOpen(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* LGA PICKER */}
      <Modal visible={lgaPickerOpen} animationType="slide" transparent onRequestClose={() => setLgaPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select LGA</Text>
            <FlatList
              data={lgaOptions}
              keyExtractor={(l) => l}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.pickerItem}
                  onPress={() => {
                    setLga(item);
                    setLgaPickerOpen(false);
                  }}
                >
                  <Text style={styles.pickerItemText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => setLgaPickerOpen(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  header: { padding: 16, paddingTop: 50 },
  back: { color: colors.primary, fontSize: 15, marginBottom: 8 },
  title: { color: colors.white, fontSize: 20, fontWeight: "700" },
  searchBar: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 8, gap: 8 },
  searchInput: {
    flex: 1,
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    color: colors.white,
  },
  searchButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  searchButtonText: { color: colors.black, fontWeight: "700" },
  filterToggle: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 10,
    alignSelf: "flex-start",
    paddingHorizontal: 16,
  },
  filterToggleText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  empty: { color: colors.textSecondary, textAlign: "center", marginTop: 40 },
  card: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  itemName: { color: colors.white, fontSize: 15, fontWeight: "600" },
  itemVendor: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  itemPrice: { color: colors.primary, fontSize: 13, marginTop: 4, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalTitle: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 16 },
  filterLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  filterField: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
  },
  filterFieldText: { color: colors.white, fontSize: 14 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  modalButtonRow: { flexDirection: "row", gap: 10, marginTop: 28 },
  clearButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center" },
  clearButtonText: { color: colors.textSecondary, fontWeight: "600" },
  applyButton: { flex: 2, backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center" },
  applyButtonText: { color: colors.black, fontWeight: "700" },

  pickerCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "75%" },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerItemText: { color: colors.white, fontSize: 15 },
  closeButton: { marginTop: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  closeButtonText: { color: colors.primary, fontWeight: "600" },
});
