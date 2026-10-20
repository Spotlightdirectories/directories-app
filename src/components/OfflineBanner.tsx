// Thin bar shown at the top when the phone has no connection to Spotlight.
// Hides itself as soon as a request succeeds, and re-checks every 10 seconds
// while visible so it clears even if the person isn't doing anything.
import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { subscribeOffline, reportOnline } from "../lib/offlineCache";
import { colors } from "../theme/colors";

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);

  useEffect(() => subscribeOffline(setOffline), []);

  useEffect(() => {
    if (!offline) return;
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "" },
        });
        if (res) reportOnline();
      } catch { /* still offline */ }
    }, 10000);
    return () => clearInterval(id);
  }, [offline]);

  if (!offline) return null;
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 6 }]}>
      <Text style={styles.text}>You're offline. Showing your last saved content.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.primary, paddingBottom: 6, paddingHorizontal: 12, alignItems: "center" },
  text: { color: colors.black, fontSize: 12, fontWeight: "700" },
});
