// A deliberately small, offline language model. A ranked frequency list supplies
// the main signal; contextual rules only break close ties, never exclude words.
const CORE_WORDS = (`THE OF AND TO A IN IS IT YOU THAT HE WAS FOR ON ARE AS WITH HIS
  THEY I AT BE THIS HAVE FROM OR ONE HAD BY WORD BUT NOT WHAT ALL WERE WE WHEN YOUR
  CAN SAID THERE USE AN EACH WHICH SHE DO HOW THEIR IF WILL UP OTHER ABOUT OUT MANY
  THEN THEM THESE SO SOME HER WOULD MAKE LIKE HIM INTO TIME HAS LOOK TWO MORE WRITE
  GO SEE NUMBER NO WAY COULD PEOPLE MY THAN FIRST WATER BEEN CALL WHO OIL ITS NOW
  FIND LONG DOWN DAY DID GET COME MADE MAY PART`).split(/\s+/);

const PAIRS = (`OF THE|IN THE|TO THE|ON THE|FOR THE|AND THE|WITH THE|AT THE|FROM THE|
  BY THE|IS THE|AS THE|IN A|TO A|OF A|FOR A|WITH A|AS A|IT IS|IT WAS|THAT IS|
  THERE IS|THERE ARE|THERE WAS|THERE WERE|YOU ARE|WE ARE|THEY ARE|I AM|I WAS|
  HE IS|SHE IS|HE WAS|SHE WAS|WE HAVE|THEY HAVE|I HAVE|YOU HAVE|HAS BEEN|HAVE BEEN|
  HAD BEEN|WILL BE|WOULD BE|CAN BE|COULD BE|SHOULD BE|MUST BE|DO NOT|DOES NOT|
  DID NOT|IS NOT|ARE NOT|WAS NOT|WERE NOT|HAVE NOT|HAS NOT|WILL NOT|CAN NOT|
  WOULD NOT|COULD NOT|SHOULD NOT|NOT A|NOT THE|NOT TO|ONE OF|SOME OF|ALL OF|
  OUT OF|BECAUSE OF|INTO THE|THAN THE|THAN A|SUCH AS|AS IF|AS WELL|AS MUCH|
  AS MANY|MORE THAN|LESS THAN|RATHER THAN|SO THAT|EVEN IF|EVEN THOUGH|TO BE|
  TO HAVE|TO DO|TO MAKE|TO GET|TO SEE|TO KNOW|TO LIVE|TO LOVE|TO FIND|TO GIVE|
  YOU CAN|WE CAN|I CAN|THEY CAN|YOU WILL|I WILL|WE WILL|THEY WILL|THE ONLY|
  THE SAME|THE FIRST|THE LAST|THE BEST|A LITTLE|A FEW|A LOT|A GOOD|EVERY DAY|
  NO ONE|NO MORE|NO MATTER|EACH OTHER|OTHER PEOPLE|PEOPLE WHO|THOSE WHO|
  ALL THAT|ALL THINGS|THEREFORE I|I THINK|I KNOW|I BELIEVE|I LOVE|I WANT|
  WE MUST|YOU MUST|LIFE IS|LOVE IS|TIME IS|TRUTH IS|THIS IS|THAT WAS|THIS WAS|
  MORE IMPORTANT|IMPORTANT THAN|BE ABLE|ABLE TO|USED TO|HAVE TO|HAS TO|
  NEED TO|WANT TO|GOING TO|HAD TO|BEEN A|BEEN THE|BEEN IN|BEEN TO|BEEN ABLE`)
  .split('|').map(pair => pair.trim().replace(/\s+/g, ' '));

const PAIR_BONUSES = new Map(PAIRS.map(pair => [pair, 0.72]));
const ARTICLES = new Set(['A', 'AN', 'THE']);
const SUBJECTS = new Set(['I', 'YOU', 'WE', 'THEY', 'HE', 'SHE', 'IT']);
const PREPOSITIONS = new Set(['OF', 'IN', 'ON', 'AT', 'BY', 'FROM', 'WITH', 'INTO']);
const SHORT_WITHOUT_VOWELS = new Set(['BY', 'MY', 'WHY', 'TRY', 'CRY', 'DRY', 'FLY', 'SHY', 'SKY', 'GYM']);

// An upper bound used by branch-and-bound. Keep this at least as large as every
// positive adjustment returned by adjacentWordScore.
export const MAX_PAIR_SCORE = 0.85;

export interface WordPrior {
  word: string;
  score: number;
  rare: boolean;
  joinedFrom?: [string, string];
}

export function normalizeWord(value: string): string | null {
  const word = value.trim().toUpperCase().replace(/['’\-]/g, '');
  return /^[A-Z]+$/.test(word) ? word : null;
}

export class LanguageModel {
  private ranks = new Map<string, number>();
  private coreRanks = new Map(CORE_WORDS.map((word, index) => [word, index + 1]));
  private ranked: boolean;

  constructor(commonWords: Set<string> | string[] = []) {
    this.ranked = Array.isArray(commonWords);
    let rank = 1;
    for (const item of commonWords) {
      const word = normalizeWord(item);
      if (word && !this.ranks.has(word)) this.ranks.set(word, rank++);
    }
  }

  prior(word: string, custom = false): WordPrior {
    const rank = this.ranks.get(word);
    const coreRank = this.coreRanks.get(word);
    // Rank is converted to a Zipf-like scale, not presented as a measured Zipf
    // frequency. Set callers retain an unranked membership prior for compatibility.
    let score = rank === undefined ? 0.7 : this.ranked ? 6.7 - Math.log10(rank) : 3.5;
    if (coreRank !== undefined) score = Math.max(score, 6.6 - Math.log10(coreRank));
    if (custom) score = Math.max(score, 2.7);
    if (word.length <= 3 && !/[AEIOU]/.test(word) && !SHORT_WITHOUT_VOWELS.has(word) && !custom) score -= 1.8;
    if (word.length <= 2 && coreRank === undefined && rank === undefined && !custom) score -= 0.8;
    return { word, score, rare: !custom && coreRank === undefined && score < 2.7 };
  }

  joined(left: WordPrior, right: WordPrior): WordPrior {
    // A possible missing separator is a hypothesis, not an observed high-frequency
    // word. Never add the two component frequencies as if they proved a compound.
    return { word: left.word + right.word, score: Math.min(0.6, Math.min(left.score, right.score) * 0.1), rare: true, joinedFrom: [left.word, right.word] };
  }
}

export function adjacentWordScore(left: string, right: string): number {
  let score = PAIR_BONUSES.get(`${left} ${right}`) ?? 0;
  if (left === right && left !== 'THAT' && left !== 'HAD') score -= 1.8;
  if (ARTICLES.has(left) && (ARTICLES.has(right) || SUBJECTS.has(right))) score -= 2.3;
  if (PREPOSITIONS.has(left) && PREPOSITIONS.has(right)) score -= 1.1;
  if (left === 'A' && /^[AEIOU]/.test(right)) score -= 0.2;
  if (left === 'AN' && !/^[AEIOU]/.test(right)) score -= 0.2;
  return score;
}
