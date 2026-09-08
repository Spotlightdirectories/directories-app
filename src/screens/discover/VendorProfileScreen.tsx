// ===============================================================
// src/screens/discover/VendorProfileScreen.tsx
//
// Slice 2 added, per Cyril's sequenced plan: About section and
// Products & Services grid, inserted in the same order as web
// (Hero -> About -> Products & Services -> Reviews). Slice 3
// (Portfolio, Similar Businesses, Branches, Video) comes next.
//
// Product/Service tapping doesn't navigate to a detail page yet --
// that's its own separate pending item ("Product/Service detail
// pages"), not silently built here. Tapping currently does nothing,
// same honest gap as Results screen's product/service cards.
//
// Description is stored as HTML (rich text editor on web) -- React
// Native's Text can't render HTML without an extra package, so tags
// are stripped to plain text here rather than adding a new
// dependency for read-only display.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Image, Linking, Modal, TextInput } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useRoute, useNavigation } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { colors } from "../../theme/colors";

type Route = RouteProp<RootStackParamList, "VendorProfile">;

type Vendor = {
  id: string; slug: string; name: string; category: string; subcategory: string;
  address: string; phone: string; telephone: string; whatsapp: string; email: string;
  logo_url: string | null; cover_url: string | null; description: string | null;
  open_time: string | null; close_time: string | null; business_days: string | null;
  verification_status: string; average_rating: number; reviews_count: number;
  auth_user_id: string; latitude: number | null; longitude: number | null; is_sponsored: boolean;
};

type SocialLink = { id: string; platform: string; url: string };
type Review = { reviewer_name: string; review_text: string; created_at: string; customer_id: string | null };
type Product = { id: string; slug: string; product_name: string; price: number; primary_image_url: string | null };
type Service = {
  id: string; slug: string; service_name: string; starting_price: number; short_description: string | null;
};

const SOCIAL_ICON_MAP: Record<string, string> = {
  instagram: "instagram", facebook: "facebook", tiktok: "tiktok", youtube: "youtube", website: "globe",
};

function Badge({ status }: { status: string }) {
  if (status === "blue") return <FontAwesome6 name="circle-check" size={16} color="#1877F2" />;
  if (status === "gray") return <FontAwesome6 name="circle-check" size={16} color={colors.textSecondary} />;
  return null;
}

// Description is saved as HTML from the rich-text editor on web.
// Stripped to plain text here rather than adding an HTML-rendering
// package just for read-only display.
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

