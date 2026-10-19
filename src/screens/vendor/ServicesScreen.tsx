// ===============================================================
// src/screens/vendor/ServicesScreen.tsx
//
// Ported faithfully from spotlightwebproject_staging/spotlight-next/
// src/app/(standalone)/vendordashboard/ServicesTab.tsx. Real
// differences from Products, all preserved here:
// - Service name is NOT freeform -- it's locked to the subcategory
//   (or sub-subcategory) name. No brand/variant composition.
// - Description must be 280-500 characters, strictly enforced
// - Only 4 images total (Representative + Additional + 2 gallery),
//   not 8 like Products
// - Starting price is optional, not required
// - A vendor can't add two services under the same subcategory
//   (unless each picks a different sub-subcategory) -- the
//   "Drone Videography" duplicate-listing rule
// - Delete now cleans up storage on the vendor-gallery bucket,
//   matching Products exactly (fixed 2026-09-08 per Cyril — this
//   used to leave orphaned files behind on both platforms)
// - Edit-lockout bug never existed here (saved list was never
//   nested inside the formOpen-gated container, unlike web's
//   pre-fix version)
// ===============================================================

import { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Image, Modal, FlatList, Alert } from "react-native";
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
const GALLERY_SLOTS = 2;

type VendorService = {
  id: string; service_name: string; short_description: string | null; starting_price: number | null; pricing_mode?: string | null;
  representative_image_url: string | null; secondary_image_url: string | null; gallery_image_urls: string[] | null;
  category_id: string | null; subcategory_id: string | null; sub_subcategory_id: string | null;
  attributes: AttributeValues | null; moderation_status: string | null;
};

type PendingService = {
  service_name: string; category_id: string; subcategory_id: string; sub_subcategory_id: string | null;
  short_description: string; starting_price: number | null; pricing_mode: string;
  representative_image_url: string; secondary_image_url: string; gallery_image_urls: string[];
  attributes: AttributeValues;
};

const SERVICE_LIMITS: Record<string, number> = { free: 2, standard: 25, enterprise: 50, elite: 100, custom: Infinity };

function isTrialActive(planTier: string, trialStartedAt: string | null): boolean {
  if (planTier !== "free" || !trialStartedAt) return false;
  const diffDays = Math.floor((Date.now() - new Date(trialStartedAt).getTime()) / (1000 * 60 * 60 * 24));
  return diffDays <= 90;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-");
}

// Extracts the storage path from a public URL so it can be removed
// from the "vendor-gallery" bucket on delete -- matches Products'
// exact approach. Added 2026-09-08 per Cyril: Services' delete used
// to leave orphaned files behind; that was a real gap, not intended
// behavior worth preserving on either platform.
function storagePathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const path = new URL(url).pathname.split("/object/public/vendor-gallery/")[1];
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

type ImageSlot = "primary" | "secondary" | number;

