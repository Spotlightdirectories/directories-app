// ===============================================================
// src/lib/uploadVendorFile.ts
//
// App-side equivalent of spotlightwebproject_staging/spotlight-next/
// src/lib/uploadVendorFile.ts -- calls the exact same "validate-upload"
// Edge Function (server-side type/size checks), so a photo uploaded
// from the app goes through identical validation as one uploaded from
// the website. Only the "get the file as base64" step differs, since
// React Native has no File.arrayBuffer() -- expo-image-picker already
// returns base64 directly when asked for it, which is simpler than
// web's manual byte-chunking.
// ===============================================================

import { supabase } from "./supabase";

export type UploadCategory =
  | "product" | "service" | "gallery" | "cover" | "logo" | "portfolio"
  | "verification" | "receipt" | "sponsorship_receipt";

export async function uploadVendorFile(
  base64: string,
  fileName: string,
  category: UploadCategory
): Promise<{ path: string; publicUrl: string | null }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("You must be logged in to upload files.");

  const response = await fetch(
    "https://gyvzmktavyrevfxnwsay.supabase.co/functions/v1/validate-upload",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ category, fileName, fileBase64: base64 }),
    }
  );

  const result = await response.json();
  if (!response.ok || !result.success) {
    throw new Error(result.error || "Upload failed. Please try again.");
  }

  return { path: result.path, publicUrl: result.publicUrl ?? null };
}
