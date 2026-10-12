// Si un module chargé à la demande a disparu (nouvelle version déployée), on recharge la page une seule fois.
export function reloadOnChunkError(err) {
  try {
    if (!sessionStorage.getItem("ll.reloaded")) { sessionStorage.setItem("ll.reloaded", "1"); location.reload(); return new Promise(() => {}); }
  } catch { /* stockage indisponible */ }
  throw err;
}
