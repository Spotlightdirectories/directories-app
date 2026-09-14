// ===============================================================
// src/screens/vendor/PortfolioScreen.tsx
//
// Ported faithfully from spotlightwebproject_staging/spotlight-next/
// src/app/(standalone)/vendordashboard/PortfolioTab.tsx.
//
// Real differences from Products/Services, preserved here:
// - Flat cap of 6 items for every vendor -- no plan-tier lookup
// - No images at all -- identity comes from an auto-generated
//   initials avatar, never a photo (Cyril's explicit decision after
//   a generic logo placeholder "did not look professional")
// - "Request recommendation from client" -- sends a one-time link
//   via the same send-email Edge Function web uses; the client fills
//   it out on a public WEB page regardless of whether the vendor
//   used app or web to send the request (this is inherent to email
//   links, not a platform gap)
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type PortfolioItem = {
  id: string; title: string; description: string | null; client_name: string | null; completed_on: string | null;
};
type PendingItem = { title: string; description: string; client_name: string; completed_on: string };
type RecommendationRequest = {
  id: string; portfolio_item_id: string; status: "pending" | "submitted" | "expired";
  recommender_email: string; recommender_name: string | null; recommender_company: string | null; message: string | null;
};

const PORTFOLIO_LIMIT = 6;

function getInitials(source: string): string {
  return (source || "").split(" ").map((p) => p.charAt(0)).join("").substring(0, 2).toUpperCase() || "?";
}

function formatCompletedDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

