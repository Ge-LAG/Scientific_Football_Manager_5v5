// Limiteur à fenêtre fixe, en mémoire, avec nettoyage périodique.
export function rateLimiter({ windowMs, max }) {
  const hits = new Map(); // clé -> { count, reset }

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, Math.max(windowMs, 1000));
  cleanup.unref?.();

  function hit(key) {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    e.count++;
    return e.count <= max;
  }

  // Utilisable comme limiter(key) ou limiter.hit(key)
  hit.hit = hit;
  hit.stop = () => clearInterval(cleanup);
  hit.reset = () => hits.clear();
  return hit;
}
