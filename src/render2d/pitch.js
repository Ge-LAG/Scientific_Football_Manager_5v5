// Rendu tactique 2D du match Manager (canvas) : terrain néon, joueurs, ballon interpolé, effets.
import { getPlayer } from "../../shared/data/content.js";

const W = 100, H = 60, S = 10, M = 34; // unités terrain → pixels, marge
const CW = W * S + M * 2, CH = H * S + M * 2;
const px = x => M + x * S, py = y => M + y * S;
const lerp = (a, b, t) => a + (b - a) * t;

export function createPitchRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = CW * dpr; canvas.height = CH * dpr; ctx.scale(dpr, dpr);
  let prev = null, cur = null, curAt = 0, interval = 100, meta = null, raf = 0, particles = [], rings = [], trail = [], flash = 0, alive = true;
  const bg = makeBackground();

  function setMeta(m) { meta = m; }
  function push(snap, tickMs) {
    prev = cur || snap; cur = snap; interval = tickMs; curAt = performance.now();
  }
  function fx(ev) {
    if (!cur || !meta) return;
    const pos = id => cur.p[id] ? { x: cur.p[id][0], y: cur.p[id][1] } : { x: cur.ball.x, y: cur.ball.y };
    const colorOf = id => getPlayer(id)?.color || "#fff";
    const teamColor = side => meta[side]?.colors?.[0] || "#fff";
    switch (ev.type) {
      case "GOAL": { flash = 1; const gx = ev.side === "home" ? 100 : 0; for (let i = 0; i < 90; i++) particles.push(part(gx, 30, teamColor(ev.side), 1.6)); rings.push({ x: gx, y: 30, r: 0, max: 26, c: teamColor(ev.side), life: 1 }); break; }
      case "SAVE": { const p = pos(ev.pid); rings.push({ ...p, r: 0, max: 7, c: "#00F0FF", life: 1 }); break; }
      case "POWERUP": { const p = pos(ev.pid); rings.push({ ...p, r: 0, max: 12, c: colorOf(ev.pid), life: 1 }); for (let i = 0; i < 26; i++) particles.push(part(p.x, p.y, colorOf(ev.pid), 0.7)); break; }
      case "TACKLE": case "INTERCEPT": { const p = pos(ev.pid); for (let i = 0; i < 10; i++) particles.push(part(p.x, p.y, "#8B5CF6", 0.45)); break; }
      case "FOUL": case "YELLOW": case "RED": { const p = pos(ev.pid); rings.push({ ...p, r: 0, max: 5, c: ev.type === "RED" ? "#FF3366" : "#FFD700", life: 1 }); break; }
      case "POST": case "BLOCK": { for (let i = 0; i < 12; i++) particles.push(part(cur.ball.x, cur.ball.y, "#ffffff", 0.5)); break; }
    }
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = 1 / 60;
    ctx.clearRect(0, 0, CW, CH);
    ctx.drawImage(bg, 0, 0, CW, CH);
    if (!cur || !meta) return;
    const t = Math.min(1, (now - curAt) / Math.max(16, interval));
    // cages aux couleurs des équipes
    goal(ctx, 0, meta.home?.colors?.[0] || "#00F0FF"); goal(ctx, 100, meta.away?.colors?.[0] || "#FF00E5");
    const b = { x: lerp(prev.ball.x, cur.ball.x, t), y: lerp(prev.ball.y, cur.ball.y, t) };
    // trajectoire de passe / tir
    if (cur.ball.tx != null && !cur.ball.o) {
      ctx.save(); ctx.setLineDash([6, 6]); ctx.lineWidth = cur.ball.k === "shot" ? 2.5 : 1.5;
      ctx.strokeStyle = cur.ball.k === "shot" ? "rgba(255,215,0,.55)" : "rgba(0,240,255,.35)";
      ctx.beginPath(); ctx.moveTo(px(b.x), py(b.y)); ctx.lineTo(px(cur.ball.tx), py(cur.ball.ty)); ctx.stroke(); ctx.restore();
    }
    // auras de power-up
    const active = new Set((cur.pu || []).map(p => p.pid));
    const debuff = new Set(cur.debuff || []);
    // joueurs
    for (const side of ["home", "away"]) {
      const team = meta[side]; if (!team) continue;
      for (const id of Object.keys(cur.p)) {
        if (!team.ids.has(id)) continue;
        const a = prev.p[id] || cur.p[id], c = cur.p[id];
        const x = lerp(a[0], c[0], t), y = lerp(a[1], c[1], t);
        drawPlayer(ctx, getPlayer(id), x, y, c[2], team, cur.ball.o === id, active.has(id), debuff.has(id), id === team.keeper, now, cur.teams?.[side]?.cards?.[id]);
      }
    }
    // ballon + traînée
    trail.push({ ...b }); if (trail.length > 10) trail.shift();
    for (let i = 0; i < trail.length - 1; i++) { const q = trail[i]; ctx.fillStyle = `rgba(255,255,255,${(i / trail.length) * 0.25})`; ctx.beginPath(); ctx.arc(px(q.x), py(q.y), 3 + i * 0.3, 0, Math.PI * 2); ctx.fill(); }
    const shot = cur.ball.k === "shot";
    ctx.save(); ctx.shadowColor = shot ? "#FFD700" : "#ffffff"; ctx.shadowBlur = shot ? 22 : 12;
    const bg2 = ctx.createRadialGradient(px(b.x) - 2, py(b.y) - 2, 1, px(b.x), py(b.y), 7);
    bg2.addColorStop(0, "#fff"); bg2.addColorStop(1, "#bbb"); ctx.fillStyle = bg2;
    ctx.beginPath(); ctx.arc(px(b.x), py(b.y), shot ? 7.5 : 6.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    // effets
    for (const r of rings) { r.r += (r.max - r.r) * 0.12; r.life -= dt * 1.4; ctx.strokeStyle = hexA(r.c, Math.max(0, r.life)); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(r.x), py(r.y), r.r * S, 0, Math.PI * 2); ctx.stroke(); }
    rings = rings.filter(r => r.life > 0);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt / p.dur; ctx.fillStyle = hexA(p.c, Math.max(0, p.life)); ctx.fillRect(px(p.x) - 2, py(p.y) - 2, 4, 4); }
    particles = particles.filter(p => p.life > 0);
    if (flash > 0) { ctx.fillStyle = `rgba(184,255,0,${flash * 0.18})`; ctx.fillRect(0, 0, CW, CH); flash -= dt * 1.2; }
  }
  raf = requestAnimationFrame(frame);
  return { push, fx, setMeta, destroy: () => { alive = false; cancelAnimationFrame(raf); } };
}

