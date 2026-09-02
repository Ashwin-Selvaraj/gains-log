/**
 * Portion maths and food matching. Pure — no Prisma, no fetch, no React — so
 * the search endpoint, the photo estimator and the UI all share one
 * implementation, and it can be reasoned about without a database.
 *
 * Macros are stored per 100 g on Food, which is the only basis that composes:
 * any portion is a multiplication, and two foods sum without unit juggling.
 */

export type Macros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type FoodLike = {
  id: string;
  name: string;
  nameKey: string;
  aliases: string;
  category: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  servingLabel: string;
  servingGrams: number;
};

export const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };

/** Same normalisation shape as exerciseKey() — one identity per food. */
export function foodKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Macros for an arbitrary weight of a food. */
export function macrosFor(food: FoodLike, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round(food.kcalPer100g * f),
    protein: round1(food.proteinPer100g * f),
    carbs: round1(food.carbsPer100g * f),
    fat: round1(food.fatPer100g * f),
    fiber: round1(food.fiberPer100g * f),
  };
}

export function sumMacros(all: Macros[]): Macros {
  return all.reduce<Macros>(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: round1(acc.protein + m.protein),
      carbs: round1(acc.carbs + m.carbs),
      fat: round1(acc.fat + m.fat),
      fiber: round1(acc.fiber + m.fiber),
    }),
    { ...EMPTY_MACROS },
  );
}

/** Every name a food answers to: its own, plus its aliases. */
function searchTerms(food: FoodLike): string[] {
  return [
    food.nameKey,
    ...food.aliases
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean),
  ];
}

/**
 * Ranked search. Scores rather than filters, because "dosa" should surface
 * plain dosa above masala dosa, and an alias hit ("dosai") should count as
 * strongly as the canonical name.
 */
export function searchFoods(foods: FoodLike[], query: string, limit = 20): FoodLike[] {
  const q = foodKey(query);
  if (!q) return [];

  const scored: { food: FoodLike; score: number }[] = [];

  for (const food of foods) {
    const terms = searchTerms(food);
    let best = 0;

    for (const term of terms) {
      if (term === q) best = Math.max(best, 100);
      else if (term.startsWith(q)) best = Math.max(best, 80 - term.length * 0.1);
      else if (term.includes(q)) best = Math.max(best, 55 - term.length * 0.1);
      // Every query word appearing somewhere — catches "chicken curry" against
      // "Chicken curry" even when word order or spacing differs.
      else if (q.split(' ').every((w) => term.includes(w))) best = Math.max(best, 40);
    }

    if (best > 0) scored.push({ food, score: best });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((s) => s.food);
}

/**
 * Best single match for a name the *model* produced, used by the photo
 * estimator. Stricter than search: returns null rather than a bad guess, so an
 * unrecognised dish falls back to the model's own estimate instead of being
 * silently logged as something else.
 */
export function matchFood(foods: FoodLike[], name: string): FoodLike | null {
  const q = foodKey(name);
  if (!q) return null;

  // Exact name or alias.
  for (const food of foods) {
    if (searchTerms(food).includes(q)) return food;
  }

  // The model tends to be more specific than the table ("plain dosa", "boiled
  // egg"), so allow a term to be contained in the query as well as vice versa.
  let best: { food: FoodLike; score: number } | null = null;
  for (const food of foods) {
    for (const term of searchTerms(food)) {
      if (term.length < 4) continue;
      let score = 0;
      if (q.includes(term)) score = term.length;
      else if (term.includes(q) && q.length >= 4) score = q.length - 1;
      if (score > (best?.score ?? 0)) best = { food, score };
    }
  }

  return best?.food ?? null;
}

/**
 * Resolves a quantity the model or UI expressed in household units into grams.
 * "2 pieces" of a food whose serving is 45 g is 90 g.
 */
export function toGrams(
  food: FoodLike,
  quantity: number,
  unit: 'serving' | 'gram',
): number {
  return unit === 'gram' ? quantity : quantity * food.servingGrams;
}

/** "2 × 1 idli (90 g)" — what the user sees before confirming. */
export function describePortion(food: FoodLike, grams: number): string {
  const servings = grams / food.servingGrams;
  if (Math.abs(servings - Math.round(servings)) < 0.05 && servings >= 1) {
    const n = Math.round(servings);
    return n === 1
      ? `${food.servingLabel} (${Math.round(grams)} g)`
      : `${n} × ${food.servingLabel} (${Math.round(grams)} g)`;
  }
  return `${Math.round(grams)} g`;
}
