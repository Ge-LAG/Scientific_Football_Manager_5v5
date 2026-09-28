// Kit géométrique de l'avatar : formes « cuites » (positions, normales, poids de peau) mises en cache,
// puis fusionnées par avatar en UNE géométrie skinnée (couleur + lueur par sommet) => 1 appel de rendu.
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const DETAIL = { high: 1, medium: 0.75, low: 0.5 };
export const sg = (n, d) => Math.max(3, Math.round(n * d));
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;

// ── Cache de formes (partagées entre avatars) ──
const SHAPES = new Map();
export function shape(key, fn) {
  let s = SHAPES.get(key);
  if (!s) { s = fn(); SHAPES.set(key, s); }
  return s;
}

// Normales moyennées sur les positions confondues (coutures, contours)
function smoothed(pos, nor) {
  const n = pos.length / 3, acc = new Map(), out = new Float32Array(nor.length);
  const key = i => `${Math.round(pos[i * 3] * 2e3)},${Math.round(pos[i * 3 + 1] * 2e3)},${Math.round(pos[i * 3 + 2] * 2e3)}`;
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = (keys[i] = key(i));
    let a = acc.get(k);
    if (!a) acc.set(k, (a = [0, 0, 0]));
    a[0] += nor[i * 3]; a[1] += nor[i * 3 + 1]; a[2] += nor[i * 3 + 2];
  }
  for (let i = 0; i < n; i++) {
    const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  return out;
}

