// Card thumbnails (2026-11-10) -- same as the website's lib/thumbUrl.ts.
// Since 10 Nov 2026 the validate-upload server step saves a small copy of
// every product, service, portfolio, gallery, cover and logo photo at
// "thumbs/<same path>" in the same storage bucket (at most 480px on its
// longest side, several times lighter). Existing photos got small copies
// by a one-time job on the same day.
//
// thumbUrl() turns a photo's public URL into its small copy's URL; any
// other URL comes back unchanged. Use it only for cards and lists (via
// ThumbImage, which falls back to the original if the small copy fails).
const THUMB_BUCKETS = ["vendor-gallery", "vendor-branding"];

export function thumbUrl(url: string | null | undefined): string {
  if (!url) return "";
  for (const bucket of THUMB_BUCKETS) {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const i = url.indexOf(marker);
    if (i === -1) continue;
    const rest = url.slice(i + marker.length);
    if (rest.startsWith("thumbs/")) return url;
    return url.slice(0, i + marker.length) + "thumbs/" + rest;
  }
  return url;
}
