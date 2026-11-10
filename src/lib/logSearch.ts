// ===============================================================
// src/lib/logSearch.ts
//
// App-side mirror of spotlightwebproject_staging/spotlight-next/
// src/lib/logSearch.ts -- same search_logs table, same fields, same
// fire-and-forget reasoning (a logging failure must never affect a
// real user's actual search). Duplicated rather than shared since
// this is a genuinely separate codebase from the website.
// ===============================================================

import { supabase } from "./supabase";

type SearchLogParams = {
  keyword?: string;
  searchType?: string;
  category?: string;
  subcategory?: string;
  state?: string;
  lga?: string;
  verifiedOnly?: boolean;
};

export async function logSearch(params: SearchLogParams): Promise<void> {
  try {
    const { data: { session: __s } } = await supabase.auth.getSession(); const user = __s?.user ?? null;
    let customerId: string | null = null;

    if (user) {
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      customerId = customer?.id || null;
    }

    await supabase.from("search_logs").insert([
      {
        customer_id: customerId,
        search_keyword: params.keyword || null,
        search_type: params.searchType || null,
        category: params.category || null,
        subcategory: params.subcategory || null,
        state: params.state || null,
        lga: params.lga || null,
        verified_only: params.verifiedOnly ?? null,
      },
    ]);
  } catch {
    /* non-fatal */
  }
}
