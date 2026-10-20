// ===============================================================
// src/components/AiDescribeModal.tsx
//
// App port of spotlightwebproject_staging/spotlight-next/src/
// components/AiDescribeModal.tsx -- same 3 guided hint questions
// (type-specific: business/product/service), same generate-
// description Edge Function, same word-limit toast on success.
// Reusable across Products, Services, and later Profile.
// ===============================================================

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from "react-native";
import { KeyboardAvoidingView as KAV, ScrollView } from "react-native";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

export type AiDescribeType = "business" | "product" | "service";

type HintConfig = {
  q1: { label: string; nudge: string; placeholder: string };
  q2: { label: string; nudge: string; placeholder: string };
  q3: { label: string; nudge: string; placeholder: string };
};

const HINT_CONFIG: Record<AiDescribeType, HintConfig> = {
  business: {
    q1: { label: "What makes your business different?", nudge: "Think: something a competitor in your category can't easily copy. Or something special about your business", placeholder: "e.g. family-owned since 2015, same-day delivery" },
    q2: { label: "What you're known for", nudge: "The one thing customers always compliment or like that make them come back to patronize your business.", placeholder: "e.g. reliable customer service, quality products" },
    q3: { label: "Typical customer (optional)", nudge: "Who are your customers? Eg Schools? Businesses? Adults? Mothers? etc.", placeholder: "e.g. small businesses, young professionals" },
  },
  product: {
    q1: { label: "Key features or what's included", nudge: "List what's special about your product — material, size, what's in the pack, carton.", placeholder: "e.g. genuine leather, adjustable straps, 1-year warranty" },
    q2: { label: "What problem it solves / why buy it", nudge: "Finish the sentence: 'Why do customers buy your product?'", placeholder: "e.g. built to last for daily use, great for gifting" },
    q3: { label: "Who it's for (optional)", nudge: "Who are your customers? Ladies? Men, Unisex? Car owners? Builders? etc", placeholder: "e.g. professionals, students" },
  },
  service: {
    q1: { label: "What's included / how you deliver it", nudge: "How do you render your services? What is the process?", placeholder: "e.g. free consultation, same-day turnaround, on-site visits" },
    q2: { label: "What outcome customers get", nudge: "What do customers get after you have finished rendering the service? Why are you different?", placeholder: "e.g. spotless home, fully repaired AC" },
    q3: { label: "Ideal client (optional)", nudge: "Who books this most, or who should?", placeholder: "e.g. busy families, small offices" },
  },
};

const TITLE_MAP: Record<AiDescribeType, string> = {
  business: "Generate Business Description",
  product: "Generate Product Description",
  service: "Generate Service Description",
};

type Props = {
  visible: boolean;
  type: AiDescribeType;
  itemName?: string;
  onClose: () => void;
  onGenerated: (text: string, meta: { type: AiDescribeType; planTier?: string; limit?: number }) => void;
};

export default function AiDescribeModal({ visible, type, itemName, onClose, onGenerated }: Props) {
  const [differentiator, setDifferentiator] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [targetCustomer, setTargetCustomer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const config = HINT_CONFIG[type] || HINT_CONFIG.business;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-description", {
        body: {
          type,
          hints: {
            differentiator: differentiator.trim(),
            specialty: specialty.trim(),
            targetCustomer: targetCustomer.trim(),
          },
          itemName: itemName ? itemName.trim() : null,
        },
      });

      if (fnError || !data || data.error) {
        setError((data && data.error) || fnError?.message || "Generation failed. Please try again.");
        setSubmitting(false);
        return;
      }

      onGenerated(data.text, { type: data.type || type, planTier: data.planTier, limit: data.limit });
      setDifferentiator(""); setSpecialty(""); setTargetCustomer("");
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KAV style={styles.overlay} behavior="padding">
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{TITLE_MAP[type]}</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.close}>×</Text></TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>
          <Text style={styles.subtext}>A few short details help write something specific to you, not generic filler.</Text>

          <Text style={styles.label}>{config.q1.label}</Text>
          <Text style={styles.nudge}>{config.q1.nudge}</Text>
          <TextInput style={styles.input} value={differentiator} onChangeText={setDifferentiator} placeholder={config.q1.placeholder} placeholderTextColor={colors.textSecondary} />

          <Text style={styles.label}>{config.q2.label}</Text>
          <Text style={styles.nudge}>{config.q2.nudge}</Text>
          <TextInput style={styles.input} value={specialty} onChangeText={setSpecialty} placeholder={config.q2.placeholder} placeholderTextColor={colors.textSecondary} />

          <Text style={styles.label}>{config.q3.label}</Text>
          <Text style={styles.nudge}>{config.q3.nudge}</Text>
          <TextInput style={styles.input} value={targetCustomer} onChangeText={setTargetCustomer} placeholder={config.q3.placeholder} placeholderTextColor={colors.textSecondary} />

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} disabled={submitting}>
            {submitting ? <ActivityIndicator color={colors.black} /> : <Text style={styles.submitText}>Generate</Text>}
          </TouchableOpacity>
          </ScrollView>
        </View>
      </KAV>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  card: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 40, maxHeight: "85%" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.white, fontSize: 17, fontWeight: "700" },
  close: { color: colors.textSecondary, fontSize: 22 },
  subtext: { color: colors.textSecondary, fontSize: 12, marginTop: 6, marginBottom: 16 },
  label: { color: colors.white, fontSize: 13, fontWeight: "600", marginTop: 12 },
  nudge: { color: colors.textSecondary, fontSize: 11, marginTop: 2, marginBottom: 6 },
  input: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14 },
  error: { color: colors.error, fontSize: 12, marginTop: 12 },
  submitBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  submitText: { color: colors.black, fontWeight: "700" },
});
