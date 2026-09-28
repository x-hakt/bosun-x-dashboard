// BXD-108: the working girls strolling outside the whorehouse (scenery). A fresh line-up every
// watch (4 hours, like the pirates' names), picked from the time alone so the server and the
// browser draw the same three. Pure and dependency-free: runs in the client bundle and in tests.

export const FOLK_WATCH_MS = 4 * 60 * 60_000;

export interface StrumpetLook {
  dress: string;
  trim: string; // petticoat edge
  hair: string;
  skin: string;
  style: 0 | 1 | 2 | 3; // long and loose, a bun, curls, a ponytail
  accent: "bow" | "flower" | "hat" | "none";
  accentColour: string;
}

export interface StreetStrumpet {
  name: string;
  look: StrumpetLook;
  x: number;
}

const FIRST = ["Zoe", "Rose", "Sal", "Moll", "Lou", "Bess", "Nell", "Kitty", "Flo", "Daisy", "Pearl", "Ivy", "Maisie", "Lottie", "Dolly", "Peggy", "Tilly", "Violet", "Hattie", "Mabel", "Clara", "Josie", "Evie", "Lil", "Greta", "Nancy", "Queenie", "Winnie"];
const EPITHET = ["Scarlet", "Velvet", "Ruby", "Silk", "Honey", "Lace", "Sugar", "Merry", "Saucy", "Peach", "Cherry", "Dimple", "Tipsy", "Garnet", "Satin", "Blushing", "Sweet", "Lucky", "Wicked", "Pretty"];
const DRESSES = ["#b8322f", "#6d3a78", "#2f7a6a", "#c2567a", "#23395b", "#d08a2e", "#8a1f4a", "#3f6f2a", "#1f1f24", "#5b3fa0"];
const TRIMS = ["#f2eee4", "#1a1a1a", "#d9b35f", "#f4c2d2"];
const HAIR = ["#2a1f1c", "#5a3522", "#8b5a2b", "#d9c07a", "#f0e2b0", "#b5452a", "#e0763a", "#9a9a9a", "#d982b5"];
const SKIN = ["#f3d2b8", "#efc39c", "#e0ac80", "#c68a5e", "#9b6541", "#6e4430"];
const ACCENTS: StrumpetLook["accent"][] = ["bow", "flower", "hat", "none"];
const ACCENT_COLOURS = ["#b8322f", "#f4c2d2", "#d9b35f", "#efe7d6", "#6d3a78", "#2f7a6a"];
const SPOTS = [70, 128, 188]; // along the street in front of the whorehouse (x 40..210)

function mulberry(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` distinct entries from `list`, in draw order. */
function draw<T>(list: readonly T[], count: number, rand: () => number): T[] {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < count && pool.length) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  return out;
}

/** The line-up on the street during the watch that contains `now`. */
export function strumpetsFor(now: number): StreetStrumpet[] {
  const watch = Math.floor(now / FOLK_WATCH_MS);
  const rand = mulberry(watch * 7919 + 101);
  const firsts = draw(FIRST, SPOTS.length, rand);
  const epithets = draw(EPITHET, SPOTS.length, rand);
  const dresses = draw(DRESSES, SPOTS.length, rand);
  return SPOTS.map((x, i) => {
    const pick = <T,>(list: readonly T[]) => list[Math.floor(rand() * list.length)];
    const look: StrumpetLook = {
      dress: dresses[i],
      trim: pick(TRIMS),
      hair: pick(HAIR),
      skin: pick(SKIN),
      style: Math.floor(rand() * 4) as StrumpetLook["style"],
      accent: pick(ACCENTS),
      accentColour: pick(ACCENT_COLOURS),
    };
    return { name: `${epithets[i]} ${firsts[i]}`, look, x };
  });
}
