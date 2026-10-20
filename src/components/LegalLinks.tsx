// Links to the website's Privacy Policy and Terms (they open in the phone's browser).
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { openWebPage } from "../lib/webHandoff";
import { colors } from "../theme/colors";

export default function LegalLinks() {
  return (
    <View style={styles.row}>
      <TouchableOpacity onPress={() => openWebPage("/privacy")}><Text style={styles.link}>Privacy Policy</Text></TouchableOpacity>
      <Text style={styles.dot}>•</Text>
      <TouchableOpacity onPress={() => openWebPage("/terms")}><Text style={styles.link}>Terms</Text></TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 8 },
  link: { color: colors.primary, fontSize: 12, fontWeight: "600" },
  dot: { color: colors.textSecondary, fontSize: 12 },
});
