// ===============================================================
// src/components/SpotlightMark.tsx
//
// Small brand mark for screens that don't have the full Home-screen
// logo -- lets a user glancing at any screen recognize "this is
// Spotlight" without a rigid, one-size-fits-all header. Cyril's ask
// (2026-09-09): "vary sensibly by screen, no hard and fast position,
// just so the user knows it's a Spotlight page."
//
// Deliberately just the icon, not the full wordmark -- most screens
// already have a title/back-button competing for header space, so a
// small square mark fits without crowding things out.
// ===============================================================

import { Image, StyleSheet, ImageStyle, StyleProp } from "react-native";

export default function SpotlightMark({ size = 22, style }: { size?: number; style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={{ uri: "https://spotlightdirectories.com/images/spotlightlogo-512.png" }}
      style={[{ width: size, height: size, borderRadius: size / 4 }, style]}
      resizeMode="contain"
    />
  );
}
