// ===============================================================
// src/screens/auth/AccountTypeScreen.tsx
//
// Entry point matching the website navbar's exact split — Vendor
// Login vs Customer Login as two separate, deliberate choices, not
// one generic login form. Mirrors the same pattern used throughout
// the website today (Navbar.tsx's account dropdown).
//
// Bug fix, 2026-09-10 per Cyril: Back used to be position:"absolute"
// inside a justifyContent:"center" container -- the centered content
// could land on the same coordinates as the absolutely-positioned
// button, leaving it visually buried and unclickable. Rebuilt with a
// normal-flow header row above the centered content instead, same
// pattern already proven correct on the Vendor Core screens.
// ===============================================================

import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../navigation/RootNavigator";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Nav = NativeStackNavigationProp<RootStackParamList, "AccountType">;

export default function AccountTypeScreen() {
  const navigation = useNavigation<Nav>();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </TouchableOpacity>
        <SpotlightMark size={22} />
      </View>

      <View style={styles.centeredContent}>
        <Text style={styles.title}>Log In</Text>
        <Text style={styles.subtitle}>Choose which kind of account you have</Text>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate("VendorLogin")}
        >
          <Text style={styles.optionIcon}>🏪</Text>
          <Text style={styles.optionTitle}>Vendor Login</Text>
          <Text style={styles.optionSubtitle}>Manage your business listing</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.optionCard}
          onPress={() => navigation.navigate("CustomerLogin")}
        >
          <Text style={styles.optionIcon}>👤</Text>
          <Text style={styles.optionTitle}>Customer Login</Text>
          <Text style={styles.optionSubtitle}>Favorites, reviews & search history</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.dark,
    padding: 24,
    paddingTop: 50,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  back: {
    color: colors.primary,
    fontSize: 15,
  },
  centeredContent: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    color: colors.white,
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 32,
  },
  optionCard: {
    backgroundColor: "#141414",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  optionIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  optionTitle: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "600",
  },
  optionSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
});