export default function PortfolioScreen() {
  const navigation = useNavigation();
  const [vendor, setVendor] = useState<{ id: string; name: string } | null>(null);
  const [savedItems, setSavedItems] = useState<PortfolioItem[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [recommendations, setRecommendations] = useState<Record<string, RecommendationRequest>>({});
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [requestEmail, setRequestEmail] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientName, setClientName] = useState("");
  const [completedOn, setCompletedOn] = useState("");

  const totalCount = savedItems.length + pendingItems.length;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: v } = await supabase.from("vendors").select("id, name").eq("auth_user_id", user.id).maybeSingle();
      if (!v) { setLoading(false); return; }
      setVendor(v);

      const { data: items } = await supabase.from("vendor_portfolio_items").select("*").eq("vendor_id", v.id).order("display_order", { ascending: true });
      setSavedItems(items || []);

      const { data: recs } = await supabase.from("vendor_recommendation_requests").select("id, portfolio_item_id, status, recommender_email, recommender_name, recommender_company, message").eq("vendor_id", v.id);
      const byItem: Record<string, RecommendationRequest> = {};
      for (const row of recs || []) byItem[row.portfolio_item_id] = row;
      setRecommendations(byItem);

      setLoading(false);
    }
    load();
  }, []);

  function resetForm() {
    setTitle(""); setDescription(""); setClientName(""); setCompletedOn("");
    setEditingId(null);
  }

  function handleAddToPending() {
    if (!title.trim()) { Alert.alert("Missing info", "A project title is required."); return; }
    if (totalCount >= PORTFOLIO_LIMIT) { Alert.alert("Limit reached", `You can add up to ${PORTFOLIO_LIMIT} portfolio items.`); return; }

    setPendingItems((prev) => [...prev, {
      title: title.trim(), description: description.trim(), client_name: clientName.trim(), completed_on: completedOn.trim(),
    }]);
    resetForm();
  }

  function handleRemovePending(index: number) {
    setPendingItems((prev) => prev.filter((_, i) => i !== index));
  }

  function handleEditSaved(item: PortfolioItem) {
    setEditingId(item.id);
    setFormOpen(true);
    setTitle(item.title || "");
    setDescription(item.description || "");
    setClientName(item.client_name || "");
    setCompletedOn(/^\d{4}-\d{2}-\d{2}$/.test(item.completed_on || "") ? item.completed_on! : "");
  }

  async function handleDeleteSaved(id: string) {
    Alert.alert("Delete portfolio item?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          const { error } = await supabase.from("vendor_portfolio_items").delete().eq("id", id);
          if (error) { Alert.alert("Error", "Unable to delete portfolio item."); return; }
          setSavedItems((prev) => prev.filter((p) => p.id !== id));
          if (editingId === id) resetForm();
        },
      },
    ]);
  }

  async function handleSave() {
    if (!editingId && !pendingItems.length) {
      Alert.alert("Nothing to save", "Add at least one portfolio item first.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from("vendor_portfolio_items").update({
          title: title.trim(), description: description.trim(), client_name: clientName.trim() || null, completed_on: completedOn.trim() || null,
        }).eq("id", editingId);
        if (error) throw error;

        setSavedItems((prev) => prev.map((p) => p.id === editingId ? {
          ...p, title: title.trim(), description: description.trim(), client_name: clientName.trim() || null, completed_on: completedOn.trim() || null,
        } : p));
        resetForm();
        Alert.alert("Updated", "Portfolio item updated successfully.");
        return;
      }

      const payload = pendingItems.map((p, index) => ({
        vendor_id: vendor!.id, title: p.title, description: p.description || null,
        client_name: p.client_name || null, completed_on: p.completed_on || null,
        display_order: savedItems.length + index,
      }));
      const { data, error } = await supabase.from("vendor_portfolio_items").insert(payload).select();
      if (error) throw error;

      setSavedItems((prev) => [...prev, ...(data || [])]);
      setPendingItems([]);
      Alert.alert("Saved", "Portfolio saved successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Unable to save portfolio items.");
    } finally {
      setSaving(false);
    }
  }

  function openRequestForm(itemId: string) {
    setRequestingId(itemId);
    setRequestEmail("");
  }

  async function handleSendRequest(item: PortfolioItem) {
    const email = requestEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert("Invalid email", "Enter a valid email address for the client.");
      return;
    }
    setSendingRequest(true);
    try {
      const { data, error } = await supabase.from("vendor_recommendation_requests").insert({
        vendor_id: vendor!.id, portfolio_item_id: item.id, recommender_email: email,
      }).select().single();
      if (error) throw error;

      const link = `https://spotlightdirectories.com/recommend/${data.token}`;
      const emailResponse = await fetch("https://gyvzmktavyrevfxnwsay.supabase.co/functions/v1/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: email,
          subject: `${vendor!.name} would like your recommendation`,
          html: `<p>${vendor!.name} has asked you to leave a recommendation for the work "${item.title}". Click here to write it: <a href="${link}">${link}</a></p>`,
        }),
      });

      if (!emailResponse.ok) {
        Alert.alert("Request saved", `The request was saved, but the email may not have sent. You can share this link with your client directly:\n\n${link}`);
      } else {
        Alert.alert("Sent", "Request sent — you'll see it here once your client responds.");
      }
      setRecommendations((prev) => ({ ...prev, [item.id]: data }));
      setRequestingId(null);
      setRequestEmail("");
    } catch (err: any) {
      Alert.alert("Error", err?.message?.includes("vendor_recommendation_requests")
        ? "Recommendations aren't set up on the database yet."
        : "Unable to send the request. Please try again.");
    } finally {
      setSendingRequest(false);
    }
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!vendor) return <View style={styles.center}><Text style={styles.emptyText}>Vendor account not found.</Text></View>;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <SpotlightMark size={20} />
        <TouchableOpacity style={styles.addBtn} onPress={() => setFormOpen((v) => !v)}>
          <FontAwesome6 name="plus" size={12} color={colors.black} />
          <Text style={styles.addBtnText}>Add Portfolio Item</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.title}>Portfolio</Text>
        <Text style={styles.subtitle}>Showcase past work for prospects — a CV for your business. Up to {PORTFOLIO_LIMIT} items, shown 2 at a time on your public profile with a "See More" to reveal the rest.</Text>
        <Text style={styles.limitText}>{totalCount} / {PORTFOLIO_LIMIT} used</Text>

        {formOpen && (
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Project title</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="A short name for the job, e.g. Office rebrand for Acme Ltd" placeholderTextColor={colors.textSecondary} />

            <Text style={styles.fieldLabel}>What did you do?</Text>
            <TextInput style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} multiline placeholder="Explain the work, your approach, or the result — don't just repeat the title above" placeholderTextColor={colors.textSecondary} />

            <Text style={styles.fieldLabel}>Client / company (optional)</Text>
            <TextInput style={styles.input} value={clientName} onChangeText={setClientName} placeholder="e.g. Acme Ltd" placeholderTextColor={colors.textSecondary} />

            <Text style={styles.fieldLabel}>Completed on (optional)</Text>
            <TextInput style={styles.input} value={completedOn} onChangeText={setCompletedOn} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textSecondary} />

            <TouchableOpacity style={styles.addToPendingBtn} onPress={handleAddToPending} disabled={!!editingId}>
              <Text style={styles.addToPendingText}>{editingId ? "Editing..." : "Add"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {pendingItems.map((item, i) => (
          <View key={i} style={styles.pill}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(item.client_name || item.title)}</Text></View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.pillName}>{item.title}</Text>
              {item.description ? <Text style={styles.pillDescription}>{item.description}</Text> : null}
              {(item.client_name || item.completed_on) && (
                <Text style={styles.pillMeta}>{[item.client_name, item.completed_on && `Completed: ${formatCompletedDate(item.completed_on)}`].filter(Boolean).join(" · ")}</Text>
              )}
            </View>
            <TouchableOpacity onPress={() => handleRemovePending(i)}><FontAwesome6 name="xmark" size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Saved Portfolio Items</Text>
        {savedItems.length === 0 ? (
          <Text style={styles.emptyText}>No saved portfolio items yet.</Text>
        ) : (
          savedItems.map((item) => {
            const rec = recommendations[item.id];
            return (
              <View key={item.id} style={styles.savedCard}>
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(item.client_name || item.title)}</Text></View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.pillName}>{item.title}</Text>
                    <Text style={styles.pillDescription}>{(item.description || "").length > 200 ? `${(item.description || "").slice(0, 200)}...` : item.description || ""}</Text>
                    {(item.client_name || item.completed_on) && (
                      <Text style={styles.pillMeta}>{[item.client_name, item.completed_on && `Completed: ${formatCompletedDate(item.completed_on)}`].filter(Boolean).join(" · ")}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => handleEditSaved(item)} style={{ marginRight: 12 }}><Text style={styles.editLink}>Edit</Text></TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteSaved(item.id)}><FontAwesome6 name="xmark" size={18} color={colors.error} /></TouchableOpacity>
                </View>

                <View style={styles.recSection}>
                  {!rec && requestingId !== item.id && (
                    <TouchableOpacity onPress={() => openRequestForm(item.id)}>
                      <Text style={styles.recRequestLink}>✉ Request recommendation from client</Text>
                    </TouchableOpacity>
                  )}
                  {!rec && requestingId === item.id && (
                    <View style={styles.recRequestForm}>
                      <TextInput style={styles.input} value={requestEmail} onChangeText={setRequestEmail} placeholder="Client's email address" placeholderTextColor={colors.textSecondary} keyboardType="email-address" autoCapitalize="none" />
                      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                        <TouchableOpacity style={styles.recSendBtn} onPress={() => handleSendRequest(item)} disabled={sendingRequest}>
                          <Text style={styles.recSendBtnText}>{sendingRequest ? "Sending..." : "Send"}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.recCancelBtn} onPress={() => setRequestingId(null)}>
                          <Text style={styles.recCancelBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                  {rec && rec.status === "pending" && (
                    <Text style={styles.recPending}>🕐 Recommendation requested from {rec.recommender_email} — awaiting their response.</Text>
                  )}
                  {rec && rec.status === "submitted" && (
                    <Text style={styles.recSubmitted}>
                      ✓ Verified recommendation from {rec.recommender_name}{rec.recommender_company ? ` (${rec.recommender_company})` : ""}:{" "}
                      <Text style={styles.recSubmittedQuote}>"{rec.message}"</Text>
                    </Text>
                  )}
                </View>
              </View>
            );
          })
        )}

        {(pendingItems.length > 0 || editingId) && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? (editingId ? "Updating..." : "Saving...") : editingId ? "Update Item" : "Save Portfolio"}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 50 },
  back: { color: colors.primary, fontSize: 15 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: colors.black, fontWeight: "700", fontSize: 12 },

  title: { color: colors.white, fontSize: 20, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, lineHeight: 18 },
  limitText: { color: colors.primary, fontSize: 12, fontWeight: "600", marginTop: 8, marginBottom: 16 },

  formCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 20 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 12, marginBottom: 6 },
  input: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14 },

  addToPendingBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 20 },
  addToPendingText: { color: colors.black, fontWeight: "700" },

  pill: { flexDirection: "row", alignItems: "flex-start", backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  savedCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 12, marginBottom: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#1e3a8a", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#dbeafe", fontSize: 13, fontWeight: "700" },
  pillName: { color: colors.white, fontSize: 14, fontWeight: "600" },
  pillDescription: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  pillMeta: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
  editLink: { color: colors.primary, fontSize: 12, fontWeight: "700" },

  recSection: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  recRequestLink: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  recRequestForm: { marginTop: 4 },
  recSendBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  recSendBtnText: { color: colors.black, fontWeight: "700", fontSize: 12 },
  recCancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  recCancelBtnText: { color: colors.textSecondary, fontSize: 12 },
  recPending: { color: colors.textSecondary, fontSize: 12 },
  recSubmitted: { color: colors.success, fontSize: 12, lineHeight: 18 },
  recSubmittedQuote: { color: colors.textSecondary, fontWeight: "400" },

  sectionTitle: { color: colors.white, fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 10 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  saveBtnText: { color: colors.black, fontWeight: "700" },
});
