// ===============================================================
// src/screens/vendor/SettingsScreen.tsx
//
// Vendor Settings -- same three cards, rules and wording as the
// website's Settings tab: Account (change email with a code),
// Notification Preferences (Email Notifications, Lead Alerts) and
// Danger Zone (close / restore account, 14-day restoration period).
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView, Switch, TextInput, Alert, KeyboardAvoidingView, Platform } from "react-native";
import KeyboardAwareScroll from "../../components/KeyboardAwareScroll";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import LegalLinks from "../../components/LegalLinks";
import AnalyticsOptOut from "../../components/AnalyticsOptOut";
import { colors } from "../../theme/colors";
import SpotlightMark from "../../components/SpotlightMark";

type SettingsVendor = {
  id: string;
  email: string | null;
  email_notifications_enabled: boolean | null;
  lead_alerts_enabled: boolean | null;
  account_status: string | null;
  scheduled_deletion_at: string | null;
};

const FUNCTIONS_URL = "https://gyvzmktavyrevfxnwsay.supabase.co/functions/v1";

export default function SettingsScreen() {
  const navigation = useNavigation();
  const [vendor, setVendor] = useState<SettingsVendor | null>(null);
  const [loading, setLoading] = useState(true);

  // Change email
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [emailStep, setEmailStep] = useState<1 | 2>(1);
  const [newEmail, setNewEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [emailMsg, setEmailMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [emailBusy, setEmailBusy] = useState(false);

  // Notifications
  const [notifError, setNotifError] = useState<string | null>(null);
  const [emailNotifSaving, setEmailNotifSaving] = useState(false);
  const [leadAlertsSaving, setLeadAlertsSaving] = useState(false);

  // Danger zone
  const [closeBusy, setCloseBusy] = useState(false);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: v } = await supabase
      .from("vendors")
      .select("id, email, email_notifications_enabled, lead_alerts_enabled, account_status, scheduled_deletion_at")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (v) setVendor(v as SettingsVendor);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  const { refreshControl } = usePullRefresh(load);

  // ---------------- Change email ----------------
  function resetEmailForm() {
    setShowChangeEmail(false);
    setEmailStep(1);
    setNewEmail("");
    setOtp("");
    setEmailMsg(null);
  }

  // Raw fetch (not functions.invoke) so the real error text from the
  // function ("email already in use", "wrong code") reaches the vendor.
  async function callEmailFunction(name: "request-email-change" | "confirm-email-change", body: Record<string, string>) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("You must be logged in to change your email.");
    const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data?.success) throw new Error(data?.error || "Something went wrong. Please try again.");
    return data;
  }

  async function handleSendCode() {
    if (!vendor) return;
    const email = newEmail.trim();
    if (!email) { setEmailMsg({ text: "Please enter a new email address.", ok: false }); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setEmailMsg({ text: "Please enter a valid email address.", ok: false }); return; }
    if (email.toLowerCase() === (vendor.email || "").toLowerCase()) { setEmailMsg({ text: "This is already your current email address.", ok: false }); return; }
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      await callEmailFunction("request-email-change", { newEmail: email });
      setEmailMsg({ text: `Code sent to ${email}. Enter it below to confirm.`, ok: true });
      setEmailStep(2);
    } catch (err) {
      setEmailMsg({ text: err instanceof Error ? err.message : "Unable to send verification codes. Please try again.", ok: false });
    }
    setEmailBusy(false);
  }

  async function handleConfirmCode() {
    const code = otp.trim();
    if (!code) { setEmailMsg({ text: "Please enter the code.", ok: false }); return; }
    setEmailBusy(true);
    try {
      const data = await callEmailFunction("confirm-email-change", { otp: code });
      setEmailMsg({ text: `Your email has been changed to ${data.newEmail}.`, ok: true });
      setVendor((v) => (v ? { ...v, email: data.newEmail } : v));
      setTimeout(resetEmailForm, 2500);
    } catch (err) {
      setEmailMsg({ text: err instanceof Error ? err.message : "Unable to confirm email change. Please try again.", ok: false });
    }
    setEmailBusy(false);
  }

  // ---------------- Notification switches ----------------
  async function saveSwitch(column: "email_notifications_enabled" | "lead_alerts_enabled", value: boolean) {
    if (!vendor) return;
    const setSaving = column === "email_notifications_enabled" ? setEmailNotifSaving : setLeadAlertsSaving;
    setSaving(true);
    setNotifError(null);
    const previous = vendor[column];
    setVendor({ ...vendor, [column]: value });
    const { error } = await supabase.from("vendors").update({ [column]: value }).eq("id", vendor.id);
    if (error) {
      setVendor((v) => (v ? { ...v, [column]: previous } : v));
      setNotifError("Couldn't save that change. Please try again.");
    }
    setSaving(false);
  }

  // ---------------- Close / restore account ----------------
  function confirmClose() {
    Alert.alert(
      "Close your account?",
      "Your listing is hidden immediately. You have 14 days to change your mind and restore it. After that the closure is final, and within 30 more days all your data is permanently erased: profile, products, services, photos, videos, documents, contact details and login.\n\nWe keep only subscription invoices and payment receipts, which we must retain for accounting and reporting.\n\nClosing your account does NOT cancel or refund any active subscription. All payments are final.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Close Account", style: "destructive", onPress: doClose },
      ]
    );
  }

  async function doClose() {
    if (!vendor) return;
    setCloseBusy(true);
    const scheduledDeletionAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("vendors")
      .update({ account_status: "closing", scheduled_deletion_at: scheduledDeletionAt })
      .eq("id", vendor.id);
    setCloseBusy(false);
    if (error) { Alert.alert("Unable to schedule account closure", "Please try again."); return; }
    setVendor({ ...vendor, account_status: "closing", scheduled_deletion_at: scheduledDeletionAt });
    Alert.alert("Closure scheduled", "Your account closure has been scheduled. You may restore your account within 14 days.");
  }

  function confirmRestore() {
    Alert.alert("Restore your vendor account?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Restore", onPress: doRestore },
    ]);
  }

  async function doRestore() {
    if (!vendor) return;
    setCloseBusy(true);
    const { error } = await supabase
      .from("vendors")
      .update({ account_status: "active", scheduled_deletion_at: null })
      .eq("id", vendor.id);
    setCloseBusy(false);
    if (error) { Alert.alert("Unable to restore account", "Please try again."); return; }
    setVendor({ ...vendor, account_status: "active", scheduled_deletion_at: null });
    Alert.alert("Account restored", "Your account has been restored.");
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!vendor) {
    return (
      <View style={styles.container}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <Text style={styles.empty}>Couldn't load your settings right now.</Text>
      </View>
    );
  }

  const isClosing = vendor.account_status === "closing";
  const deletionDate = vendor.scheduled_deletion_at ? new Date(vendor.scheduled_deletion_at) : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.dark }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <KeyboardAwareScroll refreshControl={refreshControl} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
          <SpotlightMark size={22} />
        </View>
        <Text style={styles.title}>Settings</Text>

        {/* ACCOUNT SETTINGS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account Settings</Text>
          <Text style={styles.rowTitle}>Email Address</Text>
          <Text style={styles.emailValue}>{vendor.email || "—"}</Text>
          <Text style={styles.note}>We'll send a verification code to your new email address. Enter the code to confirm the change.</Text>

          {!showChangeEmail ? (
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowChangeEmail(true)}>
              <Text style={styles.outlineBtnText}>Change Email</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ marginTop: 12 }}>
              {emailStep === 1 ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="New email address"
                    placeholderTextColor={colors.textSecondary}
                    value={newEmail}
                    onChangeText={setNewEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!emailBusy}
                  />
                  <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.primaryBtn} onPress={handleSendCode} disabled={emailBusy}>
                      <Text style={styles.primaryBtnText}>{emailBusy ? "Sending..." : "Send Code"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.outlineBtn} onPress={resetEmailForm} disabled={emailBusy}>
                      <Text style={styles.outlineBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Verification code"
                    placeholderTextColor={colors.textSecondary}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    autoCorrect={false}
                    editable={!emailBusy}
                  />
                  <View style={styles.btnRow}>
                    <TouchableOpacity style={styles.primaryBtn} onPress={handleConfirmCode} disabled={emailBusy}>
                      <Text style={styles.primaryBtnText}>{emailBusy ? "Confirming..." : "Confirm Change"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.outlineBtn} onPress={resetEmailForm} disabled={emailBusy}>
                      <Text style={styles.outlineBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
              {!!emailMsg && <Text style={[styles.msg, { color: emailMsg.ok ? colors.success : colors.error }]}>{emailMsg.text}</Text>}
            </View>
          )}
        </View>

        {/* NOTIFICATION PREFERENCES */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Notification Preferences</Text>
          {!!notifError && <Text style={[styles.msg, { color: colors.error, marginBottom: 8 }]}>{notifError}</Text>}

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Email Notifications</Text>
              <Text style={styles.note}>Receive weekly performance reports.</Text>
            </View>
            <Switch
              value={vendor.email_notifications_enabled !== false}
              disabled={emailNotifSaving}
              onValueChange={(v) => saveSwitch("email_notifications_enabled", v)}
              trackColor={{ false: "#3a3a3a", true: colors.primary }}
              thumbColor="#fff"
            />
          </View>

          <View style={[styles.switchRow, { marginBottom: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Lead Alerts</Text>
              <Text style={styles.note}>Instant notification when a customer clicks "Call" or "WhatsApp".</Text>
            </View>
            <Switch
              value={vendor.lead_alerts_enabled !== false}
              disabled={leadAlertsSaving}
              onValueChange={(v) => saveSwitch("lead_alerts_enabled", v)}
              trackColor={{ false: "#3a3a3a", true: colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* PRIVACY */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Privacy</Text>
          <AnalyticsOptOut />
          <LegalLinks />
        </View>

        {/* DANGER ZONE */}
        <View style={[styles.card, styles.dangerCard]}>
          <Text style={[styles.cardTitle, { color: colors.error }]}>Danger Zone</Text>
          <Text style={styles.rowTitle}>Permanently disable your business listing and vendor access on Spotlight.</Text>
          <View style={styles.warnBox}>
            <Text style={styles.note}>
              Closing your account will immediately disable your vendor access and remove your public profile from Spotlight. Your subscription remains non-refundable and all payments are final.
              {"\n\n"}
              You have 14 days to restore your account. After that the closure is final and cannot be undone. Within 30 days after that, all your data is permanently erased, apart from invoices and payment receipts that we are required to keep for accounting and reporting.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.dangerBtn, (isClosing || closeBusy) && { opacity: 0.6 }]}
            disabled={isClosing || closeBusy}
            onPress={confirmClose}
          >
            <Text style={styles.dangerBtnText}>{isClosing ? "Closure Scheduled" : closeBusy ? "Scheduling..." : "Close Account"}</Text>
          </TouchableOpacity>

          {isClosing && (
            <View style={styles.warnBox}>
              <Text style={styles.note}>
                Your account is scheduled for closure on {deletionDate ? deletionDate.toLocaleDateString() : "—"}. Restore it before this date to keep it. After that date the closure is final, and your data is permanently erased by {deletionDate ? new Date(deletionDate.getTime() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString() : "—"}.
              </Text>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 10, alignSelf: "flex-start" }]} onPress={confirmRestore} disabled={closeBusy}>
                <Text style={styles.primaryBtnText}>{closeBusy ? "Restoring..." : "Restore Account"}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAwareScroll>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 20, paddingTop: 50 },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 20, paddingTop: 50, paddingBottom: 60 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  back: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontSize: 22, fontWeight: "700", marginBottom: 14 },
  empty: { color: colors.textSecondary, fontSize: 14, textAlign: "center", marginTop: 40 },
  card: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 14 },
  dangerCard: { borderColor: colors.error },
  cardTitle: { color: colors.white, fontSize: 16, fontWeight: "700", marginBottom: 12 },
  rowTitle: { color: colors.white, fontSize: 14, fontWeight: "600" },
  emailValue: { color: colors.primary, fontSize: 14, marginTop: 4 },
  note: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },
  input: { backgroundColor: "#0a0a0a", borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.white, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16 },
  primaryBtnText: { color: colors.black, fontWeight: "700", fontSize: 13 },
  outlineBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 16, alignSelf: "flex-start", marginTop: 12 },
  outlineBtnText: { color: colors.white, fontWeight: "600", fontSize: 13 },
  msg: { fontSize: 12, marginTop: 10 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  warnBox: { backgroundColor: "#1a1111", borderWidth: 1, borderColor: "#3a1f1f", borderRadius: 8, padding: 12, marginTop: 12 },
  dangerBtn: { borderWidth: 1, borderColor: colors.error, borderRadius: 8, paddingVertical: 11, alignItems: "center", marginTop: 14 },
  dangerBtnText: { color: colors.error, fontWeight: "700", fontSize: 14 },
});
