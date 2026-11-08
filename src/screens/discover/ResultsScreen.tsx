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

import { useEffect, useRef, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, Image, Modal, Switch } from "react-native";
import { KeyboardAvoidingView as KAV } from "react-native";
import * as Location from "expo-location";
import { FontAwesome6 } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import VerifiedBadge from "../../components/VerifiedBadge";
import FounderBadge from "../../components/FounderBadge";
import { nigeriaData } from "../../lib/nigeria-data";
import { logSearch } from "../../lib/logSearch";
import { applyDistance, formatDistance } from "../../lib/distance";
import SpotlightMark from "../../components/SpotlightMark";
import AccountMenu from "../../components/AccountMenu";
import { colors } from "../../theme/colors";

import { insertAnalytics } from "../../lib/analytics";
type Route = RouteProp<RootStackParamList, "Results">;
type Nav = NativeStackNavigationProp<RootStackParamList, "Results">;

const DEFAULT_LOGO = "https://spotlightdirectories.com/images/default-vendor-logo.png";
const STATES = Object.keys(nigeriaData);
const RADIUS_OPTIONS = [1, 5, 10, 20];

type ResultItem = {
  image?: string | null;
  key: string;
  name: string;
  subLabel?: string | null;
  vendorName: string;
  vendorSlug: string;
  itemSlug?: string;
  price: number | null;
  kind: "product" | "service" | "vendor";
  vendorId?: string;   // used to record search impressions for the vendor
  itemId?: string;     // product / service id, same purpose
  lat: number | null;
  lng: number | null;
  distanceKm?: number | null;
  sponsored: boolean;
  branchName?: string | null;
  branchAddress?: string | null;
  // Vendor-card details (same fields the web card shows)
  verification?: string | null;
  rating?: number;
  reviews?: number;
  location?: string | null;
  categoryLabel?: string | null;
};

async function getViewingCustomerId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
  return data?.id || null;
}

