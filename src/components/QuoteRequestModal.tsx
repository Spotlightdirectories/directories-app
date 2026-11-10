// ===============================================================
// src/components/QuoteRequestModal.tsx
//
// "Request a Quote" form (Task U, Step 1). Separate from Request a
// Visit. Fields: name (read-only), phone, email (required), state +
// LGA, optional address, description (min 20 chars), timeline,
// optional budget, and up to 4 optional photos (private storage).
// Mirrors the web form on the service page.
// ===============================================================

import { useState, useEffect } from "react";
import {
  View, Text, Modal, TextInput, TouchableOpacity, ScrollView, StyleSheet, Image, Alert,
  KeyboardAvoidingView, Platform, FlatList, RefreshControl,
} from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";
import { nigeriaData } from "../lib/nigeria-data";
import { colors } from "../theme/colors";

export type QuoteCustomer = { id: string; name: string; email: string | null; phone: string | null };

type Props = {
  visible: boolean;
  onClose: () => void;
  customer: QuoteCustomer | null;
  vendorId: string;
  vendorName: string;
  serviceId: string;
  serviceName: string;
};

const STATES = Object.keys(nigeriaData);

const TIMELINES: { value: string; label: string }[] = [
  { value: "asap", label: "As soon as possible" },
  { value: "within_1_week", label: "Within 1 week" },
  { value: "within_1_month", label: "Within 1 month" },
  { value: "just_planning", label: "Just planning" },
];

const BUDGETS = [
  "Prefer not to say",
  "Under ₦50,000",
  "₦50,000 – ₦200,000",
  "₦200,000 – ₦500,000",
  "₦500,000 – ₦1,000,000",
  "Above ₦1,000,000",
];

type Photo = { uri: string; base64: string };
type PickerKind = null | "state" | "lga" | "timeline" | "budget" | "extra" | "date";

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const WEEKDAYS = ["Mo","Tu","We","Th","Fr","Sa","Su"];

