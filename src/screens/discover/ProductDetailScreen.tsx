// ===============================================================
// src/screens/discover/ProductDetailScreen.tsx
//
// Ported faithfully from spotlightwebproject_staging/spotlight-next/
// src/app/(main)/vendor/[slug]/product/[productSlug]/page.tsx.
//
// Matches web's actual, deliberate styling -- price in GREEN
// (colors.success), not gold. Web has a comment explaining this was
// already fixed once after being caught wrong; same standard applied
// here from the start, not repeated.
//
// Includes: image gallery with thumbnail swap, spec grid, key
// details, description, WhatsApp/Call/Share actions, "More from this
// vendor," "Similar from other vendors" (same RPC as web), and
// analytics tracking (product_view, whatsapp_click, phone_click) tied
// to the viewing customer when logged in, same as web.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Image, Linking, Share, FlatList } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";

type Route = RouteProp<RootStackParamList, "ProductDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList, "ProductDetail">;

type Product = {
  id: string; slug: string; vendor_id: string; product_name: string; price: number;
  short_description: string | null; key_details: string | null;
  attributes: Record<string, string> | null; category_id: string | null;
  primary_image_url: string | null; secondary_image_url: string | null;
  tertiary_image_url: string | null; gallery_image_urls: string[] | null;
  vendors: {
    slug: string; name: string; whatsapp: string; telephone: string;
    verification_status: string; average_rating: number; reviews_count: number; is_sponsored: boolean;
  };
};

type RelatedProduct = {
  slug: string; product_name: string; price: number; primary_image_url: string | null;
  vendorName: string; vendorVerification: string; vendorRating: number; vendorReviews: number;
};

function SmallBadge({ status }: { status: string }) {
  if (status === "blue") return <FontAwesome6 name="circle-check" size={12} color="#1877F2" />;
  if (status === "gray") return <FontAwesome6 name="circle-check" size={12} color={colors.textSecondary} />;
  return null;
}

async function getViewingCustomerId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
  return data?.id || null;
}

