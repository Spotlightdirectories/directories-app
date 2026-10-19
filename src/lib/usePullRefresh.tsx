// Shared "pull down to refresh" helper. A screen passes the function that
// loads its data; the hook tracks the spinner and runs it on each pull.
import { useState, useCallback } from "react";
import { RefreshControl } from "react-native";
import { colors } from "../theme/colors";

export function usePullRefresh(loader: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await loader(); } catch { /* the screen's own loader handles its errors */ }
    setRefreshing(false);
  }, [loader]);
  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />
  );
  return { refreshing, onRefresh, refreshControl };
}
