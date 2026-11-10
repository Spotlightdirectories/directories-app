// ===============================================================
// src/screens/vendor/ProfileEditScreen.tsx
//
// Vendor "Edit Profile" form, ported from web's ProfileTab.tsx with
// the same rules: WhatsApp/Telephone/Address/State/LGA are required,
// the description has a per-plan word limit, the public-listing
// consent must be ticked to save, and nothing is saved when nothing
// changed. Map pin can be detected (must confirm you are at the
// business) OR typed in by hand. Description is plain text here; if
// the vendor does not touch it, the original (possibly formatted)
// text saved from web is left exactly as it was.
// ===============================================================

import { useEffect, useState } from "react";
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
  Alert, Modal, FlatList, KeyboardAvoidingView, Platform, Linking,
} from "react-native";
import KeyboardAwareScroll from "../../components/KeyboardAwareScroll";
import { FontAwesome6 } from "@expo/vector-icons";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { nigeriaData } from "../../lib/nigeria-data";
import AiDescribeModal from "../../components/AiDescribeModal";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "ProfileEdit">;

const DESCRIPTION_WORD_LIMITS: Record<string, number> = { free: 50, standard: 100, enterprise: 150, elite: 200, custom: 250 };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

type Vendor = {
  id: string; slug: string | null; name: string | null; email: string | null; whatsapp: string | null; telephone: string | null;
  address: string | null; state: string | null; lga: string | null; latitude: number | null; longitude: number | null;
  open_time: string | null; close_time: string | null; business_days: string | null; description: string | null; plan_tier: string | null;
};

function htmlToPlain(html: string | null): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(div|p)>/gi, "\n").replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function plainToHtml(text: string): string {
  return text.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}
function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
// "09:30" / "09:30:00" -> "9:30 AM"
function showTime(t: string): string {
  if (!t) return "Select time";
  const [hh, mm] = t.split(":");
  const h = parseInt(hh, 10);
  if (isNaN(h)) return "Select time";
  return `${h % 12 === 0 ? 12 : h % 12}:${(mm || "00").slice(0, 2)} ${h >= 12 ? "PM" : "AM"}`;
}

