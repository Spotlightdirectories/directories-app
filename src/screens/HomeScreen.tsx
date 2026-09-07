// ===============================================================
// src/screens/HomeScreen.tsx
//
// Phase 0 placeholder screen — not the real homepage design yet
// (that's Phase 1). Its actual job right now is to prove the
// Supabase connection genuinely works end-to-end on a real device,
// and now also to reach the login flow for testing.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "Home">;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [count, setCount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    async function testConnection() {
      const { count, error } = await supabase
        .from("categories")
        .select("*", { count: "exact", head: true });

      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }

      setCount(count);
      setStatus("success");
    }

    testConnection();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Spotlight</Text>
      <Text style={styles.tagline}>Find. Trust. Connect.</Text>

      <View style={styles.statusBox}>
        {status === "loading" && (
          <>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.statusText}>Connecting to Supabase...</Text>
          </>
        )}
        {status === "success" && (
          <>
            <Text style={styles.successText}>✓ Connected</Text>
            <Text style={styles.statusText}>{count} categories found in the database</Text>
          </>
        )}
        {status === "error" && (
          <>
            <Text style={styles.errorText}>✗ Connection failed</Text>
            <Text style={styles.statusText}>{errorMsg}</Text>
          </>
        )}
      </View>

      <TouchableOpacity
        style={styles.loginButton}
        onPress={() => navigation.navigate("AccountType")}
      >
        <Text style={styles.loginButtonText}>Log In (test auth)</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  logo: {
    color: colors.white,
    fontSize: 32,
    fontWeight: "700",
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: 14,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 40,
  },
  statusBox: {
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  successText: {
    color: colors.success,
    fontSize: 16,
    fontWeight: "600",
  },
  errorText: {
    color: colors.error,
    fontSize: 16,
    fontWeight: "600",
  },
  loginButton: {
    marginTop: 48,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  loginButtonText: {
    color: colors.primary,
    fontWeight: "600",
    fontSize: 14,
  },
});