export default function ServicesScreen() {
  const navigation = useNavigation();
  const [vendor, setVendor] = useState<{ id: string; name: string; plan_tier: string; trial_started_at: string | null } | null>(null);
  const [savedServices, setSavedServices] = useState<VendorService[]>([]);
  const [pendingServices, setPendingServices] = useState<PendingService[]>([]);
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
  const [categorySearch, setCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [subSubSearch, setSubSubSearch] = useState("");

  const [attributeDefs, setAttributeDefs] = useState<AttributeDef[]>([]);
  const [attributeValues, setAttributeValues] = useState<AttributeValues>({});
  const [attrPickerOpen, setAttrPickerOpen] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  // Task U: show a starting price, or "Contact for a quote" (no price shown)
  const [primaryUrl, setPrimaryUrl] = useState("");
  const [primaryPreview, setPrimaryPreview] = useState("");
  const [primaryUploading, setPrimaryUploading] = useState(false);
  const [secondaryUrl, setSecondaryUrl] = useState("");
  const [secondaryPreview, setSecondaryPreview] = useState("");
  const [secondaryUploading, setSecondaryUploading] = useState(false);
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

    const { data: cats } = await supabase.from("categories").select("id,name").eq("kind", "service").order("name");
    setCategories(cats || []);

    const { data: servs } = await supabase.from("vendor_services").select("*").eq("vendor_id", v.id).order("created_at", { ascending: true });
    setSavedServices(servs || []);
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

  useEffect(() => {
    if (!categoryId) { setAttributeDefs([]); setAttributeValues({}); return; }
    supabase.from("service_attributes").select("id,key,label,field_type,options,display_order").eq("category_id", categoryId).order("display_order").then(({ data }) => {
      setAttributeDefs((data as AttributeDef[]) || []);
    });
  }, [categoryId]);

  const trialActive = vendor ? isTrialActive(vendor.plan_tier, vendor.trial_started_at) : false;
  const currentLimit = trialActive ? 5 : (SERVICE_LIMITS[vendor?.plan_tier || "free"] ?? 3);
  const totalCount = savedServices.length + pendingServices.length;

  // "No duplicate service under the same subcategory" rule — the
  // Drone Videography rule, matching web exactly.
  const usedSubcategoryIds = new Set([
    ...savedServices.filter((s) => !s.sub_subcategory_id).map((s) => s.subcategory_id).filter(Boolean),
    ...pendingServices.filter((s) => !s.sub_subcategory_id).map((s) => s.subcategory_id).filter(Boolean),
  ]);
  const usedSubSubcategoryIds = new Set([
    ...savedServices.map((s) => s.sub_subcategory_id).filter(Boolean),
    ...pendingServices.map((s) => s.sub_subcategory_id).filter(Boolean),
  ]);

  const filteredCategories = categories.filter((c) => c.name.toLowerCase().includes(categorySearch.toLowerCase()));
  const filteredSubcategories = subcategories.filter((s) => s.name.toLowerCase().includes(subcategorySearch.toLowerCase()));
  const filteredSubSubcategories = subSubcategories.filter((s) => s.name.toLowerCase().includes(subSubSearch.toLowerCase()));

  function resetForm() {
    setCategoryId(""); setSubcategoryId(""); setSubSubcategoryId("");
    setDescription(""); setPrice("");
    setPrimaryUrl(""); setPrimaryPreview("");
    setSecondaryUrl(""); setSecondaryPreview("");
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
      Alert.alert("Permission needed", "Please allow photo access in your phone's Settings to add a service image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8, base64: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    const setPreview = slot === "primary" ? setPrimaryPreview : slot === "secondary" ? setSecondaryPreview
      : (uri: string) => setGalleryPreviews((prev) => prev.map((v, i) => (i === slot ? uri : v)));
    const setUploading = slot === "primary" ? setPrimaryUploading : slot === "secondary" ? setSecondaryUploading
      : (val: boolean) => setGalleryUploading((prev) => prev.map((v, i) => (i === slot ? val : v)));
    const setUrl = slot === "primary" ? setPrimaryUrl : slot === "secondary" ? setSecondaryUrl
      : (url: string) => setGalleryUrls((prev) => prev.map((v, i) => (i === slot ? url : v)));

    setPreview(asset.uri);
    setUploading(true);
    try {
      const fileName = asset.fileName || `service-${Date.now()}.jpg`;
      const { publicUrl } = await uploadVendorFile(asset.base64!, fileName, "service");
      setUrl(publicUrl || "");
    } catch (err: any) {
      Alert.alert("Upload failed", err?.message || "Please try again.");
      setPreview("");
    } finally {
      setUploading(false);
    }
  }

  function currentServiceName() {
    return subSubcategories.find((s) => s.id === subSubcategoryId)?.name
      || subcategories.find((s) => s.id === subcategoryId)?.name || "";
  }

  function handleAddToPending() {
    if (!categoryId || !subcategoryId) {
      Alert.alert("Missing info", "Select a category and subcategory — this is what your service will be listed as.");
      return;
    }
    if (subSubcategories.length > 0 && !subSubcategoryId) {
      Alert.alert("Missing info", "This subcategory has more specific options — please select one.");
      return;
    }
    if (description.trim().length < 280) {
      Alert.alert("Description too short", "Service description must contain at least 280 characters including spaces.");
      return;
    }
    if (description.trim().length > 500) {
      Alert.alert("Description too long", "Service description must not exceed 500 characters including spaces.");
      return;
    }
    if (totalCount >= currentLimit) {
      Alert.alert("Plan limit reached", `Your current plan allows up to ${currentLimit} services. Upgrade to add more.`,
        [{ text: "Cancel", style: "cancel" }, { text: "Upgrade", onPress: () => openWebPage("/getlisted?context=upgrade") }]);
      return;
    }
    if (!editingId && subSubcategoryId && usedSubSubcategoryIds.has(subSubcategoryId)) {
      Alert.alert("Already added", "You've already added a service under this specific type.");
      return;
    }
    if (!editingId && !subSubcategoryId && usedSubcategoryIds.has(subcategoryId)) {
      Alert.alert("Already added", "You've already added a service under this subcategory.");
      return;
    }

    const name = currentServiceName();
    setPendingServices((prev) => [...prev, {
      service_name: name, category_id: categoryId, subcategory_id: subcategoryId, sub_subcategory_id: subSubcategoryId || null,
      short_description: description.trim(), starting_price: Number(price) || null, pricing_mode: Number(price) ? "starting_from" : "quote",
      representative_image_url: primaryUrl, secondary_image_url: secondaryUrl, gallery_image_urls: galleryUrls.filter(Boolean),
      attributes: attributeValues,
    }]);
    resetForm();
  }

  function handleRemovePending(index: number) {
    setPendingServices((prev) => prev.filter((_, i) => i !== index));
  }

  function handleEditSaved(service: VendorService) {
    setEditingId(service.id);
    setFormOpen(true);
    setCategoryId(service.category_id || "");
    setDescription(service.short_description || "");
    setPrice(service.starting_price != null ? String(service.starting_price) : "");
    setPrimaryUrl(service.representative_image_url || "");
    setPrimaryPreview(service.representative_image_url || "");
    setSecondaryUrl(service.secondary_image_url || "");
    setSecondaryPreview(service.secondary_image_url || "");
    const gallery = service.gallery_image_urls || [];
    setGalleryUrls(Array.from({ length: GALLERY_SLOTS }, (_, i) => gallery[i] || ""));
    setGalleryPreviews(Array.from({ length: GALLERY_SLOTS }, (_, i) => gallery[i] || ""));
    setTimeout(() => setSubcategoryId(service.subcategory_id || ""), 300);
    setTimeout(() => setSubSubcategoryId(service.sub_subcategory_id || ""), 600);
    setTimeout(() => setAttributeValues(service.attributes || {}), 300);
  }

  async function handleDeleteSaved(id: string) {
    Alert.alert("Delete service?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          const service = savedServices.find((s) => s.id === id);
          const storagePaths = [
            service?.representative_image_url,
            service?.secondary_image_url,
            ...(service?.gallery_image_urls || []),
          ].map(storagePathFromUrl).filter((p): p is string => Boolean(p));

          if (storagePaths.length) {
            const { error: storageError } = await supabase.storage.from("vendor-gallery").remove(storagePaths);
            if (storageError) console.error(storageError);
          }

          const { error } = await supabase.from("vendor_services").delete().eq("id", id);
          if (error) { Alert.alert("Error", "Unable to delete service."); return; }
          setSavedServices((prev) => prev.filter((s) => s.id !== id));
          if (editingId === id) resetForm();
        },
      },
    ]);
  }

  async function handleSave() {
    if (!editingId && !pendingServices.length) {
      Alert.alert("Nothing to save", "Add at least one service first.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        if (!categoryId || !subcategoryId) { Alert.alert("Missing info", "Select a category and subcategory."); setSaving(false); return; }
        if (subSubcategories.length > 0 && !subSubcategoryId) { Alert.alert("Missing info", "Select a specific type."); setSaving(false); return; }

        const duplicateExists = subSubcategoryId
          ? savedServices.some((s) => s.id !== editingId && s.sub_subcategory_id === subSubcategoryId)
          : savedServices.some((s) => s.id !== editingId && !s.sub_subcategory_id && s.subcategory_id === subcategoryId);
        if (duplicateExists) {
          Alert.alert("Duplicate listing", "You already have a service listed under this subcategory. Please edit that existing listing instead.");
          setSaving(false);
          return;
        }

        const name = currentServiceName();
        const galleryToSave = galleryUrls.filter(Boolean);

        const { error } = await supabase.from("vendor_services").update({
          service_name: name, slug: slugify(name), category_id: categoryId, subcategory_id: subcategoryId,
          sub_subcategory_id: subSubcategoryId || null, short_description: description.trim(), starting_price: Number(price) || null, pricing_mode: Number(price) ? "starting_from" : "quote",
          representative_image_url: primaryUrl, secondary_image_url: secondaryUrl, gallery_image_urls: galleryToSave, attributes: attributeValues,
        }).eq("id", editingId);
        if (error) throw error;

        setSavedServices((prev) => prev.map((s) => s.id === editingId ? {
          ...s, service_name: name, category_id: categoryId, subcategory_id: subcategoryId, sub_subcategory_id: subSubcategoryId || null,
          short_description: description.trim(), starting_price: Number(price) || null, pricing_mode: Number(price) ? "starting_from" : "quote",
          representative_image_url: primaryUrl, secondary_image_url: secondaryUrl, gallery_image_urls: galleryToSave, attributes: attributeValues,
        } : s));
        resetForm();
        Alert.alert("Updated", "Service updated successfully.");
        return;
      }

      const payload = pendingServices.map((s) => ({
        vendor_id: vendor!.id, vendor_name: vendor!.name, slug: slugify(s.service_name), ...s,
      }));
      const { data, error } = await supabase.from("vendor_services").insert(payload).select();
      if (error) throw error;

      setSavedServices((prev) => [...prev, ...(data || [])]);
      setPendingServices([]);
      Alert.alert("Saved", "Services saved successfully.");
    } catch (err: any) {
      Alert.alert("Error", err?.code === "23505" ? "You already have a service under this subcategory." : (err?.message || "Unable to save services."));
    } finally {
      setSaving(false);
    }
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
  const descLength = description.trim().length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>‹ Back</Text></TouchableOpacity>
        <SpotlightMark size={20} />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (!formOpen && totalCount >= currentLimit) {
              Alert.alert("Plan limit reached", `Your current plan allows up to ${currentLimit} services.`,
                [{ text: "Cancel", style: "cancel" }, { text: "Upgrade", onPress: () => openWebPage("/getlisted?context=upgrade") }]);
              return;
            }
            setFormOpen((v) => !v);
          }}
        >
          <FontAwesome6 name="plus" size={12} color={colors.black} />
          <Text style={styles.addBtnText}>Add Service</Text>
        </TouchableOpacity>
      </View>

      {aiToast && <View style={styles.toast}><Text style={styles.toastText}>{aiToast}</Text></View>}

      <ScrollView refreshControl={refreshControl} contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <Text style={styles.title}>Service Offerings</Text>
        <Text style={styles.subtitle}>Add and manage the services your business provides.</Text>
        <Text style={styles.helperText}>Choose a category and subcategory — the subcategory name becomes your service's name. Custom names aren't used, so listings stay consistent and easy to search.</Text>
        <Text style={styles.limitText}>Your current plan allows up to {currentLimit} services. ({totalCount} used)</Text>

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

            {attributeDefs.length > 0 && (
              <>
                <Text style={styles.helperText}>Add the specs customers look for in this category (all optional, but the more you fill in, the more confident a customer can be before contacting you).</Text>
                <View style={styles.attrGrid}>{attributeDefs.map(renderAttributeField)}</View>
              </>
            )}

            <View style={styles.descHeaderRow}>
              <Text style={styles.fieldLabel}>Description (280–500 characters)</Text>
              <TouchableOpacity style={styles.aiBtn} onPress={() => setAiModalOpen(true)}>
                <FontAwesome6 name="wand-magic-sparkles" size={11} color={colors.black} />
                <Text style={styles.aiBtnText}>Generate with AI</Text>
              </TouchableOpacity>
            </View>
            <TextInput style={[styles.input, { height: 110 }]} value={description} onChangeText={setDescription} multiline maxLength={500} placeholder="Describe your service. You may use bullet points (•) to list features or deliverables." placeholderTextColor={colors.textSecondary} />
            <Text style={[styles.charCount, descLength < 280 && styles.charCountWarn]}>{descLength} / 500 {descLength < 280 ? `(minimum 280)` : ""}</Text>

            <Text style={styles.fieldLabel}>Starting price (optional)</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor={colors.textSecondary} />
            <Text style={styles.charCount}>Leave the price empty and customers will see “Contact for a quote”. Every service also gets a “Request a Quote” button.</Text>

            {renderImageSlot("Representative Image (optional)", primaryPreview, primaryUploading, "primary")}
            {renderImageSlot("Additional Image (optional)", secondaryPreview, secondaryUploading, "secondary")}
            {Array.from({ length: GALLERY_SLOTS }, (_, i) => (
              <View key={i}>{renderImageSlot(`Additional Image ${i + 3} (optional)`, galleryPreviews[i], galleryUploading[i], i)}</View>
            ))}
            <Text style={styles.hint}>JPG/PNG • Max 2MB • Min 800×800px • Up to 4 photos total</Text>

            <TouchableOpacity style={styles.addToPendingBtn} onPress={handleAddToPending} disabled={!!editingId}>
              <Text style={styles.addToPendingText}>{editingId ? "Editing..." : "Add"}</Text>
            </TouchableOpacity>
          </View>
        )}

        {pendingServices.map((s, i) => (
          <View key={i} style={styles.pill}>
            {s.representative_image_url ? <Image source={{ uri: s.representative_image_url }} style={styles.pillImage} /> : <View style={[styles.pillImage, styles.pillImagePlaceholder]}><FontAwesome6 name="image" size={16} color={colors.textSecondary} /></View>}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.pillName}>{s.service_name}</Text>
              {s.pricing_mode === "quote" ? <Text style={styles.pillPriceLabel}><Text style={styles.pillPrice}>Contact for a quote</Text></Text> : s.starting_price ? <Text style={styles.pillPriceLabel}>From <Text style={styles.pillPrice}>₦{Number(s.starting_price).toLocaleString()}</Text></Text> : null}
            </View>
            <TouchableOpacity onPress={() => handleRemovePending(i)}><FontAwesome6 name="xmark" size={18} color={colors.textSecondary} /></TouchableOpacity>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Saved Services</Text>
        {savedServices.length === 0 ? (
          <Text style={styles.emptyText}>No saved services yet.</Text>
        ) : (
          savedServices.map((s) => (
            <View key={s.id} style={styles.pill}>
              {s.representative_image_url ? <Image source={{ uri: s.representative_image_url }} style={styles.pillImage} /> : <View style={[styles.pillImage, styles.pillImagePlaceholder]}><FontAwesome6 name="image" size={16} color={colors.textSecondary} /></View>}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={styles.pillName}>{s.service_name}</Text>
                  {s.moderation_status === "pending_review" && <Text style={styles.pendingBadge}>Pending Review</Text>}
                  {s.moderation_status === "rejected" && <Text style={styles.rejectedBadge}>Not Approved</Text>}
                </View>
                {s.pricing_mode === "quote" ? <Text style={styles.pillPriceLabel}><Text style={styles.pillPrice}>Contact for a quote</Text></Text> : s.starting_price ? <Text style={styles.pillPriceLabel}>From <Text style={styles.pillPrice}>₦{Number(s.starting_price).toLocaleString()}</Text></Text> : null}
              </View>
              <TouchableOpacity onPress={() => handleEditSaved(s)} style={{ marginRight: 12 }}><Text style={styles.editLink}>Edit</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteSaved(s.id)}><FontAwesome6 name="xmark" size={18} color={colors.error} /></TouchableOpacity>
            </View>
          ))
        )}

        {(pendingServices.length > 0 || editingId) && (
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? (editingId ? "Updating..." : "Saving...") : editingId ? "Update Service" : "Save Services"}</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <Modal visible={categoryPickerOpen} animationType="slide" transparent onRequestClose={() => setCategoryPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select Category</Text>
            <TextInput style={styles.searchInput} placeholder="Search categories..." placeholderTextColor={colors.textSecondary} value={categorySearch} onChangeText={setCategorySearch} autoFocus />
            <FlatList data={filteredCategories} keyExtractor={(c) => c.id} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { setCategoryId(item.id); setSubcategoryId(""); setSubSubcategoryId(""); setCategoryPickerOpen(false); setCategorySearch(""); }}>
                <Text style={styles.pickerItemText}>{item.name}</Text>
              </TouchableOpacity>
            )} ListEmptyComponent={<Text style={styles.noResults}>No matching categories.</Text>} />
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setCategoryPickerOpen(false); setCategorySearch(""); }}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={subcategoryPickerOpen} animationType="slide" transparent onRequestClose={() => setSubcategoryPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select Subcategory</Text>
            <TextInput style={styles.searchInput} placeholder="Search subcategories..." placeholderTextColor={colors.textSecondary} value={subcategorySearch} onChangeText={setSubcategorySearch} autoFocus />
            <FlatList data={filteredSubcategories} keyExtractor={(s) => s.id} renderItem={({ item }) => {
              const alreadyAdded = item.id !== subcategoryId && usedSubcategoryIds.has(item.id);
              return (
                <TouchableOpacity style={styles.pickerItem} disabled={alreadyAdded} onPress={() => { setSubcategoryId(item.id); setSubSubcategoryId(""); setSubcategoryPickerOpen(false); setSubcategorySearch(""); }}>
                  <Text style={[styles.pickerItemText, alreadyAdded && styles.pickerItemDisabled]}>{item.name}{alreadyAdded ? " (already added)" : ""}</Text>
                </TouchableOpacity>
              );
            }} ListEmptyComponent={<Text style={styles.noResults}>No matching subcategories.</Text>} />
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSubcategoryPickerOpen(false); setSubcategorySearch(""); }}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={subSubPickerOpen} animationType="slide" transparent onRequestClose={() => setSubSubPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>Select Specific Type</Text>
            <TextInput style={styles.searchInput} placeholder="Search..." placeholderTextColor={colors.textSecondary} value={subSubSearch} onChangeText={setSubSubSearch} autoFocus />
            <FlatList data={filteredSubSubcategories} keyExtractor={(s) => s.id} renderItem={({ item }) => {
              const alreadyAdded = item.id !== subSubcategoryId && usedSubSubcategoryIds.has(item.id);
              return (
                <TouchableOpacity style={styles.pickerItem} disabled={alreadyAdded} onPress={() => { setSubSubcategoryId(item.id); setSubSubPickerOpen(false); setSubSubSearch(""); }}>
                  <Text style={[styles.pickerItemText, alreadyAdded && styles.pickerItemDisabled]}>{item.name}{alreadyAdded ? " (already added)" : ""}</Text>
                </TouchableOpacity>
              );
            }} ListEmptyComponent={<Text style={styles.noResults}>No matching options.</Text>} />
            <TouchableOpacity style={styles.closeBtn} onPress={() => { setSubSubPickerOpen(false); setSubSubSearch(""); }}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!attrPickerOpen} animationType="slide" transparent onRequestClose={() => setAttrPickerOpen(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerCard}>
            <Text style={styles.modalTitle}>{activeAttrDef?.label || "Select"}</Text>
            <FlatList data={activeAttrDef?.options || []} keyExtractor={(o) => o} renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerItem} onPress={() => { if (attrPickerOpen) handleAttributeChange(attrPickerOpen, item); setAttrPickerOpen(null); }}>
                <Text style={styles.pickerItemText}>{item}</Text>
              </TouchableOpacity>
            )} />
            <TouchableOpacity style={styles.closeBtn} onPress={() => setAttrPickerOpen(null)}><Text style={styles.closeBtnText}>Close</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AiDescribeModal
        visible={aiModalOpen}
        type="service"
        itemName={currentServiceName()}
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
  helperText: { color: colors.textSecondary, fontSize: 11, marginTop: 12, lineHeight: 16 },
  limitText: { color: colors.primary, fontSize: 12, fontWeight: "600", marginTop: 8, marginBottom: 16 },

  formCard: { backgroundColor: "#141414", borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 16, marginBottom: 20 },
  fieldLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 12, marginBottom: 6 },
  field: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12 },
  fieldText: { color: colors.white, fontSize: 14 },
  input: { backgroundColor: "#0d0d0d", borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, color: colors.white, fontSize: 14 },
  charCount: { color: colors.textSecondary, fontSize: 11, marginTop: 6, textAlign: "right" },
  charCountWarn: { color: "#facc15" },

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
  pillImagePlaceholder: { alignItems: "center", justifyContent: "center" },
  pillName: { color: colors.white, fontSize: 13, fontWeight: "600" },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  modeBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 11, alignItems: "center" },
  modeBtnActive: { borderColor: colors.primary, backgroundColor: "rgba(230,194,0,0.12)" },
  modeBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: "600" },
  modeBtnTextActive: { color: colors.primary },
  pillPrice: { color: colors.success, fontSize: 12, fontWeight: "700" },
  pillPriceLabel: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
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
  pickerItemDisabled: { color: colors.textSecondary },
  closeBtn: { marginTop: 16, padding: 14, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8 },
  closeBtnText: { color: colors.primary, fontWeight: "600" },
});
