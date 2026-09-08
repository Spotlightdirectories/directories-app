// ===============================================================
// src/screens/auth/LoggedInScreen.tsx
//
// Deliberately minimal — Phase 0's job is proving the auth flow
// itself works end-to-end, not building the real dashboard (Phase
// 2). "My Search History" is added here as a real, working exception
// since Cyril asked for it specifically, on both web and app, ahead
// of the rest of the customer dashboard.
// ===============================================================

import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "LoggedIn">;

type Props = {
  route: { params: { role: "vendor" | "customer"; name: string } };
};

export default function LoggedInScreen({ route }: Props) {
  const navigation = useNavigation<Nav>();
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
        are built in the next phase.
      </Text>

      {role === "customer" && (
        <>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate("Favorites")}
          >
            <Text style={styles.buttonText}>View My Favorites</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate("MyReviews")}
          >
            <Text style={styles.buttonText}>View My Reviews</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate("SearchHistory")}
          >
            <Text style={styles.buttonText}>View My Search History</Text>
          </TouchableOpacity>
        </>
      )}
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
  button: {
    marginTop: 32,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: { color: colors.primary, fontWeight: "600", fontSize: 14 },
});
