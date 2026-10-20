// ===============================================================
// src/screens/discover/ServiceDetailScreen.tsx
//
// Ported faithfully from spotlightwebproject_staging/spotlight-next/
// src/app/(main)/vendor/[slug]/service/[serviceSlug]/page.tsx.
//
// Real differences from Product Detail, all preserved here:
// - No-image layout: centered, single-column when the service has
//   no photo at all (vs always showing an image area)
// - Expandable description: first line is intro, rest are bullets,
//   with a Read More/Less toggle once there are more than 2
// - Has its OWN Visit Request modal (Product Detail doesn't) --
//   same pattern as Vendor Profile's, including the notify Edge
//   Function call
// - Uses get_similar_services RPC, service_view analytics event
// - Price label "Starting From ₦X", green color (matching the
//   confirmed, deliberate standard)
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Image, Linking, Share, FlatList, Modal, TextInput } from "react-native";
import { KeyboardAvoidingView as KAV } from "react-native";
import KeyboardAwareScroll from "../../components/KeyboardAwareScroll";
import { FontAwesome6 } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import VerifiedBadge from "../../components/VerifiedBadge";
import SpotlightMark from "../../components/SpotlightMark";
import QuoteRequestModal, { QuoteCustomer } from "../../components/QuoteRequestModal";
import { colors } from "../../theme/colors";

import { insertAnalytics } from "../../lib/analytics";
type Route = RouteProp<RootStackParamList, "ServiceDetail">;
type Nav = NativeStackNavigationProp<RootStackParamList, "ServiceDetail">;

type ServiceData = {
  id: string; slug: string; vendor_id: string; service_name: string; starting_price: number | null; pricing_mode?: string | null;
  short_description: string | null; attributes: Record<string, string> | null; category_id: string | null;
  representative_image_url: string | null; secondary_image_url: string | null; gallery_image_urls: string[] | null;
  vendors: {
    slug: string; name: string; whatsapp: string; telephone: string;
    verification_status: string; average_rating: number; reviews_count: number; is_sponsored: boolean;
  };
};

type RelatedService = {
  slug: string; service_name: string; starting_price: number | null; representative_image_url: string | null;
  vendorName: string; vendorVerification: string; vendorRating: number; vendorReviews: number;
};

function SmallBadge({ status }: { status: string }) {
  return <VerifiedBadge status={status} size={14} />;
}

async function getViewingCustomerId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
  return data?.id || null;
}

