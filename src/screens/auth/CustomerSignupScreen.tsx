// ===============================================================
// src/screens/auth/CustomerSignupScreen.tsx
//
// Mirrors spotlightwebproject_staging/spotlight-next/src/app/(main)/
// customer-signup/page.tsx exactly: name, email, phone (optional),
// password -> auth.signUp() -> insert customers row. Welcome email
// left out here (fire-and-forget on web, calling an Edge Function
// directly) -- not essential to account creation working, and kept
// out to avoid duplicating email-sending logic across two codebases
// for a non-critical nicety.
//
// The "already registered" -> setup-mode link (attaching a customer
// profile to an existing vendor identity) is preserved, pointing to
// CustomerLogin with the same params web uses.
// ===============================================================

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Linking } from "react-native";
import KeyboardAwareScroll from "../../components/KeyboardAwareScroll";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "CustomerSignup">;

export default function CustomerSignupScreen() {
  const navigation = useNavigation<Nav>();
  // Set when a visitor was sent here from "Request a Quote" or similar.
  const route = useRoute<RouteProp<RootStackParamList, "CustomerSignup">>();
  const fromAction = route.params?.reason === "continue";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  // "customer" = email already has a customer account; "vendor" = email belongs to a vendor account
  const [alreadyRegistered, setAlreadyRegistered] = useState<null | "customer" | "vendor">(null);

  async function handleSubmit() {
    if (submitting) return;
    if (!fullName.trim() || !email.trim() || !password) {
      setError("All fields are required.");
      return;
    }

    setSubmitting(true);
    setError("");
    setAlreadyRegistered(null);

    // Check first, so we can say exactly what is already used.
    try {
      const { data: avail } = await supabase.rpc("check_signup_availability", { p_email: email.trim(), p_name: "" });
      const a = (avail || {}) as { email_vendor?: boolean; email_customer?: boolean };
      if (a.email_customer) {
        setAlreadyRegistered("customer");
        setError("This email address has already been used to register a customer account. Please log in instead.");
        setSubmitting(false);
        return;
      }
      if (a.email_vendor) {
        setAlreadyRegistered("vendor");
        setError("This email address has already been used to register a vendor account. To add a customer profile to it, continue on our website and log in with your vendor password.");
        setSubmitting(false);
        return;
      }
    } catch { /* if the check fails, sign-up below still protects against duplicates */ }

    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });

    if (authError) {
      const alreadyRegisteredError = /already registered/i.test(authError.message || "");
      if (alreadyRegisteredError) {
        setAlreadyRegistered("customer");
        setError("This email address has already been used to register an account on Spotlight. Please log in instead.");
      } else {
        setError(authError.message);
      }
      setSubmitting(false);
      return;
    }

    const { error: customerError } = await supabase.from("customers").insert([
      {
        auth_user_id: data.user!.id,
        name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
      },
    ]);

    if (customerError) {
      setError(customerError.message);
      setSubmitting(false);
      return;
    }

    // Remember why they signed up, so after confirming their email and
    // logging in they are taken back to the page they started from.
    if (fromAction) { try { await AsyncStorage.setItem("spotlight_after_signup", "1"); } catch { /* ignore */ } }

    setSubmitting(false);
    setSuccess(true);
  }

  if (success) {
    return (
      <View style={styles.container}>
        <FontAwesome6 name="envelope-circle-check" size={40} color={colors.success} />
        <Text style={styles.successTitle}>Check your email</Text>
        <Text style={styles.successText}>
          We've sent a confirmation link to your email address. Click it to activate your account, then log in.
        </Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate("CustomerLogin", fromAction ? { reason: "continue" } : undefined)}>
          <Text style={styles.buttonText}>Go to Login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAwareScroll style={{ flex: 1, backgroundColor: colors.dark }} contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: 60 }}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
      </View>
      <Text style={styles.title}>Create your account</Text>
      <Text style={styles.subtitle}>
        {fromAction ? "Create a free customer account to continue." : "Save your favorite vendors and manage your reviews in one place"}
      </Text>

      <Text style={styles.label}>Full name</Text>
      <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholderTextColor={colors.textSecondary} />

      <Text style={styles.label}>Email</Text>
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholderTextColor={colors.textSecondary} />

      <Text style={styles.label}>Phone number <Text style={styles.optional}>(optional)</Text></Text>
      <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+2348021234567" keyboardType="phone-pad" placeholderTextColor={colors.textSecondary} />
      <Text style={styles.helper}>Only shared with a vendor when you request a visit, so they can confirm it's really you.</Text>

      <Text style={styles.label}>Password</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          placeholderTextColor={colors.textSecondary}
        />
        <TouchableOpacity style={styles.eyeButton} onPress={() => setShowPassword((v) => !v)}>
          <FontAwesome6 name={showPassword ? "eye-slash" : "eye"} size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{error}</Text>
          {alreadyRegistered === "customer" && (
            <TouchableOpacity onPress={() => navigation.navigate("CustomerLogin", fromAction ? { reason: "continue" } : undefined)}>
              <Text style={styles.link}>Log in</Text>
            </TouchableOpacity>
          )}
          {alreadyRegistered === "vendor" && (
            <TouchableOpacity onPress={() => Linking.openURL("https://spotlightdirectories.com/customer-signup")}>
              <Text style={styles.link}>Continue on the website</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.black} /> : <Text style={styles.buttonText}>Create Account</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate("CustomerLogin", fromAction ? { reason: "continue" } : undefined)}>
        <Text style={styles.footerLink}>Already have an account? Log in</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate("VendorLogin")}>
        <Text style={styles.footerLink}>Own a business? Sign up as a vendor on our website</Text>
      </TouchableOpacity>
    </KeyboardAwareScroll>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark, padding: 24, paddingTop: 60 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  backText: { color: colors.primary, fontSize: 15 },
  title: { color: colors.white, fontSize: 24, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4, marginBottom: 20 },
  errorBox: { marginTop: 20, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.error, backgroundColor: "rgba(239,68,68,0.1)" },
  error: { color: colors.error, fontSize: 13, lineHeight: 19 },
  link: { color: colors.primary, fontSize: 13, fontWeight: "700", marginTop: 8 },
  label: { color: colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 12 },
  optional: { fontWeight: "400", color: colors.textSecondary },
  helper: { color: colors.textSecondary, fontSize: 11, marginTop: 4 },
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
  passwordInput: { flex: 1, padding: 12, color: colors.white, fontSize: 15 },
  eyeButton: { paddingHorizontal: 12 },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: { color: colors.black, fontWeight: "700", fontSize: 15 },
  footerLink: { color: colors.primary, fontSize: 13, textAlign: "center", marginTop: 16 },
  successTitle: { color: colors.white, fontSize: 20, fontWeight: "700", marginTop: 16, textAlign: "center" },
  successText: { color: colors.textSecondary, fontSize: 13, textAlign: "center", marginTop: 10, lineHeight: 19 },
});
