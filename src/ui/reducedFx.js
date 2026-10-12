// Effets réduits (Arène, Stade 3D) : choix du joueur, sinon préférence « réduire les animations » du système.
export const reducedFxOn = s => s?.reducedFx ?? (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);