export default function ResultsScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const {
    audience, subgroup, category, subcategory, subsubcategory,
    keyword: initialKeyword, searchType = "all",
    state: initState, lga: initLga, verifiedOnly: initVerified, distanceEnabled: initDistance,
    userLat: initLat, userLng: initLng, radius: initRadius = 5,
  } = route.params || {};

  // Filters now live here as local state (initialised from Home) so
  // "More Filters" can be changed without going back -- same as web.
  const [state, setState] = useState<string | undefined>(initState);
  const [lga, setLga] = useState<string | undefined>(initLga);
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(!!initVerified);
  const [distanceEnabled, setDistanceEnabled] = useState<boolean>(!!initDistance);
  const [userLat, setUserLat] = useState<number | null>(initLat ?? null);
  const [userLng, setUserLng] = useState<number | null>(initLng ?? null);
  const [radius, setRadius] = useState<number>(initRadius);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [lgaPickerOpen, setLgaPickerOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState("");
  const [lgaSearch, setLgaSearch] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "detecting" | "ready" | "denied">(initLat != null ? "ready" : "idle");
  const [filtersVersion, setFiltersVersion] = useState(0);
  const [emptyKeywordError, setEmptyKeywordError] = useState(false);
  const firstRun = useRef(true);

  const [keyword, setKeyword] = useState(initialKeyword || "");
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<ResultItem[]>([]);
  // Founders 1000 (1KF): slugs of vendors whose Spot-ID number is 1-1000.
  const [founderSlugs, setFounderSlugs] = useState<Set<string>>(new Set());
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
      .select("id, slug, name, category, subcategory, verification_status, is_sponsored, account_status, logo_url, average_rating, reviews_count")
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
          image: v.logo_url || null,
          kind: "vendor" as const,
          lat: b.latitude ? Number(b.latitude) : null,
          lng: b.longitude ? Number(b.longitude) : null,
          sponsored: !!v.is_sponsored,
          branchName: b.branch_name,
          branchAddress: b.address,
          verification: v.verification_status || null,
          rating: Number(v.average_rating) || 0,
          reviews: Number(v.reviews_count) || 0,
          location: [b.lga, b.state].filter(Boolean).join(", ") || null,
          categoryLabel: v.subcategory || v.category || null,
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

  async function runSearch(kw?: string, quiet = false) {
    if (!quiet) setLoading(true);

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
      key: `product-${p.id}`, name: p.product_name, subLabel: p.product_subcategory_label || null, vendorName: p.vendor_name, vendorSlug: p.vendor_slug,
      itemSlug: p.slug, vendorId: p.vendor_id, itemId: p.id,
      image: p.primary_image_url || null,
      price: p.price, kind: "product" as const, lat: p.vendor_latitude ?? null, lng: p.vendor_longitude ?? null,
      sponsored: !!p.vendor_is_sponsored,
    }));
    let serviceItems: ResultItem[] = (servicesRes.data || []).map((s: any) => ({
      key: `service-${s.id}`, name: s.service_name, vendorName: s.vendor_name, vendorSlug: s.vendor_slug,
      itemSlug: s.slug, vendorId: s.vendor_id, itemId: s.id,
      image: s.representative_image_url || s.vendor_logo_url || null,
      price: s.starting_price, kind: "service" as const, lat: s.vendor_latitude ?? null, lng: s.vendor_longitude ?? null,
      sponsored: !!s.vendor_is_sponsored,
    }));
    let vendorItems: ResultItem[] = [
      ...(vendorsRes.data || []).map((v: any) => ({
        key: `vendor-${v.id}`, vendorId: v.id, name: v.name, vendorName: v.name, vendorSlug: v.slug,
        image: v.logo_url || null,
        price: null, kind: "vendor" as const, lat: v.latitude ?? null, lng: v.longitude ?? null,
        sponsored: !!v.is_sponsored,
        verification: v.verification_status || null,
        rating: Number(v.average_rating) || 0,
        reviews: Number(v.reviews_count) || 0,
        location: [v.lga, v.state].filter(Boolean).join(", ") || null,
        categoryLabel: v.subcategory || v.category || null,
      })),
      ...branchItems,
    ];

    // Task R: category line from what each vendor actually lists (same as web + Favorites).
    if (vendorItems.length > 0) {
      try {
        const ids = [...new Set(
          vendorItems.map((i) => (i.key.startsWith("branch-") ? null : i.key.replace("vendor-", "")))
            .filter(Boolean) as string[]
        )];
        const branchVendorSlugs = vendorItems.filter((i) => i.key.startsWith("branch-")).map((i) => i.vendorSlug);
        let slugToId: Record<string, string> = {};
        if (branchVendorSlugs.length > 0) {
          const { data: vr } = await supabase.from("vendors").select("id, slug").in("slug", branchVendorSlugs);
          (vr || []).forEach((r: any) => { slugToId[r.slug] = r.id; });
        }
        const allIds = [...new Set([...ids, ...Object.values(slugToId)])];
        if (allIds.length > 0) {
          const { data: catRows } = await supabase.rpc("get_vendor_display_categories", { p_vendor_ids: allIds });
          const catMap: Record<string, any> = {};
          (catRows || []).forEach((r: any) => { catMap[r.vendor_id] = r; });
          vendorItems = vendorItems.map((i) => {
            const vid = i.key.startsWith("branch-") ? slugToId[i.vendorSlug] : i.key.replace("vendor-", "");
            const r = vid ? catMap[vid] : null;
            if (!r || !r.categories || r.categories.length === 0) return i;
            const shown = r.categories.slice(0, 2).join(" • ");
            const more = (r.total_count || r.categories.length) - 2;
            return { ...i, categoryLabel: more > 0 ? `${shown} • +${more} more` : shown };
          });
        }
      } catch { /* non-fatal: keeps stored subcategory */ }
    }

    const lat = userLat ?? null;
    const lng = userLng ?? null;
    productItems =applyDistance(productItems, (i) => i.lat, (i) => i.lng, lat, lng, radius, !!distanceEnabled);
    serviceItems = applyDistance(serviceItems, (i) => i.lat, (i) => i.lng, lat, lng, radius, !!distanceEnabled);
    vendorItems = applyDistance(vendorItems, (i) => i.lat, (i) => i.lng, lat, lng, radius, !!distanceEnabled);

    setProducts(productItems);
    setServices(serviceItems);
    setVendors(vendorItems);
    try {
      const slugs = [...new Set(vendorItems.map((i) => i.vendorSlug).filter(Boolean))];
      if (slugs.length > 0) {
        const { data: fr } = await supabase.from("vendors").select("slug").in("slug", slugs).eq("is_founder", true);
        setFounderSlugs(new Set((fr || []).map((r: any) => r.slug)));
      } else setFounderSlugs(new Set());
    } catch { /* badge is optional */ }
    setLoading(false);

    // Business Insights: one "search impression" per vendor / product / service
    // actually shown, tagged with the keyword -- same as the website. Skipped
    // on pull-to-refresh so refreshing never inflates a vendor's numbers.
    if (!quiet) {
      (async () => {
        try {
          const customerId = await getViewingCustomerId();
          const base = { event_type: "search_impression", search_keyword: kw || "", customer_id: customerId };
          const impressions = [
            ...vendorItems.filter((i) => i.vendorId).map((i) => ({ ...base, vendor_id: i.vendorId })),
            ...productItems.filter((i) => i.vendorId && i.itemId).map((i) => ({ ...base, vendor_id: i.vendorId, product_id: i.itemId })),
            ...serviceItems.filter((i) => i.vendorId && i.itemId).map((i) => ({ ...base, vendor_id: i.vendorId, service_id: i.itemId })),
          ];
          if (impressions.length) await insertAnalytics(impressions);
        } catch { /* non-fatal */ }
      })();
    }

    if (!quiet) logSearch({ keyword: kw, searchType, category, subcategory, state: state || undefined, lga: lga || undefined, verifiedOnly: !!verifiedOnly });
  }

  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      runSearch(initialKeyword);
      return;
    }
    runSearch(keyword.trim() || undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersVersion]);
  // Pull down: quietly re-run the same search (no spinner, no new history entry).
  const { refreshControl } = usePullRefresh(() => runSearch(keyword.trim() || undefined, true));

  // Same rule as Home/web: a blank keyword is not a search -- unless
  // the user arrived by browsing a category (then refine is optional).
  function handleRefine() {
    const trimmed = keyword.trim();
    const browsing = !!(audience || category || subgroup || subcategory);
    if (!trimmed && !browsing) {
      setEmptyKeywordError(true);
      return;
    }
    setEmptyKeywordError(false);
    runSearch(trimmed);
  }

  async function toggleDistance(value: boolean) {
    setDistanceEnabled(value);
    if (value && userLat == null) {
      setLocationStatus("detecting");
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocationStatus("denied"); setDistanceEnabled(false); return; }
      const pos = await Location.getCurrentPositionAsync({});
      setUserLat(pos.coords.latitude);
      setUserLng(pos.coords.longitude);
      setLocationStatus("ready");
    }
  }

  function clearFilters() {
    setState(undefined); setLga(undefined); setVerifiedOnly(false); setDistanceEnabled(false);
  }

  const lgaOptions = state ? nigeriaData[state] || [] : [];
  const filteredStates = STATES.filter((x) => x.toLowerCase().includes(stateSearch.toLowerCase()));
  const filteredLgas = lgaOptions.filter((x) => x.toLowerCase().includes(lgaSearch.toLowerCase()));

  const sponsoredItems = [...products, ...services, ...vendors].filter((i) => i.sponsored);
  const showProducts = searchType === "all" || searchType === "product";
  const showServices = searchType === "all" || searchType === "service";
  const showVendors = searchType === "all" || searchType === "vendor";
  const totalCount = products.length + services.length + vendors.length;
  const activeFilterCount = [state, lga, verifiedOnly || null, distanceEnabled || null].filter(Boolean).length;

  function renderItem(item: ResultItem) {
    function handlePress() {
      if (item.kind === "product" && item.itemSlug) {
        navigation.navigate("ProductDetail", { vendorSlug: item.vendorSlug, productSlug: item.itemSlug });
      } else if (item.kind === "service" && item.itemSlug) {
        navigation.navigate("ServiceDetail", { vendorSlug: item.vendorSlug, serviceSlug: item.itemSlug });
      } else {
        navigation.navigate("VendorProfile", { slug: item.vendorSlug });
      }
    }
    const thumb = item.image || DEFAULT_LOGO;
    return (
      <TouchableOpacity key={item.key} style={styles.card} onPress={handlePress}>
        <View style={styles.cardRow}>
          <Image source={{ uri: thumb }} style={item.kind === "vendor" ? styles.thumbLogo : styles.thumb} resizeMode="cover" />
          <View style={{ flex: 1 }}>
            {item.sponsored && <Text style={styles.sponsoredTag}>SPONSORED</Text>}
            {item.kind === "vendor" ? (
              <>
                <View style={styles.vendorNameRow}>
                  <Text style={[styles.itemName, { flexShrink: 1 }]}>{item.branchName || item.name}</Text>
                  <FounderBadge show={founderSlugs.has(item.vendorSlug)} size={18} />
                  <VerifiedBadge status={item.verification} size={18} />
                </View>
                <View style={styles.ratingRow}>
                  <FontAwesome6 name="star" size={11} color={colors.primary} solid />
                  <Text style={styles.ratingText}>{Number(item.rating || 0).toFixed(1)}</Text>
                  <Text style={styles.ratingCount}>({item.reviews || 0})</Text>
                </View>
                {(item.branchAddress || item.location) ? (
                  <Text style={styles.itemVendor}>{item.branchAddress || item.location}</Text>
                ) : null}
                {item.categoryLabel ? <Text style={styles.vendorCategory} numberOfLines={2}>{item.categoryLabel}</Text> : null}
              </>
            ) : (
              <>
                {item.subLabel ? <Text style={{ color: colors.textSecondary, fontSize: 12, marginBottom: 2 }}>{item.subLabel}</Text> : null}
                <Text style={styles.itemName}>{item.branchName || item.name}</Text>
                <Text style={styles.itemVendor}>By {item.vendorName}</Text>
              </>
            )}
            {item.price != null && (
              <Text style={styles.itemPrice}>
                {item.kind === "service" ? <Text style={styles.itemFrom}>From </Text> : null}
                ₦{Number(item.price).toLocaleString()}
              </Text>
            )}
            {distanceEnabled && item.distanceKm != null && (
              <View style={styles.distanceRow}>
                <FontAwesome6 name="location-dot" size={11} color={colors.primary} />
                <Text style={styles.itemDistance}>{formatDistance(item.distanceKm)}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.reviewBtn} onPress={() => navigation.navigate("VendorProfile", { slug: item.vendorSlug, openReview: true })}>
            <Text style={styles.reviewBtnText}>Leave Review</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate("VendorProfile", { slug: item.vendorSlug })}>
            <Text style={styles.profileBtnText}>View Profile</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.back}>‹ Back</Text>
          </TouchableOpacity>
          <SpotlightMark size={22} />
          <AccountMenu />
        </View>
        <Text style={styles.title}>
          {audience ? audience : category ? category : "Search Results"}
          {subgroup ? ` › ${subgroup}` : ""}{subcategory ? ` › ${subcategory}` : ""}{subsubcategory ? ` › ${subsubcategory}` : ""}
        </Text>
        {activeFilterCount > 0 && <Text style={styles.filterBadge}>Filters ({activeFilterCount}) active</Text>}
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Refine keyword…"
          placeholderTextColor={colors.textSecondary}
          value={keyword}
          onChangeText={(t) => { setKeyword(t); setEmptyKeywordError(false); }}
          onSubmitEditing={handleRefine}
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleRefine}>
          <Text style={styles.searchButtonText}>Search</Text>
        </TouchableOpacity>
      </View>
      {emptyKeywordError && <Text style={styles.emptyError}>Please type a keyword to search.</Text>}

      <TouchableOpacity style={styles.filterToggle} onPress={() => setFiltersOpen(true)}>
        <FontAwesome6 name="sliders" size={13} color={colors.primary} />
        <Text style={styles.filterToggleText}>More Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}</Text>
      </TouchableOpacity>

      <Modal visible={filtersOpen} animationType="slide" transparent onRequestClose={() => setFiltersOpen(false)}>
        <KAV style={styles.modalOverlay} behavior="padding">
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
            {locationStatus === "detecting" && <Text style={styles.locationText}>Detecting your location…</Text>}
            {locationStatus === "denied" && <Text style={styles.locationTextWarn}>Location permission denied. Enable it in your phone's Settings.</Text>}
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
              <TouchableOpacity style={styles.applyButton} onPress={() => { setFiltersOpen(false); setFiltersVersion((v) => v + 1); }}>
                <Text style={styles.applyButtonText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KAV>
      </Modal>

      <Modal visible={statePickerOpen} animationType="slide" transparent onRequestClose={() => setStatePickerOpen(false)}>
        <KAV style={styles.modalOverlay} behavior="padding">
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select State</Text>
            <TextInput style={styles.pickerSearchInput} placeholder="Search states..." placeholderTextColor={colors.textSecondary} value={stateSearch} onChangeText={setStateSearch} autoFocus />
            <FlatList data={filteredStates} keyExtractor={(x) => x} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setState(item); setLga(undefined); setStatePickerOpen(false); setStateSearch(""); }}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )} />
            <TouchableOpacity style={styles.closeButton} onPress={() => { setStatePickerOpen(false); setStateSearch(""); }}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </KAV>
      </Modal>

      <Modal visible={lgaPickerOpen} animationType="slide" transparent onRequestClose={() => setLgaPickerOpen(false)}>
        <KAV style={styles.modalOverlay} behavior="padding">
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select LGA</Text>
            <TextInput style={styles.pickerSearchInput} placeholder="Search LGAs..." placeholderTextColor={colors.textSecondary} value={lgaSearch} onChangeText={setLgaSearch} autoFocus />
            <FlatList data={filteredLgas} keyExtractor={(x) => x} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setLga(item); setLgaPickerOpen(false); setLgaSearch(""); }}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )} />
            <TouchableOpacity style={styles.closeButton} onPress={() => { setLgaPickerOpen(false); setLgaSearch(""); }}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </KAV>
      </Modal>

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : totalCount === 0 ? (
        <Text style={styles.empty}>No results found. Try adjusting your search on Home.</Text>
      ) : (
        <FlatList
          refreshControl={refreshControl}
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
  headerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  back: { color: colors.primary, fontSize: 15 },
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
  vendorNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  ratingText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  ratingCount: { color: colors.textSecondary, fontSize: 11 },
  vendorCategory: { color: colors.textSecondary, fontSize: 12, fontWeight: "700", marginTop: 4 },
  itemPrice: { color: colors.success, fontSize: 13, marginTop: 4, fontWeight: "600" },
  itemDistance: { color: colors.primary, fontSize: 11, fontWeight: "700", marginLeft: 4 },
  distanceRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  itemFrom: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },

  cardRow: { flexDirection: "row", gap: 12 },
  thumb: { width: 76, height: 76, borderRadius: 10, backgroundColor: "#0d0d0d" },
  thumbLogo: { width: 56, height: 56, borderRadius: 12, backgroundColor: "#0d0d0d" },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  reviewBtn: { flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  reviewBtnText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  profileBtn: { flex: 1, backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  profileBtnText: { color: colors.black, fontSize: 12, fontWeight: "700" },
  emptyError: { color: colors.error, fontSize: 12, fontWeight: "600", marginHorizontal: 16, marginTop: -6, marginBottom: 10 },

  filterToggle: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, justifyContent: "center" },
  filterToggleText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalTitle: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 16 },
  filterLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  filterField: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  filterFieldText: { color: colors.white, fontSize: 14 },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 20 },
  locationText: { color: colors.textSecondary, fontSize: 12, marginTop: 8 },
  locationTextWarn: { color: colors.warning, fontSize: 12, marginTop: 8 },
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
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerItemText: { color: colors.white, fontSize: 15 },
  closeButton: { marginTop: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  closeButtonText: { color: colors.primary, fontWeight: "600" },
});
