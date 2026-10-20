// ===============================================================
// src/screens/auth/CustomerLoginScreen.tsx
//
// Mirrors spotlightwebproject_staging/spotlight-next/src/app/(main)/
// customer-login/page.tsx's core login logic. The website's "setup
// mode" (attaching a customer profile to an existing vendor's auth
// identity mid-signup) is signup-flow territory, not login — left
// out here deliberately; it belongs with the Phase 1 customer
// signup screen, not bolted onto login.
// ===============================================================

import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import KeyboardAwareScroll from "../../components/KeyboardAwareScroll";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { supabase } from "../../lib/supabase";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "CustomerLogin">;

export default function CustomerLoginScreen() {
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

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError || !data.user) {
      setError(authError?.message || "Invalid email or password.");
      setLoading(false);
      return;
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("id, name")
      .eq("auth_user_id", data.user.id)
      .maybeSingle();

    if (!customer) {
      setError("No customer account found for this email. If you signed up as a vendor, use Vendor Login instead.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }

    navigation.replace("CustomerDashboard");
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
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Log in to see your favorite vendors and reviews</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
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

        <TouchableOpacity onPress={() => navigation.navigate("CustomerSignup")}>
          <Text style={styles.footerLink}>Don't have an account? Sign up</Text>
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
  footerLink: { color: colors.primary, fontSize: 13, textAlign: "center", marginTop: 16 },
});