export default function ProfileEditScreen() {
  const navigation = useNavigation<Nav>();
  const [loading, setLoading] = useState(true);
  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [saving, setSaving] = useState(false);

  const [whatsapp, setWhatsapp] = useState("");
  const [telephone, setTelephone] = useState("");
  const [address, setAddress] = useState("");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [openTime, setOpenTime] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [description, setDescription] = useState("");
  const [atBusiness, setAtBusiness] = useState(false);
  const [consent, setConsent] = useState(false);
  const [locStatus, setLocStatus] = useState("");
  const [detecting, setDetecting] = useState(false);

  const [picker, setPicker] = useState<null | "state" | "lga">(null);
  const [timePicker, setTimePicker] = useState<null | "open" | "close">(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiToast, setAiToast] = useState<string | null>(null);

  function applyVendor(v: Vendor) {
    setVendor(v);
    setWhatsapp(v.whatsapp || "");
    setTelephone(v.telephone || "");
    setAddress(v.address || "");
    setState(v.state || "");
    setLga(v.lga || "");
    setOpenTime(v.open_time || "");
    setCloseTime(v.close_time || "");
    setDays(v.business_days ? v.business_days.split(",").filter(Boolean) : []);
    setLat(v.latitude != null ? String(v.latitude) : "");
    setLng(v.longitude != null ? String(v.longitude) : "");
    setDescription(htmlToPlain(v.description));
  }

  useEffect(() => {
    (async () => {
      const { data: { session: __s } } = await supabase.auth.getSession(); const user = __s?.user ?? null;
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("vendors")
        .select("id, slug, name, email, whatsapp, telephone, address, state, lga, latitude, longitude, open_time, close_time, business_days, description, plan_tier")
        .eq("auth_user_id", user.id).maybeSingle();
      if (data) applyVendor(data as Vendor);
      setLoading(false);
    })();
  }, []);

  function onWhatsappChange(v: string) {
    let d = v.replace(/\D/g, "");
    if (d.startsWith("0")) d = d.substring(1);
    setWhatsapp(d.slice(0, 10));
  }

  function toggleDay(d: string) {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  }

  async function detectLocation() {
    if (!atBusiness) { setLocStatus("Please confirm you are at your business location before detecting."); return; }
    setDetecting(true);
    setLocStatus("Detecting location...");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocStatus("Location permission was denied. Allow it in your phone's Settings, or type the coordinates yourself below.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLat(pos.coords.latitude.toFixed(6));
      setLng(pos.coords.longitude.toFixed(6));
      setLocStatus("Location detected successfully.");
    } catch {
      setLocStatus("Unable to get your location. Try again outside, or type the coordinates yourself below.");
    } finally {
      setDetecting(false);
    }
  }

  async function handleSave() {
    if (!vendor) return;
    if (!consent) { Alert.alert("Consent needed", "You must agree to the public listing consent before saving."); return; }

    const required: Array<[string, string]> = [
      [whatsapp.trim(), "WhatsApp number"], [telephone.trim(), "Telephone number"], [address.trim(), "Business address"],
      [state, "State"], [lga, "LGA"],
    ];
    for (const [value, label] of required) {
      if (!value) { Alert.alert("Missing information", `${label} is required.`); return; }
    }

    const plan = vendor.plan_tier || "free";
    const limit = DESCRIPTION_WORD_LIMITS[plan] ?? 100;
    const originalPlain = htmlToPlain(vendor.description);
    const descChanged = description.trim() !== originalPlain;
    if (descChanged && countWords(description) > limit) {
      Alert.alert("Description too long", `Your business description exceeds the ${limit}-word limit for your plan. Please shorten it.`);
      return;
    }

    let nextLat: number | null = vendor.latitude;
    let nextLng: number | null = vendor.longitude;
    if (lat.trim() || lng.trim()) {
      const la = parseFloat(lat), lo = parseFloat(lng);
      if (isNaN(la) || isNaN(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
        Alert.alert("Check the coordinates", "Latitude must be between -90 and 90, and longitude between -180 and 180.");
        return;
      }
      nextLat = la; nextLng = lo;
    }

    const nextDays = DAYS.filter((d) => days.includes(d)).join(",");
    const nextDescription = descChanged ? plainToHtml(description) : (vendor.description || "");

    const hasChanges =
      whatsapp.trim() !== (vendor.whatsapp || "") || telephone.trim() !== (vendor.telephone || "") ||
      address.trim() !== (vendor.address || "") || nextDescription !== (vendor.description || "") ||
      state !== (vendor.state || "") || lga !== (vendor.lga || "") ||
      nextLat !== vendor.latitude || nextLng !== vendor.longitude ||
      openTime !== (vendor.open_time || "") || closeTime !== (vendor.close_time || "") ||
      nextDays !== (vendor.business_days || "");
    if (!hasChanges) { Alert.alert("Nothing to save", "No new changes to save."); return; }

    const payload = {
      whatsapp: whatsapp.trim(), telephone: telephone.trim(), address: address.trim(),
      description: nextDescription, latitude: nextLat, longitude: nextLng, state, lga,
      open_time: openTime || null, close_time: closeTime || null, business_days: nextDays,
    };
    const full = {
      ...payload,
      onboarding_completed: !!(
        (vendor.name || "").trim() && (vendor.email || "").trim() && payload.address && payload.description.trim() &&
        payload.whatsapp && payload.telephone && payload.latitude && payload.longitude
      ),
    };

    setSaving(true);
    try {
      const { error } = await supabase.from("vendors").update(full).eq("id", vendor.id);
      if (error) throw error;
      applyVendor({ ...vendor, ...payload });
      setConsent(false);
      Alert.alert("Saved", "Profile updated successfully.");
    } catch (err: any) {
      Alert.alert("Couldn't save", err?.message || "Unable to save profile changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!vendor) return <View style={styles.center}><Text style={styles.muted}>Vendor account not found.</Text></View>;

  const plan = vendor.plan_tier || "free";
  const limit = DESCRIPTION_WORD_LIMITS[plan] ?? 100;
  const words = countWords(description);
  const lgaOptions = state ? nigeriaData[state] || [] : [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.dark }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <KeyboardAwareScroll style={styles.container} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
          <SpotlightMark size={22} />
        </View>
        <Text style={styles.title}>Edit Business Profile</Text>
        <Text style={styles.subtitle}>Update your public information and location details.</Text>

        {!!vendor.slug && (
          <TouchableOpacity style={styles.mediaLink} onPress={() => navigation.navigate("VendorProfile", { slug: vendor.slug as string })}>
            <FontAwesome6 name="image" size={16} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.mediaLinkTitle}>Cover, logo, video & social links</Text>
              <Text style={styles.mediaLinkSub}>Edit these right on your public profile page</Text>
            </View>
            <FontAwesome6 name="chevron-right" size={12} color={colors.textSecondary} />
          </TouchableOpacity>
        )}

        <View style={styles.readonlyBox}>
          <Text style={styles.roLabel}>Business Display Name</Text>
          <Text style={styles.roValue}>{vendor.name || "—"}</Text>
          <Text style={[styles.roLabel, { marginTop: 10 }]}>Email Address</Text>
          <Text style={styles.roValue}>{vendor.email || "—"}</Text>
          <Text style={styles.roNote}>Name and email can't be changed here.</Text>
        </View>

        <Text style={styles.section}>Contact</Text>
        <Text style={styles.label}>WhatsApp *</Text>
        <View style={styles.prefixRow}>
          <Text style={styles.prefix}>+234</Text>
          <TextInput style={[styles.input, { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }]} value={whatsapp} onChangeText={onWhatsappChange}
            keyboardType="number-pad" placeholder="8012345678" placeholderTextColor={colors.textSecondary} maxLength={10} />
        </View>
        <Text style={styles.label}>Telephone *</Text>
        <TextInput style={styles.input} value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" placeholder="e.g. 08012345678" placeholderTextColor={colors.textSecondary} />

        <Text style={styles.section}>Business Hours</Text>
        <View style={styles.timeRow}>
          <TouchableOpacity style={[styles.select, { flex: 1 }]} onPress={() => setTimePicker("open")}>
            <Text style={openTime ? styles.selectValue : styles.selectPlaceholder}>Opens: {showTime(openTime)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.select, { flex: 1 }]} onPress={() => setTimePicker("close")}>
            <Text style={closeTime ? styles.selectValue : styles.selectPlaceholder}>Closes: {showTime(closeTime)}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.daysRow}>
          {DAYS.map((d) => {
            const on = days.includes(d);
            return (
              <TouchableOpacity key={d} style={[styles.dayChip, on && styles.dayChipOn]} onPress={() => toggleDay(d)}>
                <Text style={[styles.dayText, on && styles.dayTextOn]}>{d}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.section}>Address</Text>
        <Text style={styles.label}>Address *</Text>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: "top" }]} value={address} onChangeText={setAddress} multiline
          placeholder="Street, area, landmark" placeholderTextColor={colors.textSecondary} />
        <Text style={styles.label}>State *</Text>
        <TouchableOpacity style={styles.select} onPress={() => setPicker("state")}>
          <Text style={state ? styles.selectValue : styles.selectPlaceholder}>{state || "Select state"}</Text>
          <FontAwesome6 name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text style={styles.label}>LGA *</Text>
        <TouchableOpacity style={[styles.select, !state && { opacity: 0.5 }]} disabled={!state} onPress={() => setPicker("lga")}>
          <Text style={lga ? styles.selectValue : styles.selectPlaceholder}>{lga || (state ? "Select LGA" : "Choose a state first")}</Text>
          <FontAwesome6 name="chevron-down" size={12} color={colors.textSecondary} />
        </TouchableOpacity>

        <Text style={styles.section}>Business Location (map pin)</Text>
        <Text style={styles.help}>
          Click "Detect my location" while at your office or shop. If you are not there, you may enter the coordinates manually. Visit{" "}
          <Text style={styles.link} onPress={() => Linking.openURL("https://maps.google.com")}>maps.google.com</Text>
          {" "}and search your address. Press and hold the map pin to reveal its coordinates, then copy them into the boxes below.
        </Text>
        <TouchableOpacity style={styles.checkRow} onPress={() => setAtBusiness(!atBusiness)}>
          <FontAwesome6 name={atBusiness ? "square-check" : "square"} size={18} color={atBusiness ? colors.primary : colors.textSecondary} />
          <Text style={styles.checkText}>I confirm I'm at my business location</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondaryBtn, detecting && { opacity: 0.6 }]} disabled={detecting} onPress={detectLocation}>
          <FontAwesome6 name="location-crosshairs" size={14} color={colors.primary} />
          <Text style={styles.secondaryBtnText}>{detecting ? "Detecting..." : "Detect my location"}</Text>
        </TouchableOpacity>
        {!!locStatus && <Text style={styles.help}>{locStatus}</Text>}
        <View style={styles.timeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Latitude</Text>
            <TextInput style={styles.input} value={lat} onChangeText={setLat} keyboardType="numbers-and-punctuation" placeholder="e.g. 6.4281" placeholderTextColor={colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Longitude</Text>
            <TextInput style={styles.input} value={lng} onChangeText={setLng} keyboardType="numbers-and-punctuation" placeholder="e.g. 3.4219" placeholderTextColor={colors.textSecondary} />
          </View>
        </View>

        <Text style={styles.section}>Description</Text>
        <TouchableOpacity style={styles.aiBtn} onPress={() => setAiOpen(true)}>
          <FontAwesome6 name="wand-magic-sparkles" size={13} color={colors.primary} />
          <Text style={styles.aiBtnText}>Generate with AI</Text>
        </TouchableOpacity>
        {!!aiToast && <Text style={styles.toast}>{aiToast}</Text>}
        <TextInput style={[styles.input, { height: 150, textAlignVertical: "top" }]} value={description} onChangeText={setDescription} multiline
          placeholder="Tell customers about your business..." placeholderTextColor={colors.textSecondary} />
        <Text style={[styles.help, words > limit && { color: colors.error }]}>{words} / {limit} words ({plan} plan)</Text>

        <TouchableOpacity style={[styles.checkRow, { marginTop: 18, alignItems: "flex-start" }]} onPress={() => setConsent(!consent)}>
          <FontAwesome6 name={consent ? "square-check" : "square"} size={18} color={consent ? colors.primary : colors.textSecondary} style={{ marginTop: 2 }} />
          <Text style={[styles.checkText, { flex: 1 }]}>I understand that my business information (including phone number and location) will be publicly displayed on Spotlight Directories.</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} disabled={saving} onPress={handleSave}>
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save Changes"}</Text>
        </TouchableOpacity>
      </KeyboardAwareScroll>

      {/* STATE / LGA PICKER */}
      <Modal visible={picker !== null} animationType="slide" transparent onRequestClose={() => setPicker(null)}>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{picker === "state" ? "Select state" : "Select LGA"}</Text>
              <TouchableOpacity onPress={() => setPicker(null)}><Text style={styles.back}>Close</Text></TouchableOpacity>
            </View>
            <FlatList
              data={picker === "state" ? Object.keys(nigeriaData) : lgaOptions}
              keyExtractor={(i) => i}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.optionRow} onPress={() => {
                  if (picker === "state") { if (item !== state) { setState(item); setLga(""); } } else setLga(item);
                  setPicker(null);
                }}>
                  <Text style={[styles.optionText, (picker === "state" ? state : lga) === item && { color: colors.primary }]}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* TIME PICKER */}
      <TimePickerModal
        visible={timePicker !== null}
        title={timePicker === "open" ? "Opening time" : "Closing time"}
        value={timePicker === "open" ? openTime : closeTime}
        onCancel={() => setTimePicker(null)}
        onPick={(t) => { if (timePicker === "open") setOpenTime(t); else setCloseTime(t); setTimePicker(null); }}
      />

      <AiDescribeModal
        visible={aiOpen}
        type="business"
        onClose={() => setAiOpen(false)}
        onGenerated={(text, meta) => {
          setDescription(text);
          if (meta.planTier && meta.limit) {
            const p = meta.planTier.charAt(0).toUpperCase() + meta.planTier.slice(1);
            setAiToast(`Generated within your ${p} plan's ${meta.limit}-word limit`);
            setTimeout(() => setAiToast(null), 3500);
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

// Simple 3-column time picker (hour / minute / AM-PM) -- avoids adding
// a new native package. Returns a 24-hour "HH:MM" string like web does.
function TimePickerModal({ visible, title, value, onCancel, onPick }: {
  visible: boolean; title: string; value: string; onCancel: () => void; onPick: (t: string) => void;
}) {
  const [h, setH] = useState(9);
  const [m, setM] = useState(0);
  const [pm, setPm] = useState(false);

  useEffect(() => {
    if (!visible) return;
    const parts = (value || "").split(":");
    const hh = parseInt(parts[0], 10);
    const mm = parseInt(parts[1], 10);
    if (!isNaN(hh)) { setPm(hh >= 12); setH(hh % 12 === 0 ? 12 : hh % 12); } else { setH(9); setPm(false); }
    setM(!isNaN(mm) ? Math.round(mm / 5) * 5 % 60 : 0);
  }, [visible, value]);

  function confirm() {
    let hh = h % 12;
    if (pm) hh += 12;
    onPick(`${String(hh).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const mins = Array.from({ length: 12 }, (_, i) => i * 5);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={[styles.overlay, { justifyContent: "center", paddingHorizontal: 20 }]}>
        <View style={[styles.sheet, { borderRadius: 16, paddingBottom: 20, maxHeight: "80%" }]}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onCancel}><Text style={styles.back}>Cancel</Text></TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 12, height: 240 }}>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {hours.map((x) => (
                <TouchableOpacity key={x} style={[styles.tpCell, h === x && styles.tpCellOn]} onPress={() => setH(x)}>
                  <Text style={[styles.tpText, h === x && styles.tpTextOn]}>{x}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {mins.map((x) => (
                <TouchableOpacity key={x} style={[styles.tpCell, m === x && styles.tpCellOn]} onPress={() => setM(x)}>
                  <Text style={[styles.tpText, m === x && styles.tpTextOn]}>{String(x).padStart(2, "0")}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flex: 1 }}>
              {["AM", "PM"].map((x) => {
                const on = (x === "PM") === pm;
                return (
                  <TouchableOpacity key={x} style={[styles.tpCell, on && styles.tpCellOn]} onPress={() => setPm(x === "PM")}>
                    <Text style={[styles.tpText, on && styles.tpTextOn]}>{x}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <TouchableOpacity style={[styles.saveBtn, { marginHorizontal: 16 }]} onPress={confirm}>
            <Text style={styles.saveText}>Set time</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  scroll: { padding: 20, paddingTop: 50, paddingBottom: 90 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  muted: { color: colors.textSecondary, fontSize: 13 },
  back: { color: colors.primary, fontSize: 15 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: colors.white, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 16 },
  mediaLink: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.primary, borderRadius: 10, padding: 14, marginBottom: 12 },
  mediaLinkTitle: { color: colors.white, fontSize: 14, fontWeight: "600" },
  mediaLinkSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  readonlyBox: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14 },
  roLabel: { color: colors.textSecondary, fontSize: 11 },
  roValue: { color: colors.white, fontSize: 14, marginTop: 2 },
  roNote: { color: colors.textSecondary, fontSize: 11, marginTop: 10, fontStyle: "italic" },
  section: { color: colors.primary, fontSize: 14, fontWeight: "700", marginTop: 24, marginBottom: 4 },
  label: { color: colors.textSecondary, fontSize: 12, marginTop: 12, marginBottom: 6 },
  help: { color: colors.textSecondary, fontSize: 12, marginTop: 6 },
  link: { color: colors.primary, textDecorationLine: "underline" },
  input: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  prefixRow: { flexDirection: "row", alignItems: "stretch" },
  prefix: { backgroundColor: "#1c1c1c", borderWidth: 1, borderRightWidth: 0, borderColor: colors.border, borderTopLeftRadius: 8, borderBottomLeftRadius: 8, color: colors.textSecondary, paddingHorizontal: 12, textAlignVertical: "center", paddingTop: 12, fontSize: 14 },
  select: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 },
  selectValue: { color: colors.white, fontSize: 14 },
  selectPlaceholder: { color: colors.textSecondary, fontSize: 14 },
  timeRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  daysRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  dayChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: "#141414" },
  dayChipOn: { borderColor: colors.primary, backgroundColor: "#2a2400" },
  dayText: { color: colors.textSecondary, fontSize: 13 },
  dayTextOn: { color: colors.primary, fontWeight: "700" },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  checkText: { color: colors.textSecondary, fontSize: 13 },
  secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderColor: colors.primary, borderRadius: 8, paddingVertical: 11, marginTop: 12 },
  secondaryBtnText: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.primary, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginTop: 8, marginBottom: 10 },
  aiBtnText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  toast: { color: colors.success, fontSize: 12, marginBottom: 8 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  saveText: { color: colors.black, fontSize: 15, fontWeight: "700" },
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#141414", borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "75%", paddingBottom: 30 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16 },
  sheetTitle: { color: colors.white, fontSize: 16, fontWeight: "700" },
  optionRow: { paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.border },
  optionText: { color: colors.white, fontSize: 15 },
  tpCell: { paddingVertical: 12, alignItems: "center", borderRadius: 8, marginBottom: 4 },
  tpCellOn: { backgroundColor: "#2a2400" },
  tpText: { color: colors.white, fontSize: 18 },
  tpTextOn: { color: colors.primary, fontWeight: "700" },
});
