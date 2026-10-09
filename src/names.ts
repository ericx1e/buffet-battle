// Chef names, shared by the game and the server. A name is picked from two word lists ("Saucy Dumpling"), or typed;
// a typed name must pass the filter below, which the server applies too.

export const NAME_FIRST = [
  'Saucy', 'Crispy', 'Spicy', 'Zesty', 'Toasty', 'Fluffy', 'Crunchy', 'Smoky', 'Tangy', 'Sizzling',
  'Golden', 'Buttery', 'Sticky', 'Juicy', 'Peppery', 'Minty', 'Sunny', 'Frosty', 'Hasty', 'Sleepy',
  'Grumpy', 'Jolly', 'Sneaky', 'Mighty', 'Tiny', 'Humble', 'Fancy', 'Rustic', 'Speedy', 'Lucky',
  'Bold', 'Gentle', 'Wild', 'Sly', 'Brave', 'Cozy', 'Fizzy', 'Glazed', 'Seared', 'Whisked',
] as const;

export const NAME_SECOND = [
  'Dumpling', 'Noodle', 'Biscuit', 'Pickle', 'Muffin', 'Waffle', 'Pancake', 'Meatball', 'Nugget', 'Crouton',
  'Taco', 'Bagel', 'Pretzel', 'Truffle', 'Mango', 'Radish', 'Turnip', 'Olive', 'Pepper', 'Walnut',
  'Chef', 'Cook', 'Baker', 'Grill', 'Whisk', 'Ladle', 'Spatula', 'Skillet', 'Wok', 'Kettle',
  'Gnocchi', 'Ramen', 'Sushi', 'Churro', 'Scone', 'Brioche', 'Tofu', 'Kimchi', 'Paella', 'Fondue',
] as const;

/** A random name from the lists. `random` returns [0, 1). */
export function randomName(random: () => number = Math.random): string {
  const pick = <T>(xs: readonly T[]) => xs[Math.floor(random() * xs.length)];
  return `${pick(NAME_FIRST)} ${pick(NAME_SECOND)}`;
}

/** Tidies a typed name: Unicode normalized, spaces trimmed and collapsed. */
export const tidyName = (raw: string) => raw.normalize('NFKC').trim().replace(/\s+/g, ' ');

/** Allowed characters and length: 1 to 20 letters, digits, spaces and ' . _ - */
const SHAPE = /^[\p{L}\p{N} '._-]{1,20}$/u;

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't' };

/** Lowercase letters only: accents dropped and lookalike digits and symbols turned into letters. */
function plain(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[0-9@$!|+]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, '');
}

/** The ways a word might be stretched out: as is, runs of a letter cut to one, and cut to two ("fuuuck", "cooock"). */
const forms = (s: string) => [s, s.replace(/(.)\1+/g, '$1'), s.replace(/(.)\1+/g, '$1$1')];

// Checked anywhere in the name, with its words run together, so spacing, symbols, digits standing in for letters
// and stretched-out letters don't get around them.
const ANYWHERE = [
  'fuck', 'fuk', 'fuq', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'whore', 'slut', 'bastard', 'asshole',
  'nigger', 'nigga', 'faggot', 'retard', 'tranny', 'kike', 'chink', 'wetback', 'gook',
  'rape', 'rapist', 'molest', 'pedo', 'nazi', 'hitler', 'kkk', 'porn', 'penis', 'vagina', 'dildo', 'jizz',
  'semen', 'boob', 'tits', 'horny', 'naked', 'sex',
];
// Too short, or too common inside ordinary words ("canal", "Nigel"), to check anywhere: checked as whole words.
const WHOLE_WORD = ['ass', 'arse', 'fag', 'tit', 'hoe', 'cum', 'anal', 'anus', 'nude', 'spic', 'jap', 'coon', 'paki', 'twat', 'wank', 'kys'];
// Ordinary words the anywhere-list would catch, cut out before checking.
const HARMLESS = ['hancock', 'peacock', 'cocktail', 'cockatoo', 'scunthorpe', 'dickens', 'grape', 'drape', 'therapist', 'sussex', 'essex', 'shiitake', 'shitake', 'torpedo', 'cumin', 'cucumber'];
// Not rude, but would pass for the game or a bot.
const RESERVED = /^(admin|moderator|mod|system|official|bot ?chef)\b/i;

/** Why a typed name can't be used, or null when it can. */
export function nameProblem(raw: string): string | null {
  const name = tidyName(raw);
  if (!SHAPE.test(name)) return "Names are 1 to 20 letters, numbers, spaces or ' . _ -";
  if (RESERVED.test(name)) return 'That name is reserved.';
  const words = name.split(/[\s'._-]+/).map(plain).filter(Boolean);
  let joined = words.join('');
  for (const ok of HARMLESS) joined = joined.split(ok).join(' ');
  const parts = joined.split(' ').flatMap(forms);
  const rude = ANYWHERE.some((w) => parts.some((p) => p.includes(w))) || words.flatMap(forms).some((w) => WHOLE_WORD.includes(w));
  return rude ? "Let's keep the kitchen friendly: pick another name." : null;
}
