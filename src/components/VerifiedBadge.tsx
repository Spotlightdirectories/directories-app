// ===============================================================
// src/components/VerifiedBadge.tsx
//
// The real Spotlight verification badges (same two image files the
// website uses: bluebadge.png and graybadge.png). Tapping a badge
// explains what it means (the web shows the same text on hover).
// Shows nothing for vendors with no verification.
// ===============================================================

import { Image, TouchableOpacity, Alert } from "react-native";

const BLUE = require("../../assets/badges/bluebadge.png");
const GRAY = require("../../assets/badges/graybadge.png");

export default function VerifiedBadge({ status, size = 16 }: { status?: string | null; size?: number }) {
  if (status !== "blue" && status !== "gray") return null;
  const label = status === "blue" ? "Verified Business" : "Verified Identity";
  const explanation =
    status === "blue"
      ? "Official business documents reviewed by Spotlight. This vendor operates a registered and credible business."
      : "Business owner identity confirmed.";
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      onPress={() => Alert.alert(label, explanation)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Image source={status === "blue" ? BLUE : GRAY} style={{ width: size, height: size }} resizeMode="contain" />
    </TouchableOpacity>
  );
}
