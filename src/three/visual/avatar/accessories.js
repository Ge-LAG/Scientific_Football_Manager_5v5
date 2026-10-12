// Accessoires : cravate, nœud papillon, stéthoscope, écharpe, collier, cape, guitare, fraise.
import * as THREE from "three";
import { shape, bake, rings, sweep, twoSided, splitSides, flatShape, ell, sg, V3, smoothstep, lerp } from "./kit.js";
import { B, torsoW } from "./skeleton.js";
import { onTorso, wrapTorso } from "./body.js";

const TAU = Math.PI * 2;
const GOLD = "#e8b93a", METAL = "#c9ced8";

// Surface de la cape (u ∈ [-1,1] en largeur, v ∈ [0,1] de l'encolure à l'ourlet) — partagée avec le dossard
export function capeSurf(M, backOff, u, v) {
  const y = lerp(1.445, 0.6, v);
  const w = lerp(0.17, 0.3, v) * (0.5 + 0.5 * M.K.w);
  const rzMax = Math.max(...M.torso.map(t => t.rz));
  const zTop = -(0.085 + backOff) + 0.075 * u * u;
  const zHang = -(rzMax + backOff + 0.03) - 0.035 * (1 - u * u) - 0.03 * v;
  return V3(u * w * lerp(1.05, 1, v), y, lerp(zTop, zHang, smoothstep(0, 0.3, v)));
}
export const capeW = (x, y) => {
  const v = (1.445 - y) / 0.845, a = smoothstep(0.0, 0.1, v), b = smoothstep(0.35, 0.75, v);
  return [[B.chest, 1 - a], [B.capeA, a * (1 - b)], [B.capeB, a * b]];
};
function capeGeo(M, backOff, d) {
  const nu = sg(12, d), nv = sg(10, d), pos = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const p = capeSurf(M, backOff, -1 + (2 * i) / nu, j / nv); pos.push(p.x, p.y, p.z); }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, dd = c + 1;
    idx.push(a, b, c, b, dd, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildAccessory(ctx, type, info) {
  const { M, d, col } = ctx, fo = info.frontOff + 0.003, K = `${ctx.key}|acc|${type}|${fo}|${info.backOff}`;
  const put = (s, c, g = 0, o = true) => { if (s) ctx.parts.push({ s, c, g, o }); };
  const S = (k, fn) => shape(`${K}|${k}`, fn);
  switch (type) {
    case "tie": {
      put(S("knot", () => { const { p } = onTorso(M, 1.418, 0, fo + 0.008); return bake([[ell(0.022, 0.019, 0.012, d, 10, 6).translate(p.x, p.y, p.z), torsoW]]); }), col.acc, 0.1);
      put(S("blade", () => bake([[wrapTorso(flatShape([[-0.011, 0], [0.011, 0], [0.027, -0.24], [0, -0.29], [-0.027, -0.24]]), M, 1.405, 0, fo), torsoW]])), col.acc, 0.1, false);
      put(S("stripes", () => bake([-0.07, -0.13, -0.19].map(v => [wrapTorso(flatShape([[-0.018, v], [0.02, v - 0.03], [0.021, v - 0.038], [-0.018, v - 0.009]]), M, 1.405, 0, fo + 0.0008), torsoW]))), col.accDk, 0, false);
      break;
    }
    case "bowtie": {
      put(S("bow", () => { const { p } = onTorso(M, 1.428, 0, fo + 0.012); return bake([
        [new THREE.ConeGeometry(0.03, 0.06, 4).rotateZ(Math.PI / 2).scale(1, 1, 0.5).translate(p.x + 0.031, p.y, p.z), B.chest],
        [new THREE.ConeGeometry(0.03, 0.06, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.5).translate(p.x - 0.031, p.y, p.z), B.chest],
      ]); }), col.acc, 0.2);
      put(S("knot", () => { const { p } = onTorso(M, 1.428, 0, fo + 0.016); return bake([[ell(0.014, 0.014, 0.01, d, 8, 6).translate(p.x, p.y, p.z), B.chest]]); }), col.accDk, 0.1);
      break;
    }
    case "stethoscope": {
      put(S("tube", () => {
        const side = s => [onTorso(M, 1.2, s * 0.28, fo + 0.01).p, onTorso(M, 1.33, s * 0.4, fo + 0.01).p, V3(s * 0.1, 1.46, 0.03), V3(s * 0.08, 1.49, -0.07)];
        const L = side(1), R = side(-1);
        const pts = [...L, V3(0, 1.5, -0.1), ...R.reverse()];
        return bake([[sweep(pts, 0.009, sg(6, d)), torsoW]]);
      }), "#23232b");
      put(S("metal", () => {
        const a = onTorso(M, 1.18, 0.28, fo + 0.012).p, b = onTorso(M, 1.18, -0.28, fo + 0.012).p;
        return bake([[new THREE.CylinderGeometry(0.03, 0.03, 0.014, sg(16, d)).rotateX(Math.PI / 2).translate(a.x, a.y - 0.02, a.z + 0.006), torsoW], [ell(0.014, 0.014, 0.014, d, 8, 6).translate(b.x, b.y - 0.01, b.z + 0.004), torsoW]]);
      }), METAL, 0.15);
      break;
    }
    case "scarf": {
      const ring = [];
      for (let i = 0; i <= 16; i++) { const a = (i / 16) * TAU; ring.push(V3(Math.sin(a) * 0.105 * M.K.neck, 1.45 + 0.012 * Math.cos(a), -0.006 + Math.cos(a) * 0.097 * M.K.neck)); }
      const endW = (x, y) => { const k = smoothstep(1.41, 1.33, y); return [[B.chest, 1 - k], [B.scarf, k]]; };
      for (const [k, c] of [[0, col.team], [1, "#f4f4f4"]]) {
        put(S("loop" + k, () => bake([0, 1, 2, 3].map(q => { const i0 = (q * 2 + k) * 2; return [sweep(ring.slice(i0, i0 + 3), 0.034, sg(8, d), { closeStart: false, closeEnd: false }), B.chest]; }))), c, k ? 0 : 0.08);
        put(S("ends" + k, () => bake([0.3, 0.46].flatMap((a, e) => {
          const pts = [1.43, 1.36, 1.29, 1.22, 1.15, 1.08 - e * 0.05].map(y => onTorso(M, y, a + (1.43 - y) * 0.4, fo + 0.028 + e * 0.012).p);
          return [0, 1, 2, 3, 4].filter(s => s % 2 === k).map(s => [sweep(pts.slice(s, s + 2), 0.0085, 4, { flat: 3.5 }), endW]);
        }))), c, k ? 0 : 0.08);
      }
      break;
    }
    case "necklace": {
      put(S("chain", () => {
        const pts = [];
        for (let i = 0; i <= 24; i++) { const a = (i / 24) * TAU, y = 1.45 - 0.11 * Math.pow((1 + Math.cos(a)) / 2, 1.6); pts.push(onTorso(M, y, a, fo + 0.004).p); }
        return bake([[sweep(pts, 0.0035, 4, { closeStart: false, closeEnd: false }), torsoW]]);
      }), GOLD, 0.2, false);
      put(S("pendant", () => { const { p } = onTorso(M, 1.325, 0, fo + 0.02); return bake([
        [new THREE.TorusGeometry(0.026, 0.0035, 4, sg(16, d)).scale(1, 0.45, 1).rotateZ(0.6).translate(p.x, p.y, p.z), torsoW],
        [new THREE.TorusGeometry(0.026, 0.0035, 4, sg(16, d)).scale(1, 0.45, 1).rotateZ(-0.6).translate(p.x, p.y, p.z), torsoW],
      ]); }), GOLD, 0.25, false);
      put(S("core", () => { const { p } = onTorso(M, 1.325, 0, fo + 0.02); return bake([[ell(0.011, 0.011, 0.011, d, 8, 6).translate(p.x, p.y, p.z), torsoW]]); }), col.acc, 1, false);
      break;
    }
    case "cape": {
      const k = `cape|${info.backOff}`;
      const out = shape(`${ctx.key}|${k}|o`, () => {
        const [a, b] = splitSides(twoSided(capeGeo(M, info.backOff, d), 0.005));
        shape(`${ctx.key}|${k}|i`, () => bake([[b, capeW]]));
        return bake([[a, capeW]]);
      });
      put(out, col.teamRaw, 0.05); put(shape(`${ctx.key}|${k}|i`, () => null), col.acc, 0.05, false);
      put(S("collar", () => { const t = M.torsoAt(1.44); return bake([[twoSided(rings([{ y: 1.43, rx: t.rx + 0.03, rz: t.rz + 0.03, z: t.z }, { y: 1.52, rx: t.rx + 0.06, rz: t.rz + 0.07, z: t.z - 0.01 }], sg(16, d), { th0: 0.55 * Math.PI, th1: 1.45 * Math.PI }), 0.004), B.chest]]); }), col.teamRaw);
      put(S("clasp", () => {
        const a = capeSurf(M, info.backOff, 1, 0), b = capeSurf(M, info.backOff, -1, 0), f = onTorso(M, 1.39, 0, fo + 0.004).p;
        return bake([[ell(0.02, 0.02, 0.012, d, 8, 6).translate(a.x, a.y - 0.01, a.z + 0.01), B.chest], [ell(0.02, 0.02, 0.012, d, 8, 6).translate(b.x, b.y - 0.01, b.z + 0.01), B.chest],
          [sweep([V3(a.x, a.y - 0.01, a.z + 0.02), onTorso(M, 1.4, 0.8, fo + 0.004).p, f, onTorso(M, 1.4, -0.8, fo + 0.004).p, V3(b.x, b.y - 0.01, b.z + 0.02)], 0.004, 4), torsoW]]);
      }), GOLD, 0.25);
      break;
    }
    case "guitar": {
      const place = g => g.scale(0.9, 0.9, 0.9).rotateY(Math.PI).rotateZ(0.62).translate(0.13, 0.99, -(Math.max(...M.torso.map(t => t.rz)) + info.backOff + 0.045));
      put(S("body", () => {
        const s = new THREE.Shape();
        s.moveTo(0, -0.21);
        s.bezierCurveTo(0.16, -0.21, 0.17, -0.06, 0.12, 0.0);
        s.bezierCurveTo(0.1, 0.03, 0.14, 0.12, 0.08, 0.17);
        s.bezierCurveTo(0.05, 0.2, 0.02, 0.19, 0.02, 0.17);
        s.lineTo(-0.02, 0.17);
        s.bezierCurveTo(-0.02, 0.19, -0.05, 0.2, -0.08, 0.17);
        s.bezierCurveTo(-0.14, 0.12, -0.1, 0.03, -0.12, 0.0);
        s.bezierCurveTo(-0.17, -0.06, -0.16, -0.21, 0, -0.21);
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, curveSegments: sg(8, d) }).translate(0, 0, -0.0175);
        return bake([[place(g), B.spine]]);
      }), col.acc, 0.12);
      put(S("guard", () => {
        const s = new THREE.Shape(); s.moveTo(-0.02, 0.15); s.lineTo(0.06, 0.12); s.bezierCurveTo(0.1, 0.0, 0.08, -0.1, 0.02, -0.12); s.lineTo(-0.03, -0.05); s.closePath();
        return bake([[place(new THREE.ShapeGeometry(s).translate(0, 0, 0.0245)), B.spine]]);
      }), "#f6f6f2", 0, false);
      put(S("hw", () => bake([
        [place(new THREE.BoxGeometry(0.075, 0.022, 0.01).translate(0, 0.02, 0.028)), B.spine],
        [place(new THREE.BoxGeometry(0.075, 0.022, 0.01).translate(0, -0.06, 0.028)), B.spine],
        [place(new THREE.BoxGeometry(0.05, 0.42, 0.022).translate(0, 0.38, 0.0)), B.spine],
        [place(new THREE.BoxGeometry(0.075, 0.11, 0.018).translate(0, 0.64, 0.0)), B.spine],
      ])), "#2a2420");
      put(S("strap", () => {
        const f1 = onTorso(M, 1.25, 0.75, fo + 0.006).p, f2 = onTorso(M, 1.08, -0.5, fo + 0.006).p;
        const pts = [V3(0.2, 0.86, -0.2), V3(0.17, 1.3, -0.16), V3(0.15, 1.47, -0.04), f1, f2, V3(-0.19, 1.02, -0.02), V3(-0.12, 1.1, -0.19)];
        return bake([[sweep(pts, 0.012, 5), torsoW]]);
      }), "#3a2418", 0);
      break;
    }
    case "ruff": {
      put(S("pleats", () => {
        const n = sg(20, d), list = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU, rr = 0.108 * M.K.neck;
          list.push([ell(0.026, 0.028, 0.05, d, 8, 6).rotateX(i % 2 ? 0.25 : -0.25).rotateY(a).translate(Math.sin(a) * rr, 1.49, -0.008 + Math.cos(a) * rr * 0.95), B.chest]);
        }
        return bake(list);
      }), "#f7f5ee", 0.05);
      put(S("inner", () => bake([[new THREE.CylinderGeometry(0.12 * M.K.neck, 0.12 * M.K.neck, 0.03, sg(20, d)).translate(0, 1.49, -0.008), B.chest]])), "#d6d2c6", 0, false);
      break;
    }
  }
}