// Cuit une ou plusieurs géométries three : [[geo, poids], ...] ; poids = n° d'os ou (x,y,z) => [[os, w], ...]
// Attribut optionnel « tone » (1 composante) : mélange par sommet entre les 2 couleurs de la partie (c -> c2)
export function bake(list, { smooth = false } = {}) {
  if (!Array.isArray(list)) list = [[list, 0]];
  let nv = 0, ni = 0, hasT = false;
  const items = list.filter(it => it && it[0]).map(([g, w]) => {
    if (!g.index) {
      const n = g.attributes.position.count, idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (g.attributes.tone) hasT = true;
    nv += g.attributes.position.count; ni += g.index.count;
    return [g, w];
  });
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4), tt = hasT ? new Float32Array(nv) : null;
  let vo = 0, io = 0;
  for (const [g, w] of items) {
    const p = g.attributes.position, nn = g.attributes.normal, ix = g.index, n = p.count;
    if (tt && g.attributes.tone) tt.set(g.attributes.tone.array.subarray(0, n), vo);
    for (let i = 0; i < n; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), o = (vo + i) * 3;
      pos[o] = x; pos[o + 1] = y; pos[o + 2] = z;
      nor[o] = nn.getX(i); nor[o + 1] = nn.getY(i); nor[o + 2] = nn.getZ(i);
      const so = (vo + i) * 4;
      if (typeof w === "number") { si[so] = w; sw[so] = 1; continue; }
      const ws = w(x, y, z, i).filter(e => e[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
      let tot = 0;
      for (const e of ws) tot += e[1];
      ws.forEach((e, k) => { si[so + k] = e[0]; sw[so + k] = e[1] / (tot || 1); });
      if (!ws.length) sw[so] = 1;
    }
    for (let i = 0; i < ix.count; i++) idx[io + i] = ix.getX(i) + vo;
    vo += n; io += ix.count;
    g.dispose();
  }
  const s = { pos, nor: smooth ? smoothed(pos, nor) : nor, idx, si, sw, n: nv, onor: null, t: tt };
  return s;
}

// Assemble plusieurs formes cuites en une seule (mise en cache composite)
export function join(shapes) {
  const list = shapes.filter(Boolean);
  let nv = 0, ni = 0;
  for (const s of list) { nv += s.n; ni += s.idx.length; }
  const hasT = list.some(s => s.t);
  const out = { pos: new Float32Array(nv * 3), nor: new Float32Array(nv * 3), idx: new Uint32Array(ni), si: new Uint16Array(nv * 4), sw: new Float32Array(nv * 4), n: nv, onor: null, t: hasT ? new Float32Array(nv) : null };
  let vo = 0, io = 0;
  for (const s of list) {
    out.pos.set(s.pos, vo * 3); out.nor.set(s.nor, vo * 3); out.si.set(s.si, vo * 4); out.sw.set(s.sw, vo * 4);
    if (hasT && s.t) out.t.set(s.t, vo);
    for (let i = 0; i < s.idx.length; i++) out.idx[io + i] = s.idx[i] + vo;
    vo += s.n; io += s.idx.length;
  }
  return out;
}

// Fusion par avatar : parts = [{ s, c: THREE.Color, c2?: THREE.Color, g: lueur, o: contour }]
// (c2 + attribut tone : couleur = c -> c2 selon tone ; tone < 0 extrapole au-delà de c, ex. pointes plus claires)
export function mergeParts(parts, withOutline) {
  let nv = 0, ni = 0, onv = 0, oni = 0;
  for (const p of parts) {
    nv += p.s.n; ni += p.s.idx.length;
    if (withOutline && p.o) { onv += p.s.n; oni += p.s.idx.length; }
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), glow = new Float32Array(nv);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const opos = withOutline ? new Float32Array(onv * 3) : null, onor = withOutline ? new Float32Array(onv * 3) : null;
  const osi = withOutline ? new Uint16Array(onv * 4) : null, osw = withOutline ? new Float32Array(onv * 4) : null;
  const oidx = withOutline ? (onv > 65535 ? new Uint32Array(oni) : new Uint16Array(oni)) : null;
  let vo = 0, io = 0, ovo = 0, oio = 0;
  for (const p of parts) {
    const s = p.s, n = s.n, c = p.c, g = p.g || 0, c2 = s.t ? p.c2 : null;
    pos.set(s.pos, vo * 3); nor.set(s.nor, vo * 3); si.set(s.si, vo * 4); sw.set(s.sw, vo * 4);
    if (c2) {
      const cl = v => (v < 0 ? 0 : v > 1 ? 1 : v);
      for (let i = 0; i < n; i++) {
        const o = (vo + i) * 3, t = s.t[i];
        col[o] = cl(c.r + (c2.r - c.r) * t); col[o + 1] = cl(c.g + (c2.g - c.g) * t); col[o + 2] = cl(c.b + (c2.b - c.b) * t); glow[vo + i] = g;
      }
    } else for (let i = 0; i < n; i++) { const o = (vo + i) * 3; col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; glow[vo + i] = g; }
    for (let i = 0; i < s.idx.length; i++) idx[io + i] = s.idx[i] + vo;
    if (withOutline && p.o) {
      if (!s.onor) s.onor = smoothed(s.pos, s.nor);
      opos.set(s.pos, ovo * 3); onor.set(s.onor, ovo * 3); osi.set(s.si, ovo * 4); osw.set(s.sw, ovo * 4);
      for (let i = 0; i < s.idx.length; i++) oidx[oio + i] = s.idx[i] + ovo;
      ovo += n; oio += s.idx.length;
    }
    vo += n; io += s.idx.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("aGlow", new THREE.BufferAttribute(glow, 1));
  geo.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  let ogeo = null;
  if (withOutline && onv) {
    ogeo = new THREE.BufferGeometry();
    ogeo.setAttribute("position", new THREE.BufferAttribute(opos, 3));
    ogeo.setAttribute("normal", new THREE.BufferAttribute(onor, 3));
    ogeo.setAttribute("skinIndex", new THREE.BufferAttribute(osi, 4));
    ogeo.setAttribute("skinWeight", new THREE.BufferAttribute(osw, 4));
    ogeo.setIndex(new THREE.BufferAttribute(oidx, 1));
  }
  return { geo, ogeo, verts: nv };
}

// ── Générateurs de géométrie ──

// Ellipsoïde
export const ell = (rx, ry, rz, d, ws = 14, hs = 10) =>
  new THREE.SphereGeometry(1, sg(ws, d), sg(hs, d)).scale(rx, ry, rz);

// Anneaux elliptiques (tube « lathe ») : rings = [{ y, rx, rz, x?, z? }] du bas vers le haut
// th0/th1 : secteur angulaire (0 = +Z devant, croît vers +X) ; capB/capT : fermeture
export function rings(list, seg, { th0 = 0, th1 = Math.PI * 2, capB = false, capT = false, cx = 0, cz = 0, full: fullOpt } = {}) {
  const full = fullOpt ?? Math.abs(th1 - th0 - Math.PI * 2) < 1e-6;
  const cols = seg + 1, pos = [], idx = [];
  for (const r of list) {
    const a0 = r.th0 ?? th0, a1 = r.th1 ?? th1;
    for (let j = 0; j <= seg; j++) {
      const t = a0 + ((a1 - a0) * j) / seg;
      pos.push(cx + (r.x || 0) + r.rx * Math.sin(t), r.y, cz + (r.z || 0) + r.rz * Math.cos(t));
    }
  }
  for (let i = 0; i < list.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const addCap = (ri, top) => {
    const r = list[ri], ci = pos.length / 3;
    pos.push(cx + (r.x || 0), r.y + (top ? r.capH || 0 : -(r.capH || 0)), cz + (r.z || 0));
    for (let j = 0; j < seg; j++) {
      const a = ri * cols + j, b = a + 1;
      if (top) idx.push(ci, a, b); else idx.push(ci, b, a);
    }
  };
  if (capB && full) addCap(0, false);
  if (capT && full) addCap(list.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (full) fixSeam(g, list.length, cols);
  return g;
}
function fixSeam(g, nr, cols) {
  const n = g.attributes.normal;
  for (let i = 0; i < nr; i++) {
    const a = i * cols, b = a + cols - 1;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
}

// Tube balayé le long d'un chemin (mèches, queue, tuyaux, cordons) ; radii : nombre ou tableau
export function sweep(points, radii, seg, { closeStart = true, closeEnd = true, flat = 1 } = {}) {
  const P = points.map(p => (p.isVector3 ? p : V3(...p)));
  const n = P.length, R = i => (Array.isArray(radii) ? radii[i] : radii);
  const T = [], N = [], B = [];
  for (let i = 0; i < n; i++) T.push(new THREE.Vector3().subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize());
  const up = Math.abs(T[0].y) > 0.9 ? V3(1, 0, 0) : V3(0, 1, 0);
  N.push(new THREE.Vector3().crossVectors(up, T[0]).normalize());
  for (let i = 1; i < n; i++) {
    const v = N[i - 1].clone().addScaledVector(T[i], -N[i - 1].dot(T[i]));
    N.push(v.lengthSq() > 1e-8 ? v.normalize() : N[i - 1].clone());
  }
  for (let i = 0; i < n; i++) B.push(new THREE.Vector3().crossVectors(T[i], N[i]).normalize());
  const cols = seg + 1, pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const r = R(i);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r * flat;
      pos.push(P[i].x + N[i].x * c + B[i].x * s, P[i].y + N[i].y * c + B[i].y * s, P[i].z + N[i].z * c + B[i].z * s);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  if (closeStart && R(0) > 0) {
    const ci = pos.length / 3; pos.push(P[0].x, P[0].y, P[0].z);
    for (let j = 0; j < seg; j++) idx.push(ci, j + 1, j);
  }
  if (closeEnd && R(n - 1) > 0) {
    const ci = pos.length / 3, o = (n - 1) * cols; pos.push(P[n - 1].x, P[n - 1].y, P[n - 1].z);
    for (let j = 0; j < seg; j++) idx.push(ci, o + j, o + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  fixSeam(g, n, cols);
  return g;
}

// Ajoute une copie retournée (faces intérieures) : tissus ouverts visibles des deux côtés
export function twoSided(g, inset = 0.003) {
  const p = g.attributes.position, nn = g.attributes.normal, ix = g.index, n = p.count;
  const pos = new Float32Array(n * 6), nor = new Float32Array(n * 6), idx = new Uint32Array(ix.count * 2);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = p.getX(i); pos[i * 3 + 1] = p.getY(i); pos[i * 3 + 2] = p.getZ(i);
    nor[i * 3] = nn.getX(i); nor[i * 3 + 1] = nn.getY(i); nor[i * 3 + 2] = nn.getZ(i);
    const o = (n + i) * 3;
    pos[o] = p.getX(i) - nn.getX(i) * inset; pos[o + 1] = p.getY(i) - nn.getY(i) * inset; pos[o + 2] = p.getZ(i) - nn.getZ(i) * inset;
    nor[o] = -nn.getX(i); nor[o + 1] = -nn.getY(i); nor[o + 2] = -nn.getZ(i);
  }
  for (let i = 0; i < ix.count; i += 3) {
    idx[i] = ix.getX(i); idx[i + 1] = ix.getX(i + 1); idx[i + 2] = ix.getX(i + 2);
    const o = ix.count + i;
    idx[o] = ix.getX(i) + n; idx[o + 1] = ix.getX(i + 2) + n; idx[o + 2] = ix.getX(i + 1) + n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  if (g.attributes.tone) { const t = g.attributes.tone.array, tt = new Float32Array(n * 2); tt.set(t.subarray(0, n)); tt.set(t.subarray(0, n), n); out.setAttribute("tone", new THREE.BufferAttribute(tt, 1)); }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  g.dispose();
  return out;
}

// Sépare les faces extérieures / intérieures d'une géométrie twoSided (pour 2 couleurs)
export function splitSides(g) {
  const n = g.attributes.position.count / 2, ix = g.index.array, half = ix.length / 2;
  const mk = (from, to, off) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(g.attributes.position.array.slice(off * 3, (off + n) * 3), 3));
    out.setAttribute("normal", new THREE.BufferAttribute(g.attributes.normal.array.slice(off * 3, (off + n) * 3), 3));
    const idx = new Uint32Array(to - from);
    for (let i = from; i < to; i++) idx[i - from] = ix[i] - off;
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  };
  const r = [mk(0, half, 0), mk(half, ix.length, n)];
  g.dispose();
  return r;
}

// Subdivise les triangles (arête la plus longue) jusqu'à maxEdge : formes plates enroulées sur une surface courbe
export function subdivide(g, maxEdge) {
  const p = g.attributes.position, ix = g.index, out = [];
  const tri = (a, b, c, depth) => {
    const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a), m = Math.max(ab, bc, ca);
    if (m <= maxEdge || depth > 8) { out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z); return; }
    if (m === ab) { const k = a.clone().add(b).multiplyScalar(0.5); tri(a, k, c, depth + 1); tri(k, b, c, depth + 1); }
    else if (m === bc) { const k = b.clone().add(c).multiplyScalar(0.5); tri(a, b, k, depth + 1); tri(a, k, c, depth + 1); }
    else { const k = c.clone().add(a).multiplyScalar(0.5); tri(a, b, k, depth + 1); tri(k, b, c, depth + 1); }
  };
  const n = ix ? ix.count : p.count, get = i => V3().fromBufferAttribute(p, ix ? ix.getX(i) : i);
  for (let i = 0; i < n; i += 3) tri(get(i), get(i + 1), get(i + 2), 0);
  const r = new THREE.BufferGeometry();
  r.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  g.dispose();
  const m = mergeVertices(r, 1e-6);
  r.dispose();
  return m;
}

// Supprime les triangles dont le centre vérifie fn(x, y, z) (ouvertures : visage dans une capuche, bouche dans la barbe)
export function cutTris(g, fn) {
  const p = g.attributes.position, ix = g.index, keep = [];
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i), b = ix.getX(i + 1), c = ix.getX(i + 2);
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3, y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3, z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    if (!fn(x, y, z)) keep.push(a, b, c);
  }
  g.setIndex(keep);
  return g;
}

// Déforme les sommets : fn(v: Vector3) modifie v en place ; normales recalculées
export function warp(g, fn, recompute = true) {
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); fn(v, i); p.setXYZ(i, v.x, v.y, v.z); }
  if (recompute) g.computeVertexNormals();
  return g;
}

