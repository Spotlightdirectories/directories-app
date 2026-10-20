// ===============================================================
// src/components/KeyboardAwareScroll.tsx
//
// A ScrollView that keeps the text box being typed in visible:
// when the keyboard opens, it scrolls the focused box just above the
// keyboard and leaves enough room at the bottom to reach every field.
// Used on every screen that has text inputs, so nothing is buried.
// (On iPhone the built-in keyboard insets handle it.)
// ===============================================================

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { ScrollView, Keyboard, TextInput, Platform, View } from "react-native";
import type { ScrollViewProps, NativeSyntheticEvent, NativeScrollEvent } from "react-native";

const KeyboardAwareScroll = forwardRef<ScrollView, ScrollViewProps>(function KeyboardAwareScroll(
  { children, onScroll, keyboardShouldPersistTaps, ...rest },
  ref
) {
  const inner = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useImperativeHandle(ref, () => inner.current as ScrollView);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      const keyboardTop = e.endCoordinates.screenY;
      // Wait a beat so the extra bottom room is in place, then lift the focused box.
      setTimeout(() => {
        const focused = TextInput.State.currentlyFocusedInput?.();
        focused?.measureInWindow((_x, y, _w, h) => {
          const hidden = y + h + 24 - keyboardTop;
          if (hidden > 0) inner.current?.scrollTo({ y: offset.current + hidden, animated: true });
        });
      }, 80);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  return (
    <ScrollView
      ref={inner}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps ?? "handled"}
      automaticallyAdjustKeyboardInsets
      scrollEventThrottle={16}
      onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
        offset.current = e.nativeEvent.contentOffset.y;
        onScroll?.(e);
      }}
      {...rest}
    >
      {children}
      {keyboardHeight > 0 && <View style={{ height: keyboardHeight }} />}
    </ScrollView>
  );
});

export default KeyboardAwareScroll;