function part(x, y, c, dur) { const a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 26; return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, c, life: 1, dur: dur * (0.6 + Math.random() * 0.8) }; }
function hexA(hex, a) { const h = hex.replace("#", ""); const n = parseInt(h.length === 3 ? h.split("").map(c => c + c).join("") : h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

function goal(ctx, x, c) {
  ctx.save(); ctx.shadowColor = c; ctx.shadowBlur = 18; ctx.strokeStyle = c; ctx.lineWidth = 3;
  const w = 2.4 * S, top = py(24), h = 12 * S;
  const gx = x === 0 ? px(0) - w : px(100);
  ctx.fillStyle = hexA(c, 0.12); ctx.fillRect(gx, top, w, h); ctx.strokeRect(gx, top, w, h);
  ctx.restore();
}

function drawPlayer(ctx, p, x, y, stamina, team, hasBall, pu, debuff, keeper, now, card) {
  const X = px(x), Y = py(y), r = 15;
  const tc = team.colors[0], dc = p.color;
  if (pu) { const k = (Math.sin(now / 120) + 1) / 2; ctx.save(); ctx.shadowColor = dc; ctx.shadowBlur = 25; ctx.strokeStyle = hexA(dc, 0.5 + k * 0.5); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X, Y, r + 7 + k * 4, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  if (debuff) { ctx.strokeStyle = "rgba(255,0,229,.5)"; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.arc(X, Y, r + 5, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
  if (hasBall) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X, Y, r + 4 + Math.sin(now / 150) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
  // corps
  ctx.save(); ctx.shadowColor = tc; ctx.shadowBlur = hasBall ? 20 : 10;
  const g = ctx.createRadialGradient(X - 4, Y - 5, 2, X, Y, r);
  g.addColorStop(0, hexA(tc, 1)); g.addColorStop(1, hexA(team.colors[1] || "#0a0a12", 1));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  ctx.lineWidth = 3; ctx.strokeStyle = keeper ? "#FFD700" : dc; ctx.beginPath(); ctx.arc(X, Y, r, 0, Math.PI * 2); ctx.stroke();
  // endurance
  ctx.lineWidth = 3; ctx.strokeStyle = stamina > 55 ? "#B8FF00" : stamina > 30 ? "#FFD700" : "#FF3366";
  ctx.beginPath(); ctx.arc(X, Y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * stamina) / 100); ctx.stroke();
  // texte
  ctx.fillStyle = "#fff"; ctx.font = "800 12px Rajdhani, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "#000"; ctx.shadowBlur = 4; ctx.fillText(p.nom.slice(0, 2).toUpperCase(), X, Y + 0.5);
  ctx.font = "700 11px Rajdhani, sans-serif"; ctx.fillText(p.nom, X, Y + r + 12); ctx.shadowBlur = 0;
  if (card) { ctx.fillStyle = card === "R" ? "#FF3366" : "#FFD700"; ctx.fillRect(X + r - 2, Y - r - 4, 7, 10); }
}

function makeBackground() {
  const c = document.createElement("canvas"); c.width = CW; c.height = CH; const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, CH); grd.addColorStop(0, "#03180f"); grd.addColorStop(0.5, "#06281a"); grd.addColorStop(1, "#03180f");
  g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
  for (let i = 0; i < 10; i++) if (i % 2 === 0) { g.fillStyle = "rgba(0,0,0,.12)"; g.fillRect(px(i * 10), py(0), 10 * S, 60 * S); }
  // grille hexagonale discrète
  g.strokeStyle = "rgba(0,240,255,.05)"; g.lineWidth = 1;
  for (let y = 0; y < CH; y += 26) for (let x = (y / 26) % 2 ? 15 : 0; x < CW; x += 30) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; g.lineTo(x + 9 * Math.cos(a), y + 9 * Math.sin(a)); } g.closePath(); g.stroke(); }
  g.save(); g.shadowColor = "#00F0FF"; g.shadowBlur = 10; g.strokeStyle = "rgba(220,255,255,.75)"; g.lineWidth = 2.5;
  g.strokeRect(px(0), py(0), W * S, H * S);
  g.beginPath(); g.moveTo(px(50), py(0)); g.lineTo(px(50), py(60)); g.stroke();
  g.beginPath(); g.arc(px(50), py(30), 8 * S, 0, Math.PI * 2); g.stroke();
  for (const side of [0, 1]) {
    const x0 = side ? px(100) : px(0), d = side ? -1 : 1;
    g.beginPath(); g.moveTo(x0, py(14)); g.lineTo(x0 + d * 15 * S, py(14)); g.lineTo(x0 + d * 15 * S, py(46)); g.lineTo(x0, py(46)); g.stroke();
    g.beginPath(); g.arc(x0 + d * 11 * S, py(30), 2.5, 0, Math.PI * 2); g.fillStyle = "#fff"; g.fill();
  }
  g.beginPath(); g.arc(px(50), py(30), 3, 0, Math.PI * 2); g.fill();
  g.restore();
  return c;
}