// Step 2: extra questions for the service's category family (all optional)
type QuoteQuestion = {
  id: string; question: string; question_pidgin: string | null;
  answer_type: "choice" | "text" | "number" | "date";
  options: { en: string; pcm: string }[]; placeholder: string | null;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export default function QuoteRequestModal({ visible, onClose, customer, vendorId, vendorName, serviceId, serviceName }: Props) {
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [timeline, setTimeline] = useState("");
  const [budget, setBudget] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [picker, setPicker] = useState<PickerKind>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [initFor, setInitFor] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuoteQuestion[]>([]);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [extraPickerId, setExtraPickerId] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState<Date>(new Date());

  // Load this service's extra questions whenever the form is opened (and on pull-down refresh).
  async function loadQuestions(): Promise<QuoteQuestion[] | null> {
    if (!serviceId) return null;
    try {
      const { data: svc } = await supabase.from("vendor_services").select("category_id").eq("id", serviceId).maybeSingle();
      if (!svc?.category_id) return null;
      const { data: link } = await supabase.from("quote_category_families").select("family_id").eq("category_id", svc.category_id).maybeSingle();
      if (!link?.family_id) return null;
      const { data: qs } = await supabase
        .from("quote_questions")
        .select("id, question, question_pidgin, answer_type, options, placeholder")
        .eq("family_id", link.family_id).eq("active", true).order("position", { ascending: true });
      return (qs as QuoteQuestion[]) || [];
    } catch { return null; /* optional questions; form works without them */ }
  }
  useEffect(() => {
    if (!visible || !serviceId) return;
    let cancelled = false;
    (async () => {
      const qs = await loadQuestions();
      if (!cancelled && qs) setQuestions(qs);
    })();
    return () => { cancelled = true; };
  }, [visible, serviceId]);

  const [refreshing, setRefreshing] = useState(false);
  async function onRefresh() {
    setRefreshing(true);
    const qs = await loadQuestions();
    if (qs) setQuestions(qs);
    setRefreshing(false);
  }

  // Reset the form each time the modal is opened (new open = new request).
  if (visible && initFor !== `${customer?.id}`) {
    setInitFor(`${customer?.id}`);
    setPhone(customer?.phone || "");
    setEmail(customer?.email || "");
    setState(""); setLga(""); setAddress(""); setDescription("");
    setTimeline(""); setBudget(""); setPhotos([]); setPicker(null); setExtra({}); setExtraPickerId(null);
    setSubmitted(false); setSubmitting(false);
  }

  function close() {
    setInitFor(null);
    onClose();
  }

  async function addPhoto() {
    if (photos.length >= 4) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo access in your phone's Settings to add pictures.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.6,
      base64: true,
      allowsMultipleSelection: true,
      selectionLimit: 4 - photos.length,
    });
    if (result.canceled) return;
    const next = [...photos];
    for (const a of result.assets) {
      if (next.length >= 4) break;
      if (!a.base64) continue;
      next.push({ uri: a.uri, base64: a.base64 });
    }
    setPhotos(next);
  }

  async function submit() {
    if (!customer) return;
    if (!phone.trim()) { Alert.alert("Missing info", "Please add your phone number."); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { Alert.alert("Missing info", "Please enter a valid email address."); return; }
    if (!state) { Alert.alert("Missing info", "Please choose the state where the job is."); return; }
    if (!lga) { Alert.alert("Missing info", "Please choose the local government area (LGA) where the job is."); return; }
    if (description.trim().length < 20) { Alert.alert("Missing info", "Please describe what you need in at least 20 characters, so the vendor can price it properly."); return; }
    if (!timeline) { Alert.alert("Missing info", "Please tell the vendor when you need this done."); return; }

    setSubmitting(true);
    try {
      if (phone.trim() !== (customer.phone || "")) {
        await supabase.from("customers").update({ phone: phone.trim() }).eq("id", customer.id);
      }

      const { data: { session: __s } } = await supabase.auth.getSession(); const user = __s?.user ?? null;
      if (!user) { Alert.alert("Please log in again", "Your session expired."); setSubmitting(false); return; }

      const paths: string[] = [];
      for (const p of photos) {
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
        const { error: upErr } = await supabase.storage.from("quote-photos").upload(path, base64ToBytes(p.base64), { contentType: "image/jpeg" });
        if (upErr) { Alert.alert("Upload failed", "One of the pictures could not be uploaded. Please try again."); setSubmitting(false); return; }
        paths.push(path);
      }

      const { data: created, error } = await supabase.from("quote_requests").insert({
        vendor_id: vendorId,
        customer_id: customer.id,
        service_id: serviceId,
        service_name: serviceName,
        customer_name: customer.name || "",
        customer_phone: phone.trim(),
        customer_email: email.trim(),
        state,
        lga,
        location_note: address.trim() || null,
        description: description.trim(),
        timeline,
        budget_range: budget && budget !== "Prefer not to say" ? budget : null,
        photo_urls: paths,
        extra_answers: questions
          .filter((q) => (extra[q.id] || "").trim() !== "")
          .map((q) => ({ question_id: q.id, question: q.question, answer: extra[q.id].trim() })),
      }).select("id").single();

      if (error) { Alert.alert("Not sent", "Unable to send the quote request. Please try again."); setSubmitting(false); return; }

      try { await supabase.functions.invoke("notify-quote-request", { body: { quote_request_id: created?.id } }); } catch { /* non-fatal */ }

      setSubmitting(false);
      setSubmitted(true);
    } catch {
      setSubmitting(false);
      Alert.alert("Not sent", "Something went wrong. Please try again.");
    }
  }

  // ---- option list shown in place of the form (avoids nested Modals) ----
  // Simple month calendar (no extra package needed). Past days are greyed out.
  function renderCalendar() {
    const q = questions.find((x) => x.id === extraPickerId);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const y = calMonth.getFullYear(); const m = calMonth.getMonth();
    const offset = (new Date(y, m, 1).getDay() + 6) % 7; // Monday first
    const total = new Date(y, m + 1, 0).getDate();
    const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(null);
    const weeks: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    const canPrev = y > today.getFullYear() || m > today.getMonth();
    return (
      <View>
        <View style={styles.pickerHeader}>
          <Text style={[styles.title, { flex: 1 }]} numberOfLines={2}>{q?.question || "Choose a date"}</Text>
          <TouchableOpacity onPress={() => setPicker(null)}><Text style={styles.pickerClose}>Close</Text></TouchableOpacity>
        </View>
        <View style={styles.calNav}>
          <TouchableOpacity disabled={!canPrev} onPress={() => setCalMonth(new Date(y, m - 1, 1))} style={{ opacity: canPrev ? 1 : 0.3, padding: 8 }}>
            <FontAwesome6 name="chevron-left" size={14} color={colors.white} />
          </TouchableOpacity>
          <Text style={styles.calMonth}>{MONTH_NAMES[m]} {y}</Text>
          <TouchableOpacity onPress={() => setCalMonth(new Date(y, m + 1, 1))} style={{ padding: 8 }}>
            <FontAwesome6 name="chevron-right" size={14} color={colors.white} />
          </TouchableOpacity>
        </View>
        <View style={styles.calRow}>
          {WEEKDAYS.map((d) => <Text key={d} style={styles.calWeekday}>{d}</Text>)}
        </View>
        {weeks.map((w, wi) => (
          <View key={wi} style={styles.calRow}>
            {w.map((d, di) => {
              if (d === null) return <View key={di} style={styles.calCell} />;
              const isPast = new Date(y, m, d) < today;
              const isToday = new Date(y, m, d).getTime() === today.getTime();
              return (
                <TouchableOpacity
                  key={di}
                  style={[styles.calCell, isToday && styles.calToday]}
                  disabled={isPast}
                  onPress={() => { if (q) setExtra({ ...extra, [q.id]: `${d} ${MONTH_SHORT[m]} ${y}` }); setPicker(null); }}
                >
                  <Text style={[styles.calDay, isPast && { opacity: 0.25 }]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  }

  function renderPicker() {
    if (picker === "date") return renderCalendar();
    let title = "";
    let options: { value: string; label: string }[] = [];
    let onPick: (v: string) => void = () => {};
    if (picker === "state") { title = "Select state"; options = STATES.map((s) => ({ value: s, label: s })); onPick = (v) => { setState(v); setLga(""); }; }
    if (picker === "lga") { title = "Select LGA"; options = (nigeriaData[state] || []).map((l: string) => ({ value: l, label: l })); onPick = setLga; }
    if (picker === "timeline") { title = "When do you need it?"; options = TIMELINES; onPick = setTimeline; }
    if (picker === "budget") { title = "Budget range"; options = BUDGETS.map((b) => ({ value: b, label: b })); onPick = setBudget; }
    if (picker === "extra") {
      const q = questions.find((x) => x.id === extraPickerId);
      title = q?.question || "Choose one";
      options = (q?.options || []).map((o) => ({ value: o.en, label: o.pcm && o.pcm !== o.en ? `${o.en}\n${o.pcm}` : o.en }));
      onPick = (v) => { if (q) setExtra({ ...extra, [q.id]: v }); };
    }
    return (
      <View style={{ height: 460 }}>
        <View style={styles.pickerHeader}>
          <Text style={styles.title}>{title}</Text>
          <TouchableOpacity onPress={() => setPicker(null)}><Text style={styles.pickerClose}>Close</Text></TouchableOpacity>
        </View>
        <FlatList
          data={options}
          keyExtractor={(o) => o.value}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.optionRow} onPress={() => { onPick(item.value); setPicker(null); }}>
              <Text style={styles.optionText}>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  const timelineLabel = TIMELINES.find((t) => t.value === timeline)?.label;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <KeyboardAvoidingView style={[styles.overlay, submitted && { justifyContent: "center", paddingHorizontal: 20 }]} behavior="padding">
        <View style={[styles.card, submitted ? { borderRadius: 16, paddingBottom: 20 } : { paddingBottom: 56 }]}>
          {submitted ? (
            <>
              <Text style={styles.title}>Quote Request Sent</Text>
              <Text style={styles.text}>
                {vendorName || "The vendor"} will contact you with a quote. You can follow this request under My Quote Requests in your dashboard. Sending it does not commit you to anything.
              </Text>
              <TouchableOpacity style={[styles.submitBtn, { flex: 0, minHeight: 48, justifyContent: "center", alignSelf: "stretch", marginTop: 8 }]} onPress={close}><Text style={styles.submitText}>Done</Text></TouchableOpacity>
            </>
          ) : picker ? (
            renderPicker()
          ) : (
            <>
              <Text style={styles.title}>Request a Quote</Text>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ flexShrink: 1 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}>
                <Text style={styles.text}>
                  Tell {vendorName || "the vendor"} what you need for “{serviceName}” and they will contact you with a quote. Sending this does not commit you to anything.
                </Text>

                <Text style={styles.label}>Your name</Text>
                <TextInput style={[styles.input, { opacity: 0.6 }]} value={customer?.name || ""} editable={false} />

                <Text style={styles.label}>Your phone number</Text>
                <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+2348021234567" placeholderTextColor={colors.textSecondary} keyboardType="phone-pad" />

                <Text style={styles.label}>Your email address</Text>
                <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.textSecondary} keyboardType="email-address" autoCapitalize="none" />

                <Text style={styles.label}>State where the job is</Text>
                <TouchableOpacity style={styles.select} onPress={() => setPicker("state")}>
                  <Text style={state ? styles.selectValue : styles.selectPlaceholder}>{state || "Select state"}</Text>
                  <FontAwesome6 name="chevron-down" size={12} color={colors.textSecondary} />
                </TouchableOpacity>

                <Text style={styles.label}>Local government area (LGA)</Text>
                <TouchableOpacity style={[styles.select, !state && { opacity: 0.5 }]} disabled={!state} onPress={() => setPicker("lga")}>
                  <Text style={lga ? styles.selectValue : styles.selectPlaceholder}>{lga || (state ? "Select LGA" : "Choose a state first")}</Text>
                  <FontAwesome6 name="chevron-down" size={12} color={colors.textSecondary} />
                </TouchableOpacity>

                <Text style={styles.label}>Address or landmark (optional)</Text>
                <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="e.g. Off Admiralty Way, Lekki Phase 1" placeholderTextColor={colors.textSecondary} />

                <Text style={styles.label}>Describe what you need</Text>
                <TextInput
                  style={[styles.input, { height: 100, textAlignVertical: "top" }]}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  placeholder="Describe the job in detail so the vendor can price it properly (at least 20 characters)..."
                  placeholderTextColor={colors.textSecondary}
                />

                <Text style={styles.label}>When do you need it?</Text>
                <TouchableOpacity style={styles.select} onPress={() => setPicker("timeline")}>
                  <Text style={timeline ? styles.selectValue : styles.selectPlaceholder}>{timelineLabel || "Select"}</Text>
                  <FontAwesome6 name="chevron-down" size={12} color={colors.textSecondary} />
                </TouchableOpacity>

                <Text style={styles.label}>Budget range (optional)</Text>
                <TouchableOpacity style={styles.select} onPress={() => setPicker("budget")}>
                  <Text style={budget ? styles.selectValue : styles.selectPlaceholder}>{budget || "Prefer not to say"}</Text>
                  <FontAwesome6 name="chevron-down" size={12} color={colors.textSecondary} />
                </TouchableOpacity>

                {questions.length > 0 && (
                  <>
                    <Text style={[styles.text, { marginTop: 16 }]}>A few more questions help the vendor quote faster (all optional).</Text>
                    <Text style={[styles.text, { opacity: 0.7 }]}>Some small questions to help the vendor quote quick (you fit skip any).</Text>
                    {questions.map((q) => (
                      <View key={q.id}>
                        <Text style={styles.label}>{q.question}</Text>
                        {q.question_pidgin ? <Text style={[styles.text, { opacity: 0.7, marginTop: -2 }]}>{q.question_pidgin}</Text> : null}
                        {q.answer_type === "date" ? (
                          <TouchableOpacity style={styles.select} onPress={() => { setExtraPickerId(q.id); setCalMonth(new Date()); setPicker("date"); }}>
                            <Text style={extra[q.id] ? styles.selectValue : styles.selectPlaceholder}>{extra[q.id] || "Pick a date"}</Text>
                            <FontAwesome6 name="calendar-days" size={14} color={colors.textSecondary} />
                          </TouchableOpacity>
                        ) : q.answer_type === "choice" ? (
                          <TouchableOpacity style={styles.select} onPress={() => { setExtraPickerId(q.id); setPicker("extra"); }}>
                            <Text style={extra[q.id] ? styles.selectValue : styles.selectPlaceholder}>{extra[q.id] || "Choose one"}</Text>
                            <FontAwesome6 name="chevron-down" size={12} color={colors.textSecondary} />
                          </TouchableOpacity>
                        ) : (
                          <TextInput
                            style={styles.input}
                            value={extra[q.id] || ""}
                            onChangeText={(v) => setExtra({ ...extra, [q.id]: v })}
                            keyboardType={q.answer_type === "number" ? "numeric" : "default"}
                            maxLength={300}
                            placeholder={q.placeholder || ""}
                            placeholderTextColor={colors.textSecondary}
                          />
                        )}
                      </View>
                    ))}
                  </>
                )}

                <Text style={styles.label}>Photos of the job (optional, up to 4)</Text>
                <View style={styles.photoRow}>
                  {photos.map((p, i) => (
                    <View key={p.uri + i} style={styles.photoSlot}>
                      <Image source={{ uri: p.uri }} style={styles.photoImg} />
                      <TouchableOpacity style={styles.photoRemove} onPress={() => setPhotos(photos.filter((_, idx) => idx !== i))}>
                        <Text style={styles.photoRemoveText}>×</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {photos.length < 4 && (
                    <TouchableOpacity style={[styles.photoSlot, styles.photoAdd]} onPress={addPhoto}>
                      <FontAwesome6 name="camera" size={16} color={colors.primary} />
                      <Text style={styles.photoAddText}>Add photo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={close}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={submit} disabled={submitting}>
                  <Text style={styles.submitText}>{submitting ? "Sending..." : "Send Quote Request"}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  calNav: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  calMonth: { color: colors.white, fontSize: 15, fontWeight: "700" },
  calRow: { flexDirection: "row" },
  calWeekday: { width: "14.285%", textAlign: "center", color: colors.textSecondary, fontSize: 11, fontWeight: "600", paddingVertical: 6 },
  calCell: { width: "14.285%", height: 40, alignItems: "center", justifyContent: "center", borderRadius: 8 },
  calToday: { borderWidth: 1, borderColor: colors.primary },
  calDay: { color: colors.white, fontSize: 14 },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  card: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 32, maxHeight: "92%" },
  title: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 12 },
  text: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14 },
  select: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectValue: { color: colors.white, fontSize: 14 },
  selectPlaceholder: { color: colors.textSecondary, fontSize: 14 },
  photoRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  photoSlot: { width: 70, height: 70, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  photoImg: { width: "100%", height: "100%" },
  photoRemove: { position: "absolute", top: 3, right: 3, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.75)", alignItems: "center", justifyContent: "center" },
  photoRemoveText: { color: "#fff", fontSize: 14, lineHeight: 16 },
  photoAdd: { borderStyle: "dashed", borderColor: colors.primary, alignItems: "center", justifyContent: "center", gap: 4 },
  photoAddText: { color: colors.textSecondary, fontSize: 10, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 14, alignItems: "center" },
  cancelText: { color: colors.textSecondary, fontWeight: "600" },
  submitBtn: { flex: 2, backgroundColor: colors.primary, borderRadius: 8, padding: 14, alignItems: "center" },
  submitText: { color: colors.black, fontWeight: "700" },
  pickerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  pickerClose: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  optionRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionText: { color: colors.white, fontSize: 15 },
});
