// ===============================================================
// src/components/FounderBadge.tsx
//
// Founders 1000 badge: gold "1KF" on black. Goes BEFORE the verified
// badge, for the first 1,000 vendors (Spot-ID number 1-1000, stored
// in vendors.is_founder). No number is shown on purpose.
// Tapping explains it (the web shows the same text on hover).
//
// Pass `show` when the screen already knows, or pass the vendor's
// `slug` and the badge looks it up itself (cached).
// ===============================================================

import { useEffect, useState } from "react";
import { Text, TouchableOpacity, Alert } from "react-native";
import { supabase } from "../lib/supabase";

const cache = new Map<string, Promise<boolean>>();

function lookup(slug: string): Promise<boolean> {
  let p = cache.get(slug);
  if (!p) {
    p = Promise.resolve(
      supabase.from("vendors").select("is_founder").eq("slug", slug).maybeSingle()
    ).then(({ data }: any) => !!data?.is_founder, () => false);
    cache.set(slug, p);
  }
  return p;
}

export default function FounderBadge({
  show, slug, size = 18,
}: { show?: boolean | null; slug?: string | null; size?: number }) {
  const [found, setFound] = useState(false);
  useEffect(() => {
    if (show !== undefined && show !== null) return;
    if (!slug) return;
    let alive = true;
    lookup(slug).then((v) => { if (alive) setFound(v); });
    return () => { alive = false; };
  }, [show, slug]);

  const on = show !== undefined && show !== null ? show : found;
  if (!on) return null;
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => Alert.alert("Founders 1000", "One of the first 1,000 vendors to join Spotlight Directories.")}
      accessibilityRole="button"
      accessibilityLabel="Founders 1000"
      style={{
        height: size,
        paddingHorizontal: Math.round(size * 0.33),
        borderRadius: size,
        backgroundColor: "#000",
        borderWidth: 1,
        borderColor: "#F2C94C",
        shadowColor: "#FFC828",
        shadowOpacity: 0.95,
        shadowRadius: 7,
        shadowOffset: { width: 0, height: 0 },
        elevation: 6,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 6,
      }}
    >
      <Text style={{ color: "#FFD84D", fontSize: Math.round(size * 0.55), fontWeight: "800", letterSpacing: 0.5, textShadowColor: "rgba(255,200,40,0.9)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 } }}>1KF</Text>
    </TouchableOpacity>
  );
}
