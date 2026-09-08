// ===============================================================
// src/lib/distance.ts
//
// Exact port of the Haversine + applyDistance logic from
// spotlightwebproject_staging/spotlight-next/src/app/(standalone)/
// discover-results/DiscoverResults.tsx -- same math, same filtering/
// sorting behavior, so "5km away" means the same real-world distance
// on both web and app.
// ===============================================================

export function haversineKm(
  lat1: number, lon1: number,
  lat2: number | null, lon2: number | null
): number | null {
  if (lat2 == null || lon2 == null) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function applyDistance<T>(
  items: T[],
  getLat: (i: T) => number | null,
  getLng: (i: T) => number | null,
  userLat: number | null,
  userLng: number | null,
  radius: number,
  enabled: boolean
): (T & { distanceKm?: number | null })[] {
  if (!enabled || userLat == null || userLng == null) return items as (T & { distanceKm?: number | null })[];
  return items
    .map((i) => {
      const d = haversineKm(userLat, userLng, getLat(i), getLng(i));
      return { ...i, distanceKm: d };
    })
    .filter((i) => i.distanceKm != null && i.distanceKm <= radius)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export function formatDistance(km?: number | null): string {
  if (km == null || isNaN(km)) return "";
  return km < 1 ? `${Math.round(km * 1000)}m away` : `${km.toFixed(1)}km away`;
}
