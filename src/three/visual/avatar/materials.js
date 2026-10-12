// Matériaux partagés des avatars : toon (dégradé 4 paliers) + lueur/liseré par sommet, contour « coque inversée ».
import * as THREE from "three";
import { cached } from "../util.js";

// Rampe toon : 4 paliers nets (NearestFilter)
export function toonGradient() {
  return cached("av:toonRamp", () => {
    const t = new THREE.DataTexture(new Uint8Array([72, 138, 205, 255]), 4, 1, THREE.RedFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  });
}

// Matériau principal : couleur par sommet, lueur (aGlow) et liseré de contre-jour cel-shadé
export function bodyMaterial(quality) {
  const rim = quality === "low" ? 0.0 : 0.3;
  return cached(`av:body:${quality}`, () => {
    const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aGlow;\nvarying float vGlow;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGlow = aGlow;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vGlow;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * vGlow;
  float rimF = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
  totalEmissiveRadiance += diffuseColor.rgb * smoothstep(0.58, 0.68, rimF) * ${rim.toFixed(2)} * (1.0 - vGlow);`);
    };
    m.customProgramCacheKey = () => `labToon${quality}`;
    return m;
  });
}

// Contour : faces arrière extrudées le long des normales (épaisseur ~constante à l'écran), skinning compris
export function outlineMaterial() {
  return cached("av:outline", () => new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uColor: { value: new THREE.Color("#0a0a12") }, uWidth: { value: 0.0105 } }]),
    vertexShader: `
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>
uniform float uWidth;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vec3 n = normalize(normalMatrix * objectNormal);
  float d = clamp(-mvPosition.z, 0.5, 60.0);
  mvPosition.xyz += n * uWidth * (0.5 + d * 0.1);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `
uniform vec3 uColor;
#include <common>
#include <fog_pars_fragment>
void main() {
  gl_FragColor = vec4(uColor, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`,
    side: THREE.BackSide,
    fog: true,
  }));
}

// Verres translucides (lunettes de labo, visière)
export function lensMaterial(hex) {
  return cached(`av:lens:${hex}`, () => new THREE.MeshToonMaterial({
    color: hex, gradientMap: toonGradient(), transparent: true, opacity: 0.38, depthWrite: false, emissive: hex, emissiveIntensity: 0.35,
  }));
}

// Étoiles d'étourdissement
export function starMaterial() {
  return cached("av:star", () => new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
}
