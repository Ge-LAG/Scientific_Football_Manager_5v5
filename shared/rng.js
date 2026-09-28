// Générateur pseudo-aléatoire déterministe (mulberry32) : même graine ⇒ même match.
export function makeRng(seed = Date.now()) {
  let a = (seed >>> 0) || 0x9e3779b9;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rand.range = (lo, hi) => lo + rand() * (hi - lo);
  rand.int = n => Math.floor(rand() * n);
  rand.pick = arr => arr[Math.floor(rand() * arr.length)];
  rand.chance = p => rand() < p;
  rand.shuffle = arr => { const a2 = [...arr]; for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  return rand;
}

export const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;
