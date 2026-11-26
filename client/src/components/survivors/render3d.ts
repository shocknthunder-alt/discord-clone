import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as skClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { SurvHeroId, SurvMapId, SurvSkinId } from "@discord-clone/shared";
import { ENEMIES, MAPS, type EnemyId, type MapDef } from "./content";
import { FX, GK, HEROES_ORDER, MK, type Fx, type RView } from "./engine";
import { enemySize, enemySprite, groundTile, pickupSprite, skinLook } from "./sprites";

// 🧟 Шмиркленд in 3D (2026-11-27): a WebGL layer UNDER the 2D canvas. It draws the ground, scenery, heroes
// (rigged CC0 KayKit models, recoloured per hero / skin), the humanoid enemies (skeleton models, animation baked
// into a texture so hundreds run in a few draw calls), bosses (their own animated model) and the rest of the
// enemies + pickups as upright pictures. The camera is "oblique": the ground maps 1:1 onto the same pixels as the
// 2D renderer (so projectiles, numbers, marks drawn there line up), height goes up the screen by K.

/** how much one unit of height moves up the screen */
const K = 1.2;
/** screen height (px at zoom 1) of a hero */
const HERO_PX = 60;
const BASE = "/surv3d/";

type ModelName =
  | "barbarian"
  | "knight"
  | "mage"
  | "rogue"
  | "rogue_hooded"
  | "skeleton_minion"
  | "skeleton_warrior"
  | "skeleton_rogue"
  | "skeleton_mage"
  // CC0 animals (OpenGameArt / Grab3D via oosawak/cc0-monsters), each with its own clips (or none)
  | "a_rat"
  | "a_vbat"
  | "a_wolf"
  | "a_bear"
  | "a_werewolf"
  | "a_dragon";
const MODELS: ModelName[] = [
  "barbarian",
  "knight",
  "mage",
  "rogue",
  "rogue_hooded",
  "skeleton_minion",
  "skeleton_warrior",
  "skeleton_rogue",
  "skeleton_mage",
  "a_rat",
  "a_vbat",
  "a_wolf",
  "a_bear",
  "a_werewolf",
  "a_dragon",
];

interface Assets {
  models: Record<ModelName, GLTF>;
  clips: Map<string, THREE.AnimationClip>;
  props: GLTF;
  /** height of each model in its own units (bind pose) */
  heights: Record<ModelName, number>;
}

let assetsP: Promise<Assets> | null = null;
function loadAssets(): Promise<Assets> {
  if (assetsP) return assetsP;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const one = (n: string) => loader.loadAsync(BASE + n + ".glb");
  assetsP = (async () => {
    const [list, props] = await Promise.all([Promise.all(MODELS.map(one)), one("props")]);
    const models = {} as Record<ModelName, GLTF>;
    const heights = {} as Record<ModelName, number>;
    MODELS.forEach((m, i) => {
      models[m] = list[i]!;
      const box = new THREE.Box3().setFromObject(list[i]!.scene);
      heights[m] = Math.max(0.5, box.max.y - box.min.y);
    });
    const clips = new Map<string, THREE.AnimationClip>();
    for (const c of models.skeleton_minion.animations) clips.set(c.name, c);
    return { models, clips, props, heights };
  })();
  assetsP.catch(() => (assetsP = null));
  return assetsP;
}

/* ───────────── recolouring: the textures are an 8×4 grid of colour swatches ───────────── */

function hexRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const texCache = new Map<string, THREE.Texture>();
function recolor(src: THREE.Texture, key: string, cells: Record<number, string>): THREE.Texture {
  const hit = texCache.get(key);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  const S = 512;
  const cv = document.createElement("canvas");
  cv.width = S;
  cv.height = S;
  const c = cv.getContext("2d", { willReadFrequently: true })!;
  c.drawImage(img, 0, 0, S, S);
  const cw = S / 8;
  const ch = S / 4;
  for (const [k, col] of Object.entries(cells)) {
    const i = Number(k);
    const x = (i % 8) * cw;
    const y = Math.floor(i / 8) * ch;
    const d = c.getImageData(x, y, cw, ch);
    const px = d.data;
    let sum = 0;
    for (let j = 0; j < px.length; j += 4) sum += px[j]! * 0.3 + px[j + 1]! * 0.59 + px[j + 2]! * 0.11;
    const avg = Math.max(1, sum / (px.length / 4));
    const [r, g, b] = hexRgb(col);
    for (let j = 0; j < px.length; j += 4) {
      const f = (px[j]! * 0.3 + px[j + 1]! * 0.59 + px[j + 2]! * 0.11) / avg;
      px[j] = Math.min(255, r * f);
      px[j + 1] = Math.min(255, g * f);
      px[j + 2] = Math.min(255, b * f);
    }
    c.putImageData(d, x, y);
  }
  const t = new THREE.CanvasTexture(cv);
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}
function shade(h: string, f: number): string {
  const [r, g, b] = hexRgb(h);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${((1 << 24) | (k(r) << 16) | (k(g) << 8) | k(b)).toString(16).slice(1)}`;
}

/* ───────────── heroes ───────────── */

type Look = { body: string; trim: string; hat: string; skin: string };
interface Hero3D {
  model: ModelName;
  scale: number;
  /** optional parts (weapons, hats, capes) that stay visible */
  show: string[];
  /** weapons borrowed from another model: [model, node name] */
  extra?: [ModelName, string][];
  cells: (l: Look) => Record<number, string>;
  /** the one-off animation when the skill goes off */
  skillAnim: string;
}
/** parts every model always shows */
const CORE = /(ArmLeft|ArmRight|Body|Head|Head_Hooded|LegLeft|LegRight)$/;

const barbCells = (l: Look) => ({ 0: l.skin, 25: l.skin, 8: l.body, 9: l.body, 10: l.trim, 7: l.hat, 6: shade(l.body, 0.7), 19: shade(l.body, 0.55) });
const mageCells = (l: Look) => ({ 0: l.skin, 23: l.skin, 8: l.body, 9: l.hat, 10: l.trim, 15: shade(l.body, 0.45), 5: l.trim, 19: shade(l.body, 0.5) });
const rogueCells = (l: Look) => ({ 0: l.skin, 8: shade(l.body, 0.75), 9: l.hat, 21: l.trim, 5: shade(l.trim, 0.8), 6: shade(l.body, 0.55), 19: shade(l.body, 0.45), 15: shade(l.body, 0.35) });

const HERO3D: Record<SurvHeroId, Hero3D> = {
  peyo: { model: "barbarian", scale: 1, show: ["Barbarian_Cape"], extra: [["mage", "2H_Staff"]], cells: (l) => ({ ...barbCells(l), 1: "#d8d2c8" }), skillAnim: "Spellcast_Summon" },
  tseko: { model: "rogue", scale: 0.95, show: [], cells: (l) => ({ ...rogueCells(l), 8: l.body, 9: l.body, 6: l.hat }), skillAnim: "Cheer" },
  nikola: { model: "mage", scale: 1, show: ["Spellbook_open", "1H_Wand", "Mage_Cape"], cells: (l) => ({ ...mageCells(l), 10: "#f4f6f8", 1: "#6a6a6a" }), skillAnim: "Spellcast_Long" },
  gitsa: { model: "rogue_hooded", scale: 0.95, show: ["Rogue_Cape"], extra: [["barbarian", "Mug"]], cells: rogueCells, skillAnim: "Throw" },
  strahil: { model: "barbarian", scale: 1.18, show: ["2H_Axe"], cells: (l) => ({ ...barbCells(l), 1: "#2a2420" }), skillAnim: "2H_Melee_Attack_Spinning" },
  vela: { model: "mage", scale: 0.95, show: ["1H_Wand", "Mage_Cape"], cells: (l) => ({ ...mageCells(l), 1: l.hat, 9: l.trim }), skillAnim: "Spellcast_Shoot" },
  gosho: { model: "barbarian", scale: 1.1, show: ["Barbarian_Hat", "Barbarian_Cape"], cells: (l) => ({ ...barbCells(l), 7: shade(l.body, 1.4), 1: "#3a3028" }), skillAnim: "Taunt" },
  mitko: { model: "knight", scale: 1, show: ["Knight_Cape"], extra: [["barbarian", "1H_Axe"]], cells: (l) => ({ 0: l.skin, 8: l.body, 18: l.body, 1: "#2a2420", 3: shade(l.trim, 0.75), 7: shade(l.trim, 0.6) }), skillAnim: "Cheer" },
  stana: { model: "rogue_hooded", scale: 0.95, show: ["Rogue_Cape"], extra: [["mage", "2H_Staff"]], cells: rogueCells, skillAnim: "Spellcast_Summon" },
};

interface HeroObj {
  key: string;
  root: THREE.Group;
  /** the model inside (turned / flipped for skills) */
  body: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  cur: string;
  mats: THREE.MeshLambertMaterial[];
  yaw: number;
  lx: number;
  ly: number;
  oneShot: { name: string; t: number } | null;
  wasDead: boolean;
  seen: number;
}

/* ───────────── enemies ───────────── */

interface Enemy3D {
  m: ModelName;
  /** the clip to bake: the model's own, or one of the shared KayKit clips; null = no animation (bobs) */
  clip: string | null;
  /** screen height in px */
  h: number;
  tint: string;
  alpha?: number;
  /** animation speed */
  sp?: number;
  /** turn the model so its nose points forward (radians) */
  yaw?: number;
  /** flies this many px above the ground */
  lift?: number;
}
const EN3D: Partial<Record<EnemyId, Enemy3D>> = {
  zombie: { m: "skeleton_minion", clip: "Walking_D_Skeletons", h: 46, tint: "#a8c890" },
  skeleton: { m: "skeleton_minion", clip: "Walking_D_Skeletons", h: 46, tint: "#ffffff", sp: 1.3 },
  vampire: { m: "skeleton_rogue", clip: "Running_A", h: 50, tint: "#ff9aa8" },
  witch: { m: "skeleton_mage", clip: "Walking_A", h: 50, tint: "#c0f0a0" },
  yuda: { m: "skeleton_mage", clip: "Running_A", h: 50, tint: "#d8ecff", alpha: 0.72 },
  ghost: { m: "skeleton_rogue", clip: "Walking_A", h: 46, tint: "#eef4ff", alpha: 0.55 },
  kuker: { m: "skeleton_warrior", clip: "Walking_D_Skeletons", h: 54, tint: "#fff2e0" },
  blatnik: { m: "skeleton_warrior", clip: "Walking_D_Skeletons", h: 74, tint: "#7aa858", sp: 0.8 },
  // animals
  rat: { m: "a_rat", clip: null, h: 18, tint: "#b8b0a8", yaw: Math.PI },
  bat: { m: "a_vbat", clip: "Bat_Flying", h: 10, tint: "#c0a0d0", lift: 26, sp: 1 },
  wolf: { m: "a_wolf", clip: "Walking", h: 30, tint: "#c8c4c0", sp: 2 },
  bear: { m: "a_bear", clip: null, h: 50, tint: "#9a6a44", yaw: Math.PI },
  werewolf: { m: "a_werewolf", clip: "run", h: 58, tint: "#d0b8a0", sp: 1.2 },
};
/** bosses with their own animated model */
interface Boss3D {
  m: ModelName;
  h: number;
  tint: string;
  alpha?: number;
  show?: string[];
  yaw?: number;
  lift?: number;
}
const BOSS3D: Partial<Record<EnemyId, Boss3D>> = {
  karak: { m: "skeleton_warrior", h: 110, tint: "#8a7aa8" },
  mora: { m: "skeleton_mage", h: 104, tint: "#c890ff" },
  chuma: { m: "skeleton_mage", h: 100, tint: "#b8c878" },
  vampking: { m: "skeleton_rogue", h: 112, tint: "#ff5a70" },
  ispolin: { m: "barbarian", h: 160, tint: "#9ab0c8", show: ["2H_Axe", "Barbarian_Hat"] },
  samqueen: { m: "mage", h: 104, tint: "#f4f0ff", alpha: 0.85, show: ["2H_Staff", "Mage_Hat", "Mage_Cape"] },
  swampking: { m: "skeleton_warrior", h: 130, tint: "#5a8a3a" },
  kukerchief: { m: "barbarian", h: 124, tint: "#e8dccb", show: ["Barbarian_Hat", "Barbarian_Cape", "2H_Axe"] },
  ghostking: { m: "skeleton_rogue", h: 114, tint: "#cfe2ff", alpha: 0.6 },
  hala: { m: "skeleton_mage", h: 114, tint: "#a8b8d0" },
  wolfking: { m: "a_wolf", h: 90, tint: "#5a5560" },
  bearking: { m: "a_bear", h: 120, tint: "#6a4a30", yaw: Math.PI },
  zmey: { m: "a_dragon", h: 130, tint: "#d86040", lift: 30, yaw: Math.PI },
  lamia: { m: "a_dragon", h: 120, tint: "#6aa050", yaw: Math.PI },
  // the missions' giants
  velikan: { m: "barbarian", h: 230, tint: "#a8a090", show: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"] },
  gorskicar: { m: "barbarian", h: 210, tint: "#6a8a4a", show: ["Barbarian_Hat", "Barbarian_Cape", "2H_Axe"] },
  blatnamaika: { m: "skeleton_mage", h: 200, tint: "#7aa058" },
  ledenvelikan: { m: "knight", h: 240, tint: "#b8d8ff", show: ["2H_Sword", "Knight_Helmet", "Knight_Cape"] },
};
interface BossObj {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
  cur: string;
  mats: THREE.MeshLambertMaterial[];
  yaw: number;
  lx: number;
  ly: number;
  seen: number;
  baseTint: THREE.Color;
  body: THREE.Object3D;
  /** the model's own clips (animals) */
  own: THREE.AnimationClip[];
  animal: boolean;
}

/* ───────────── VAT: animation baked into a texture ───────────── */

interface Vat {
  geo: THREE.BufferGeometry;
  pos: THREE.DataTexture;
  nrm: THREE.DataTexture;
  texW: number;
  verts: number;
  frames: number;
  dur: number;
  height: number;
  mats: { name: string; tex: THREE.Texture | null; color: THREE.Color; glow: boolean }[];
}
const VAT_FRAMES = 20;
const VAT_W = 2048;

/** clip = null: a model without animation (one frame; the renderer bobs it) */
function bakeVat(src: THREE.Object3D, clip: THREE.AnimationClip | null): Vat {
  const root = skClone(src);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.visible) meshes.push(o as THREE.Mesh);
  });
  const FR = clip ? VAT_FRAMES : 1;
  const mixer = new THREE.AnimationMixer(root);
  if (clip) mixer.clipAction(clip).play();
  root.updateMatrixWorld(true);
  // merged geometry, grouped by material
  const matList: Vat["mats"] = [];
  const matIdx = new Map<string, number>();
  let verts = 0;
  for (const m of meshes) verts += m.geometry.attributes.position!.count;
  const uv = new Float32Array(verts * 2);
  const pos0 = new Float32Array(verts * 3);
  const nrm0 = new Float32Array(verts * 3);
  const index: number[] = [];
  const groups: { start: number; count: number; mat: number }[] = [];
  let base = 0;
  for (const m of meshes) {
    const g = m.geometry;
    const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial;
    let mi = matIdx.get(mat.name);
    if (mi === undefined) {
      mi = matList.length;
      matIdx.set(mat.name, mi);
      matList.push({ name: mat.name, tex: mat.map ?? null, color: mat.color?.clone() ?? new THREE.Color(1, 1, 1), glow: /glow/i.test(mat.name) || (mat.emissive?.getHex() ?? 0) > 0 });
    }
    const uva = g.attributes.uv;
    const n = g.attributes.position!.count;
    for (let i = 0; i < n; i++) {
      uv[(base + i) * 2] = uva ? uva.getX(i) : 0;
      uv[(base + i) * 2 + 1] = uva ? uva.getY(i) : 0;
    }
    const start = index.length;
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    else for (let i = 0; i < n; i++) index.push(base + i);
    groups.push({ start, count: index.length - start, mat: mi });
    base += n;
  }
  const rows = Math.ceil((verts * FR) / VAT_W);
  const posData = new Float32Array(VAT_W * rows * 4);
  const nrmData = new Uint8Array(VAT_W * rows * 4);
  const v = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const skin = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (let f = 0; f < FR; f++) {
    if (clip) mixer.setTime((f / FR) * clip.duration);
    root.updateMatrixWorld(true);
    let b = 0;
    for (const m0 of meshes) {
      const sk = (m0 as THREE.SkinnedMesh).isSkinnedMesh ? (m0 as THREE.SkinnedMesh) : null;
      const m = m0;
      if (sk) sk.skeleton.update();
      const bm = sk?.skeleton.boneMatrices;
      const g = m.geometry;
      const P = g.attributes.position!;
      const N = g.attributes.normal;
      const SI = g.attributes.skinIndex;
      const SW = g.attributes.skinWeight;
      nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < P.count; i++) {
        if (sk && bm && SI && SW) {
          // skinMatrix = bindInv * Σ w·bone * bind
          skin.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
          const e = skin.elements;
          for (let k = 0; k < 4; k++) {
            const w = SW.getComponent(i, k);
            if (!w) continue;
            const bi = SI.getComponent(i, k) * 16;
            for (let q = 0; q < 16; q++) e[q]! += bm[bi + q]! * w;
          }
          tmp.multiplyMatrices(sk.bindMatrixInverse, skin).multiply(sk.bindMatrix);
        } else tmp.identity();
        v.fromBufferAttribute(P, i).applyMatrix4(tmp).applyMatrix4(m.matrixWorld);
        const o = ((f * verts + b + i) * 4) | 0;
        posData[o] = v.x;
        posData[o + 1] = v.y;
        posData[o + 2] = v.z;
        posData[o + 3] = 1;
        if (f === 0) {
          pos0[(b + i) * 3] = v.x;
          pos0[(b + i) * 3 + 1] = v.y;
          pos0[(b + i) * 3 + 2] = v.z;
        }
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
        if (N) {
          nv.fromBufferAttribute(N, i).transformDirection(tmp).applyMatrix3(nm).normalize();
        } else nv.set(0, 1, 0);
        nrmData[o] = Math.round((nv.x * 0.5 + 0.5) * 255);
        nrmData[o + 1] = Math.round((nv.y * 0.5 + 0.5) * 255);
        nrmData[o + 2] = Math.round((nv.z * 0.5 + 0.5) * 255);
        nrmData[o + 3] = 255;
        if (f === 0) {
          nrm0[(b + i) * 3] = nv.x;
          nrm0[(b + i) * 3 + 1] = nv.y;
          nrm0[(b + i) * 3 + 2] = nv.z;
        }
      }
      b += P.count;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos0, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nrm0, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  for (const g of groups) geo.addGroup(g.start, g.count, g.mat);
  const pos = new THREE.DataTexture(posData, VAT_W, rows, THREE.RGBAFormat, THREE.FloatType);
  pos.needsUpdate = true;
  const nrm = new THREE.DataTexture(nrmData, VAT_W, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  nrm.needsUpdate = true;
  mixer.stopAllAction();
  return { geo, pos, nrm, texW: VAT_W, verts, frames: FR, dur: clip?.duration ?? 1, height: Math.max(0.5, maxY - Math.min(0, minY)), mats: matList };
}

const VAT_HEAD = /* glsl */ `
uniform highp sampler2D uVatPos;
uniform sampler2D uVatNrm;
uniform float uVatW;
uniform float uVatVerts;
uniform float uVatFrames;
uniform float uVatDur;
uniform float uTime;
attribute vec3 aAnim;
varying float vFlash;
ivec2 vatUV(float idx) { return ivec2(int(mod(idx, uVatW)), int(floor(idx / uVatW))); }
vec3 vatFrame() {
  float ft = fract((uTime * aAnim.y + aAnim.x) / uVatDur) * uVatFrames;
  float f0 = floor(ft);
  return vec3(f0, mod(f0 + 1.0, uVatFrames), ft - f0);
}
`;

function vatMaterial(vat: Vat, mi: number, uTime: { value: number }, alpha: number) {
  const info = vat.mats[mi]!;
  const mat = info.glow
    ? new THREE.MeshBasicMaterial({ color: info.color, map: info.tex })
    : new THREE.MeshLambertMaterial({ map: info.tex, color: info.tex ? 0xffffff : info.color });
  if (alpha < 1) {
    mat.transparent = true;
    mat.opacity = alpha;
    mat.depthWrite = false;
  }
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uVatPos = { value: vat.pos };
    sh.uniforms.uVatNrm = { value: vat.nrm };
    sh.uniforms.uVatW = { value: vat.texW };
    sh.uniforms.uVatVerts = { value: vat.verts };
    sh.uniforms.uVatFrames = { value: vat.frames };
    sh.uniforms.uVatDur = { value: vat.dur };
    sh.uniforms.uTime = uTime;
    sh.vertexShader = VAT_HEAD + sh.vertexShader
      .replace(
        "#include <beginnormal_vertex>",
        `vec3 vf = vatFrame();
float vid = float(gl_VertexID);
vec3 objectNormal = normalize(mix(texelFetch(uVatNrm, vatUV(vf.x * uVatVerts + vid), 0).xyz, texelFetch(uVatNrm, vatUV(vf.y * uVatVerts + vid), 0).xyz, vf.z) * 2.0 - 1.0);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif`,
      )
      .replace(
        "#include <begin_vertex>",
        `vec3 vf2 = vatFrame();
float vid2 = float(gl_VertexID);
vec3 transformed = mix(texelFetch(uVatPos, vatUV(vf2.x * uVatVerts + vid2), 0).xyz, texelFetch(uVatPos, vatUV(vf2.y * uVatVerts + vid2), 0).xyz, vf2.z);
vFlash = aAnim.z;`,
      );
    sh.fragmentShader = "varying float vFlash;\n" + sh.fragmentShader.replace(
      "#include <opaque_fragment>",
      `outgoingLight = mix(outgoingLight, vec3(1.0, 0.95, 0.9), clamp(vFlash, 0.0, 1.0));
#include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => `vat:${info.glow ? 1 : 0}:${alpha < 1 ? 1 : 0}`;
  return mat;
}

