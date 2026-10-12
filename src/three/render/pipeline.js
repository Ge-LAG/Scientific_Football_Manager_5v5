// Pipeline de rendu « premium » : scène HDR → (GTAO) → bloom néon → passe finale (ACES + sRGB + étalonnage) → AA.
// low = rendu direct (aucune passe). Dégradation propre : sans cible flottante ou en cas d'erreur → renderer.render.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { Pass, FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { normLevel } from "./quality.js";

// Préréglages par niveau. maxRatio = plafond du pixel ratio (avant l'échelle adaptative).
export const PIPELINE_PRESETS = {
  low: { composer: false, maxRatio: 1, exposure: 1.0 },
  medium: {
    composer: true, maxRatio: 1, exposure: 1.0, msaa: 0, aa: "smaa", ao: false,
    bloom: { strength: 0.45, radius: 0.3, threshold: 1.0, scale: 0.5 },
    grade: { vignette: 0.32, contrast: 0.14, saturation: 1.1, grain: 0, chroma: 0, split: 0.5 },
  },
  high: {
    composer: true, maxRatio: 1.5, exposure: 1.0, msaa: 0, aa: "smaa", ao: false,
    bloom: { strength: 0.5, radius: 0.35, threshold: 1.0, scale: 1 },
    grade: { vignette: 0.36, contrast: 0.16, saturation: 1.12, grain: 0.028, chroma: 0, split: 0.7 },
  },
  ultra: {
    composer: true, maxRatio: 2, exposure: 1.0, msaa: 4, aa: "smaa", ao: true,
    bloom: { strength: 0.55, radius: 0.38, threshold: 1.0, scale: 1 },
    grade: { vignette: 0.38, contrast: 0.17, saturation: 1.13, grain: 0.032, chroma: 0.0012, split: 0.8 },
  },
};

