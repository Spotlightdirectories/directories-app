// ===============================================================
// src/screens/vendor/VisitRequestsReceivedScreen.tsx
//
// The vendor's inbox, ported from web's VisitRequestsTab.tsx
// ("Visit & Quote Requests"). Two sections:
//   - Quote Requests: Received -> Viewed (automatic on open) ->
//     Quoted / Closed (vendor taps). Photos are in a private bucket,
//     so each gets a short-lived signed link; tap to view full size.
//   - Visit Requests: Pending -> Confirmed / Declined, with the same
//     safety check as web before a visit can be confirmed.
// ===============================================================

import { useState, useCallback } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, Modal, Image, Linking } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { openWebPage } from "../../lib/webHandoff";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "VisitRequestsReceived">;

type VisitRequest = {
  id: string; customer_name: string | null; customer_phone: string; customer_email: string | null;
  location_note: string | null; message: string | null; status: string; created_at: string; acknowledged_at: string | null;
};
type QuoteRequest = {
  id: string; service_name: string; customer_name: string | null; customer_phone: string; customer_email: string;
  state: string; lga: string; location_note: string | null; description: string; timeline: string;
  budget_range: string | null; photo_urls: string[] | null; extra_answers: { question: string; answer: string }[] | null; status: "received" | "viewed" | "quoted" | "closed";
  created_at: string; quoted_at: string | null;
};

const TIMELINE_LABELS: Record<string, string> = {
  asap: "As soon as possible", within_1_week: "Within 1 week", within_1_month: "Within 1 month", just_planning: "Just planning",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}
