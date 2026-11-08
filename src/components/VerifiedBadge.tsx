// ===============================================================
// src/components/VerifiedBadge.tsx
//
// The real Spotlight verification badges (same two image files the
// website uses: bluebadge.png and graybadge.png). Tapping a badge
// explains what it means (the web shows the same text on hover).
// Shows nothing for vendors with no verification.
// ===============================================================

import { Image } from "react-native";
import BadgeTip from "./BadgeTip";

const BLUE = require("../../assets/badges/bluebadge.png");
const GRAY = require("../../assets/badges/graybadge.png");

export default function VerifiedBadge({ status, size = 16 }: { status?: string | null; size?: number }) {
  if (status !== "blue" && status !== "gray") return null;
  return (
    <BadgeTip kind={status}>
      <Image source={status === "blue" ? BLUE : GRAY} style={{ width: size, height: size }} resizeMode="contain" />
    </BadgeTip>
  );
}
