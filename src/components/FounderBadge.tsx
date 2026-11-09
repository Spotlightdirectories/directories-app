// ===============================================================
// src/components/FounderBadge.tsx
//
// Founders 1000 badge: round gold laurel medal with "1KF". Goes BEFORE the verified
// badge, for the first 1,000 vendors (Spot-ID number 1-1000, stored
// in vendors.is_founder). No number is shown on purpose.
// Tapping explains it (the web shows the same text on hover).
//
// Pass `show` when the screen already knows, or pass the vendor's
// `slug` and the badge looks it up itself (cached).
// ===============================================================

import { useEffect, useState } from "react";
import { Image, View } from "react-native";
import BadgeTip from "./BadgeTip";
import { supabase } from "../lib/supabase";

const MEDAL = require("../../assets/badges/foundersbadge.png");

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
    <View style={{ marginRight: 4 }}>
      <BadgeTip kind="founder">
        <Image source={MEDAL} style={{ width: size, height: size }} resizeMode="contain" />
      </BadgeTip>
    </View>
  );
}