// Nigerian numbers: 0803... or +234803... -> digits only, country code first.
function waDigits(phone: string) {
  const d = phone.replace(/\D/g, "");
  return d.startsWith("0") ? `234${d.slice(1)}` : d;
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function ContactRow({ phone }: { phone: string }) {
  return (
    <View style={styles.contactRow}>
      <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`tel:${phone}`)}>
        <FontAwesome6 name="phone" size={12} color={colors.white} />
        <Text style={styles.contactBtnText}>Call</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.contactBtn} onPress={() => Linking.openURL(`https://wa.me/${waDigits(phone)}`)}>
        <FontAwesome6 name="whatsapp" size={12} color={colors.white} />
        <Text style={styles.contactBtnText}>WhatsApp</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function VisitRequestsReceivedScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [visits, setVisits] = useState<VisitRequest[]>([]);
  const [quotes, setQuotes] = useState<QuoteRequest[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<VisitRequest | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError(true); setLoading(false); return; }
    const { data: vendor } = await supabase.from("vendors").select("id").eq("auth_user_id", user.id).maybeSingle();
    if (!vendor) { setError(true); setLoading(false); return; }

    const [{ data: vData, error: vErr }, { data: qData, error: qErr }] = await Promise.all([
      supabase.from("visit_requests")
        .select("id, customer_name, customer_phone, customer_email, location_note, message, status, created_at, acknowledged_at")
        .eq("vendor_id", vendor.id).order("created_at", { ascending: false }),
      supabase.from("quote_requests")
        .select("id, service_name, customer_name, customer_phone, customer_email, state, lga, location_note, description, timeline, budget_range, photo_urls, extra_answers, status, created_at, quoted_at")
        .eq("vendor_id", vendor.id).order("created_at", { ascending: false }),
    ]);
    if (vErr || qErr) { setError(true); setLoading(false); return; }

    const quoteList = (qData as QuoteRequest[]) || [];
    setVisits((vData as VisitRequest[]) || []);
    setQuotes(quoteList);

    const urlMap: Record<string, string[]> = {};
    for (const q of quoteList) {
      if (!q.photo_urls || q.photo_urls.length === 0) continue;
      const { data: signed } = await supabase.storage.from("quote-photos").createSignedUrls(q.photo_urls, 3600);
      urlMap[q.id] = (signed || []).map((x) => x.signedUrl).filter(Boolean) as string[];
    }
    setPhotoUrls(urlMap);
    setLoading(false);

    // Opening the inbox = "seen": clears the unread count and moves
    // quotes from Received to Viewed, same as web.
    const nowIso = new Date().toISOString();
    await supabase.from("visit_requests").update({ vendor_viewed_at: nowIso }).eq("vendor_id", vendor.id).is("vendor_viewed_at", null);
    await supabase.from("quote_requests").update({ status: "viewed", vendor_viewed_at: nowIso }).eq("vendor_id", vendor.id).eq("status", "received");
    await supabase.from("quote_requests").update({ vendor_viewed_at: nowIso }).eq("vendor_id", vendor.id).is("vendor_viewed_at", null);
    setQuotes((qs) => qs.map((q) => (q.status === "received" ? { ...q, status: "viewed" } : q)));
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function setQuoteStatus(id: string, status: "quoted" | "closed") {
    setBusyId(id);
    const { error: err } = await supabase.from("quote_requests").update({ status }).eq("id", id);
    if (err) Alert.alert("Couldn't update", "Please try again.");
    else setQuotes((qs) => qs.map((q) => (q.id === id ? { ...q, status, quoted_at: status === "quoted" ? new Date().toISOString() : q.quoted_at } : q)));
    setBusyId(null);
  }

  function confirmClose(id: string) {
    Alert.alert("Close this quote request?", "It will be marked closed for you and the customer.", [
      { text: "Cancel", style: "cancel" },
      { text: "Close", style: "destructive", onPress: () => setQuoteStatus(id, "closed") },
    ]);
  }

  async function setVisitStatus(id: string, status: "acknowledged" | "declined") {
    setBusyId(id);
    const patch: Record<string, unknown> = { status };
    if (status === "acknowledged") patch.acknowledged_at = new Date().toISOString();
    const { error: err } = await supabase.from("visit_requests").update(patch).eq("id", id);
    if (err) Alert.alert("Couldn't update", "Please try again.");
    else setVisits((vs) => vs.map((v) => (v.id === id ? { ...v, status, acknowledged_at: (patch.acknowledged_at as string) || v.acknowledged_at } : v)));
    setBusyId(null);
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <SpotlightMark size={22} />
      </View>
      <Text style={styles.title}>Visit & Quote Requests</Text>
      <Text style={styles.subtitle}>Requests customers have sent you</Text>

      {error ? (
        <Text style={styles.empty}>Couldn't load your requests right now.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.safety}>
            <FontAwesome6 name="shield-heart" size={14} color={colors.primary} />
            <Text style={styles.safetyText}>
              Before you travel to a customer's location, confirm their name and phone number here — that's your safety check.{" "}
              <Text style={styles.link} onPress={() => openWebPage("/safety")}>Read the Safety Center</Text>
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Quote Requests</Text>
          {quotes.length === 0 ? (
            <Text style={styles.emptySmall}>No quote requests yet. When a customer uses "Request a Quote" on one of your services, it will show up here.</Text>
          ) : quotes.map((q) => (
            <View key={q.id} style={styles.card}>
              <View style={styles.topRow}>
                <Text style={styles.name}>{q.customer_name || "Unnamed customer"}</Text>
                <Pill label="Quote" color="#f59e0b" />
                {q.status === "received" && <Pill label="Received" color="#facc15" />}
                {q.status === "viewed" && <Pill label="Viewed" color="#60a5fa" />}
                {q.status === "quoted" && <Pill label="Quoted" color={colors.success} />}
                {q.status === "closed" && <Pill label="Closed" color={colors.textSecondary} />}
              </View>
              <Text style={styles.date}>{fmt(q.created_at)}</Text>

              <Detail icon="briefcase" text={q.service_name} />
              <Detail icon="location-dot" text={[q.location_note, q.lga, q.state].filter(Boolean).join(", ")} />
              <Detail icon="clock" text={TIMELINE_LABELS[q.timeline] || q.timeline} />
              {q.budget_range ? <Detail icon="wallet" text={`Budget: ${q.budget_range}`} /> : null}
              <Detail icon="comment" text={q.description} />
              {(q.extra_answers || []).map((a, i) => (
                <Detail key={i} icon="circle-question" text={`${a.question} ${a.answer}`} />
              ))}
              <Detail icon="phone" text={q.customer_phone} />
              <Detail icon="envelope" text={q.customer_email} />

              {(photoUrls[q.id] || []).length > 0 && (
                <ScrollView horizontal style={{ marginTop: 10 }}>
                  {(photoUrls[q.id] || []).map((u) => (
                    <TouchableOpacity key={u} onPress={() => setViewerUrl(u)}>
                      <Image source={{ uri: u }} style={styles.thumb} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <ContactRow phone={q.customer_phone} />

              {(q.status === "received" || q.status === "viewed") && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.primaryBtn} disabled={busyId === q.id} onPress={() => setQuoteStatus(q.id, "quoted")}>
                    <Text style={styles.primaryBtnText}>{busyId === q.id ? "Saving..." : "Mark as quoted"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ghostBtn} disabled={busyId === q.id} onPress={() => confirmClose(q.id)}>
                    <Text style={styles.ghostBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              )}
              {q.status === "quoted" && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.ghostBtn} disabled={busyId === q.id} onPress={() => confirmClose(q.id)}>
                    <Text style={styles.ghostBtnText}>Close</Text>
                  </TouchableOpacity>
                </View>
              )}
              {q.status !== "closed" && (
                <Text style={styles.hint}>Contact {q.customer_name || "the customer"} by phone or WhatsApp with your quote, then tap "Mark as quoted".</Text>
              )}
            </View>
          ))}

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Visit Requests</Text>
          {visits.length === 0 ? (
            <Text style={styles.emptySmall}>No visit requests yet. When a customer uses "Request a Visit" on your profile, it will show up here.</Text>
          ) : visits.map((v) => (
            <View key={v.id} style={styles.card}>
              <View style={styles.topRow}>
                <Text style={styles.name}>{v.customer_name || "Unnamed customer"}</Text>
                {v.status === "pending" && <Pill label="Awaiting you" color="#facc15" />}
                {v.status === "acknowledged" && <Pill label="Confirmed" color={colors.success} />}
                {v.status === "declined" && <Pill label="Declined" color={colors.error} />}
              </View>
              <Text style={styles.date}>{fmt(v.created_at)}</Text>
              <Detail icon="phone" text={v.customer_phone} />
              {v.customer_email ? <Detail icon="envelope" text={v.customer_email} /> : null}
              {v.location_note ? <Detail icon="location-dot" text={v.location_note} /> : null}
              {v.message ? <Detail icon="comment" text={v.message} /> : null}

              <ContactRow phone={v.customer_phone} />

              {v.status === "pending" && (
                <View style={styles.actions}>
                  <TouchableOpacity style={styles.primaryBtn} disabled={busyId === v.id} onPress={() => setConfirmTarget(v)}>
                    <Text style={styles.primaryBtnText}>Confirm & Acknowledge</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.ghostBtn} disabled={busyId === v.id} onPress={() => setVisitStatus(v.id, "declined")}>
                    <Text style={styles.ghostBtnText}>Decline</Text>
                  </TouchableOpacity>
                </View>
              )}
              {v.status === "acknowledged" && v.acknowledged_at && (
                <Text style={styles.hint}>Confirmed {fmt(v.acknowledged_at)} — call or WhatsApp {v.customer_phone} to arrange the visit.</Text>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Safety check before a visit can be confirmed (same as web) */}
      <Modal visible={!!confirmTarget} transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
        <View style={styles.overlay}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ padding: 18 }}>
            <Text style={styles.modalTitle}>Before You Confirm</Text>
            <Text style={styles.modalText}>
              You're about to confirm a visit to <Text style={{ fontWeight: "700", color: colors.white }}>{confirmTarget?.customer_name || "this customer"}</Text> at:
            </Text>
            <Text style={styles.modalLocation}>{confirmTarget?.location_note}</Text>
            <Text style={styles.bullet}>• Double-check the name and phone number match who you're actually expecting.</Text>
            <Text style={styles.bullet}>• If this location is far from your usual area, or somewhere you don't know well, let a family member or friend know where you're going and roughly when you'll be back — and consider not going alone.</Text>
            <Text style={styles.bullet}>• Never share your bank PIN, OTP, or full card details with anyone on site.</Text>
            <Text style={styles.bullet}>• If anything about this request feels off, decline it instead and report it to Spotlight support.</Text>
            <Text style={[styles.link, { marginVertical: 8 }]} onPress={() => openWebPage("/safety")}>Read the full Safety Center</Text>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={async () => { const t = confirmTarget; setConfirmTarget(null); if (t) await setVisitStatus(t.id, "acknowledged"); }}
              >
                <Text style={styles.primaryBtnText}>I've Reviewed — Confirm Visit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setConfirmTarget(null)}>
                <Text style={styles.ghostBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* Full-size photo viewer */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <TouchableOpacity style={styles.viewer} activeOpacity={1} onPress={() => setViewerUrl(null)}>
          {viewerUrl ? <Image source={{ uri: viewerUrl }} style={styles.viewerImg} resizeMode="contain" /> : null}
          <Text style={styles.viewerClose}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function Detail({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.detailRow}>
      <FontAwesome6 name={icon as any} size={12} color={colors.textSecondary} style={{ marginTop: 3 }} />
      <Text style={styles.detail}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 20, paddingTop: 50 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  back: { color: colors.primary, fontSize: 15 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: colors.white, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 14 },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 40 },
  emptySmall: { color: colors.textSecondary, fontSize: 13, marginBottom: 12 },
  safety: { flexDirection: "row", gap: 8, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 12, marginBottom: 16 },
  safetyText: { color: colors.textSecondary, fontSize: 12, flex: 1 },
  link: { color: colors.primary, fontWeight: "700" },
  sectionTitle: { color: colors.white, fontSize: 16, fontWeight: "700", marginBottom: 10 },
  card: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, marginBottom: 10 },
  topRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  name: { color: colors.white, fontSize: 14, fontWeight: "700", marginRight: 4 },
  pill: { borderWidth: 1, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 9 },
  pillText: { fontSize: 11, fontWeight: "700" },
  date: { color: colors.textSecondary, fontSize: 11, marginTop: 4, marginBottom: 4 },
  detailRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  detail: { color: colors.white, fontSize: 13, flex: 1 },
  thumb: { width: 76, height: 76, borderRadius: 8, marginRight: 8, borderWidth: 1, borderColor: colors.border },
  contactRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  contactBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 12 },
  contactBtnText: { color: colors.white, fontSize: 12, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 },
  primaryBtnText: { color: "#000", fontSize: 13, fontWeight: "700" },
  ghostBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 14 },
  ghostBtnText: { color: colors.textSecondary, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.textSecondary, fontSize: 11, marginTop: 10 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, maxHeight: "85%" },
  modalTitle: { color: colors.white, fontSize: 17, fontWeight: "700", marginBottom: 10 },
  modalText: { color: colors.textSecondary, fontSize: 13 },
  modalLocation: { color: colors.white, fontSize: 13, fontWeight: "600", marginVertical: 8 },
  bullet: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  viewer: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", alignItems: "center", justifyContent: "center" },
  viewerImg: { width: "100%", height: "80%" },
  viewerClose: { color: colors.textSecondary, fontSize: 12, marginTop: 12 },
});