export default function ServiceDetailScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const { vendorSlug, serviceSlug } = route.params;

  const [service, setService] = useState<ServiceData | null>(null);
  const [activeImage, setActiveImage] = useState("");
  const [moreServices, setMoreServices] = useState<RelatedService[]>([]);
  const [similarServices, setSimilarServices] = useState<RelatedService[]>([]);
  const [attributeLabels, setAttributeLabels] = useState<{ key: string; label: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [descExpanded, setDescExpanded] = useState(false);

  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [visitCustomer, setVisitCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [visitPhone, setVisitPhone] = useState("");
  const [visitLocation, setVisitLocation] = useState("");
  const [visitMessage, setVisitMessage] = useState("");
  const [submittingVisit, setSubmittingVisit] = useState(false);
  const [visitSubmitted, setVisitSubmitted] = useState(false);

  // Request a Quote (Task U, Step 1)
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteCustomer, setQuoteCustomer] = useState<QuoteCustomer | null>(null);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    const { data, error } = await supabase
      .from("vendor_services")
      .select(`*, vendors(slug, name, whatsapp, telephone, verification_status, average_rating, reviews_count, is_sponsored)`)
      .eq("slug", serviceSlug)
      .eq("moderation_status", "approved")
      .single();

    if (error || !data) { setLoading(false); return; }

    setService(data);
    const mainImg = data.representative_image_url || data.secondary_image_url || (data.gallery_image_urls || [])[0] || "";
    setActiveImage(mainImg);
    setLoading(false);

    if (data.category_id) {
      const { data: defs } = await supabase
        .from("service_attributes")
        .select("key,label")
        .eq("category_id", data.category_id)
        .order("display_order", { ascending: true });
      setAttributeLabels(defs || []);
    }

    if (!quiet) try {
      const customerId = await getViewingCustomerId();
      await insertAnalytics({
        vendor_id: data.vendor_id, service_id: data.id, event_type: "service_view", customer_id: customerId,
      });
    } catch { /* non-fatal */ }

    const { data: more } = await supabase
      .from("vendor_services")
      .select(`slug, service_name, starting_price, representative_image_url, vendors(name, verification_status, average_rating, reviews_count)`)
      .eq("vendor_id", data.vendor_id)
      .eq("moderation_status", "approved")
      .neq("slug", data.slug);
    setMoreServices((more || []).map((s: any) => ({
      slug: s.slug, service_name: s.service_name, starting_price: s.starting_price,
      representative_image_url: s.representative_image_url,
      vendorName: s.vendors?.name, vendorVerification: s.vendors?.verification_status,
      vendorRating: s.vendors?.average_rating, vendorReviews: s.vendors?.reviews_count,
    })));

    const { data: similar } = await supabase.rpc("get_similar_services", {
      p_exclude_vendor_id: data.vendor_id, p_exclude_service_id: data.id, p_limit: 12,
    });
    setSimilarServices((similar || []).map((s: any) => ({
      slug: s.slug, service_name: s.service_name, starting_price: s.starting_price,
      representative_image_url: s.representative_image_url,
      vendorName: s.vendor_name, vendorVerification: s.vendor_verification_status,
      vendorRating: s.vendor_average_rating, vendorReviews: s.vendor_reviews_count,
    })));
  }

  useEffect(() => { load(); }, [serviceSlug]);
  const { refreshControl } = usePullRefresh(() => load(true));

  async function logContactClick(eventType: "whatsapp_click" | "phone_click") {
    if (!service) return;
    try {
      const customerId = await getViewingCustomerId();
      await insertAnalytics({
        vendor_id: service.vendor_id, service_id: service.id, event_type: eventType, customer_id: customerId,
      });
    } catch { /* non-fatal */ }
  }

  async function handleShare() {
    if (!service) return;
    try {
      await Share.share({ title: service.service_name, message: `Check out ${service.service_name} on Spotlight Directories.` });
    } catch { /* cancelled */ }
  }

  async function openVisitModal() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigation.navigate("CustomerLogin"); return; }
    const { data: customer } = await supabase.from("customers").select("id, name, phone").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { navigation.navigate("CustomerLogin"); return; }
    setVisitCustomer(customer);
    setVisitPhone(customer.phone || "");
    setVisitLocation("");
    setVisitMessage("");
    setVisitSubmitted(false);
    setVisitModalOpen(true);
  }

  async function openQuoteModal() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigation.navigate("CustomerLogin"); return; }
    const { data: customer } = await supabase.from("customers").select("id, name, phone, email").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) { navigation.navigate("CustomerLogin"); return; }
    setQuoteCustomer(customer);
    setQuoteOpen(true);
  }

  async function submitVisit() {
    if (!service || !visitCustomer) return;
    if (!visitPhone.trim()) { alert("Please add a phone number so the vendor can confirm it's really you."); return; }
    if (!visitLocation.trim()) { alert("Please add the location or address for the visit."); return; }

    setSubmittingVisit(true);
    if (visitPhone.trim() !== (visitCustomer.phone || "")) {
      await supabase.from("customers").update({ phone: visitPhone.trim() }).eq("id", visitCustomer.id);
    }
    const { data: created, error } = await supabase.from("visit_requests").insert({
      vendor_id: service.vendor_id,
      customer_id: visitCustomer.id,
      customer_name: visitCustomer.name || "",
      customer_phone: visitPhone.trim(),
      location_note: visitLocation.trim(),
      message: visitMessage.trim() || null,
    }).select("id").single();

    if (error) { setSubmittingVisit(false); alert("Unable to send the visit request. Please try again."); return; }

    try { await supabase.functions.invoke("notify-visit-request", { body: { visit_request_id: created?.id } }); } catch { /* non-fatal */ }

    setSubmittingVisit(false);
    setVisitSubmitted(true);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!service) return <View style={styles.center}><Text style={styles.emptyText}>Service not found.</Text></View>;

  const vendor = service.vendors;
  const allImages = [service.representative_image_url, service.secondary_image_url, ...(service.gallery_image_urls || [])].filter(Boolean) as string[];
  const hasImage = allImages.length > 0;
  const thumbnails = allImages.slice(1);
  const specEntries = attributeLabels.map((def) => ({ label: def.label, value: service.attributes?.[def.key] || "" })).filter((e) => e.value);

  const rawDesc = service.short_description || "";
  const descLines = rawDesc.split("\n").map((l) => l.trim()).filter(Boolean);
  const intro = descLines[0] || "";
  const bullets = descLines.slice(1);
  const showToggle = hasImage && bullets.length > 2;
  const visibleBullets = hasImage && !descExpanded ? bullets.slice(0, 2) : bullets;

  return (
    <KeyboardAwareScroll refreshControl={refreshControl} style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={18} />
        <TouchableOpacity style={styles.vendorLink} onPress={() => navigation.navigate("VendorProfile", { slug: vendorSlug })}>
          <FontAwesome6 name="store" size={12} color={colors.white} />
          <Text style={styles.vendorLinkText}>View Vendor Profile</Text>
        </TouchableOpacity>
      </View>

      {/* MEDIA — only rendered when a service actually has one, matching web's no-image layout */}
      {hasImage && (
        <>
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
        </>
      )}

      <View style={[styles.info, !hasImage && styles.infoCentered]}>
        <Text style={[styles.name, !hasImage && styles.textCenter]}>{service.service_name}</Text>

        {service.pricing_mode === "quote" && (
          <Text style={[styles.priceLabel, !hasImage && styles.textCenter]}>
            <Text style={styles.price}>Contact for a quote</Text>
          </Text>
        )}
        {service.pricing_mode !== "quote" && service.starting_price != null && (
          <Text style={[styles.priceLabel, !hasImage && styles.textCenter]}>
            Starting From <Text style={styles.price}>₦{Number(service.starting_price).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
          </Text>
        )}

        <View style={styles.vendorMeta}>
          <View style={[styles.vendorRow, !hasImage && styles.centerRow]}>
            <Text style={styles.vendorName}>By {vendor?.name || ""}</Text>
            <SmallBadge status={vendor?.verification_status || "none"} />
          </View>
          <View style={[styles.ratingRow, !hasImage && styles.centerRow]}>
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

        {rawDesc ? (
          <View style={styles.descriptionBox}>
            {intro ? <Text style={styles.descriptionIntro}>{intro}</Text> : null}
            {visibleBullets.map((line, i) => (
              <Text key={i} style={styles.descriptionBullet}>• {line}</Text>
            ))}
            {showToggle && (
              <TouchableOpacity onPress={() => setDescExpanded((v) => !v)}>
                <Text style={styles.readMoreBtn}>{descExpanded ? "Read Less" : "Read More"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* ACTIONS — Service has a 4th action Product doesn't: Request a Visit */}
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
            <Text style={[styles.actionBtnText, { color: colors.black }]}>Share Service</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.visitBtn]} onPress={openVisitModal}>
            <FontAwesome6 name="shield-heart" size={13} color={colors.primary} />
            <Text style={[styles.actionBtnText, { color: colors.primary }]}>Request a Visit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, styles.quoteBtn]} onPress={openQuoteModal}>
            <FontAwesome6 name="file-invoice-dollar" size={13} color={colors.black} />
            <Text style={[styles.actionBtnText, { color: colors.black }]}>Request a Quote</Text>
          </TouchableOpacity>
        </View>
      </View>

      {moreServices.length > 0 && (
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>More Services From This Vendor</Text>
          <FlatList
            data={moreServices}
            keyExtractor={(s) => s.slug}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.relatedCard} onPress={() => navigation.push("ServiceDetail", { vendorSlug, serviceSlug: item.slug })}>
                {item.representative_image_url && <Image source={{ uri: item.representative_image_url }} style={styles.relatedImage} />}
                <Text style={styles.relatedName} numberOfLines={2}>{item.service_name}</Text>
                {item.starting_price != null && <Text style={styles.relatedPriceLabel}>From <Text style={styles.relatedPrice}>₦{Number(item.starting_price).toLocaleString()}</Text></Text>}
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {similarServices.length > 0 && (
        <View style={styles.relatedSection}>
          <Text style={styles.relatedTitle}>Similar Services From Other Vendors</Text>
          <FlatList
            data={similarServices}
            keyExtractor={(s) => s.slug}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.relatedCard} onPress={() => navigation.push("VendorProfile", { slug: vendorSlug })}>
                {item.representative_image_url && <Image source={{ uri: item.representative_image_url }} style={styles.relatedImage} />}
                <Text style={styles.relatedName} numberOfLines={2}>{item.service_name}</Text>
                {item.starting_price != null && <Text style={styles.relatedPriceLabel}>From <Text style={styles.relatedPrice}>₦{Number(item.starting_price).toLocaleString()}</Text></Text>}
                <Text style={styles.relatedVendor} numberOfLines={1}>By {item.vendorName}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      <QuoteRequestModal
        visible={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        customer={quoteCustomer}
        vendorId={service.vendor_id}
        vendorName={vendor?.name || ""}
        serviceId={service.id}
        serviceName={service.service_name}
      />

      {/* VISIT REQUEST MODAL */}
      <Modal visible={visitModalOpen} animationType="slide" transparent onRequestClose={() => setVisitModalOpen(false)}>
        <KAV style={styles.modalOverlay} behavior="padding">
          <ScrollView style={[styles.modalCard, { flexGrow: 0 }]} keyboardShouldPersistTaps="handled" bounces={false}>
            {visitSubmitted ? (
              <>
                <Text style={styles.modalTitle}>Request Sent</Text>
                <Text style={styles.modalText}>{vendor?.name || "The vendor"} will confirm your name and phone number before coming.</Text>
                <TouchableOpacity style={styles.modalSubmitBtn} onPress={() => setVisitModalOpen(false)}>
                  <Text style={styles.modalSubmitText}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Request a Visit</Text>
                <Text style={styles.modalLabel}>Your phone number</Text>
                <TextInput style={styles.modalInput} value={visitPhone} onChangeText={setVisitPhone} placeholder="+2348021234567" placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />
                <Text style={styles.modalLabel}>Location / address</Text>
                <TextInput style={styles.modalInput} value={visitLocation} onChangeText={setVisitLocation} placeholder="e.g. Off Admiralty Way, Lekki" placeholderTextColor={colors.textSecondary} />
                <Text style={styles.modalLabel}>What do you need? (optional)</Text>
                <TextInput style={[styles.modalInput, { height: 80 }]} value={visitMessage} onChangeText={setVisitMessage} multiline placeholderTextColor={colors.textSecondary} />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setVisitModalOpen(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.modalSubmitBtn} onPress={submitVisit} disabled={submittingVisit}>
                    <Text style={styles.modalSubmitText}>{submittingVisit ? "Sending..." : "Send Request"}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </KAV>
      </Modal>
    </KeyboardAwareScroll>
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

  mainImage: { width: "100%", height: 280, backgroundColor: "#141414" },
  thumbnailRow: { flexDirection: "row", gap: 8, padding: 16, flexWrap: "wrap" },
  thumbnail: { width: 60, height: 60, borderRadius: 8, borderWidth: 2, borderColor: "transparent" },
  thumbnailActive: { borderColor: colors.primary },

  info: { padding: 20 },
  infoCentered: { alignItems: "center", paddingTop: 40 },
  textCenter: { textAlign: "center" },
  centerRow: { justifyContent: "center" },
  name: { color: colors.white, fontSize: 20, fontWeight: "800" },
  price: { color: colors.success, fontSize: 18, fontWeight: "800" },
  priceLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "600", marginTop: 8, marginBottom: 14 },
  vendorMeta: { marginBottom: 14, width: "100%" },
  vendorRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  vendorName: { color: colors.textSecondary, fontSize: 13 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  ratingText: { color: colors.textSecondary, fontSize: 13 },
  sponsored: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "center" },

  specGrid: { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingBottom: 14, marginBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, width: "100%" },
  specItem: { width: "45%" },
  specValue: { color: colors.white, fontSize: 14, fontWeight: "700" },
  specLabel: { color: colors.textSecondary, fontSize: 10, fontWeight: "600", textTransform: "uppercase", marginTop: 2 },

  descriptionBox: { width: "100%", marginBottom: 20 },
  descriptionIntro: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  descriptionBullet: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 4 },
  readMoreBtn: { color: colors.primary, fontSize: 13, fontWeight: "700", marginTop: 6 },

  actionsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, width: "100%" },
  actionBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 46, borderRadius: 10, minWidth: "47%", flex: 1 },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  whatsappBtn: { backgroundColor: "#25D366" },
  callBtn: { backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.border },
  shareBtn: { backgroundColor: colors.primary },
  quoteBtn: { backgroundColor: colors.primary, minWidth: "100%" },
  visitBtn: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: colors.primary },

  relatedSection: { marginTop: 16, paddingLeft: 20 },
  relatedTitle: { color: colors.white, fontSize: 15, fontWeight: "700", marginBottom: 12 },
  relatedCard: { width: 130, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, marginRight: 10 },
  relatedImage: { width: "100%", height: 90, borderRadius: 8, backgroundColor: colors.border },
  relatedName: { color: colors.white, fontSize: 12, fontWeight: "600", marginTop: 6 },
  relatedPrice: { color: colors.success, fontSize: 12, fontWeight: "700" },
  relatedPriceLabel: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  relatedVendor: { color: colors.textSecondary, fontSize: 10, marginTop: 2 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalTitle: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 16 },
  modalText: { color: colors.textSecondary, fontSize: 13, marginBottom: 20 },
  modalLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  modalInput: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center" },
  modalCancelText: { color: colors.textSecondary, fontWeight: "600" },
  modalSubmitBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center" },
  modalSubmitText: { color: colors.black, fontWeight: "700" },
});