function formatTime(time: string | null | undefined): string {
  if (!time) return "";
  const [hour, minute] = time.split(":");
  const h = Number(hour);
  const suffix = h >= 12 ? "PM" : "AM";
  const displayHour = h % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

export default function VendorProfileScreen() {
  const route = useRoute<Route>();
  const navigation = useNavigation();
  const { slug } = route.params;

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  const [favoriteVisible, setFavoriteVisible] = useState(false);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favoriteCustomerId, setFavoriteCustomerId] = useState<string | null>(null);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const [visitModalOpen, setVisitModalOpen] = useState(false);
  const [visitCustomer, setVisitCustomer] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [visitPhone, setVisitPhone] = useState("");
  const [visitLocation, setVisitLocation] = useState("");
  const [visitMessage, setVisitMessage] = useState("");
  const [submittingVisit, setSubmittingVisit] = useState(false);
  const [visitSubmitted, setVisitSubmitted] = useState(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewingCustomer, setReviewingCustomer] = useState<{ id: string; name: string; email: string } | null>(null);
  const [reviewerName, setReviewerName] = useState("");
  const [reviewerEmail, setReviewerEmail] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [reviewRating, setReviewRating] = useState(0);
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: v } = await supabase.from("vendors").select("*").eq("slug", slug).maybeSingle();
      if (!v) { setLoading(false); return; }
      setVendor(v);
      setIsOwner(!!(user && v.auth_user_id === user.id));

      const { data: links } = await supabase.from("vendor_social_links").select("*").eq("vendor_id", v.id);
      setSocialLinks(links || []);

      const { data: revs } = await supabase
        .from("vendor_reviews")
        .select("reviewer_name, review_text, created_at, customer_id")
        .eq("vendor_id", v.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setReviews(revs || []);

      const { data: prods } = await supabase
        .from("vendor_products")
        .select("id, slug, product_name, price, primary_image_url")
        .eq("vendor_id", v.id)
        .eq("moderation_status", "approved")
        .order("display_order", { ascending: true });
      setProducts(prods || []);

      const { data: servs } = await supabase
        .from("vendor_services")
        .select("id, slug, service_name, starting_price, short_description")
        .eq("vendor_id", v.id)
        .eq("moderation_status", "approved");
      setServices(servs || []);

      // Favorite state — logged-in customer, not the owner
      if (user && v.auth_user_id !== user.id) {
        const { data: customer } = await supabase.from("customers").select("id").eq("auth_user_id", user.id).maybeSingle();
        if (customer) {
          setFavoriteCustomerId(customer.id);
          const { data: fav } = await supabase.from("customer_favorites").select("id").eq("customer_id", customer.id).eq("vendor_id", v.id).maybeSingle();
          setIsFavorited(!!fav);
          setFavoriteVisible(true);
        }
      }

      setLoading(false);
    }
    load();
  }, [slug]);

  async function toggleFavorite() {
    if (!vendor || !favoriteCustomerId || favoriteBusy) return;
    setFavoriteBusy(true);
    if (isFavorited) {
      await supabase.from("customer_favorites").delete().eq("customer_id", favoriteCustomerId).eq("vendor_id", vendor.id);
      setIsFavorited(false);
    } else {
      await supabase.from("customer_favorites").insert({ customer_id: favoriteCustomerId, vendor_id: vendor.id });
      setIsFavorited(true);
    }
    setFavoriteBusy(false);
  }

  async function openVisitModal() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      navigation.navigate("CustomerLogin" as never);
      return;
    }
    const { data: customer } = await supabase.from("customers").select("id, name, phone").eq("auth_user_id", user.id).maybeSingle();
    if (!customer) {
      navigation.navigate("CustomerLogin" as never);
      return;
    }
    setVisitCustomer(customer);
    setVisitPhone(customer.phone || "");
    setVisitLocation("");
    setVisitMessage("");
    setVisitSubmitted(false);
    setVisitModalOpen(true);
  }

  async function submitVisit() {
    if (!vendor || !visitCustomer) return;
    if (!visitPhone.trim()) { alert("Please add a phone number so the vendor can confirm it's really you."); return; }
    if (!visitLocation.trim()) { alert("Please add the location or address for the visit."); return; }

    setSubmittingVisit(true);
    if (visitPhone.trim() !== (visitCustomer.phone || "")) {
      await supabase.from("customers").update({ phone: visitPhone.trim() }).eq("id", visitCustomer.id);
    }
    const { error } = await supabase.from("visit_requests").insert({
      vendor_id: vendor.id,
      customer_id: visitCustomer.id,
      customer_name: visitCustomer.name || "",
      customer_phone: visitPhone.trim(),
      location_note: visitLocation.trim(),
      message: visitMessage.trim() || null,
    });
    setSubmittingVisit(false);
    if (error) { alert("Unable to send the visit request. Please try again."); return; }
    setVisitSubmitted(true);
  }

  async function openReviewModal() {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: customer } = await supabase.from("customers").select("id, name, email").eq("auth_user_id", user.id).maybeSingle();
      if (customer) {
        setReviewingCustomer(customer);
        setReviewerName(customer.name || "");
        setReviewerEmail(customer.email || "");
      }
    }
    setReviewModalOpen(true);
  }

  async function submitReview() {
    if (!vendor || !reviewRating || !reviewerName.trim() || !reviewerEmail.trim() || !reviewText.trim()) {
      alert("Please fill in your name, email, rating, and review.");
      return;
    }
    setSubmittingReview(true);
    const { error } = await supabase.from("vendor_reviews").insert({
      vendor_id: vendor.id,
      reviewer_name: reviewerName.trim(),
      reviewer_email: reviewerEmail.trim(),
      review_text: reviewText.trim(),
      rating: reviewRating,
      customer_id: reviewingCustomer?.id || null,
    });
    setSubmittingReview(false);
    if (error) {
      alert(error.code === "42501" ? "You cannot submit a review for yourself." : "Unable to submit review.");
      return;
    }
    setReviewModalOpen(false);
    setReviewText(""); setReviewRating(0);
    const { data: revs } = await supabase.from("vendor_reviews").select("reviewer_name, review_text, created_at, customer_id").eq("vendor_id", vendor.id).order("created_at", { ascending: false }).limit(10);
    setReviews(revs || []);
    const { data: updated } = await supabase.from("vendors").select("average_rating, reviews_count").eq("id", vendor.id).maybeSingle();
    if (updated) setVendor((v) => v ? { ...v, ...updated } : v);
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!vendor) {
    return <View style={styles.center}><Text style={styles.emptyText}>Vendor not found.</Text></View>;
  }

  const mapHref = vendor.latitude && vendor.longitude
    ? `https://www.google.com/maps/search/?api=1&query=${vendor.latitude},${vendor.longitude}`
    : vendor.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(vendor.address)}` : null;

  const plainDescription = vendor.description ? stripHtml(vendor.description) : "";

  return (
    <ScrollView style={styles.container}>
      {/* COVER */}
      <View style={styles.cover}>
        {vendor.cover_url ? <Image source={{ uri: vendor.cover_url }} style={styles.coverImg} /> : <View style={styles.coverPlaceholder} />}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <FontAwesome6 name="arrow-left" size={16} color={colors.white} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* LOGO + NAME */}
        <View style={styles.heroRow}>
          {vendor.logo_url ? <Image source={{ uri: vendor.logo_url }} style={styles.logo} /> : <View style={styles.logoPlaceholder}><FontAwesome6 name="store" size={24} color={colors.textSecondary} /></View>}
          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{vendor.name}</Text>
              <Badge status={vendor.verification_status} />
            </View>
            <Text style={styles.category}>{vendor.category}{vendor.subcategory ? ` • ${vendor.subcategory}` : ""}</Text>
          </View>
        </View>

        <View style={styles.ratingRow}>
          <FontAwesome6 name="star" size={13} color={colors.primary} solid />
          <Text style={styles.ratingText}>{Number(vendor.average_rating || 0).toFixed(1)} ({vendor.reviews_count || 0} reviews)</Text>
        </View>

        <Text style={styles.address}>{vendor.address}</Text>

        {socialLinks.length > 0 && (
          <View style={styles.socialRow}>
            {socialLinks.map((link) => (
              <TouchableOpacity key={link.id} style={styles.socialIcon} onPress={() => Linking.openURL(link.url)}>
                <FontAwesome6 name={SOCIAL_ICON_MAP[link.platform] || "link"} size={16} color={colors.white} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* QUICK ACTIONS */}
        <View style={styles.actionsRow}>
          {vendor.whatsapp && (
            <TouchableOpacity style={styles.action} onPress={() => Linking.openURL(`https://wa.me/${vendor.whatsapp}`)}>
              <FontAwesome6 name="whatsapp" size={18} color={colors.white} />
              <Text style={styles.actionText}>WhatsApp</Text>
            </TouchableOpacity>
          )}
          {(vendor.phone || vendor.whatsapp) && (
            <TouchableOpacity style={styles.action} onPress={() => Linking.openURL(`tel:${vendor.phone || vendor.whatsapp}`)}>
              <FontAwesome6 name="phone" size={16} color={colors.white} />
              <Text style={styles.actionText}>Call</Text>
            </TouchableOpacity>
          )}
          {mapHref && (
            <TouchableOpacity style={styles.action} onPress={() => Linking.openURL(mapHref)}>
              <FontAwesome6 name="location-arrow" size={16} color={colors.white} />
              <Text style={styles.actionText}>Directions</Text>
            </TouchableOpacity>
          )}
          {favoriteVisible && (
            <TouchableOpacity style={styles.action} onPress={toggleFavorite} disabled={favoriteBusy}>
              <FontAwesome6 name="heart" size={16} color={isFavorited ? colors.primary : colors.white} solid={isFavorited} />
              <Text style={styles.actionText}>{isFavorited ? "Saved" : "Save"}</Text>
            </TouchableOpacity>
          )}
          {!isOwner && (
            <TouchableOpacity style={[styles.action, styles.actionVisit]} onPress={openVisitModal}>
              <FontAwesome6 name="shield-heart" size={16} color={colors.white} />
              <Text style={styles.actionText}>Request a Visit</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ABOUT — Slice 2 */}
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>About the Business</Text>
          {plainDescription ? (
            <Text style={styles.aboutText}>{plainDescription}</Text>
          ) : (
            <Text style={styles.emptyText}>No description added yet.</Text>
          )}

          {(vendor.open_time || vendor.close_time) && (
            <View style={styles.contactRow}>
              <FontAwesome6 name="clock" size={13} color={colors.textSecondary} />
              <View style={{ marginLeft: 8 }}>
                <Text style={styles.contactText}>Opens {formatTime(vendor.open_time)} • Closes {formatTime(vendor.close_time)}</Text>
                {vendor.business_days && <Text style={styles.contactSubtext}>{vendor.business_days.split(",").join(" • ")}</Text>}
              </View>
            </View>
          )}
          {(vendor.phone || vendor.whatsapp || vendor.telephone) && (
            <View style={styles.contactRow}>
              <FontAwesome6 name="phone" size={13} color={colors.textSecondary} />
              <Text style={[styles.contactText, { marginLeft: 8 }]}>{vendor.phone || vendor.whatsapp || vendor.telephone}</Text>
            </View>
          )}
          {vendor.email && (
            <View style={styles.contactRow}>
              <FontAwesome6 name="envelope" size={13} color={colors.textSecondary} />
              <Text style={[styles.contactText, { marginLeft: 8 }]}>{vendor.email}</Text>
            </View>
          )}
        </View>

        {/* PRODUCTS & SERVICES — Slice 2 */}
        {(products.length > 0 || services.length > 0) && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Products & Services</Text>

            {products.length > 0 && (
              <>
                <Text style={styles.subheading}>Products</Text>
                <View style={styles.productGrid}>
                  {products.map((p) => (
                    <View key={p.id} style={styles.productCard}>
                      <Image
                        source={{ uri: p.primary_image_url || "https://spotlightdirectories.com/images/spotlightlogo-512.png" }}
                        style={styles.productImage}
                      />
                      <Text style={styles.productName} numberOfLines={2}>{p.product_name}</Text>
                      <Text style={styles.productPrice}>₦{Number(p.price || 0).toLocaleString()}</Text>
                      {vendor.is_sponsored && <Text style={styles.sponsoredTag}>SPONSORED</Text>}
                    </View>
                  ))}
                </View>
              </>
            )}

            {services.length > 0 && (
              <>
                <Text style={[styles.subheading, { marginTop: products.length > 0 ? 20 : 0 }]}>Services</Text>
                {services.map((s) => (
                  <View key={s.id} style={styles.serviceCard}>
                    <Text style={styles.serviceName}>{s.service_name}</Text>
                    {s.short_description && (
                      <Text style={styles.serviceDescription} numberOfLines={2}>{s.short_description}</Text>
                    )}
                    <Text style={styles.servicePrice}>Starting from ₦{Number(s.starting_price || 0).toLocaleString()}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}

        {/* REVIEWS */}
        <View style={styles.reviewsHeader}>
          <Text style={styles.sectionTitle}>Reviews</Text>
          <TouchableOpacity style={styles.rateBtn} onPress={openReviewModal}>
            <Text style={styles.rateBtnText}>Rate</Text>
          </TouchableOpacity>
        </View>

        {reviews.length === 0 ? (
          <Text style={styles.emptyText}>No reviews yet. Be the first to leave one.</Text>
        ) : (
          reviews.map((r, i) => (
            <View key={i} style={styles.reviewCard}>
              <View style={styles.reviewTop}>
                <Text style={styles.reviewerName}>{r.reviewer_name || "Anonymous"}</Text>
                {r.customer_id && <Text style={styles.verifiedTag}>✓ Verified</Text>}
              </View>
              <Text style={styles.reviewText}>{r.review_text}</Text>
            </View>
          ))
        )}
      </View>

      {/* VISIT REQUEST MODAL */}
      <Modal visible={visitModalOpen} animationType="slide" transparent onRequestClose={() => setVisitModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {visitSubmitted ? (
              <>
                <Text style={styles.modalTitle}>Request Sent</Text>
                <Text style={styles.modalText}>{vendor.name} will confirm your name and phone number before coming.</Text>
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
          </View>
        </View>
      </Modal>

      {/* REVIEW MODAL */}
      <Modal visible={reviewModalOpen} animationType="slide" transparent onRequestClose={() => setReviewModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Leave a Review</Text>
            <View style={styles.starPicker}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity key={n} onPress={() => setReviewRating(n)}>
                  <FontAwesome6 name="star" size={26} color={n <= reviewRating ? colors.primary : colors.border} solid={n <= reviewRating} style={{ marginHorizontal: 3 }} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput style={styles.modalInput} value={reviewerName} onChangeText={setReviewerName} placeholder="Your name" placeholderTextColor={colors.textSecondary} editable={!reviewingCustomer} />
            <TextInput style={styles.modalInput} value={reviewerEmail} onChangeText={setReviewerEmail} placeholder="Your email" placeholderTextColor={colors.textSecondary} editable={!reviewingCustomer} keyboardType="email-address" />
            <TextInput style={[styles.modalInput, { height: 90 }]} value={reviewText} onChangeText={setReviewText} placeholder="Write your review..." placeholderTextColor={colors.textSecondary} multiline />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setReviewModalOpen(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={submitReview} disabled={submittingReview}>
                <Text style={styles.modalSubmitText}>{submittingReview ? "Submitting..." : "Submit Review"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 12 },

  cover: { height: 160, width: "100%", backgroundColor: "#1a1a1a", overflow: "hidden", alignItems: "center", justifyContent: "center" },
  coverImg: { width: "100%", height: "100%", resizeMode: "contain" },
  coverPlaceholder: { width: "100%", height: "100%", backgroundColor: "#1a1a1a" },
  backBtn: { position: "absolute", top: 44, left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },

  content: { padding: 20, paddingTop: 0, marginTop: -45 },
  heroRow: { flexDirection: "row", alignItems: "flex-end" },
  logo: { width: 64, height: 64, borderRadius: 12, borderWidth: 2, borderColor: colors.dark, backgroundColor: colors.dark, resizeMode: "cover", overflow: "hidden" },
  logoPlaceholder: { width: 64, height: 64, borderRadius: 12, borderWidth: 2, borderColor: colors.dark, backgroundColor: "#141414", alignItems: "center", justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { color: colors.white, fontSize: 18, fontWeight: "700" },
  category: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },

  ratingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  ratingText: { color: colors.textSecondary, fontSize: 13 },
  address: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },

  socialRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  socialIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1f2937", alignItems: "center", justifyContent: "center" },

  actionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 20 },
  action: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
  actionVisit: { borderColor: colors.primary },
  actionText: { color: colors.white, fontSize: 12, fontWeight: "600" },

  sectionCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginTop: 24 },
  sectionTitle: { color: colors.white, fontSize: 16, fontWeight: "700" },
  aboutText: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginTop: 10 },
  contactRow: { flexDirection: "row", alignItems: "center", marginTop: 14 },
  contactText: { color: colors.white, fontSize: 13 },
  contactSubtext: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },

  subheading: { color: colors.white, fontSize: 14, fontWeight: "700", marginTop: 14, marginBottom: 10 },
  productGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  productCard: { width: "47%", backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10 },
  productImage: { width: "100%", height: 90, borderRadius: 8, backgroundColor: colors.border, resizeMode: "cover" },
  productName: { color: colors.white, fontSize: 12, fontWeight: "600", marginTop: 8 },
  productPrice: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 4 },
  sponsoredTag: { color: colors.primary, fontSize: 9, fontWeight: "700", marginTop: 4 },
  serviceCard: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 8 },
  serviceName: { color: colors.white, fontSize: 14, fontWeight: "600" },
  serviceDescription: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  servicePrice: { color: colors.primary, fontSize: 12, fontWeight: "700", marginTop: 6 },

  reviewsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 12 },
  rateBtn: { backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 16 },
  rateBtnText: { color: colors.black, fontWeight: "700", fontSize: 12 },

  reviewCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 10 },
  reviewTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  reviewerName: { color: colors.white, fontWeight: "600", fontSize: 14 },
  verifiedTag: { color: colors.primary, fontSize: 11, fontWeight: "600" },
  reviewText: { color: colors.textSecondary, fontSize: 13, marginTop: 6 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40 },
  modalTitle: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 16 },
  modalText: { color: colors.textSecondary, fontSize: 13, marginBottom: 20 },
  modalLabel: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  modalInput: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14 },
  starPicker: { flexDirection: "row", justifyContent: "center", marginBottom: 16 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20 },
  modalCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center" },
  modalCancelText: { color: colors.textSecondary, fontWeight: "600" },
  modalSubmitBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center" },
  modalSubmitText: { color: colors.black, fontWeight: "700" },
});
