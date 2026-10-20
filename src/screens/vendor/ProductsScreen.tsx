// ===============================================================
// src/screens/vendor/ProductsScreen.tsx
//
// Products management -- now COMPLETE: category-specific spec
// fields, AI-assisted description, and all 8 image slots (primary +
// secondary + tertiary + 5 gallery), matching web exactly.
//
// Ported faithfully from spotlightwebproject_staging/spotlight-next/
// src/app/(standalone)/vendordashboard/ProductsTab.tsx.
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Image, Modal, FlatList, Alert } from "react-native";
import { KeyboardAvoidingView as KAV } from "react-native";
import KeyboardAwareScroll from "../../components/KeyboardAwareScroll";
import { FontAwesome6 } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
import { supabase } from "../../lib/supabase";
import { usePullRefresh } from "../../lib/usePullRefresh";
import { uploadVendorFile } from "../../lib/uploadVendorFile";
import { openWebPage } from "../../lib/webHandoff";
import AiDescribeModal from "../../components/AiDescribeModal";
import SpotlightMark from "../../components/SpotlightMark";
import { colors } from "../../theme/colors";

type Option = { id: string; name: string };
type AttributeDef = { id: string; key: string; label: string; field_type: "text" | "number" | "select" | "multiselect"; options: string[] | null; display_order: number };
type AttributeValues = Record<string, string>;
const GALLERY_SLOTS = 5;

type VendorProduct = {
  id: string; product_name: string; short_description: string | null; price: number;
  primary_image_url: string; secondary_image_url: string | null; tertiary_image_url: string | null;
  gallery_image_urls: string[] | null;
  category_id: string | null; subcategory_id: string | null;
  sub_subcategory_id: string | null; brand: string | null; variant: string | null;
  attributes: AttributeValues | null; moderation_status: string | null;
};

type PendingProduct = {
  product_name: string; short_description: string; price: number; primary_image_url: string;
  secondary_image_url: string | null; tertiary_image_url: string | null; gallery_image_urls: string[];
  category_id: string; subcategory_id: string; sub_subcategory_id: string | null;
  brand: string; variant: string; attributes: AttributeValues;
};

const PRODUCT_LIMITS: Record<string, number> = {
  trial: 5, free: 2, standard: 25, enterprise: 50, elite: 100, custom: Infinity,
};

function isTrialActive(planTier: string, trialStartedAt: string | null): boolean {
  if (planTier !== "free" || !trialStartedAt) return false;
  const start = new Date(trialStartedAt);
  const diffDays = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 90;
}

function composeProductName(brand: string, variant: string, leafName: string): string {
  return [brand.trim(), variant.trim(), leafName.trim()].filter(Boolean).join(" ");
}

type ImageSlot = "primary" | "secondary" | "tertiary" | number; // number = gallery index

