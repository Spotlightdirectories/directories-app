// ===============================================================
// src/components/BadgeTip.tsx
//
// Shared tap-tooltip for the verified badges and the 1KF badge.
// Tap the badge -> a neat wrapped rectangle appears just above it;
// tap anywhere else to close. The app is dark-themed, so the box is
// off-white with dark gray text (the light theme comes later, with
// black box + white text, same as the website).
// ===============================================================

import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Modal, Pressable, Text, View, Dimensions } from "react-native";

export const BADGE_TIPS = {
  blue: {
    title: "Verified Business",
    body: "Official business documents reviewed by Spotlight. This vendor operates a registered and credible business.",
  },
  gray: {
    title: "Verified Identity",
    body: "Business owner identity confirmed.",
  },
  founder: {
    title: "Founders 1000",
    body: "One of the first 1,000 vendors to join Spotlight Directories.",
  },
} as const;

const BOX_W = 230;

export default function BadgeTip({ kind, children }: { kind: keyof typeof BADGE_TIPS; children: ReactNode }) {
  const ref = useRef<View>(null);
  const [pos, setPos] = useState<{ x: number; y: number; h: number } | null>(null);
  const tip = BADGE_TIPS[kind];

  function open() {
    ref.current?.measureInWindow((x, y, w, h) => {
      const screenW = Dimensions.get("window").width;
      const centre = x + w / 2;
      const left = Math.min(Math.max(centre - BOX_W / 2, 10), screenW - BOX_W - 10);
      setPos({ x: left, y, h });
    });
  }

  return (
    <>
      <Pressable
        ref={ref}
        onPress={open}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={tip.title}
        collapsable={false}
      >
        {children}
      </Pressable>
      <Modal visible={!!pos} transparent animationType="fade" onRequestClose={() => setPos(null)}>
        <Pressable style={{ flex: 1 }} onPress={() => setPos(null)}>
          {pos && (
            <View
              style={{
                position: "absolute",
                left: pos.x,
                width: BOX_W,
                // sits above the badge; if too close to the top, drops below it instead
                ...(pos.y > 130 ? { bottom: Dimensions.get("window").height - pos.y + 8 } : { top: pos.y + pos.h + 8 }),
                backgroundColor: "#f3f1ea",
                borderRadius: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                shadowColor: "#000",
                shadowOpacity: 0.4,
                shadowRadius: 8,
                elevation: 8,
              }}
            >
              <Text style={{ color: "#374151", fontSize: 13, fontWeight: "700", marginBottom: 3 }}>{tip.title}</Text>
              <Text style={{ color: "#374151", fontSize: 12.5, lineHeight: 18 }}>{tip.body}</Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}
