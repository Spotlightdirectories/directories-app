// ===============================================================
// src/screens/HomeScreen.tsx
//
// Restructured per Cyril's UX correction: all search configuration
// now lives here, not on Results. Two separate paths:
// - Category tiles (Artisans/Goods/Professionals) -- a "definite
//   move," single row, icon-on-top -- goes straight into browsing
// - Keyword search + type tabs (All/Products/Services/Vendors) --
//   a "point to start a search," not a result
//
// Option B, per Cyril's own reasoning (the Alimosho-carpenter
// example): category tiles now carry whatever's set in "More
// Filters" (state/LGA/verified/distance) too, not just keyword
// search. A filter-count badge shows near BOTH paths so an active
// filter is never invisible, wherever you're browsing from.
//
// "More Filters" holds state -> LGA cascade, verified-only, and
// distance (permission + radius chips) -- same logic ResultsScreen
// used to own, moved here since it's configuration, not a result.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Switch, Modal, FlatList, Image } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { supabase } from "../lib/supabase";
import { nigeriaData } from "../lib/nigeria-data";
import { colors } from "../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

const GOODS_SUBGROUPS = [
  "Fashion & Accessories", "Electronics & Gadgets", "Food, Groceries & Beverages",
  "Home, Furniture & Kitchen", "Health, Beauty & Safety", "Building, Hardware & Industrial",
  "Agriculture & Animals", "Office, Print & Stationery", "Gifts, Events & Leisure", "Other Goods",
];
const DEEP_CATEGORIES = ["Tailoring & Fashion Designer", "Clothing & Fashion"];
const STATES = Object.keys(nigeriaData);
const RADIUS_OPTIONS = [1, 5, 10, 20];
const TYPE_TABS = ["all", "product", "service", "vendor"] as const;
type SearchTypeTab = typeof TYPE_TABS[number];
type OpenPill = "artisan" | "goods" | "professional" | null;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [keyword, setKeyword] = useState("");
  const [emptySearchError, setEmptySearchError] = useState(false);
  const [searchType, setSearchType] = useState<SearchTypeTab>("all");
  const [connected, setConnected] = useState<boolean | null>(null);

  const [openPill, setOpenPill] = useState<OpenPill>(null);
  const [openSubgroup, setOpenSubgroup] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openSubcat, setOpenSubcat] = useState<string | null>(null);

  const [artisanCats, setArtisanCats] = useState<string[]>([]);
  const [professionalCats, setProfessionalCats] = useState<string[]>([]);
  const [goodsCatsBySubgroup, setGoodsCatsBySubgroup] = useState<Record<string, string[]>>({});
  const [nestedCats, setNestedCats] = useState<Record<string, Record<string, string[]>>>({});

  // ── Global filters (Option B) — shared by both category tiles and keyword search ──
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [lga, setLga] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [lgaPickerOpen, setLgaPickerOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState("");
  const [lgaSearch, setLgaSearch] = useState("");
  const [distanceEnabled, setDistanceEnabled] = useState(false);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [radius, setRadius] = useState(5);
  const [locationStatus, setLocationStatus] = useState<"idle" | "detecting" | "ready" | "denied">("idle");

  const lgaOptions = state ? nigeriaData[state] : [];
  const filteredStates = STATES.filter((s) => s.toLowerCase().includes(stateSearch.toLowerCase()));
  const filteredLgas = lgaOptions.filter((l) => l.toLowerCase().includes(lgaSearch.toLowerCase()));
  const activeFilterCount = [state, lga, verifiedOnly || null, distanceEnabled || null].filter(Boolean).length;

  useEffect(() => {
    supabase.from("categories").select("*", { count: "exact", head: true }).then(({ error }) => setConnected(!error));

    supabase.from("categories").select("name, audience_type, goods_subgroup").then(({ data }) => {
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

    supabase.from("categories").select("name, subcategories(name, sub_subcategories(name))").in("name", DEEP_CATEGORIES).then(({ data }) => {
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

  async function requestLocation(): Promise<boolean> {
    setLocationStatus("detecting");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationStatus("denied");
      setDistanceEnabled(false);
      return false;
    }
    const pos = await Location.getCurrentPositionAsync({});
    setUserLat(pos.coords.latitude);
    setUserLng(pos.coords.longitude);
    setLocationStatus("ready");
    return true;
  }

  async function toggleDistance(value: boolean) {
    setDistanceEnabled(value);
    if (value && userLat == null) await requestLocation();
  }

  function closeAllExpansions() {
    setOpenPill(null);
    setOpenSubgroup(null);
    setOpenCategory(null);
    setOpenSubcat(null);
  }

  // Every navigation to Results carries the current global filters —
  // Option B: category tiles are no longer filter-independent.
  function goToResults(params: { audience?: string; subgroup?: string; category?: string; subcategory?: string; subsubcategory?: string; keyword?: string }) {
    closeAllExpansions();
    navigation.navigate("Results", {
      ...params,
      searchType: params.keyword !== undefined ? searchType : undefined,
      state: state || undefined,
      lga: lga || undefined,
      verifiedOnly: verifiedOnly || undefined,
      distanceEnabled: distanceEnabled || undefined,
      userLat: userLat ?? undefined,
      userLng: userLng ?? undefined,
      radius: distanceEnabled ? radius : undefined,
    });
  }

  // Bug fix, 2026-09-10 per Cyril: tapping Search with an empty
  // keyword used to run anyway -- an empty string becomes null in
  // the actual query, so it matched EVERYTHING (products, services,
  // vendors, sponsored, all of it) with no filter at all. Now
  // requires an actual keyword, same as web's matching fix.
  function handleKeywordSearch() {
    const trimmed = keyword.trim();
    if (!trimmed) {
      setEmptySearchError(true);
      return;
    }
    setEmptySearchError(false);
    goToResults({ keyword: trimmed });
  }

  function togglePill(pill: OpenPill) {
    setOpenSubgroup(null);
    setOpenCategory(null);
    setOpenSubcat(null);
    setOpenPill((current) => (current === pill ? null : pill));
  }

  function clearFilters() {
    setState(null);
    setLga(null);
    setVerifiedOnly(false);
    setDistanceEnabled(false);
  }

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
        <TouchableOpacity style={styles.subgroupItem} onPress={() => { setOpenSubcat(null); setOpenCategory(isCatOpen ? null : cat); }}>
          <Text style={styles.subgroupText}>{cat} {isCatOpen ? "▾" : "▸"}</Text>
        </TouchableOpacity>
        {isCatOpen && (
          <View style={styles.nestedLevel}>
            {Object.entries(nested).map(([subName, subsubs]) => {
              const isSubOpen = openSubcat === subName;
              return (
                <View key={subName}>
                  <TouchableOpacity style={styles.subgroupItem} onPress={() => setOpenSubcat(isSubOpen ? null : subName)}>
                    <Text style={styles.subgroupText}>{subName} {isSubOpen ? "▾" : "▸"}</Text>
                  </TouchableOpacity>
                  {isSubOpen && (
                    <View style={styles.nestedLevel}>
                      {subsubs.map((ss) => (
                        <TouchableOpacity key={ss} style={styles.subgroupItem} onPress={() => goToResults({ category: cat, subcategory: subName, subsubcategory: ss })}>
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

      <Image
        source={{ uri: "https://spotlightdirectories.com/images/whitelogo3.png" }}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.tagline}>
        <Text style={styles.taglineWord}>FIND</Text><Text style={styles.taglineDot}>.</Text>{" "}
        <Text style={styles.taglineWord}>TRUST</Text><Text style={styles.taglineDot}>.</Text>{" "}
        <Text style={styles.taglineWord}>CONNECT</Text><Text style={styles.taglineDot}>.</Text>
      </Text>

      {connected === false && <Text style={styles.connectionWarning}>⚠ Couldn't reach the database</Text>}

      {/* PATH 1: Direct category jump — a "definite move" */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Browse by Category</Text>
        {activeFilterCount > 0 && (
          <TouchableOpacity onPress={() => setFiltersOpen(true)}>
            <Text style={styles.badgeText}>Filters ({activeFilterCount})</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.tileRow}>
        <TouchableOpacity style={styles.tile} onPress={() => togglePill("artisan")}>
          <FontAwesome6 name="hammer" size={22} color={colors.white} />
          <Text style={styles.tileLabel}>Artisans</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => togglePill("goods")}>
          <FontAwesome6 name="bag-shopping" size={22} color={colors.white} />
          <Text style={styles.tileLabel}>Goods</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} onPress={() => togglePill("professional")}>
          <FontAwesome6 name="briefcase" size={22} color={colors.white} />
          <Text style={styles.tileLabel}>Professionals</Text>
        </TouchableOpacity>
      </View>

      {openPill === "artisan" && (
        <View style={styles.subgroupList}>
          {artisanCats.length === 0 ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : artisanCats.map(renderCategoryRow)}
        </View>
      )}
      {openPill === "goods" && (
        <View style={styles.subgroupList}>
          {GOODS_SUBGROUPS.map((sub) => {
            const isSubOpen = openSubgroup === sub;
            const cats = goodsCatsBySubgroup[sub] || [];
            return (
              <View key={sub}>
                <TouchableOpacity style={styles.subgroupItem} onPress={() => { setOpenCategory(null); setOpenSubcat(null); setOpenSubgroup(isSubOpen ? null : sub); }}>
                  <Text style={styles.subgroupText}>{sub} {isSubOpen ? "▾" : "▸"}</Text>
                </TouchableOpacity>
                {isSubOpen && (
                  <View style={styles.nestedLevel}>
                    {cats.length === 0 ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 8 }} /> : cats.map(renderCategoryRow)}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      {openPill === "professional" && (
        <View style={styles.subgroupList}>
          {professionalCats.length === 0 ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} /> : professionalCats.map(renderCategoryRow)}
        </View>
      )}

      {/* PATH 2: Keyword search — "a point to start a search" */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Or Search by Keyword</Text>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="What are you looking for?"
          placeholderTextColor={colors.textSecondary}
          value={keyword}
          onChangeText={(text) => { setKeyword(text); setEmptySearchError(false); }}
          onSubmitEditing={handleKeywordSearch}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleKeywordSearch}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>
      {emptySearchError && (
        <Text style={styles.emptySearchError}>Please type a keyword to search.</Text>
      )}

      <View style={styles.tabRow}>
        {TYPE_TABS.map((tab) => (
          <TouchableOpacity key={tab} style={[styles.tab, searchType === tab && styles.tabActive]} onPress={() => setSearchType(tab)}>
            <Text style={[styles.tabText, searchType === tab && styles.tabTextActive]}>
              {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1) + "s"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.filterToggle} onPress={() => setFiltersOpen(true)}>
        <FontAwesome6 name="sliders" size={13} color={colors.primary} />
        <Text style={styles.filterToggleText}>More Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</Text>
      </TouchableOpacity>

      {/* MORE FILTERS MODAL — shared by both paths */}
      <Modal visible={filtersOpen} animationType="slide" transparent onRequestClose={() => setFiltersOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>More Filters</Text>

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
              <Switch value={verifiedOnly} onValueChange={setVerifiedOnly} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>

            <View style={styles.switchRow}>
              <Text style={styles.filterLabel}>Search near me</Text>
              <Switch value={distanceEnabled} onValueChange={toggleDistance} trackColor={{ true: colors.primary, false: colors.border }} />
            </View>

            {locationStatus === "detecting" && <Text style={styles.locationStatusText}>Detecting your location…</Text>}
            {locationStatus === "denied" && <Text style={styles.locationStatusTextWarn}>Location permission denied. Enable it in your phone's Settings.</Text>}

            {distanceEnabled && locationStatus === "ready" && (
              <>
                <Text style={styles.filterLabel}>Within</Text>
                <View style={styles.radiusRow}>
                  {RADIUS_OPTIONS.map((r) => (
                    <TouchableOpacity key={r} style={[styles.radiusChip, radius === r && styles.radiusChipActive]} onPress={() => setRadius(r)}>
                      <Text style={[styles.radiusChipText, radius === r && styles.radiusChipTextActive]}>{r}km</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.applyButton} onPress={() => setFiltersOpen(false)}>
                <Text style={styles.applyButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={statePickerOpen} animationType="slide" transparent onRequestClose={() => setStatePickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select State</Text>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search states..."
              placeholderTextColor={colors.textSecondary}
              value={stateSearch}
              onChangeText={setStateSearch}
              autoFocus
            />
            <FlatList data={filteredStates} keyExtractor={(s) => s} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setState(item); setLga(null); setStatePickerOpen(false); setStateSearch(""); }}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.noResults}>No matching states.</Text>}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => { setStatePickerOpen(false); setStateSearch(""); }}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={lgaPickerOpen} animationType="slide" transparent onRequestClose={() => setLgaPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select LGA</Text>
            <TextInput
              style={styles.pickerSearchInput}
              placeholder="Search LGAs..."
              placeholderTextColor={colors.textSecondary}
              value={lgaSearch}
              onChangeText={setLgaSearch}
              autoFocus
            />
            <FlatList data={filteredLgas} keyExtractor={(l) => l} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setLga(item); setLgaPickerOpen(false); setLgaSearch(""); }}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.noResults}>No matching LGAs.</Text>}
            />
            <TouchableOpacity style={styles.closeButton} onPress={() => { setLgaPickerOpen(false); setLgaSearch(""); }}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  topRow: { flexDirection: "row", padding: 16, paddingTop: 50 },
  loginLink: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  logo: { width: 220, height: 60, alignSelf: "center", marginTop: 8 },
  tagline: { textAlign: "center", marginTop: 6, marginBottom: 20 },
  taglineWord: { color: colors.textSecondary, fontSize: 13, fontWeight: "300", letterSpacing: 1 },
  taglineDot: { color: colors.primary, fontWeight: "900", fontSize: 15 },
  connectionWarning: { color: colors.warning, textAlign: "center", fontSize: 12, marginBottom: 12 },

  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: 20, marginTop: 20, marginBottom: 10 },
  sectionLabel: { color: colors.textSecondary, fontSize: 12, textTransform: "uppercase" },
  badgeText: { color: colors.primary, fontSize: 12, fontWeight: "700" },

  tileRow: { flexDirection: "row", gap: 8, marginHorizontal: 20 },
  tile: { flex: 1, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  tileLabel: { color: colors.white, fontSize: 12, fontWeight: "600", marginTop: 6 },

  subgroupList: { marginHorizontal: 20, marginTop: 8, marginBottom: 4 },
  subgroupItem: { paddingVertical: 10, paddingLeft: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  subgroupText: { color: colors.textSecondary, fontSize: 14 },
  nestedLevel: { paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: colors.border, marginLeft: 4 },

  searchBar: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 10 },
  searchInput: { flex: 1, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white },
  searchButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 18, justifyContent: "center" },
  searchButtonText: { color: colors.black, fontWeight: "700" },
  emptySearchError: { color: colors.error, fontSize: 12, fontWeight: "600", marginHorizontal: 20, marginTop: -4, marginBottom: 10 },

  tabRow: { flexDirection: "row", paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  tab: { flex: 1, backgroundColor: "#141414", borderRadius: 999, paddingVertical: 8, alignItems: "center" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textSecondary, fontSize: 12, fontWeight: "700" },
  tabTextActive: { color: colors.black },

  filterToggle: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, justifyContent: "center" },
  filterToggleText: { color: colors.primary, fontSize: 13, fontWeight: "600" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalTitle: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 16 },
  filterLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  filterField: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  filterFieldText: { color: colors.white, fontSize: 14 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  locationStatusText: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  locationStatusTextWarn: { color: colors.warning, fontSize: 12, marginTop: 8 },
  radiusRow: { flexDirection: "row", gap: 8 },
  radiusChip: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" },
  radiusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  radiusChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  radiusChipTextActive: { color: colors.black },
  modalButtonRow: { flexDirection: "row", gap: 10, marginTop: 28 },
  clearButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center" },
  clearButtonText: { color: colors.textSecondary, fontWeight: "600" },
  applyButton: { flex: 2, backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center" },
  applyButtonText: { color: colors.black, fontWeight: "700" },

  pickerCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "75%" },
  pickerSearchInput: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14, marginBottom: 12 },
  noResults: { color: colors.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: 20 },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerItemText: { color: colors.white, fontSize: 15 },
  closeButton: { marginTop: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  closeButtonText: { color: colors.primary, fontWeight: "600" },
});