interface VatSet {
  mesh: THREE.InstancedMesh;
  anim: THREE.InstancedBufferAttribute;
  cfg: Enemy3D;
  vat: Vat;
  scale: number;
  n: number;
}

/* ───────────── upright pictures (animals, pickups) ───────────── */

const BB_VERT = /* glsl */ `
attribute float aCell;
attribute float aFlash;
uniform vec2 uGrid;
varying vec2 vUv;
varying float vFl;
void main() {
  float cx = mod(aCell, uGrid.x);
  float cy = floor(aCell / uGrid.x);
  vUv = vec2((cx + uv.x) / uGrid.x, 1.0 - (cy + 1.0 - uv.y) / uGrid.y);
  vFl = aFlash;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const BB_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uLight;
varying vec2 vUv;
varying float vFl;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a < 0.45) discard;
  vec3 col = c.rgb * uLight;
  col = mix(col, vec3(1.0, 0.25, 0.2), clamp(vFl, 0.0, 1.0) * 0.45);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

interface BbSet {
  mesh: THREE.InstancedMesh;
  cell: THREE.InstancedBufferAttribute;
  flash: THREE.InstancedBufferAttribute;
  /** sprite size in px (the drawn size = canvas / 2) */
  w: number;
  h: number;
  n: number;
}

function makeAtlas(cells: HTMLCanvasElement[], cols: number) {
  const cw = Math.max(...cells.map((c) => c.width));
  const ch = Math.max(...cells.map((c) => c.height));
  const rows = Math.ceil(cells.length / cols);
  const cv = document.createElement("canvas");
  cv.width = cw * cols;
  cv.height = ch * rows;
  const c = cv.getContext("2d")!;
  cells.forEach((s, i) => c.drawImage(s, (i % cols) * cw + (cw - s.width) / 2, Math.floor(i / cols) * ch + (ch - s.height), s.width, s.height));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  return { tex, cw, ch, cols, rows };
}

/* ───────────── scenery ───────────── */

interface PropKind {
  name: string;
  /** weight in the random pick */
  w: number;
  scale: number;
  parts: { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4 }[];
  meshes: THREE.InstancedMesh[];
  n: number;
}
/** [name, weight in the random pick, screen height in px] */
const PROP_LIST: [string, number, number][] = [
  ["tree_pine_yellow_large", 4, 190],
  ["tree_pine_orange_large", 3, 190],
  ["tree_pine_yellow_medium", 4, 150],
  ["tree_pine_orange_medium", 3, 150],
  ["tree_pine_yellow_small", 4, 105],
  ["tree_dead_large", 2, 180],
  ["tree_dead_medium", 3, 135],
  ["tree_dead_small", 3, 95],
  ["grave_A", 3, 34],
  ["grave_B", 3, 34],
  ["gravestone", 4, 42],
  ["gravemarker_A", 3, 40],
  ["gravemarker_B", 3, 40],
  ["fence", 2, 30],
  ["fence_broken", 2, 30],
  ["lantern_standing", 2, 64],
  ["post_lantern", 2, 70],
  ["post_skull", 1, 56],
  ["pumpkin_orange", 3, 24],
  ["pumpkin_yellow_small", 3, 16],
  ["pumpkin_orange_jackolantern", 2, 26],
  ["skull", 2, 12],
  ["skull_candle", 1, 20],
  ["ribcage", 2, 22],
  ["bone_A", 2, 8],
  ["bone_B", 2, 8],
  ["coffin", 1, 26],
  ["bench", 1, 28],
  ["candle_triple", 1, 18],
];
/** which scenery each map has: [name, weight] (heights come from PROP_LIST) */
const PROP_SETS: Record<MapDef["props"], [string, number][]> = {
  meadow: PROP_LIST.map(([n, w]) => [n, w]),
  deadwood: [
    ["tree_dead_large", 7],
    ["tree_dead_medium", 8],
    ["tree_dead_small", 7],
    ["tree_pine_orange_medium", 2],
    ["gravestone", 3],
    ["gravemarker_A", 2],
    ["skull", 3],
    ["skull_candle", 2],
    ["ribcage", 3],
    ["bone_A", 3],
    ["bone_B", 3],
    ["post_skull", 2],
    ["lantern_standing", 2],
    ["fence_broken", 2],
  ],
  swamp: [
    ["tree_dead_medium", 5],
    ["tree_dead_small", 7],
    ["ribcage", 3],
    ["bone_A", 4],
    ["bone_B", 4],
    ["skull", 3],
    ["skull_candle", 3],
    ["candle_triple", 3],
    ["coffin", 2],
    ["post_lantern", 2],
    ["grave_A", 2],
    ["fence_broken", 2],
  ],
  mountain: [
    ["tree_pine_yellow_large", 6],
    ["tree_pine_yellow_medium", 6],
    ["tree_pine_yellow_small", 6],
    ["tree_pine_orange_large", 2],
    ["gravestone", 3],
    ["gravemarker_B", 3],
    ["fence", 2],
    ["post_skull", 2],
    ["skull", 2],
    ["lantern_standing", 1],
  ],
};
/** the scenery's colour per map (snow on the pines, rot in the swamp) */
const PROP_TINT: Record<MapDef["props"], number> = { meadow: 0xffffff, deadwood: 0xb8b0c8, swamp: 0xb8d098, mountain: 0xd8f0ff };

/** prop scale: KayKit units → world */
const PROP_UNIT = 40;

/* ───────────── the renderer ───────────── */

export interface Draw3DOpts {
  me: string | null;
  camX: number;
  camY: number;
  zoom: number;
  night: boolean;
  map?: SurvMapId;
}

export class Renderer3D {
  ready = false;
  failed = false;
  private gl: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.Camera();
  private w = 1;
  private h = 1;
  private assets: Assets | null = null;
  private sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  private hemi = new THREE.HemisphereLight(0xc8dcff, 0x4a6a34, 1.25);
  private lamp = new THREE.PointLight(0xffc070, 0, 520, 1.2);
  private ground: THREE.Mesh | null = null;
  private heroes = new Map<string, HeroObj>();
  private bosses = new Map<number, BossObj>();
  private vats = new Map<EnemyId, VatSet>();
  private bbs = new Map<string, BbSet>();
  private blobs: THREE.InstancedMesh | null = null;
  private props: PropKind[] = [];
  private propTotal = 0;
  private shrine: THREE.Object3D | null = null;
  /** 🗿 sanctuaries (by enemy id) and the giant's portal arch */
  private altars = new Map<number, { obj: THREE.Object3D; mats: THREE.MeshLambertMaterial[]; seen: number }>();
  private arch: { obj: THREE.Object3D; mats: THREE.MeshLambertMaterial[] } | null = null;
  private mapNow: SurvMapId | null = null;
  private groundTex = new Map<SurvMapId, THREE.Texture>();
  private propPick: [PropKind, number][] = [];
  private propPickTotal = 1;
  private uTime = { value: 0 };
  private clock = 0;
  private frame = 0;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpC = new THREE.Color();
  private yAxis = new THREE.Vector3(0, 1, 0);
  private vatCache = new Map<string, Vat>();

  constructor(private canvas: HTMLCanvasElement) {
    try {
      this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
      this.gl.setClearColor(0x263a1d, 1);
      this.gl.shadowMap.enabled = true;
      this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
      this.gl.outputColorSpace = THREE.SRGBColorSpace;
    } catch {
      this.failed = true;
      return;
    }
    this.cam.matrixAutoUpdate = false;
    this.scene.add(this.hemi);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -900;
    sc.right = 900;
    sc.top = 900;
    sc.bottom = -900;
    sc.near = 10;
    sc.far = 4000;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 1.5;
    this.scene.add(this.sun, this.sun.target, this.lamp);
    loadAssets()
      .then((a) => {
        this.assets = a;
        this.build();
        this.ready = true;
      })
      .catch((e) => {
        console.warn("surv3d: assets failed", e);
        this.failed = true;
      });
  }

  resize(cssW: number, cssH: number) {
    if (!this.gl) return;
    this.w = Math.max(1, cssW);
    this.h = Math.max(1, cssH);
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(this.w, this.h, false);
  }

  dispose() {
    for (const h of this.heroes.values()) this.scene.remove(h.root);
    for (const b of this.bosses.values()) this.scene.remove(b.root);
    this.heroes.clear();
    this.bosses.clear();
    this.gl?.dispose();
    this.gl = null;
  }

  /** a prop's own copy (lit, casting shadows), scaled to a screen height */
  private propClone(name: string, px: number, emissive = 0): { obj: THREE.Object3D; mats: THREE.MeshLambertMaterial[] } | null {
    const src = this.assets?.props.scene.getObjectByName(name);
    if (!src) return null;
    const obj = src.clone(true);
    const mats: THREE.MeshLambertMaterial[] = [];
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const sm = m.material as THREE.MeshStandardMaterial;
      const mat = new THREE.MeshLambertMaterial({ map: sm.map ?? null, color: sm.color ?? 0xffffff, emissive });
      mats.push(mat);
      m.material = mat;
      m.castShadow = true;
      m.frustumCulled = false;
    });
    const box = new THREE.Box3().setFromObject(src);
    obj.position.set(0, 0, 0);
    obj.rotation.set(0, 0, 0);
    obj.scale.setScalar(px / K / Math.max(0.05, box.max.y - box.min.y));
    this.scene.add(obj);
    return { obj, mats };
  }

  /** 🗺️ a new map: its ground, light, colours and scenery */
  private setMap(map: SurvMapId) {
    this.mapNow = map;
    const d = MAPS[map];
    let tex = this.groundTex.get(map);
    if (!tex) {
      tex = new THREE.CanvasTexture(groundTile(map));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(8, 8);
      tex.anisotropy = 4;
      this.groundTex.set(map, tex);
    }
    if (this.ground) {
      const gm = this.ground.material as THREE.MeshLambertMaterial;
      gm.map = tex;
      gm.needsUpdate = true;
    }
    this.gl?.setClearColor(d.light.clear, 1);
    this.sun.color.set(d.light.sun);
    this.hemi.color.set(d.light.sky);
    this.hemi.groundColor.set(d.light.earth);
    const set = PROP_SETS[d.props];
    this.propPick = [];
    for (const [n, w] of set) {
      const k = this.props.find((p) => p.name === n);
      if (k) this.propPick.push([k, w]);
    }
    this.propPickTotal = this.propPick.reduce((s, [, w]) => s + w, 0) || 1;
    for (const k of this.props) for (const p of k.parts) (p.mat as THREE.MeshLambertMaterial).color.set(PROP_TINT[d.props]);
  }

  /** world units → the model's size */
  private unitFor(m: ModelName, px: number) {
    return px / K / this.assets!.heights[m];
  }

  private build() {
    const a = this.assets!;
    // ground: the meadow picture, lit
    const gt = new THREE.CanvasTexture(groundTile());
    gt.wrapS = gt.wrapT = THREE.RepeatWrapping;
    gt.colorSpace = THREE.SRGBColorSpace;
    const S = 512 * 8;
    gt.repeat.set(8, 8);
    gt.anisotropy = 4;
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(S, S), new THREE.MeshLambertMaterial({ map: gt }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // blob shadows under everyone
    const blobGeo = new THREE.CircleGeometry(1, 20);
    blobGeo.rotateX(-Math.PI / 2);
    this.blobs = new THREE.InstancedMesh(blobGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }), 900);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.blobs.count = 0;
    this.scene.add(this.blobs);

    // props
    a.props.scene.updateMatrixWorld(true);
    for (const [name, w, px] of PROP_LIST) {
      const node = a.props.scene.getObjectByName(name);
      if (!node) continue;
      const box = new THREE.Box3().setFromObject(node);
      const scale = px / K / Math.max(0.05, box.max.y - box.min.y) / PROP_UNIT;
      const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
      const parts: PropKind["parts"] = [];
      node.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const src = m.material as THREE.MeshStandardMaterial;
        const mat = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.color ?? 0xffffff });
        parts.push({ geo: m.geometry, mat, m: new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld) });
      });
      const meshes = parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geo, p.mat, 64);
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        im.count = 0;
        this.scene.add(im);
        return im;
      });
      this.props.push({ name, w, scale, parts, meshes, n: 0 });
      this.propTotal += w;
    }
    const sh = a.props.scene.getObjectByName("shrine_candles");
    if (sh) {
      this.shrine = sh.clone(true);
      this.shrine.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          const src = m.material as THREE.MeshStandardMaterial;
          m.material = new THREE.MeshLambertMaterial({ map: src.map ?? null, color: src.color ?? 0xffffff, emissive: 0x332200 });
          m.castShadow = true;
        }
      });
      this.shrine.position.set(0, 0, 0);
      this.shrine.rotation.set(0, 0, 0);
      const box = new THREE.Box3().setFromObject(sh);
      this.shrine.scale.setScalar(70 / K / Math.max(0.05, box.max.y - box.min.y));
      this.shrine.visible = false;
      this.scene.add(this.shrine);
    }

    // humanoid enemies
    for (const [type, cfg] of Object.entries(EN3D) as [EnemyId, Enemy3D][]) {
      const ck = `${cfg.m}:${cfg.clip}`;
      let vat = this.vatCache.get(ck);
      if (!vat) {
        const clip = cfg.clip ? (a.models[cfg.m].animations.find((c) => c.name === cfg.clip) ?? a.clips.get(cfg.clip) ?? null) : null;
        vat = bakeVat(a.models[cfg.m].scene, clip);
        this.vatCache.set(ck, vat);
      }
      const mats = vat.mats.map((_, i) => vatMaterial(vat!, i, this.uTime, cfg.alpha ?? 1));
      const mesh = new THREE.InstancedMesh(vat.geo, mats, 400);
      mesh.frustumCulled = false;
      mesh.count = 0;
      const anim = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
      anim.setUsage(THREE.DynamicDrawUsage);
      // each set needs its own attribute: give it its own geometry view
      const geo = vat.geo.clone();
      geo.setAttribute("aAnim", anim);
      mesh.geometry = geo;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(400 * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      if (cfg.alpha) mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.vats.set(type, { mesh, anim, cfg, vat, scale: cfg.h / K / vat.height, n: 0 });
    }
  }

  private bbSet(key: string, make: () => { cells: HTMLCanvasElement[]; cols: number; w: number; h: number }, cap: number): BbSet {
    let s = this.bbs.get(key);
    if (s) return s;
    const d = make();
    const at = makeAtlas(d.cells, d.cols);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, 0.5, 0);
    const cell = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    const flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    cell.setUsage(THREE.DynamicDrawUsage);
    flash.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aCell", cell);
    geo.setAttribute("aFlash", flash);
    const mat = new THREE.ShaderMaterial({
      vertexShader: BB_VERT,
      fragmentShader: BB_FRAG,
      uniforms: { uMap: { value: at.tex }, uGrid: { value: new THREE.Vector2(at.cols, at.rows) }, uLight: { value: new THREE.Vector3(1, 1, 1) } },
    });
    const mesh = new THREE.InstancedMesh(geo, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.scene.add(mesh);
    s = { mesh, cell, flash, w: at.cw / 2, h: at.ch / 2, n: 0 };
    this.bbs.set(key, s);
    return s;
  }

  private enemyBb(type: EnemyId) {
    return this.bbSet(
      `e:${type}`,
      () => {
        const cells: HTMLCanvasElement[] = [];
        // index = frame * 6 + variant * 2 + flip
        for (let f = 0; f < 2; f++) for (let v = 0; v < 3; v++) for (let fl = 0; fl < 2; fl++) cells.push(enemySprite(type, f, v, fl === 1));
        const d = enemySize(type);
        return { cells, cols: 6, w: d.w, h: d.h };
      },
      ENEMIES[type].boss ? 4 : 400,
    );
  }
  private gemBb() {
    return this.bbSet(
      "gems",
      () => {
        const cells: HTMLCanvasElement[] = [];
        for (let k = 0; k <= GK.bag; k++) cells.push(pickupSprite(k) ?? document.createElement("canvas"));
        return { cells, cols: 9, w: 20, h: 20 };
      },
      1500,
    );
  }

  private place(s: BbSet, x: number, y: number, cell: number, scale: number, flash: number, bob = 0) {
    if (s.n >= s.mesh.instanceMatrix.count) return;
    const hw = s.w * scale;
    const hh = s.h * scale;
    // the picture's bottom edge sits where the 2D renderer had it, standing up
    this.tmpV.set(x, bob, y + hh / 2);
    this.tmpS.set(hw, hh / K, 1);
    this.tmpM.compose(this.tmpV, this.tmpQ.identity(), this.tmpS);
    s.mesh.setMatrixAt(s.n, this.tmpM);
    s.cell.setX(s.n, cell);
    s.flash.setX(s.n, flash);
    s.n++;
  }

  private blob(x: number, y: number, rx: number, n: { i: number }) {
    const b = this.blobs!;
    if (n.i >= 900) return;
    this.tmpV.set(x, 0.5, y);
    this.tmpS.set(rx, 1, rx * 0.55);
    this.tmpM.compose(this.tmpV, this.tmpQ.identity(), this.tmpS);
    b.setMatrixAt(n.i++, this.tmpM);
  }

  /* ── heroes ── */

  private makeHero(hero: SurvHeroId, skin: SurvSkinId | undefined): HeroObj {
    const a = this.assets!;
    const cfg = HERO3D[hero];
    const src = a.models[cfg.model];
    const body = skClone(src.scene);
    const look = skinLook(hero, skin ?? "classic");
    const baseTex = (src.scene.getObjectByProperty("isMesh", true) as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
    const tex = baseTex?.map ? recolor(baseTex.map, `${hero}:${skin ?? "classic"}`, cfg.cells(look)) : null;
    const mats: THREE.MeshLambertMaterial[] = [];
    const mk = (map: THREE.Texture | null) => {
      const m = new THREE.MeshLambertMaterial({ map });
      if (skin === "ghost") {
        m.transparent = true;
        m.opacity = 0.62;
        m.emissive.set(0x5a8ab0);
      } else if (skin === "gold") {
        m.color.set(0xffe9a0);
        m.emissive.set(0x5a3a00);
      } else if (skin === "fire") {
        m.emissive.set(0x501400);
      } else if (skin === "night") {
        m.color.set(0xb8c0d8);
      }
      mats.push(m);
      return m;
    };
    const main = mk(tex);
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const name = m.name || m.parent?.name || "";
      const keep = CORE.test(name) || cfg.show.some((s) => name === s || m.parent?.name === s);
      m.visible = keep;
      m.castShadow = true;
      m.material = main;
      m.frustumCulled = false;
    });
    // borrowed weapons go to the same bone of this rig
    for (const [mn, nodeName] of cfg.extra ?? []) {
      const srcNode = a.models[mn].scene.getObjectByName(nodeName);
      const bone = srcNode?.parent ? body.getObjectByName(srcNode.parent.name) : null;
      if (!srcNode || !bone) continue;
      const c = srcNode.clone(true);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const sm = m.material as THREE.MeshStandardMaterial;
        m.material = mk(sm.map ?? null);
        m.castShadow = true;
        m.visible = true;
        m.frustumCulled = false;
      });
      c.visible = true;
      bone.add(c);
    }
    const root = new THREE.Group();
    body.scale.setScalar(this.unitFor(cfg.model, HERO_PX * cfg.scale));
    root.add(body);
    this.scene.add(root);
    const mixer = new THREE.AnimationMixer(body);
    return { key: `${hero}:${skin ?? ""}`, root, body, mixer, actions: new Map(), cur: "", mats, yaw: 0, lx: NaN, ly: NaN, oneShot: null, wasDead: false, seen: 0 };
  }

  private play(o: { mixer: THREE.AnimationMixer; actions: Map<string, THREE.AnimationAction>; cur: string; own?: THREE.AnimationClip[] }, name: string, fade = 0.15, once = false, speed = 1) {
    let act = o.actions.get(name);
    if (!act) {
      const clip = o.own?.find((c) => c.name === name) ?? this.assets!.clips.get(name);
      if (!clip) return;
      act = o.mixer.clipAction(clip);
      o.actions.set(name, act);
    }
    act.timeScale = speed;
    if (o.cur === name) return;
    const prev = o.cur ? o.actions.get(o.cur) : null;
    act.reset();
    if (once) {
      act.setLoop(THREE.LoopOnce, 1);
      act.clampWhenFinished = true;
    } else act.setLoop(THREE.LoopRepeat, Infinity);
    act.play();
    if (prev) act.crossFadeFrom(prev, fade, false);
    o.cur = name;
  }

  pushFx(list: Fx[], view: RView) {
    if (!this.ready) return;
    for (const f of list) {
      if (f[0] === FX.skill) {
        const p = view.players[f[1] as number];
        const hero = HEROES_ORDER[f[4] as number];
        if (!p || !hero) continue;
        const h = this.heroes.get(p.uid);
        if (h && hero !== "tseko" && hero !== "strahil") h.oneShot = { name: HERO3D[hero].skillAnim, t: 1.1 };
      }
    }
  }

  /* ── the frame ── */

  render(v: RView, o: Draw3DOpts, dt: number) {
    const gl = this.gl;
    if (!gl || !this.ready) return;
    this.clock += dt;
    this.frame++;
    this.uTime.value = this.clock;
    const z = o.zoom;
    const halfW = this.w / 2 / z;
    const halfH = this.h / 2 / z;
    const cx = o.camX;
    const cz = o.camY;
    const R = 4000;
    // oblique projection: x → x, ground y → screen y 1:1 (like 2D), height → up the screen by K
    this.cam.projectionMatrix.set(1 / halfW, 0, 0, -cx / halfW, 0, K / halfH, -1 / halfH, cz / halfH, 0, -1 / R, -K / R, (K * cz) / R, 0, 0, 0, 1);
    this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
    this.cam.matrixWorld.identity();
    this.cam.matrixWorldInverse.identity();

    const map = o.map ?? "polyana";
    if (map !== this.mapNow) this.setMap(map);
    const L = MAPS[map].light;
    // lights follow the camera
    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.set(cx - 700, 1400, cz + 500);
    this.sun.intensity = o.night ? 0.35 : L.sunI;
    this.hemi.intensity = o.night ? 0.35 : L.skyI;
    const me = v.players.find((p) => p.uid === o.me) ?? v.players[0];
    if (me) this.lamp.position.set(me.x, 90, me.y + 20);
    this.lamp.intensity = o.night ? 6 : 0;

    // ground snapped to its tile so the pattern never swims
    if (this.ground) this.ground.position.set(Math.round(cx / 512) * 512, 0, Math.round(cz / 512) * 512);

    const x0 = cx - halfW - 120;
    const x1 = cx + halfW + 120;
    const y0 = cz - halfH - 160;
    const y1 = cz + halfH + 240;
    const on = (x: number, y: number) => x > x0 && x < x1 && y > y0 && y < y1;

    this.drawProps(x0, x1, y0, y1);

    const blobN = { i: 0 };
    for (const s of this.bbs.values()) s.n = 0;
    for (const s of this.vats.values()) s.n = 0;

    // shrine
    const sm = v.marks.find((m) => m.kind === MK.shrine);
    if (this.shrine) {
      this.shrine.visible = !!sm;
      if (sm) this.shrine.position.set(sm.x, 0, sm.y - 6);
    }

    // 🌀 the portal of the giant: an old stone arch, glowing
    const pm = v.marks.find((m) => m.kind === MK.portal);
    if (pm && !this.arch) this.arch = this.propClone("arch", 120, 0x3a1a6a);
    if (this.arch) {
      this.arch.obj.visible = !!pm;
      if (pm) {
        this.arch.obj.position.set(pm.x, 0, pm.y - pm.r * 0.55);
        const k = 0.5 + 0.5 * Math.sin(this.clock * 3);
        for (const m of this.arch.mats) m.emissive.setRGB(0.25 + 0.25 * k + pm.p * 0.4, 0.1, 0.45 + 0.3 * k);
      }
    }

    // pickups
    const gb = this.gemBb();
    for (const g of v.gems) {
      if (!on(g.x, g.y)) continue;
      const bob = g.k >= GK.food ? (Math.sin(this.clock * 4 + g.x) * 0.5 + 0.5) * 4 : 0;
      this.place(gb, g.x, g.y, g.k, 1, 0, bob);
    }

    // enemies
    const players = v.players.filter((p) => !(p as { gone?: boolean }).gone && !p.dead);
    const seenBoss = this.frame;
    for (const e of v.enemies) {
      if (!on(e.x, e.y)) continue;
      const def = ENEMIES[e.type];
      // face the nearest hero
      let tx = e.x + e.face;
      let ty = e.y;
      let best = Infinity;
      for (const p of players) {
        const d = (p.x - e.x) ** 2 + (p.y - e.y) ** 2;
        if (d < best) {
          best = d;
          tx = p.x;
          ty = p.y;
        }
      }
      const yaw = Math.atan2(tx - e.x, ty - e.y);
      const sc = e.elite ? 1.6 : 1;
      if (e.type === "altar") {
        let a = this.altars.get(e.id);
        if (!a) {
          const c = this.propClone("shrine_candles", 92, 0x1a1000);
          if (!c) continue;
          a = { ...c, seen: 0 };
          this.altars.set(e.id, a);
        }
        a.seen = seenBoss;
        a.obj.position.set(e.x, 0, e.y + def.r * 0.4);
        for (const m of a.mats) m.emissive.setRGB(e.flash > 0 ? 0.6 : 0.12 + Math.sin(this.clock * 2 + e.id) * 0.06, e.flash > 0 ? 0.55 : 0.08, e.flash > 0 ? 0.5 : 0);
        this.blob(e.x, e.y + def.r * 0.4, def.r * 1.2, blobN);
        continue;
      }
      const bcfg = def.boss ? BOSS3D[e.type] : undefined;
      if (bcfg) {
        this.drawBoss(e, bcfg, yaw, Math.sqrt(best), dt, seenBoss);
        this.blob(e.x, e.y + def.r * 0.5, def.r * 1.3, blobN);
        continue;
      }
      const vs = EN3D[e.type] ? this.vats.get(e.type) : undefined;
      if (vs) {
        if (vs.n >= 400) continue;
        const s = vs.scale * sc;
        const frozen0 = e.frozenT > 0;
        const still = !vs.cfg.clip;
        const ph = this.clock * 10 + e.id * 1.7;
        const hop = still && !frozen0 ? Math.abs(Math.sin(ph)) * 3 : 0;
        const lift = (vs.cfg.lift ?? 0) / K + (vs.cfg.lift ? Math.sin(this.clock * 4 + e.id) * 4 : 0);
        this.tmpV.set(e.x, lift + hop / K, e.y + def.r * 0.55 * sc);
        this.tmpQ.setFromAxisAngle(this.yAxis, yaw + (vs.cfg.yaw ?? 0) + (still && !frozen0 ? Math.sin(ph * 0.5) * 0.12 : 0));
        const sq = still && !frozen0 ? Math.sin(ph) * 0.05 : 0;
        this.tmpS.set(s * (1 + sq), s * (1 - sq), s * (1 + sq));
        this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
        vs.mesh.setMatrixAt(vs.n, this.tmpM);
        const frozen = e.frozenT > 0;
        this.tmpC.set(vs.cfg.tint);
        if (frozen) this.tmpC.lerp(new THREE.Color(0x7ad0ff), 0.7);
        else if (e.poison) this.tmpC.lerp(new THREE.Color(0x7aff4a), 0.45);
        if (e.elite) this.tmpC.multiplyScalar(1.15);
        vs.mesh.setColorAt(vs.n, this.tmpC);
        const fl = e.flash > 0 ? 0.85 : e.rage ? 0.2 + Math.sin(this.clock * 10) * 0.1 : 0;
        vs.anim.setXYZ(vs.n, e.id * 0.37, frozen ? 0 : (vs.cfg.sp ?? 1) * (def.speed / 70), fl);
        vs.n++;
        this.blob(e.x, e.y + def.r * 0.55 * sc, def.r * 0.95 * sc, blobN);
        continue;
      }
      // a picture standing up
      const bb = this.enemyBb(e.type);
      const still = e.frozenT > 0 || e.type === "pot";
      const fr = still ? 0 : Math.floor(this.clock * 6) % 2;
      const variant = e.flash > 0 ? 1 : e.frozenT > 0 ? 2 : 0;
      const hop = still ? 0 : Math.abs(Math.sin(this.clock * (def.boss ? 5 : 9) + e.id * 1.7)) * (def.boss ? 2 : 2.5);
      this.place(bb, e.x, e.y, fr * 6 + variant * 2 + (e.face < 0 ? 1 : 0), sc, e.rage ? 0.3 : 0, hop / K);
      this.blob(e.x, e.y + (bb.h / 2) * sc * 0.85, (bb.w / 3) * sc, blobN);
    }
    for (const [id, a] of this.altars) {
      if (a.seen !== seenBoss) {
        this.scene.remove(a.obj);
        this.altars.delete(id);
      }
    }
    // bosses that left the screen / died
    for (const [id, b] of this.bosses) {
      if (b.seen !== seenBoss) {
        this.scene.remove(b.root);
        this.bosses.delete(id);
      }
    }

    // heroes
    const seenHero = this.frame;
    for (const p of v.players) {
      if ((p as { gone?: boolean }).gone) continue;
      let h = this.heroes.get(p.uid);
      const key = `${p.hero}:${p.skin ?? ""}`;
      if (h && h.key !== key) {
        this.scene.remove(h.root);
        this.heroes.delete(p.uid);
        h = undefined;
      }
      if (!h) {
        h = this.makeHero(p.hero, p.skin);
        this.heroes.set(p.uid, h);
      }
      h.seen = seenHero;
      this.updateHero(h, p, dt);
      if (!p.dead) this.blob(p.x, p.y + 17, 13, blobN);
    }
    for (const [uid, h] of this.heroes) {
      if (h.seen !== seenHero) {
        this.scene.remove(h.root);
        this.heroes.delete(uid);
      }
    }

    // flush instance buffers
    for (const s of this.bbs.values()) {
      s.mesh.count = s.n;
      s.mesh.instanceMatrix.needsUpdate = true;
      s.cell.needsUpdate = true;
      s.flash.needsUpdate = true;
      (s.mesh.material as THREE.ShaderMaterial).uniforms.uLight!.value.setScalar(o.night ? 0.55 : 1);
    }
    for (const s of this.vats.values()) {
      s.mesh.count = s.n;
      s.mesh.instanceMatrix.needsUpdate = true;
      if (s.mesh.instanceColor) s.mesh.instanceColor.needsUpdate = true;
      s.anim.needsUpdate = true;
    }
    if (this.blobs) {
      this.blobs.count = blobN.i;
      this.blobs.instanceMatrix.needsUpdate = true;
    }
    gl.render(this.scene, this.cam);
  }

  private updateHero(h: HeroObj, p: RView["players"][number], dt: number) {
    const moved = Number.isFinite(h.lx) ? Math.hypot(p.x - h.lx, p.y - h.ly) : 0;
    if (moved > 0.4 && moved < 200) {
      const target = Math.atan2(p.x - h.lx, p.y - h.ly);
      let d = target - h.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      h.yaw += d * Math.min(1, dt * 14);
    } else if (!Number.isFinite(h.lx)) h.yaw = 0;
    h.lx = p.x;
    h.ly = p.y;
    h.root.position.set(p.x, 0, p.y + 16);
    h.root.rotation.set(0, h.yaw, 0);
    h.body.rotation.set(0, 0, 0);
    h.body.position.set(0, 0, 0);
    h.root.visible = !(p.invulnT > 0 && p.dashT <= 0 && p.hurtT <= 0 && Math.floor(this.clock * 20) % 2 === 0);

    if (h.oneShot) {
      h.oneShot.t -= dt;
      if (h.oneShot.t <= 0) h.oneShot = null;
    }
    if (p.dead) {
      if (!h.wasDead) this.play(h, "Death_A", 0.1, true);
      h.wasDead = true;
    } else {
      if (h.wasDead) {
        h.mixer.stopAllAction();
        h.cur = "";
      }
      h.wasDead = false;
      if (p.skillT > 0 && p.hero === "tseko") {
        // Брейк на главата: upside down, spinning on the head
        this.play(h, "Idle", 0.1);
        h.body.rotation.set(Math.PI, this.clock * 22, 0);
        h.body.position.y = HERO_PX / K * 0.95;
      } else if (p.skillT > 0 && p.hero === "strahil") {
        this.play(h, "2H_Melee_Attack_Spinning", 0.1, false, 1.6);
        h.body.rotation.y = -this.clock * 14;
      } else if (p.dashT > 0) this.play(h, "Dodge_Forward", 0.05, true, 1.6);
      else if (h.oneShot) this.play(h, h.oneShot.name, 0.1, true, 1.3);
      else if (p.moving) this.play(h, "Running_A", 0.15, false, 1.1);
      else this.play(h, "Idle", 0.25);
    }
    // hurt = red glow, skins glow on their own
    const hurt = p.hurtT > 0 ? 1 : 0;
    for (const m of h.mats) {
      if (hurt) m.emissive.setRGB(0.55, 0.05, 0.02);
      else if (p.skin === "fire") m.emissive.setRGB(0.32 + Math.sin(this.clock * 6) * 0.1, 0.08, 0);
      else if (p.skin === "gold") m.emissive.setRGB(0.35, 0.22, 0);
      else if (p.skin === "ghost") m.emissive.setRGB(0.25, 0.4, 0.55);
      else m.emissive.setRGB(0, 0, 0);
    }
    h.mixer.update(dt);
  }

  private drawBoss(e: RView["enemies"][number], cfg: Boss3D, yaw: number, dist: number, dt: number, seen: number) {
    let b = this.bosses.get(e.id);
    if (!b) {
      const a = this.assets!;
      const body = skClone(a.models[cfg.m].scene);
      const mats: THREE.MeshLambertMaterial[] = [];
      body.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const name = m.name || "";
        const hero = !cfg.m.startsWith("skeleton") && !cfg.m.startsWith("a_");
        if (hero) m.visible = CORE.test(name) || (cfg.show ?? []).includes(name) || (cfg.show ?? []).includes(m.parent?.name ?? "");
        const src = m.material as THREE.MeshStandardMaterial;
        const glow = /glow/i.test(src.name);
        const tint = new THREE.Color(cfg.tint);
        const mat = new THREE.MeshLambertMaterial({
          map: src.map ?? null,
          color: glow ? src.color : src.map ? tint : (src.color?.clone() ?? new THREE.Color(1, 1, 1)).multiply(tint).multiplyScalar(1.6),
          emissive: glow ? new THREE.Color(0xff3020) : new THREE.Color(0),
        });
        if (cfg.alpha) {
          mat.transparent = true;
          mat.opacity = cfg.alpha;
        }
        if (!glow) mats.push(mat);
        m.material = mat;
        m.castShadow = true;
        m.frustumCulled = false;
      });
      body.scale.setScalar(this.unitFor(cfg.m, cfg.h));
      const root = new THREE.Group();
      root.add(body);
      this.scene.add(root);
      b = { root, body, mixer: new THREE.AnimationMixer(body), actions: new Map(), cur: "", mats, yaw, lx: e.x, ly: e.y, seen, baseTint: new THREE.Color(cfg.tint), own: a.models[cfg.m].animations, animal: cfg.m.startsWith("a_") };
      this.bosses.set(e.id, b);
    }
    b.seen = seen;
    const moved = Math.hypot(e.x - b.lx, e.y - b.ly);
    b.lx = e.x;
    b.ly = e.y;
    let d = yaw - b.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    b.yaw += d * Math.min(1, dt * 6);
    const r = ENEMIES[e.type].r;
    const lift = (cfg.lift ?? 0) / K + (cfg.lift ? Math.sin(this.clock * 2.5) * 6 : 0);
    b.root.position.set(e.x, lift, e.y + r * 0.5);
    b.root.rotation.y = b.yaw + (cfg.yaw ?? 0);
    if (b.animal) {
      // animals: their own walk if they have one, else a heavy sway
      const walk = b.own.find((c) => /^(walk|walking|run|flying|fly)$/i.test(c.name));
      if (walk) this.play(b, walk.name, 0.2, false, ENEMIES[e.type].speed > 75 ? 1.6 : 1);
      else if (e.frozenT <= 0) {
        const ph = this.clock * 5;
        b.body.position.y = Math.abs(Math.sin(ph)) * 4 / K;
        b.body.rotation.z = Math.sin(ph * 0.5) * 0.06;
      }
    } else if (e.shield) this.play(b, "Block", 0.2);
    else if (dist < r + 70) this.play(b, cfg.m.startsWith("skeleton") ? "1H_Melee_Attack_Chop" : "2H_Melee_Attack_Chop", 0.15);
    else if (moved > 0.3 && e.frozenT <= 0) this.play(b, ENEMIES[e.type].speed > 75 ? "Running_A" : cfg.m.startsWith("skeleton") ? "Walking_D_Skeletons" : "Walking_A", 0.25);
    else this.play(b, "Idle", 0.3);
    for (const m of b.mats) {
      if (e.flash > 0) m.emissive.setRGB(0.7, 0.65, 0.6);
      else if (e.frozenT > 0) m.emissive.setRGB(0.1, 0.3, 0.5);
      else if (e.rage) m.emissive.setRGB(0.35 + Math.sin(this.clock * 10) * 0.12, 0.02, 0);
      else m.emissive.setRGB(0, 0, 0);
    }
    b.mixer.timeScale = e.frozenT > 0 ? 0 : 1;
    b.mixer.update(dt);
  }

  /** scenery from a hash of the 220-px cell (same cells as the 2D decor) */
  private drawProps(x0: number, x1: number, y0: number, y1: number) {
    for (const k of this.props) k.n = 0;
    const DC = 220;
    for (let gx = Math.floor(x0 / DC); gx <= Math.floor(x1 / DC); gx++) {
      for (let gy = Math.floor(y0 / DC); gy <= Math.floor((y1 + 80) / DC); gy++) {
        let h = (gx * 73856093) ^ (gy * 19349663);
        h = (h ^ (h >>> 13)) * 1274126177;
        h = (h ^ (h >>> 16)) >>> 0;
        if (h % 100 > 30) continue;
        // keep the start clear
        if (Math.abs(gx) <= 1 && Math.abs(gy) <= 1) continue;
        let pick = ((h >>> 8) % 1000) / 1000 * this.propPickTotal;
        let kind = this.propPick[0]?.[0] ?? this.props[0]!;
        for (const [k, w] of this.propPick) {
          pick -= w;
          if (pick <= 0) {
            kind = k;
            break;
          }
        }
        const x = gx * DC + ((h >>> 4) % 160) + 30;
        const y = gy * DC + ((h >>> 12) % 160) + 30;
        const rot = (((h >>> 20) % 628) / 100);
        const s = PROP_UNIT * kind.scale * (0.85 + ((h >>> 3) % 30) / 100);
        if (kind.n >= 64) continue;
        this.tmpV.set(x, 0, y);
        this.tmpQ.setFromAxisAngle(this.yAxis, rot);
        this.tmpS.set(s, s, s);
        const base = new THREE.Matrix4().compose(this.tmpV, this.tmpQ, this.tmpS);
        kind.parts.forEach((p, i) => {
          this.tmpM.multiplyMatrices(base, p.m);
          kind.meshes[i]!.setMatrixAt(kind.n, this.tmpM);
        });
        kind.n++;
      }
    }
    for (const k of this.props) {
      for (const m of k.meshes) {
        m.count = k.n;
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }
}

/** does this browser do WebGL2 at all */
export function canWebGL2(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!c.getContext("webgl2");
  } catch {
    return false;
  }
}