export default function ProductsScreen() {
  const navigation = useNavigation();
  const [vendor, setVendor] = useState<{ id: string; name: string; plan_tier: string; trial_started_at: string | null } | null>(null);
  const [savedProducts, setSavedProducts] = useState<VendorProduct[]>([]);
  const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Option[]>([]);
  const [subcategories, setSubcategories] = useState<Option[]>([]);
  const [subSubcategories, setSubSubcategories] = useState<Option[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [subSubcategoryId, setSubSubcategoryId] = useState("");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [subcategoryPickerOpen, setSubcategoryPickerOpen] = useState(false);
  const [subSubPickerOpen, setSubSubPickerOpen] = useState(false);

  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValues>({});
  const [attrPickerOpen, setAttrPickerOpen] = useState<string | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [subSubSearch, setSubSubSearch] = useState("");

  const [brand, setBrand] = useState("");
  const [variant, setVariant] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");

  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [secondaryPreview, setSecondaryPreview] = useState("");
  const [secondaryUploading, setSecondaryUploading] = useState(false);
  const [tertiaryUrl, setTertiaryUrl] = useState("");
  const [tertiaryPreview, setTertiaryPreview] = useState("");
  const [tertiaryUploading, setTertiaryUploading] = useState(false);
  const [galleryUrls, setGalleryUrls] = useState<string[]>(Array(GALLERY_SLOTS).fill(""));
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>(Array(GALLERY_SLOTS).fill(""));
  const [galleryUploading, setGalleryUploading] = useState<boolean[]>(Array(GALLERY_SLOTS).fill(false));

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiToast, setAiToast] = useState<string | null>(null);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data: v } = await supabase.from("vendors").select("id, name, plan_tier, trial_started_at").eq("auth_user_id", user.id).maybeSingle();
    if (!v) { setLoading(false); return; }
    setVendor(v);

    const { data: cats } = await supabase.from("categories").select("id,name").eq("kind", "product").order("name");
    setCategories(cats || []);

    const { data: prods } = await supabase.from("vendor_products").select("*").eq("vendor_id", v.id).order("display_order", { ascending: true });
    setSavedProducts(prods || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);
  const { refreshControl } = usePullRefresh(load);

  useEffect(() => {
    if (!categoryId) { setSubcategories([]); return; }
    supabase.from("subcategories").select("id,name").eq("category_id", categoryId).order("name").then(({ data }) => setSubcategories(data || []));
  }, [categoryId]);

  useEffect(() => {
    if (!subcategoryId) { setSubSubcategories([]); return; }
    supabase.from("sub_subcategories").select("id,name").eq("subcategory_id", subcategoryId).order("display_order").then(({ data }) => setSubSubcategories(data || []));
  }, [subcategoryId]);

  // Spec/attribute definitions for the selected category -- fetches
  // both category-wide and any subcategory-specific overrides, then
  // resolves per key: a row scoped to the currently selected
  // subcategory wins over the category-wide row for that same key.
  // Added 2026-09-08 to fix PPE's Size field (Safety Boot/Shoe need
  // numeric sizes; every other PPE subcategory needs letters) --
  // same fix as web, matching exactly.
  useEffect(() => {
    if (!categoryId) { setAttributeDefs([]); setAttributeValues({}); return; }
    supabase.from("product_attributes").select("id,key,label,field_type,options,display_order,subcategory_id").eq("category_id", categoryId).order("display_order").then(({ data }) => {
      const rows = (data as (AttributeDef & { subcategory_id: string | null })[]) || [];
      const byKey = new Map<string, AttributeDef>();
      for (const row of rows) {
        if (row.subcategory_id !== null && row.subcategory_id !== subcategoryId) continue;
        const existing = byKey.get(row.key);
        if (!existing || row.subcategory_id !== null) byKey.set(row.key, row);
      }
      setAttributeDefs(Array.from(byKey.values()).sort((a, b) => a.display_order - b.display_order));
    });
  }, [categoryId, subcategoryId]);

  const trialActive = vendor ? isTrialActive(vendor.plan_tier, vendor.trial_started_at) : false;
  const currentLimit = trialActive ? 5 : (PRODUCT_LIMITS[vendor?.plan_tier || "free"] ?? 1);
  const totalCount = savedProducts.length + pendingProducts.length;

  function resetForm() {
    setCategoryId(""); setSubcategoryId(""); setSubSubcategoryId("");
    setBrand(""); setVariant(""); setDescription(""); setPrice("");
    setImageUrl(""); setImagePreview("");
    setSecondaryUrl(""); setSecondaryPreview("");
    setTertiaryUrl(""); setTertiaryPreview("");
    setGalleryUrls(Array(GALLERY_SLOTS).fill(""));
    setGalleryPreviews(Array(GALLERY_SLOTS).fill(""));
    setAttributeValues({});
    setEditingId(null);
  }

  function handleAttributeChange(key: string, value: string) {
    setAttributeValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleMultiselectOption(key: string, option: string) {
    const current = attributeValues[key] ? attributeValues[key].split(",") : [];
    const next = current.includes(option) ? current.filter((o) => o !== option) : [...current, option];
    handleAttributeChange(key, next.join(","));
  }

  async function pickImage(slot: ImageSlot) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission needed", "Please allow photo access in your phone's Settings to add a product image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    const setPreview = slot === "primary" ? setImagePreview : slot === "secondary" ? setSecondaryPreview : slot === "tertiary" ? setTertiaryPreview
      : (uri: string) => setGalleryPreviews((prev) => prev.map((v, i) => (i === slot ? uri : v)));
    const setUploading = slot === "primary" ? setImageUploading : slot === "secondary" ? setSecondaryUploading : slot === "tertiary" ? setTertiaryUploading
      : (val: boolean) => setGalleryUploading((prev) => prev.map((v, i) => (i === slot ? val : v)));
    const setUrl = slot === "primary" ? setImageUrl : slot === "secondary" ? setSecondaryUrl : slot === "tertiary" ? setTertiaryUrl
      : (url: string) => setGalleryUrls((prev) => prev.map((v, i) => (i === slot ? url : v)));

    setPreview(asset.uri);
    setUploading(true);
    try {
      const fileName = asset.fileName || `product-${Date.now()}.jpg`;
      const { publicUrl } = await uploadVendorFile(asset.base64!, fileName, "product");
      setUrl(publicUrl || "");
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message || "Please try again.");
      setPreview("");
    } finally {
      setUploading(false);
    }
  }

  function handleAddToPending() {
    if (!categoryId || !subcategoryId) {
      Alert.alert("Missing info", "Select a category and subcategory for this product.");
      return;
    }
    if (subSubcategories.length > 0 && !subSubcategoryId) {
      Alert.alert("Missing info", "This subcategory has more specific options — please select one.");
      return;
    }
    if (!description.trim() || !price.trim()) {
      Alert.alert("Missing info", "Product description and price are required.");
      return;
    }
    if (!imageUrl) {
      Alert.alert("Missing image", "A primary product image is required.");
      return;
    }
    if (totalCount >= currentLimit) {
      Alert.alert("Plan limit reached", `Your current plan allows up to ${currentLimit} products. Upgrade to add more.`,
        [{ text: "Cancel", style: "cancel" }, { text: "Upgrade", onPress: () => openWebPage("/getlisted?context=upgrade") }]);
      return;
    }

    const subcategoryName = subcategories.find((s) => s.id === subcategoryId)?.name || "";
    const subSubName = subSubcategories.find((s) => s.id === subSubcategoryId)?.name || "";
    const name = composeProductName(brand, variant, subSubName || subcategoryName);

    setPendingProducts((prev) => [...prev, {
      product_name: name, short_description: description.trim(), price: Number(price),
      primary_image_url: imageUrl, secondary_image_url: secondaryUrl || null, tertiary_image_url: tertiaryUrl || null,
      gallery_image_urls: galleryUrls.filter(Boolean),
      category_id: categoryId, subcategory_id: subcategoryId,
      sub_subcategory_id: subSubcategoryId || null, brand: brand.trim(), variant: variant.trim(),
      attributes: attributeValues,
    }]);
    resetForm();
  }

  function handleRemovePending(index: number) {
    setPendingProducts((prev) => prev.filter((_, i) => i !== index));
  }

  function handleEditSaved(product: VendorProduct) {
    setEditingId(product.id);
    setFormOpen(true);
    setCategoryId(product.category_id || "");
    setBrand(product.brand || "");
    setVariant(product.variant || "");
    setDescription(product.short_description || "");
    setPrice(product.price != null ? String(product.price) : "");
    setImageUrl(product.primary_image_url || "");
    setImagePreview(product.primary_image_url || "");
    setSecondaryUrl(product.secondary_image_url || "");
    setSecondaryPreview(product.secondary_image_url || "");
    setTertiaryUrl(product.tertiary_image_url || "");
    setTertiaryPreview(product.tertiary_image_url || "");
    const gallery = product.gallery_image_urls || [];
    setGalleryUrls(Array.from({ length: GALLERY_SLOTS }, (_, i) => gallery[i] || ""));
    setGalleryPreviews(Array.from({ length: GALLERY_SLOTS }, (_, i) => gallery[i] || ""));
    setTimeout(() => setSubcategoryId(product.subcategory_id || ""), 300);
    setTimeout(() => setSubSubcategoryId(product.sub_subcategory_id || ""), 600);
    setTimeout(() => setAttributeValues(product.attributes || {}), 300);
  }

  async function handleDeleteSaved(id: string) {
    Alert.alert("Delete product?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          const { error } = await supabase.from("vendor_products").delete().eq("id", id);
          if (error) { Alert.alert("Error", "Unable to delete product."); return; }
          setSavedProducts((prev) => prev.filter((p) => p.id !== id));
          if (editingId === id) resetForm();
        },
      },
    ]);
  }

  async function handleSave() {
    if (!editingId && !pendingProducts.length) {
      Alert.alert("Nothing to save", "Add at least one product first.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const subcategoryName = subcategories.find((s) => s.id === subcategoryId)?.name || "";
        const subSubName = subSubcategories.find((s) => s.id === subSubcategoryId)?.name || "";
        const name = composeProductName(brand, variant, subSubName || subcategoryName);
        const galleryToSave = galleryUrls.filter(Boolean);

        const { error } = await supabase.from("vendor_products").update({
          product_name: name, category_id: categoryId, subcategory_id: subcategoryId,
          sub_subcategory_id: subSubcategoryId || null, brand: brand.trim(), variant: variant.trim(),
          short_description: description.trim(), price: Number(price),
          primary_image_url: imageUrl, secondary_image_url: secondaryUrl || null, tertiary_image_url: tertiaryUrl || null,
          gallery_image_urls: galleryToSave, attributes: attributeValues,
        }).eq("id", editingId);
        if (error) throw error;

        setSavedProducts((prev) => prev.map((p) => p.id === editingId ? {
          ...p, product_name: name, category_id: categoryId, subcategory_id: subcategoryId,
          sub_subcategory_id: subSubcategoryId || null, brand: brand.trim(), variant: variant.trim(),
          short_description: description.trim(), price: Number(price),
          primary_image_url: imageUrl, secondary_image_url: secondaryUrl || null, tertiary_image_url: tertiaryUrl || null,
          gallery_image_urls: galleryToSave, attributes: attributeValues,
        } : p));
        resetForm();
        Alert.alert("Updated", "Product updated successfully.");
        return;
      }

      const payload = pendingProducts.map((p) => ({ vendor_id: vendor!.id, vendor_name: vendor!.name, ...p }));
      const { data, error } = await supabase.from("vendor_products").insert(payload).select();
      if (error) throw error;

      setSavedProducts((prev) => [...prev, ...(data || [])]);
      setPendingProducts([]);
      Alert.alert("Saved", "Products saved successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Unable to save products.");
    } finally {
      setSaving(false);
    }
  }

  function currentItemName() {
    const subcategoryName = subcategories.find((s) => s.id === subcategoryId)?.name || "";
    const subSubName = subSubcategories.find((s) => s.id === subSubcategoryId)?.name || "";
    return composeProductName(brand, variant, subSubName || subcategoryName);
  }

  function renderAttributeField(def: AttributeDef) {
    const value = attributeValues[def.key] || "";
    if (def.field_type === "select") {
      return (
        <View key={def.id} style={{ width: "48%" }}>
          <Text style={styles.fieldLabel}>{def.label}</Text>
          <TouchableOpacity style={styles.field} onPress={() => setAttrPickerOpen(def.key)}>
            <Text style={styles.fieldText}>{value || `Select ${def.label}`}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    if (def.field_type === "multiselect") {
      const selected = value ? value.split(",") : [];
      return (
        <View key={def.id} style={{ width: "100%" }}>
          <Text style={styles.fieldLabel}>{def.label}</Text>
          <View style={styles.multiselectRow}>
            {(def.options || []).map((opt) => {
              const active = selected.includes(opt);
              return (
                <TouchableOpacity key={opt} style={[styles.multiselectChip, active && styles.multiselectChipActive]} onPress={() => toggleMultiselectOption(def.key, opt)}>
                  <Text style={[styles.multiselectChipText, active && styles.multiselectChipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }
    return (
      <View key={def.id} style={{ width: "48%" }}>
        <Text style={styles.fieldLabel}>{def.label}</Text>
        <TextInput style={styles.input} value={value} onChangeText={(v) => handleAttributeChange(def.key, v)} keyboardType={def.field_type === "number" ? "numeric" : "default"} placeholderTextColor={colors.textSecondary} />
      </View>
    );
  }

  function renderImageSlot(label: string, preview: string, uploading: boolean, slot: ImageSlot) {
    return (
      <View style={{ marginTop: 12 }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <TouchableOpacity style={styles.imagePicker} onPress={() => pickImage(slot)} disabled={uploading}>
          {preview ? (
            <Image source={{ uri: preview }} style={[styles.imagePreview, uploading && { opacity: 0.5 }]} />
          ) : (
            <View style={styles.imagePlaceholder}><FontAwesome6 name="image" size={20} color={colors.textSecondary} /></View>
          )}
          <Text style={styles.imagePickerText}>{uploading ? "Uploading..." : preview ? "Change Image" : "Choose Image"}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  if (!vendor) return <View style={styles.center}><Text style={styles.emptyText}>Vendor account not found.</Text></View>;

  const activeAttrDef = attributeDefs.find((d) => d.key === attrPickerOpen);
  const filteredCategories = categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()));
  const filteredSubcategories = subcategories.filter((s) => s.name.toLowerCase().includes(subcategorySearch.toLowerCase()));
  const filteredSubSubcategories = subSubcategories.filter((s) => s.name.toLowerCase().includes(subSubSearch.toLowerCase()));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <SpotlightMark size={20} />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (!formOpen && totalCount >= currentLimit) {
              Alert.alert("Plan limit reached", `Your current plan allows up to ${currentLimit} products.`,
                [{ text: "Cancel", style: "cancel" }, { text: "Upgrade", onPress: () => openWebPage("/getlisted?context=upgrade") }]);
              return;
            }
            setFormOpen((v) => !v);
          }}
        >
          <FontAwesome6 name="plus" size={12} color={colors.black} />
          <Text style={styles.addBtnText}>Add Product</Text>
        </TouchableOpacity>
      </View>

      {aiToast && <View style={styles.toast}><Text style={styles.toastText}>{aiToast}</Text></View>}

      <KeyboardAwareScroll refreshControl={refreshControl} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.title}>Product Catalogue</Text>
        <Text style={styles.subtitle}>Add and manage the products your business sells.</Text>
        <Text style={styles.limitText}>Your current plan allows up to {currentLimit} products. ({totalCount} used)</Text>

        {formOpen && (
          <View style={styles.formCard}>
            <Text style={styles.fieldLabel}>Category</Text>
            <TouchableOpacity style={styles.field} onPress={() => setCategoryPickerOpen(true)}>
              <Text style={styles.fieldText}>{categories.find((c) => c.id === categoryId)?.name || "Select category"}</Text>
            </TouchableOpacity>

            {categoryId && (
              <>
                <Text style={styles.fieldLabel}>Subcategory</Text>
                <TouchableOpacity style={styles.field} onPress={() => setSubcategoryPickerOpen(true)}>
                  <Text style={styles.fieldText}>{subcategories.find((s) => s.id === subcategoryId)?.name || "Select subcategory"}</Text>
                </TouchableOpacity>
              </>
            )}

            {subSubcategories.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Specific Type</Text>
                <TouchableOpacity style={styles.field} onPress={() => setSubSubPickerOpen(true)}>
                  <Text style={styles.fieldText}>{subSubcategories.find((s) => s.id === subSubcategoryId)?.name || "Select type"}</Text>
                </TouchableOpacity>
              </>
            )}

            <Text style={styles.fieldLabel}>Brand (optional)</Text>
            <TextInput style={styles.input} value={brand} onChangeText={setBrand} placeholderTextColor={colors.textSecondary} />

            <Text style={styles.fieldLabel}>Model / Variant (optional)</Text>
            <TextInput style={styles.input} value={variant} onChangeText={setVariant} placeholderTextColor={colors.textSecondary} />

            {attributeDefs.length > 0 && (
              <>
                <Text style={styles.helperText}>Add the specs buyers look for in this category (all optional, but the more you fill in, the more confident a buyer can be before contacting you).</Text>
                <View style={styles.attrGrid}>{attributeDefs.map(renderAttributeField)}</View>
              </>
            )}

            <View style={styles.descHeaderRow}>
              <Text style={styles.fieldLabel}>Description</Text>
              <TouchableOpacity style={styles.aiBtn} onPress={() => setAiModalOpen(true)}>
                <FontAwesome6 name="wand-magic-sparkles" size={11} color={colors.black} />
                <Text style={styles.aiBtnText}>Generate with AI</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { height: 80 }]} value={description} onChangeText={setDescription} multiline placeholderTextColor={colors.textSecondary} />

            <Text style={styles.fieldLabel}>Price (₦)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />

            {renderImageSlot("Primary Image", imagePreview, imageUploading, "primary")}
            {renderImageSlot("Secondary Image (optional)", secondaryPreview, secondaryUploading, "secondary")}
            {renderImageSlot("Third Image (optional)", tertiaryPreview, tertiaryUploading, "tertiary")}
            {Array.from({ length: GALLERY_SLOTS }, (_, i) => (
              <View key={i}>{renderImageSlot(`Additional Image ${i + 4} (optional)`, galleryPreviews[i], galleryUploading[i], i)}</View>
            ))}
            <Text style={styles.hint}>JPG/PNG • Max 2MB • Min 800×800px • Up to 8 photos total</Text>

            <TouchableOpacity style={styles.addToPendingBtn} onPress={handleAddToPending} disabled={!!editingId}>
              <Text style={styles.addToPendingText}>{editingId ? "Editing..." : "Add"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {pendingProducts.map((p, i) => (
          <View key={i} style={styles.pill}>
            <Image source={{ uri: p.primary_image_url }} style={styles.pillImage} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.pillName}>{p.product_name}</Text>
              <Text style={styles.pillPrice}>₦{p.price.toLocaleString()}</Text>
            </View>
            <TouchableOpacity onPress={() => handleRemovePending(i)}><FontAwesome6 name="xmark" size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Saved Products</Text>
        {savedProducts.length === 0 ? (
          <Text style={styles.emptyText}>No saved products yet.</Text>
        ) : (
          savedProducts.map((p) => (
            <View key={p.id} style={styles.pill}>
              <Image source={{ uri: p.primary_image_url }} style={styles.pillImage} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.pillName}>{p.product_name}</Text>
                  {p.moderation_status === "pending_review" && <Text style={styles.pendingBadge}>Pending Review</Text>}
                  {p.moderation_status === "rejected" && <Text style={styles.rejectedBadge}>Not Approved</Text>}
                </View>
                <Text style={styles.pillPrice}>₦{Number(p.price).toLocaleString()}</Text>
              </View>
              <TouchableOpacity onPress={() => handleEditSaved(p)} style={{ marginRight: 12 }}><Text style={styles.editLink}>Edit</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteSaved(p.id)}><FontAwesome6 name="xmark" size={18} color={colors.error} /></TouchableOpacity>
            </View>
          ))
        )}

        {(pendingProducts.length > 0 || editingId) && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? (editingId ? "Updating..." : "Saving...") : editingId ? "Update Product" : "Save Products"}</Text>
          </TouchableOpacity>
        )}
      </KeyboardAwareScroll>

      <Modal visible={categoryPickerOpen} animationType="slide" transparent onRequestClose={() => setCategoryPickerOpen(false)}>
        <KAV style={styles.modalOverlay} behavior="padding">
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search categories..."
              placeholderTextColor={colors.textSecondary}
              value={categorySearch}
              onChangeText={setCategorySearch}
              autoFocus
            />
            <FlatList data={filteredCategories} keyExtractor={(c) => c.id} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setCategoryId(item.id); setSubcategoryId(""); setSubSubcategoryId(""); setCategoryPickerOpen(false); setCategorySearch(""); }}>
                <Text style={styles.pickerItemText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.noResults}>No matching categories.</Text>}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setCategoryPickerOpen(false); setCategorySearch(""); }}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </KAV>
      </Modal>

      <Modal visible={subcategoryPickerOpen} animationType="slide" transparent onRequestClose={() => setSubcategoryPickerOpen(false)}>
        <KAV style={styles.modalOverlay} behavior="padding">
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select Subcategory</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search subcategories..."
              placeholderTextColor={colors.textSecondary}
              value={subcategorySearch}
              onChangeText={setSubcategorySearch}
              autoFocus
            />
            <FlatList data={filteredSubcategories} keyExtractor={(s) => s.id} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setSubcategoryId(item.id); setSubSubcategoryId(""); setSubcategoryPickerOpen(false); setSubcategorySearch(""); }}>
                <Text style={styles.pickerItemText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.noResults}>No matching subcategories.</Text>}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSubcategoryPickerOpen(false); setSubcategorySearch(""); }}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </KAV>
      </Modal>

      <Modal visible={subSubPickerOpen} animationType="slide" transparent onRequestClose={() => setSubSubPickerOpen(false)}>
        <KAV style={styles.modalOverlay} behavior="padding">
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select Specific Type</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor={colors.textSecondary}
              value={subSubSearch}
              onChangeText={setSubSubSearch}
              autoFocus
            />
            <FlatList data={filteredSubSubcategories} keyExtractor={(s) => s.id} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setSubSubcategoryId(item.id); setSubSubPickerOpen(false); setSubSubSearch(""); }}>
                <Text style={styles.pickerItemText}>{item.name}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.noResults}>No matching options.</Text>}
            />
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSubSubPickerOpen(false); setSubSubSearch(""); }}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </KAV>
      </Modal>

      <Modal visible={!!attrPickerOpen} animationType="slide" transparent onRequestClose={() => setAttrPickerOpen(null)}>
        <KAV style={styles.modalOverlay} behavior="padding">
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>{activeAttrDef?.label || "Select"}</Text>
            <FlatList data={activeAttrDef?.options || []} keyExtractor={(o) => o} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { if (attrPickerOpen) handleAttributeChange(attrPickerOpen, item); setAttrPickerOpen(null); }}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )} />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setAttrPickerOpen(null)}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </KAV>
      </Modal>

      <AiDescribeModal
        visible={aiModalOpen}
        type="product"
        itemName={currentItemName()}
        onClose={() => setAiModalOpen(false)}
        onGenerated={(text, meta) => {
          setDescription(text);
          if (meta.planTier && meta.limit) {
            const plan = meta.planTier.charAt(0).toUpperCase() + meta.planTier.slice(1);
            setAiToast(`Generated within your ${plan} plan's ${meta.limit}-word limit`);
            setTimeout(() => setAiToast(null), 3500);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  center: { flex: 1, backgroundColor: colors.dark, alignItems: "center", justifyContent: "center" },
  emptyText: { color: colors.textSecondary, fontSize: 13 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, paddingTop: 50 },
  back: { color: colors.primary, fontSize: 15 },
  addBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
  addBtnText: { color: colors.black, fontWeight: "700", fontSize: 12 },

  toast: { position: "absolute", top: 90, left: 20, right: 20, backgroundColor: colors.primary, borderRadius: 8, padding: 10, zIndex: 10 },
  toastText: { color: colors.black, fontSize: 12, fontWeight: "600", textAlign: "center" },

  title: { color: colors.white, fontSize: 20, fontWeight: "700" },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  limitText: { color: colors.primary, fontSize: 12, fontWeight: "600", marginTop: 8, marginBottom: 16 },

  formCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 20 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 12, marginBottom: 6 },
  helperText: { color: colors.textSecondary, fontSize: 11, marginTop: 12, lineHeight: 16 },
  field: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  fieldText: { color: colors.white, fontSize: 14 },
  input: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14 },

  attrGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  multiselectRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  multiselectChip: { borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: "#0d0d0d" },
  multiselectChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  multiselectChipText: { color: colors.textSecondary, fontSize: 12 },
  multiselectChipTextActive: { color: colors.black, fontWeight: "600" },

  descHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  aiBtn: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.primary, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10 },
  aiBtnText: { color: colors.black, fontSize: 10, fontWeight: "700" },

  imagePicker: { flexDirection: "row", alignItems: "center", gap: 12 },
  imagePreview: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.border },
  imagePlaceholder: { width: 56, height: 56, borderRadius: 8, backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  imagePickerText: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  hint: { color: colors.textSecondary, fontSize: 11, marginTop: 10 },

  addToPendingBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12, alignItems: "center", marginTop: 20 },
  addToPendingText: { color: colors.black, fontWeight: "700" },

  pill: { flexDirection: "row", alignItems: "center", backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, marginBottom: 10 },
  pillImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.border },
  pillName: { color: colors.white, fontSize: 13, fontWeight: "600" },
  pillPrice: { color: colors.success, fontSize: 12, fontWeight: "700", marginTop: 2 },
  editLink: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  pendingBadge: { color: "#facc15", fontSize: 9, fontWeight: "700" },
  rejectedBadge: { color: colors.error, fontSize: 9, fontWeight: "700" },

  sectionTitle: { color: colors.white, fontSize: 15, fontWeight: "700", marginTop: 20, marginBottom: 10 },
  saveBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  saveBtnText: { color: colors.black, fontWeight: "700" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  modalTitle: { color: colors.white, fontSize: 18, fontWeight: "700", marginBottom: 16 },
  searchInput: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14, marginBottom: 12 },
  noResults: { color: colors.textSecondary, fontSize: 13, textAlign: "center", paddingVertical: 20 },
  pickerCard: { backgroundColor: colors.dark, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: "75%" },
  pickerItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  pickerItemText: { color: colors.white, fontSize: 15 },
  closeBtn: { marginTop: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  closeBtnText: { color: colors.primary, fontWeight: "600" },
});
