// ===============================================================
// src/screens/auth/LoggedInScreen.tsx
//
// Deliberately minimal — Phase 0's job is proving the auth flow
// itself works end-to-end (correct table checked, correct routing
// decision made), not building the real dashboard. That's Phase 2.
// This screen exists so today's testing has something concrete to
// confirm success against, without scope-creeping into screens that
// belong later.
// ===============================================================

import { View, Text, StyleSheet } from "react-native";
import { colors } from "../../theme/colors";

type Props = {
  route: { params: { role: "vendor" | "customer"; name: string } };
};

export default function LoggedInScreen({ route }: Props) {
  const { role, name } = route.params;

  return (
    <View style={styles.container}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.title}>Welcome, {name}</Text>
      <Text style={styles.subtitle}>
        Logged in as {role === "vendor" ? "a Vendor" : "a Customer"}
      </Text>
      <Text style={styles.note}>
        {role === "vendor" ? "Vendor Dashboard" : "Customer Dashboard"} screens
        are built in the next phase — this confirms login is fully
        working end-to-end.
      </Text>
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
  check: { color: colors.success, fontSize: 48, marginBottom: 16 },
  title: { color: colors.white, fontSize: 22, fontWeight: "700" },
  subtitle: { color: colors.primary, fontSize: 14, marginTop: 4, marginBottom: 24 },
  note: { color: colors.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 20 },
});
