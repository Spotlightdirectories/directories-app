// ===============================================================
// src/components/AccountMenu.tsx
//
// Top-right account control for the Home screen.
//  - Logged out: shows "Log In" (goes to the account-type chooser).
//  - Logged in: shows the user's picture (vendor logo, or gold
//    initials for a customer). Tapping it opens a small dropdown
//    with their dashboard link(s) and Log Out.
// Login is saved on the device (see lib/supabase.ts) and only ends
// when the user taps Log Out here or on their dashboard.
// ===============================================================

import { useCallback, useState } from "react";
import { View, Text, Image, TouchableOpacity, Modal, Pressable, StyleSheet } from "react-native";
import { FontAwesome6 } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { supabase } from "../lib/supabase";
import { colors } from "../theme/colors";

type Identity = { name: string; logo: string | null; isVendor: boolean; isCustomer: boolean };

function initialsOf(text: string): string {
  const letters = text.trim().split(/\s+/).map((p) => p.charAt(0)).join("").substring(0, 2).toUpperCase();
  return letters || "?";
}

export default function AccountMenu() {
  const navigation = useNavigation<any>();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [open, setOpen] = useState(false);

  // Re-check every time the screen is shown, so logging in or out
  // elsewhere is reflected immediately when the user lands back here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { if (active) setIdentity(null); return; }
        const uid = session.user.id;
        const [{ data: vendor }, { data: customer }] = await Promise.all([
          supabase.from("vendors").select("name, logo_url").eq("auth_user_id", uid).maybeSingle(),
          supabase.from("customers").select("name").eq("auth_user_id", uid).maybeSingle(),
        ]);
        if (!active) return;
        setIdentity({
          name: vendor?.name || customer?.name || session.user.email || "My account",
          logo: vendor?.logo_url || null,
          isVendor: !!vendor,
          isCustomer: !!customer,
        });
      })();
      return () => { active = false; };
    }, [])
  );

  async function logout() {
    setOpen(false);
    await supabase.auth.signOut();
    setIdentity(null);
    navigation.reset({ index: 0, routes: [{ name: "Home" }] });
  }

  function go(route: string) {
    setOpen(false);
    navigation.navigate(route);
  }

  if (!identity) {
    return (
      <TouchableOpacity onPress={() => navigation.navigate("AccountType")}>
        <Text style={styles.loginLink}>Log In</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityLabel="Account menu" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        {identity.logo ? (
          <Image source={{ uri: identity.logo }} style={styles.avatarImg} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(identity.name)}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <Text style={styles.menuName} numberOfLines={1}>{identity.name}</Text>
            {identity.isCustomer && (
              <TouchableOpacity style={styles.item} onPress={() => go("CustomerDashboard")}>
                <FontAwesome6 name="user" size={14} color={colors.white} />
                <Text style={styles.itemText}>My Account</Text>
              </TouchableOpacity>
            )}
            {identity.isVendor && (
              <TouchableOpacity style={styles.item} onPress={() => go("DashboardHome")}>
                <FontAwesome6 name="gauge" size={14} color={colors.white} />
                <Text style={styles.itemText}>Vendor Dashboard</Text>
              </TouchableOpacity>
            )}
            <View style={styles.divider} />
            <TouchableOpacity style={styles.item} onPress={logout}>
              <FontAwesome6 name="right-from-bracket" size={14} color="#ef4444" />
              <Text style={[styles.itemText, { color: "#ef4444" }]}>Log Out</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  loginLink: { color: colors.primary, fontSize: 14, fontWeight: "600" },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#000", fontWeight: "700", fontSize: 13 },
  avatarImg: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.border },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "flex-end", paddingTop: 70, paddingRight: 16 },
  menu: { minWidth: 210, backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8 },
  menuName: { color: colors.textSecondary, fontSize: 12, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 8 },
  item: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 8 },
  itemText: { color: colors.white, fontSize: 14, fontWeight: "600" },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 4 },
});