export default function ProductDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { vendorSlug, productSlug } = route.params;

  const [product, setProduct] = useState<Product | null>(null);
  const [activeImage, setActiveImage] = useState("");
  const [moreProducts, setMoreProducts] = useState<RelatedProduct[]>([]);
  const [similarProducts, setSimilarProducts] = useState<RelatedProduct[]>([]);
  const [attributeLabels, setAttributeLabels] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("vendor_products")
        .select(`*, vendors(slug, name, whatsapp, telephone, verification_status, average_rating, reviews_count, is_sponsored)`)
        .eq("slug", productSlug)
        .eq("moderation_status", "approved")
        .single();

      if (error || !data) { setLoading(false); return; }

      setProduct(data);
      setActiveImage(data.primary_image_url || "https://spotlightdirectories.com/images/spotlightlogo-512.png");
      setLoading(false);

      if (data.category_id) {
        const { data: defs } = await supabase
          .from("product_attributes")
          .select("key,label")
          .eq("category_id", data.category_id)
          .order("display_order", { ascending: true });
        setAttributeLabels(defs || []);
      }

      try {
        const customerId = await getViewingCustomerId();
        await supabase.from("analytics_events").insert({
          vendor_id: data.vendor_id, product_id: data.id, event_type: "product_view", customer_id: customerId,
        });
      } catch { /* non-fatal */ }

      const { data: more } = await supabase
        .from("vendor_products")
        .select(`slug, product_name, price, primary_image_url, vendors(name, verification_status, average_rating, reviews_count)`)
        .eq("vendor_id", data.vendor_id)
        .eq("moderation_status", "approved")
        .neq("id", data.id)
        .order("display_order", { ascending: true });
      setMoreProducts((more || []).map((p: any) => ({
        slug: p.slug, product_name: p.product_name, price: p.price, primary_image_url: p.primary_image_url,
        vendorName: p.vendors?.name, vendorVerification: p.vendors?.verification_status,
        vendorRating: p.vendors?.average_rating, vendorReviews: p.vendors?.reviews_count,
      })));

      const { data: similar } = await supabase.rpc("get_similar_products", {
        p_exclude_vendor_id: data.vendor_id, p_exclude_product_id: data.id, p_limit: 12,
      });
      setSimilarProducts((similar || []).map((p: any) => ({
        slug: p.slug, product_name: p.product_name, price: p.price, primary_image_url: p.primary_image_url,
        vendorName: p.vendor_name, vendorVerification: p.vendor_verification_status,
        vendorRating: p.vendor_average_rating, vendorReviews: p.vendor_reviews_count,
      })));
    }
    load();
  }, [productSlug]);

  async function logContactClick(eventType: "whatsapp_click" | "phone_click") {
    if (!product) return;
    try {
      const customerId = await getViewingCustomerId();
      await supabase.from("analytics_events").insert({
        vendor_id: product.vendor_id, product_id: product.id, event_type: eventType, customer_id: customerId,
      });
    } catch { /* non-fatal */ }
  }

  async function handleShare() {
    if (!product) return;
    try {
      await Share.share({
        title: product.product_name,
        message: `Check out ${product.product_name} on Spotlight Directories.`,
      });
    } catch { /* user cancelled */ }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!product) {
    return <View style={styles.center}><Text style={styles.emptyText}>Product not found.</Text></View>;
  }

  const vendor = product.vendors;
  const keyDetails = product.key_details ? product.key_details.split("\n").map((l) => l.trim()).filter(Boolean) : [];
  const thumbnails = [product.secondary_image_url, product.tertiary_image_url, ...(product.gallery_image_urls || [])].filter(Boolean) as string[];
  const specEntries = attributeLabels.map((def) => ({ label: def.label, value: product.attributes?.[def.key] || "" })).filter((e) => e.value);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.vendorLink} onPress={() => navigation.navigate("VendorProfile", { slug: vendorSlug })}>
          <FontAwesome6 name="store" size={12} color={colors.white} />
          <Text style={styles.vendorLinkText}>View Vendor Profile</Text>
        </TouchableOpacity>
      </View>

      {/* MEDIA */}
      <Image source={{ uri: activeImage }} style={styles.mainImage} resizeMode="contain" />
      {thumbnails.length > 0 && (
        <View style={styles.thumbnailRow}>
          {thumbnails.map((src, i) => (
            <TouchableOpacity key={i} onPress={() => setActiveImage(src)}>
              <Image source={{ uri: src }} style={[styles.thumbnail, activeImage === src && styles.thumbnailActive]} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.name}>{product.product_name}</Text>
        <Text style={styles.price}>₦ {Number(product.price || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>

        <View style={styles.vendorMeta}>
          <View style={styles.vendorRow}>
            <Text style={styles.vendorName}>By {vendor?.name || ""}</Text>
            <SmallBadge status={vendor?.verification_status || "none"} />
          </View>
          <View style={styles.ratingRow}>
            <FontAwesome6 name="star" size={12} color={colors.primary} solid />
            <Text style={styles.ratingText}>{Number(vendor?.average_rating || 0).toFixed(1)} ({vendor?.reviews_count || 0})</Text>
          </View>
          {vendor?.is_sponsored && <Text style={styles.sponsored}>Sponsored</Text>}
        </View>

        {specEntries.length > 0 && (
          <View style={styles.specGrid}>
            {specEntries.map((entry) => (
              <View key={entry.label} style={styles.specItem}>
                <Text style={styles.specValue}>{entry.value}</Text>
                <Text style={styles.specLabel}>{entry.label}</Text>
              </View>
            ))}
          </View>
        )}

        {keyDetails.length > 0 && (
          <View style={styles.keyDetailsBox}>
            <Text style={styles.keyDetailsTitle}>{specEntries.length > 0 ? "Additional Notes" : "Key Details"}</Text>
            {keyDetails.map((item, i) => (
              <Text key={i} style={styles.keyDetailItem}>• {item}</Text>
            ))}
          </View>
        )}

        {product.short_description && <Text style={styles.description}>{product.short_description}</Text>}

        {/* ACTIONS — 2x2 grid, matching web's fix for text wrapping */}
        <View style={styles.actionsGrid}>
          {vendor?.whatsapp && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.whatsappBtn]}
              onPress={() => { logContactClick("whatsapp_click"); Linking.openURL(`https://wa.me/${vendor.whatsapp}`); }}
            >
              <FontAwesome6 name="whatsapp" size={14} color="#fff" />
              <Text style={styles.actionBtnText}>Chat Vendor</Text>
            </TouchableOpacity>
          )}
          {(vendor?.telephone || vendor?.whatsapp) && (
            <TouchableOpacity
              style={[styles.actionBtn, styles.callBtn]}
              onPress={() => { logContactClick("phone_click"); Linking.openURL(`tel:${vendor.telephone || vendor.whatsapp}`); }}
            >
              <FontAwesome6 name="phone" size={13} color="#fff" />
              <Text style={styles.actionBtnText}>Call Vendor</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.actionBtn, styles.shareBtn]} onPress={handleShare}>
            <FontAwesome6 name="share-nodes" size={13} color={colors.black} />
            <Text style={[styles.actionBtnText, { color: colors.black }]}>Share Product</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MORE FROM THIS VENDOR */}
      {moreProducts.length > 0 && (
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>More Products From This Vendor</Text>
          <FlatList
            data={moreProducts}
            keyExtractor={(p) => p.slug}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.relatedCard}
                onPress={() => navigation.push("ProductDetail", { vendorSlug, productSlug: item.slug })}
              >
                <Image source={{ uri: item.primary_image_url || "https://spotlightdirectories.com/images/spotlightlogo-512.png" }} style={styles.relatedImage} />
                <Text style={styles.relatedName} numberOfLines={2}>{item.product_name}</Text>
                <Text style={styles.relatedPrice}>₦{Number(item.price || 0).toLocaleString()}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* SIMILAR FROM OTHER VENDORS */}
      {similarProducts.length > 0 && (
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>Similar Products From Other Vendors</Text>
          <FlatList
            data={similarProducts}
            keyExtractor={(p) => p.slug}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.relatedCard}
                onPress={() => navigation.push("VendorProfile", { slug: vendorSlug })}
              >
                <Image source={{ uri: item.primary_image_url || "https://spotlightdirectories.com/images/spotlightlogo-512.png" }} style={styles.relatedImage} />
                <Text style={styles.relatedName} numberOfLines={2}>{item.product_name}</Text>
                <Text style={styles.relatedPrice}>₦{Number(item.price || 0).toLocaleString()}</Text>
                <Text style={styles.relatedVendor} numberOfLines={1}>By {item.vendorName}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 50 },
  back: { color: colors.primary, fontSize: 15 },
  vendorLink: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#141414", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  vendorLinkText: { color: colors.white, fontSize: 12, fontWeight: "600" },

  mainImage: { width: "100%", height: 300, backgroundColor: "#141414" },
  thumbnailRow: { flexDirection: "row", gap: 8, padding: 16, flexWrap: "wrap" },
  thumbnail: { width: 60, height: 60, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  thumbnailActive: { borderColor: colors.primary },

  info: { padding: 20 },
  name: { color: colors.white, fontSize: 20, fontWeight: "800" },
  // Matches web exactly: green (success), not gold — a deliberate,
  // previously-corrected standard on web, applied correctly here
  // from the start.
  price: {
    color: colors.success,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 8,
    marginBottom: 14,
    paddingBottom: 6,
    borderBottomWidth: 3,
    borderBottomColor: colors.primary,
    alignSelf: "flex-start",
  },
  vendorMeta: { marginBottom: 14 },
  vendorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  vendorName: { color: colors.textSecondary, fontSize: 13 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  ratingText: { color: colors.textSecondary, fontSize: 13 },
  sponsored: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 6 },

  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingBottom: 14, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  specItem: { width: "45%" },
  specValue: { color: colors.white, fontSize: 14, fontWeight: "700" },
  specLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "600", textTransform: "uppercase", marginTop: 2 },

  keyDetailsBox: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 14 },
  keyDetailsTitle: { color: colors.white, fontSize: 14, fontWeight: "800", marginBottom: 8 },
  keyDetailItem: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, lineHeight: 18 },

  description: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 4, marginBottom: 20 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 10, minWidth: "47%", flex: 1 },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  whatsappBtn: { backgroundColor: "#25D366" },
  callBtn: { backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border },
  shareBtn: { backgroundColor: colors.primary },

  relatedSection: { marginTop: 16, paddingLeft: 20 },
  relatedTitle: { color: colors.white, fontSize: 15, fontWeight: "700", marginBottom: 12 },
  relatedCard: { width: 130, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, marginRight: 10 },
  relatedImage: { width: "100%", height: 90, borderRadius: 8, backgroundColor: colors.border },
  relatedName: { color: colors.white, fontSize: 12, fontWeight: "600", marginTop: 6 },
  relatedPrice: { color: colors.success, fontSize: 13, fontWeight: "700", marginTop: 2 },
  relatedVendor: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },
});
