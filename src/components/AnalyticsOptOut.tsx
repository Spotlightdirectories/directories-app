// A single switch: "Visitor analytics" on/off for this phone.
// Off = no anonymous visitor code and no approximate location attached
// to what you view or search. Used in vendor Settings and the customer
// dashboard.
import { useEffect, useState } from "react";
import { View, Text, Switch, StyleSheet } from "react-native";
import { isAnalyticsOptedOut, setAnalyticsOptOut } from "../lib/analytics";
import { colors } from "../theme/colors";

export default function AnalyticsOptOut() {
  const [on, setOn] = useState(true);
  useEffect(() => { isAnalyticsOptedOut().then((off) => setOn(!off)); }, []);

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Visitor analytics</Text>
        <Text style={styles.note}>
          Attaches a random visitor code and your approximate state to what you view or search, so businesses can see anonymous totals. Turn off to stop this on this phone.
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={(v) => { setOn(v); setAnalyticsOptOut(!v); }}
        trackColor={{ false: "#3a3a3a", true: colors.primary }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: colors.white, fontSize: 14, fontWeight: "600" },
  note: { color: colors.textSecondary, fontSize: 12, marginTop: 2, lineHeight: 17 },
});
