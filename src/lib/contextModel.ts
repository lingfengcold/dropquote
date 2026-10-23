/** Corpus-derived adjacent-word scores; no sentences or puzzle answers. */
export type ContextData = Record<string, number>;

// Stored scores are capped at 2.5; multiplying by two caps every bonus at five.
export const MAX_CONTEXT_SCORE = 5;

const CLASSES: Readonly<Record<string, readonly string[]>> = {
  '@DET': 'A AN THE THIS THAT THESE THOSE MY YOUR HIS HER ITS OUR THEIR'.split(' '),
  '@OBJ': 'ME YOU HIM HER IT US THEM'.split(' '),
  '@SUBJ': 'I YOU HE SHE IT WE THEY'.split(' '),
  '@PREP': 'AT BY FOR FROM IN INTO OF ON TO WITH WITHOUT'.split(' '),
};

const memberships = new Map<string, string[]>();
for (const [category, members] of Object.entries(CLASSES)) {
  for (const word of members) {
    const list = memberships.get(word) ?? [];
    list.push(category);
    memberships.set(word, list);
  }
}

/** Inputs use the solver's normalized uppercase, letter-only word format. */
export function createContextScore(data: ContextData): (left: string, right: string) => number {
  return (left, right) => {
    let value = data[`${left} ${right}`] ?? 0;
    for (const category of memberships.get(left) ?? []) {
      value = Math.max(value, 0.7 * (data[`${category} ${right}`] ?? 0));
    }
    for (const category of memberships.get(right) ?? []) {
      value = Math.max(value, 0.7 * (data[`${left} ${category}`] ?? 0));
    }
    return 2 * value;
  };
}