// ───────────────────────── Passe finale : tone mapping + sRGB + étalonnage ─────────────────────────

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    toneMappingExposure: { value: 1 },
    resolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uVignette: { value: 0.35 },
    uContrast: { value: 0.15 },
    uSaturation: { value: 1.1 },
    uGrain: { value: 0 },
    uChroma: { value: 0 },
    uSplit: { value: 0.6 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    precision highp float;
    uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
    attribute vec3 position; attribute vec2 uv;
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float uTime, uVignette, uContrast, uSaturation, uGrain, uChroma, uSplit, uFlash;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    #include <colorspace_pars_fragment>
    float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      vec4 col;
      #ifdef CHROMA
        // aberration chromatique radiale très légère (bords seulement)
        vec2 off = c * dot(c, c) * uChroma * 4.0;
        col = texture2D(tDiffuse, uv);
        col.r = texture2D(tDiffuse, uv - off).r;
        col.b = texture2D(tDiffuse, uv + off).b;
      #else
        col = texture2D(tDiffuse, uv);
      #endif
      col.rgb += uFlashColor * uFlash;
      // tone mapping (linéaire HDR → affichage)
      #if defined( ACES_FILMIC_TONE_MAPPING )
        col.rgb = ACESFilmicToneMapping(col.rgb);
      #elif defined( AGX_TONE_MAPPING )
        col.rgb = AgXToneMapping(col.rgb);
      #elif defined( NEUTRAL_TONE_MAPPING )
        col.rgb = NeutralToneMapping(col.rgb);
      #elif defined( REINHARD_TONE_MAPPING )
        col.rgb = ReinhardToneMapping(col.rgb);
      #elif defined( CINEON_TONE_MAPPING )
        col.rgb = CineonToneMapping(col.rgb);
      #elif defined( LINEAR_TONE_MAPPING )
        col.rgb = LinearToneMapping(col.rgb);
      #endif
      #ifdef SRGB_TRANSFER
        col = sRGBTransferOETF(col);
      #endif
      vec3 g = clamp(col.rgb, 0.0, 1.0);
      float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      // virage partiel : ombres bleu-sarcelle, hautes lumières légèrement chaudes
      g += uSplit * (vec3(-0.012, 0.004, 0.028) * (1.0 - l) * (1.0 - l) + vec3(0.02, 0.008, -0.018) * l * l);
      // courbe en S douce + saturation
      g = mix(g, g * g * (3.0 - 2.0 * g), uContrast);
      l = dot(g, vec3(0.2126, 0.7152, 0.0722));
      g = mix(vec3(l), g, uSaturation);
      // vignette (ovale, suit le format de l'écran)
      vec2 vc = c * vec2(resolution.x / max(1.0, resolution.y), 1.0) * 0.82;
      float v = 1.0 - smoothstep(0.18, 0.95, length(vc));
      g *= mix(1.0, v, uVignette);
      // grain de film (dans les tons moyens) + tramage anti-bandes
      float n = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 173.0);
      g += (n - 0.5) * uGrain * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
      g += (hash12(gl_FragCoord.xy * 1.37 + 11.0) - 0.5) / 255.0;
      gl_FragColor = vec4(clamp(g, 0.0, 1.0), 1.0);
    }`,
};

class FinalPass extends Pass {
  constructor() {
    super();
    this.uniforms = THREE.UniformsUtils.clone(FinalShader.uniforms);
    this.material = new THREE.RawShaderMaterial({
      name: "LabFinalPass", uniforms: this.uniforms,
      vertexShader: FinalShader.vertexShader, fragmentShader: FinalShader.fragmentShader,
      depthTest: false, depthWrite: false,
    });
    this._fsQuad = new FullScreenQuad(this.material);
    this._key = "";
  }
  setChroma(on) { this._chroma = !!on; this._key = ""; }
  setSize(w, h) { this.uniforms.resolution.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    const key = `${renderer.outputColorSpace}|${renderer.toneMapping}|${this._chroma ? 1 : 0}`;
    if (key !== this._key) {
      this._key = key;
      const d = {};
      if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) d.SRGB_TRANSFER = "";
      const tm = renderer.toneMapping;
      if (tm === THREE.ACESFilmicToneMapping) d.ACES_FILMIC_TONE_MAPPING = "";
      else if (tm === THREE.AgXToneMapping) d.AGX_TONE_MAPPING = "";
      else if (tm === THREE.NeutralToneMapping) d.NEUTRAL_TONE_MAPPING = "";
      else if (tm === THREE.ReinhardToneMapping) d.REINHARD_TONE_MAPPING = "";
      else if (tm === THREE.CineonToneMapping) d.CINEON_TONE_MAPPING = "";
      else if (tm === THREE.LinearToneMapping) d.LINEAR_TONE_MAPPING = "";
      if (this._chroma) d.CHROMA = "";
      this.material.defines = d;
      this.material.needsUpdate = true;
    }
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (!this.renderToScreen && this.clear) renderer.clear();
    this._fsQuad.render(renderer);
  }
  dispose() { this.material.dispose(); this._fsQuad.dispose(); }
}

// Rendu de la scène dans une cible MSAA dédiée puis copie résolue dans le tampon du composer.
// (Les cibles MSAA du composer sont invalidées après résolution par three : le bloom / GTAO qui s'y
// mélangent ensuite perdraient l'image. On garde donc des tampons simples pour la chaîne.)
class MSAARenderPass extends Pass {
  constructor(scene, camera, samples) {
    super();
    this.scene = scene; this.camera = camera;
    this.rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.rt.texture.name = "LabPipeline.msaa";
    this.material = new THREE.ShaderMaterial({
      name: "LabCopy", uniforms: { tDiffuse: { value: null } }, depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
      vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }",
    });
    this._fsQuad = new FullScreenQuad(this.material);
    this.needsSwap = false;
  }
  setSize(w, h) { this.rt.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    this.material.uniforms.tDiffuse.value = this.rt.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    this._fsQuad.render(renderer);
  }
  dispose() { this.rt.dispose(); this.material.dispose(); this._fsQuad.dispose(); }
}

// GTAO sans les objets transparents / additifs (verre, faisceaux, particules) ni les sprites
class LabGTAOPass extends GTAOPass {
  _overrideVisibility() {
    const cache = this._visibilityCache;
    this.scene.traverse(o => {
      if (!o.visible) return;
      const m = o.material;
      const skip = o.isPoints || o.isLine || o.isLine2 || o.isSprite || o.userData?.noAO ||
        (m && (Array.isArray(m) ? m.some(x => x.transparent || !x.depthWrite) : m.transparent || !m.depthWrite));
      if (skip) { o.visible = false; cache.push(o); }
    });
  }
}

// Échelle interne du bloom (moins de pixels sur « medium »)
function scaledSetSize(pass, scale) {
  const base = Object.getPrototypeOf(pass).setSize;
  pass.setSize = (w, h) => base.call(pass, Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
}

/**
 * @param {THREE.WebGLRenderer} renderer  créé de préférence avec { antialias:false, stencil:false, powerPreference:"high-performance" }
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {object} [o]
 * @param {"low"|"medium"|"high"|"ultra"} [o.quality="high"]
 * @param {boolean} [o.ao]       force l'occlusion ambiante (défaut : ultra seulement)
 * @param {boolean} [o.shadows=true]  active renderer.shadowMap (les lumières du stade décident ensuite)
 * @param {number} [o.exposure]  exposition ACES (défaut 1.0)
 * @param {boolean} [o.updateCamera=true]  setSize met à jour aspect/projection d'une PerspectiveCamera
 */
export function createPipeline(renderer, scene, camera, { quality = "high", ao, shadows = true, exposure, updateCamera = true } = {}) {
  let level = normLevel(quality);
  let preset = PIPELINE_PRESETS[level];
  let chain = null, oldChain = null, broken = null;
  let width = 0, height = 0, dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1, resScale = 1, effRatio = 1;
  let time = 0, flashI = 0;
  const flashColor = new THREE.Color(1, 1, 1);
  const gradeOverride = {};
  let exposureOverride = exposure;

  // réglages du renderer (tone mapping ACES appliqué par la passe finale, ou directement en « low »)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  if (shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; }
  const prevAutoReset = renderer.info.autoReset;
  renderer.info.autoReset = false; // compteurs cumulés sur toutes les passes de l'image

  // capacités : cible flottante indispensable pour le HDR
  let floatRT = false, maxSamples = 0;
  try {
    const gl = renderer.getContext();
    const webgl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
    floatRT = webgl2 && (renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float"));
    maxSamples = webgl2 ? renderer.capabilities.maxSamples || 0 : 0;
  } catch { floatRT = false; }
  if (!floatRT) broken = "no-float-render-target";

  {
    const s = renderer.getSize(new THREE.Vector2());
    width = s.x || 1; height = s.y || 1;
  }

  function useAO(q) { return ao === undefined ? PIPELINE_PRESETS[q].ao : !!ao && q !== "low"; }

  function buildChain(q) {
    const p = PIPELINE_PRESETS[q];
    if (!p.composer || broken) return null;
    const pr = renderer.getPixelRatio();
    const samples = Math.min(p.msaa || 0, maxSamples);
    const rt = new THREE.WebGLRenderTarget(Math.max(1, width * pr), Math.max(1, height * pr), { type: THREE.HalfFloatType });
    rt.texture.name = "LabPipeline.rt";
    const composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(pr);
    composer.setSize(width, height);
    const renderPass = samples > 1 ? new MSAARenderPass(scene, camera, samples) : new RenderPass(scene, camera);
    composer.addPass(renderPass);
    let gtao = null;
    if (useAO(q)) {
      // AO à demi-résolution (le coût plein écran est prohibitif sur GPU intégré), fusionné en pleine résolution
      gtao = new LabGTAOPass(scene, camera, Math.round(width * pr * 0.5), Math.round(height * pr * 0.5));
      scaledSetSize(gtao, 0.5);
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 10, distanceFallOff: 1 });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
      composer.addPass(gtao);
    }
    const b = p.bloom;
    const bloom = new UnrealBloomPass(new THREE.Vector2(width * pr, height * pr), b.strength, b.radius, b.threshold);
    bloom.highPassUniforms.smoothWidth.value = 0.3; // seuil progressif : le néon « s'allume » sans cassure
    // garde-fou : un pixel NaN/Inf (ou une « luciole » extrême) ne doit pas contaminer tout l'écran via le flou.
    // max() écarte NaN (sémantique D3D/ANGLE ; isnan() y est supprimé par le compilateur)
    bloom.materialHighPassFilter.fragmentShader = bloom.materialHighPassFilter.fragmentShader.replace(
      "vec4 texel = texture2D( tDiffuse, vUv );",
      "vec4 texel = texture2D( tDiffuse, vUv ); texel.rgb = min(max(texel.rgb, vec3(0.0)), vec3(32.0));");
    if (b.scale !== 1) scaledSetSize(bloom, b.scale);
    composer.addPass(bloom);
    const final = new FinalPass();
    final.setChroma((p.grade.chroma || 0) > 0);
    composer.addPass(final);
    // SMAA après l'étalonnage (entrée sRGB) ; en ultra il complète le MSAA (reflets, bords du bloom)
    let aa = null;
    if (p.aa === "smaa") aa = new SMAAPass();
    else if (p.aa === "fxaa") aa = new FXAAPass();
    if (aa) composer.addPass(aa);
    const c = { q, composer, rt, renderPass, gtao, bloom, final, aa, samples };
    applyGrade(c);
    return c;
  }

  function disposeChain(c) {
    if (!c) return;
    for (const p of c.composer.passes) p.dispose?.();
    c.composer.dispose();
  }

  function applyGrade(c = chain) {
    const p = PIPELINE_PRESETS[level];
    renderer.toneMappingExposure = exposureOverride ?? p.exposure;
    if (!c) return;
    const g = { ...p.grade, ...gradeOverride };
    const u = c.final.uniforms;
    u.uVignette.value = g.vignette; u.uContrast.value = g.contrast; u.uSaturation.value = g.saturation;
    u.uGrain.value = g.grain; u.uChroma.value = g.chroma; u.uSplit.value = g.split;
    c.bloom.strength = (gradeOverride.bloomStrength ?? p.bloom.strength) * (gradeOverride.bloomScale ?? 1);
    if (gradeOverride.bloomThreshold != null) c.bloom.threshold = gradeOverride.bloomThreshold;
    if (gradeOverride.bloomRadius != null) c.bloom.radius = gradeOverride.bloomRadius;
  }

  function applySize() {
    effRatio = Math.max(0.25, Math.min(dpr, preset.maxRatio) * resScale);
    renderer.setPixelRatio(effRatio);
    renderer.setSize(width, height, false);
    if (chain) { chain.composer.setPixelRatio(effRatio); chain.composer.setSize(width, height); }
    if (updateCamera && camera?.isPerspectiveCamera && height > 0) { camera.aspect = width / height; camera.updateProjectionMatrix(); }
  }

  function rebuild() {
    if (oldChain) disposeChain(oldChain);
    oldChain = chain; // libéré après la première image du nouveau (programmes partagés réutilisés)
    chain = null;
    try { chain = buildChain(level); } catch (e) { fail(e); }
  }

  function fail(e) {
    if (!broken) console.warn("[pipeline] post-traitement désactivé :", e?.message || e);
    broken = "error";
    disposeChain(chain); chain = null;
    disposeChain(oldChain); oldChain = null;
  }

  applySize();
  rebuild();

  return {
    /** Rend une image (dt en secondes). */
    render(dt = 1 / 60) {
      renderer.info.reset();
      time += dt;
      flashI *= Math.exp(-dt * 5);
      if (!chain) {
        renderer.render(scene, camera);
      } else {
        const u = chain.final.uniforms;
        u.uTime.value = time;
        u.uFlash.value = flashI > 0.002 ? flashI : 0;
        u.uFlashColor.value.copy(flashColor);
        try { chain.composer.render(dt); } catch (e) { fail(e); renderer.setRenderTarget(null); renderer.render(scene, camera); }
      }
      if (oldChain) { disposeChain(oldChain); oldChain = null; }
    },
    /** Taille CSS du canevas + pixel ratio de l'appareil (plafonné par niveau, × échelle adaptative). */
    setSize(w, h, pixelRatio) {
      width = Math.max(1, Math.floor(w)); height = Math.max(1, Math.floor(h));
      if (pixelRatio > 0) dpr = pixelRatio;
      applySize();
    },
    /** Échelle de résolution adaptative (0.6..1), cf. createQualityManager().scale. */
    setResolutionScale(s) {
      const n = Math.max(0.3, Math.min(1, +s || 1));
      if (Math.abs(n - resScale) < 1e-3) return;
      resScale = n; applySize();
    },
    setQuality(q) {
      const n = normLevel(q);
      if (n === level) return;
      level = n; preset = PIPELINE_PRESETS[level];
      applySize();
      rebuild();
      applyGrade();
    },
    setCamera(cam) {
      camera = cam;
      if (chain) { chain.renderPass.camera = cam; if (chain.gtao) chain.gtao.camera = cam; }
      applySize();
    },
    /** Surcharge de l'étalonnage : { vignette, contrast, saturation, grain, chroma, split, bloomStrength, bloomScale, bloomThreshold, bloomRadius, exposure } */
    setGrade(o = {}) {
      for (const [k, v] of Object.entries(o)) { if (k === "exposure") exposureOverride = v; else if (v == null) delete gradeOverride[k]; else gradeOverride[k] = v; }
      applyGrade();
    },
    /** Flash plein écran additif (but, gros impact) : intensité HDR ~0.3..1. */
    flash(color = "#ffffff", strength = 0.5) { flashColor.set(color); flashI = Math.max(flashI, strength); },
    get level() { return level; },
    get composer() { return chain?.composer || null; },
    info() {
      const r = renderer.info;
      return {
        level, composer: !!chain, fallback: broken, pixelRatio: +effRatio.toFixed(3), scale: resScale,
        msaa: chain?.samples || 0, ao: !!chain?.gtao, aa: chain?.aa ? chain.aa.constructor.name : "none",
        passes: chain ? chain.composer.passes.filter(p => p.enabled).map(p => p.constructor.name) : ["direct"],
        calls: r.render.calls, triangles: r.render.triangles, points: r.render.points, lines: r.render.lines,
        geometries: r.memory.geometries, textures: r.memory.textures, programs: r.programs?.length || 0,
      };
    },
    dispose() {
      disposeChain(chain); disposeChain(oldChain); chain = oldChain = null;
      renderer.info.autoReset = prevAutoReset;
    },
  };
}