// Forme plate (THREE.Shape) -> géométrie dans le plan XY
export function flatShape(pts, curveSeg = 6) {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return new THREE.ShapeGeometry(s, curveSeg);
}
export function ellipseShape(rx, ry, seg, a0 = 0, a1 = Math.PI * 2) {
  const s = new THREE.Shape();
  s.absellipse(0, 0, rx, ry, a0, a1, false, 0);
  if (Math.abs(a1 - a0) < Math.PI * 2 - 1e-6) s.lineTo(0, 0);
  return new THREE.ShapeGeometry(s, seg);
}
// Ruban plat en arc (sourcils, traits, bouche)
export function arcRibbon(r, w, a0, a1, seg, taper = 0) {
  const pos = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, a = a0 + (a1 - a0) * t, ww = w * (1 - taper * Math.pow(Math.abs(t - 0.5) * 2, 2));
    pos.push(Math.cos(a) * (r - ww / 2), Math.sin(a) * (r - ww / 2), 0, Math.cos(a) * (r + ww / 2), Math.sin(a) * (r + ww / 2), 0);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
// Oriente l'axe +Y d'une géométrie selon dir, puis place en pos
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1);
export function orient(g, dir, pos) {
  _q.setFromUnitVectors(V3(0, 1, 0), dir.clone().normalize());
  _m.compose(pos, _q, _one);
  return g.applyMatrix4(_m);
}
// Barre cylindrique entre deux points
export function bar(a, b, r, seg = 6) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  return orient(new THREE.CylinderGeometry(r, r, len, seg, 1), d, a.clone().add(b).multiplyScalar(0.5));
}
