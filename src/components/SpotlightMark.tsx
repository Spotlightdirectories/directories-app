// ===============================================================
// src/components/SpotlightMark.tsx
//
// Brand mark shown on every screen that doesn't already have the
// full Home-screen logo -- lets a user glancing at any screen
// recognize "this is Spotlight." Corrected 2026-09-10 per Cyril:
// this was icon-only at first; the actual ask was icon + "Spotlight"
// wordmark together (same whitelogo3.png used on Home), not just the
// light-bulb icon alone. One component change here updates every
// screen that imports it -- kept the same `size` prop name every
// call site already uses (now used as the image's height, with
// width scaled to whitelogo3.png's actual proportions).
// ===============================================================

import { Image, StyleSheet, ImageStyle, StyleProp, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";

// Tapping the logo takes the user to the Home screen from any page
// (mirrors the web, where the logo links to "/"). Pass linkHome={false}
// on any screen where the logo should stay a plain, non-tappable image.
export default function SpotlightMark({ size = 20, style, linkHome = true }: { size?: number; style?: StyleProp<ImageStyle>; linkHome?: boolean }) {
  const navigation = useNavigation<any>();
  // whitelogo3.png's native proportions are roughly wide (icon +
  // wordmark side by side) -- width scales off the given size to
  // keep it from looking squashed at small sizes.
  const width = size * 4.2;
  const image = (
    <Image
      source={{ uri: "https://spotlightdirectories.com/images/whitelogo3.png" }}
      style={[{ width, height: size }, style]}
      resizeMode="contain"
    />
  );
  if (!linkHome) return image;
  return (
    <TouchableOpacity
      accessibilityRole="link"
      accessibilityLabel="Go to Spotlight home"
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      onPress={() => navigation.reset({ index: 0, routes: [{ name: "Home" }] })}
    >
      {image}
    </TouchableOpacity>
  );
}
