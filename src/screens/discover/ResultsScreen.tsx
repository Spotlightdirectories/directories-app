// ===============================================================
// src/screens/discover/ResultsScreen.tsx
//
// Simplified per Cyril's UX correction: this screen no longer owns
// any filter configuration (state/LGA/verified/distance/type) --
// all of that now happens on Home before arriving here. This screen
// just displays whatever was configured. The keyword box stays,
// for quick refinement without going back to Home, but it re-runs
// using the SAME type/state/lga/verified/distance it arrived with.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { logSearch } from "../../lib/logSearch";
import { applyDistance, formatDistance } from "../../lib/distance";
import { colors } from "../../theme/colors";

type Route = RouteProp<RootStackParamList, "Results">;
type Nav = NativeStackNavigationProp<RootStackParamList, "Results">;

type ResultItem = {
  key: string;
  name: string;
  vendorName: string;
  vendorSlug: string;
  itemSlug?: string;
  price: number | null;
  kind: "product" | "service" | "vendor";
  lat: number | null;
  lng: number | null;
  distanceKm?: number | null;
  sponsored: boolean;
  branchName?: string | null;
  branchAddress?: string | null;
};

export default function ResultsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const {
    audience, subgroup, category, subcategory, subsubcategory,
    keyword: initialKeyword, searchType = "all",
    state, lga, verifiedOnly, distanceEnabled, userLat, userLng, radius = 5,
  } = route.params || {};

  const [keyword, setKeyword] = useState(initialKeyword || "");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ResultItem[]>([]);
  const [services, setServices] = useState<ResultItem[]>([]);
  const [vendors, setVendors] = useState<ResultItem[]>([]);

  async function fetchBranchResults(kw: string | undefined): Promise<ResultItem[]> {
    let branchQuery = supabase
      .from("branches")
      .select("id, branch_name, address, state, lga, latitude, longitude, vendor_id, account_status")
      .eq("account_status", "active");
    if (state) branchQuery = branchQuery.eq("state", state);
    if (lga) branchQuery = branchQuery.eq("lga", lga);
    const { data: branchData } = await branchQuery;
    if (!branchData || branchData.length === 0) return [];

    const vendorIds = [...new Set(branchData.map((b: any) => b.vendor_id))];
    const { data: branchVendors } = await supabase
      .from("vendors")
      .select("id, slug, name, category, subcategory, verification_status, is_sponsored, account_status")
      .in("id", vendorIds)
      .eq("account_status", "active");

    const vendorMap = new Map((branchVendors || []).map((v: any) => [v.id, v]));

    let items: any[] = branchData
      .map((b: any) => {
        const v = vendorMap.get(b.vendor_id);
        if (!v) return null;
        return {
          key: `branch-${b.id}`,
          name: b.branch_name || v.name,
          vendorName: v.name,
          vendorSlug: v.slug,
          price: null,
          kind: "vendor" as const,
          lat: b.latitude ? Number(b.latitude) : null,
          lng: b.longitude ? Number(b.longitude) : null,
          sponsored: !!v.is_sponsored,
          branchName: b.branch_name,
          branchAddress: b.address,
          _category: v.category,
          _verification: v.verification_status,
        };
      })
      .filter(Boolean);

    if (kw) {
      const kwLower = kw.toLowerCase();
      items = items.filter((i) => (i.name || "").toLowerCase().includes(kwLower) || (i._category || "").toLowerCase().includes(kwLower));
    }
    if (category) items = items.filter((i) => i._category === category);
    if (verifiedOnly) items = items.filter((i) => i._verification === "blue" || i._verification === "gray");

    return items;
  }

  async function runSearch(kw?: string) {
    setLoading(true);

    const params = {
      p_keyword: kw || null,
      p_category: category || null,
      p_subcategory: subcategory || null,
      p_state: state || null,
      p_lga: lga || null,
      p_verified_only: !!verifiedOnly,
      p_subsubcategory: subsubcategory || null,
      p_audience_type: audience || null,
      p_goods_subgroup: subgroup || null,
    };

    const [productsRes, servicesRes, vendorsRes, branchItems] = await Promise.all([
      searchType === "all" || searchType === "product" ? supabase.rpc("search_products", params) : Promise.resolve({ data: [] }),
      searchType === "all" || searchType === "service" ? supabase.rpc("search_services", params) : Promise.resolve({ data: [] }),
      searchType === "all" || searchType === "vendor" ? supabase.rpc("search_vendors", params) : Promise.resolve({ data: [] }),
      searchType === "all" || searchType === "vendor" ? fetchBranchResults(kw) : Promise.resolve([]),
    ]);

    let productItems: ResultItem[] = (productsRes.data || []).map((p: any) => ({
      key: `product-${p.id}`, name: p.product_name, vendorName: p.vendor_name, vendorSlug: p.vendor_slug,
      itemSlug: p.slug,
      price: p.price, kind: "product" as const, lat: p.vendor_latitude ?? null, lng: p.vendor_longitude ?? null,
      sponsored: !!p.vendor_is_sponsored,
    }));
    let serviceItems: ResultItem[] = (servicesRes.data || []).map((s: any) => ({
      key: `service-${s.id}`, name: s.service_name, vendorName: s.vendor_name, vendorSlug: s.vendor_slug,
      price: s.starting_price, kind: "service" as const, lat: s.vendor_latitude ?? null, lng: s.vendor_longitude ?? null,
      sponsored: !!s.vendor_is_sponsored,
    }));
    let vendorItems: ResultItem[] = [
      ...(vendorsRes.data || []).map((v: any) => ({
        key: `vendor-${v.id}`, name: v.name, vendorName: v.name, vendorSlug: v.slug,
        price: null, kind: "vendor" as const, lat: v.latitude ?? null, lng: v.longitude ?? null,
        sponsored: !!v.is_sponsored,
      })),
      ...branchItems,
    ];

    const lat = userLat ?? null;
    const lng = userLng ?? null;
    productItems = applyDistance(productItems, (i) => i.lat, (i) => i.lng, lat, lng, radius, !!distanceEnabled);
    serviceItems = applyDistance(serviceItems, (i) => i.lat, (i) => i.lng, lat, lng, radius, !!distanceEnabled);
    vendorItems = applyDistance(vendorItems, (i) => i.lat, (i) => i.lng, lat, lng, radius, !!distanceEnabled);

    setProducts(productItems);
    setServices(serviceItems);
    setVendors(vendorItems);
    setLoading(false);

    logSearch({ keyword: kw, searchType, category, subcategory, state: state || undefined, lga: lga || undefined, verifiedOnly: !!verifiedOnly });
  }

  useEffect(() => {
    runSearch(initialKeyword);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sponsoredItems = [...products, ...services, ...vendors].filter((i) => i.sponsored);
  const showProducts = searchType === "all" || searchType === "product";
  const showServices = searchType === "all" || searchType === "service";
  const showVendors = searchType === "all" || searchType === "vendor";
  const totalCount = products.length + services.length + vendors.length;
  const activeFilterCount = [state, lga, verifiedOnly || null, distanceEnabled || null].filter(Boolean).length;

  function renderItem(item: ResultItem) {
    return (
      <TouchableOpacity key={item.key} style={styles.card} onPress={() => navigation.navigate("VendorProfile", { slug: item.vendorSlug })}>
        {item.sponsored && <Text style={styles.sponsoredTag}>SPONSORED</Text>}
        <Text style={styles.itemName}>{item.branchName || item.name}</Text>
        {item.kind !== "vendor" && <Text style={styles.itemVendor}>By {item.vendorName}</Text>}
        {item.branchAddress && <Text style={styles.itemVendor}>{item.branchAddress}</Text>}
        {item.price != null && <Text style={styles.itemPrice}>₦{Number(item.price).toLocaleString()}</Text>}
        {distanceEnabled && item.distanceKm != null && (
          <View style={styles.distanceRow}>
            <FontAwesome6 name="location-dot" size={11} color={colors.primary} />
            <Text style={styles.itemDistance}>{formatDistance(item.distanceKm)}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>
          {audience ? audience : category ? category : "Search Results"}
          {subgroup ? ` › ${subgroup}` : ""}{subcategory ? ` › ${subcategory}` : ""}{subsubcategory ? ` › ${subsubcategory}` : ""}
        </Text>
        {activeFilterCount > 0 && <Text style={styles.filterBadge}>Filters ({activeFilterCount}) active from Home</Text>}
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Refine keyword…"
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

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : totalCount === 0 ? (
        <Text style={styles.empty}>No results found. Try adjusting your search on Home.</Text>
      ) : (
        <FlatList
          data={[{ key: "content" }]}
          keyExtractor={(i) => i.key}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={() => (
            <View>
              {sponsoredItems.length > 0 && (<><Text style={styles.sectionHeading}>Sponsored</Text>{sponsoredItems.map(renderItem)}</>)}
              {showProducts && products.length > 0 && (<><Text style={styles.sectionHeading}>Products</Text>{products.map(renderItem)}</>)}
              {showServices && services.length > 0 && (<><Text style={styles.sectionHeading}>Services</Text>{services.map(renderItem)}</>)}
              {showVendors && vendors.length > 0 && (<><Text style={styles.sectionHeading}>Vendors</Text>{vendors.map(renderItem)}</>)}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  header: { padding: 16, paddingTop: 50 },
  back: { color: colors.primary, fontSize: 15, marginBottom: 8 },
  title: { color: colors.white, fontSize: 20, fontWeight: "700" },
  filterBadge: { color: colors.primary, fontSize: 11, marginTop: 6 },
  searchBar: { flexDirection: "row", paddingHorizontal: 16, marginBottom: 12, gap: 8 },
  searchInput: { flex: 1, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, color: colors.white },
  searchButton: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 16, justifyContent: "center" },
  searchButtonText: { color: colors.black, fontWeight: "700" },
  empty: { color: colors.textSecondary, textAlign: "center", marginTop: 40 },
  sectionHeading: { color: colors.white, fontSize: 15, fontWeight: "700", marginTop: 16, marginBottom: 8 },
  sponsoredTag: { color: colors.primary, fontSize: 10, fontWeight: "700", marginBottom: 4 },
  card: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 10 },
  itemName: { color: colors.white, fontSize: 15, fontWeight: "600" },
  itemVendor: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  itemPrice: { color: colors.primary, fontSize: 13, marginTop: 4, fontWeight: "600" },
  itemDistance: { color: colors.primary, fontSize: 11, fontWeight: "700", marginLeft: 4 },
  distanceRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
});
