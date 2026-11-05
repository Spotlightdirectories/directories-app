// Keyword-triggered hints shown while a vendor types in the Category search.
// Nothing shows until the typed text matches; clearing the search or choosing a category hides it.
const DELIVERY = /deliver|dispatch|despatch|courier|rider|logistic/i;
const FOOD = /food|restaurant|cater|cook|canteen|kitchen|meal|chef|takeaway|snack|chop/i;

export function serviceCategoryHint(query: string): string | null {
  const q = query.trim();
  if (q.length < 3) return null;
  const out: string[] = [];
  if (DELIVERY.test(q) || /canteen|meal/i.test(q)) out.push("Delivering your own meals? Choose Food & Catering > Meal Delivery. Delivering other people's goods? Choose Courier & Logistics.");
  if (FOOD.test(q)) out.push("Looking for catering or a restaurant? Choose Food & Catering. To sell cooked meals as products, use the Products screen and choose Prepared Meals & Takeaway.");
  return out.length ? out.join("\n") : null;
}

export function productCategoryHint(query: string): string | null {
  const q = query.trim();
  if (q.length < 3) return null;
  const out: string[] = [];
  if (FOOD.test(q)) out.push("Selling cooked food or running a restaurant? Choose Prepared Meals & Takeaway. For catering services, use the Services screen.");
  if (DELIVERY.test(q)) out.push("Delivery is a service, not a product. Add it on the Services screen: Food & Catering > Meal Delivery, or Courier & Logistics.");
  return out.length ? out.join("\n") : null;
}
