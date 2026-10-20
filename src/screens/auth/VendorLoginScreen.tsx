// ===============================================================
// src/screens/auth/VendorLoginScreen.tsx
//
// Mirrors the exact routing logic from
// spotlightwebproject_staging/spotlight-next/src/app/(standalone)/
// login/page.tsx, branch for branch — but redirects differently
// per the locked mobile-app architecture:
//
// - No vendor row (needs signup), business_type not set, and
//   payment/pending/failed states → these are all Get Listed /
//   business-type / Subscription territory, which stay web-only.
//   The app hands off to the browser for these instead of trying to
//   replicate them.
// - Free plan or active paid plan → these ARE in-app territory
//   (Vendor Dashboard), so the app navigates in-app.
// ===============================================================

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import KeyboardAwareScroll from "../../components/KeyboardAwareScroll";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import { openWebPage } from "../../lib/webHandoff";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "VendorLogin">;

export default function VendorLoginScreen() {
  const navigation = useNavigation<Nav>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (loading) return;
    setLoading(true);
    setError("");

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !authData.user) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    const { data: vendor, error: vendorError } = await supabase
      .from("vendors")
      .select("*")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (vendorError) {
      setError("Error fetching vendor record.");
      setLoading(false);
      return;
    }

    // No vendor row → signup is web-only
    if (!vendor) {
      setError("No vendor account found. Please sign up on our website first.");
      setLoading(false);
      openWebPage("/getlisted");
      return;
    }

    if (vendor.account_status === "closed") {
      setError("Your account has been closed. Please contact support.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    // Business type setup is web-only
    if (!vendor.business_type) {
      setError("Please finish setting up your business type on our website.");
      setLoading(false);
      openWebPage("/business-type");
      return;
    }

    // Free plan → in-app dashboard
    if (vendor.plan_tier === "free") {
      navigation.replace("DashboardHome");
      return;
    }

    // Paid plan, payment not resolved → web-only
    if (vendor.subscription_status === "pending" || vendor.subscription_status === "failed") {
      setError("There's an issue with your payment. Please resolve it on our website.");
      setLoading(false);
      openWebPage(vendor.subscription_status === "pending" ? "/payment" : "/payment-failed");
      return;
    }

    // Active paid plan → in-app dashboard
    if (vendor.subscription_status === "active") {
      navigation.replace("DashboardHome");
      return;
    }

    // Fallback — same as website
    setError("Please complete your payment on our website.");
    setLoading(false);
    openWebPage("/payment");
  }

  return (
    <KeyboardAwareScroll style={{ flex: 1, backgroundColor: colors.dark }} contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 50 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
      </View>

      <View style={styles.centeredContent}>
        <Text style={styles.title}>Vendor Login</Text>
        <Text style={styles.subtitle}>Access your Spotlight dashboard</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          placeholder="you@business.com"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Your password"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
            <FontAwesome6 name={showPassword ? "eye-slash" : "eye"} size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.black} /> : <Text style={styles.buttonText}>Log In</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => openWebPage("/getlisted")}>
          <Text style={styles.link}>Don't have a vendor account? Get listed</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 24, paddingTop: 50 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  centeredContent: { flex: 1, justifyContent: "center" },
  backText: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontSize: 26, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 24 },
  error: { color: colors.error, fontSize: 13, marginBottom: 16 },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.white,
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    color: colors.white,
    fontSize: 15,
  },
  eyeButton: {
    paddingHorizontal: 12,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 24,
  },
  buttonText: { color: colors.black, fontWeight: "700", fontSize: 15 },
  link: { color: colors.primary, fontSize: 13, textAlign: "center", marginTop: 20 },
});
