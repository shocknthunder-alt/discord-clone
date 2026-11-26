// Builds client/public/surv3d/*.glb from the KayKit CC0 packs (run: node build.mjs <assetsDir> <outDir>)
import { NodeIO, Document } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { prune, dedup, quantize, reorder, resample, weld, mergeDocuments, unpartition } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import fs from "fs";
import path from "path";

const [, , A, OUT] = process.argv;
fs.mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

const ADV = path.join(A, "Character-Pack-Adventures-1.0/KayKit-Character-Pack-Adventures-1.0-main/addons/kaykit_character_pack_adventures/Characters/gltf");
const SKE = path.join(A, "Character-Pack-Skeletons-1.0/KayKit-Character-Pack-Skeletons-1.0-main/addons/kaykit_character_pack_skeletons/Characters/gltf");
const HAL = path.join(A, "Halloween-Bits-1.0/KayKit-Halloween-Bits-1.0-main/addons/kaykit_halloween_bits/Assets/gltf");

const KEEP_ANIMS = new Set([
  "Idle", "Idle_Combat", "Running_A", "Running_B", "Walking_A", "Walking_D_Skeletons", "Death_A", "Death_A_Pose", "Death_B",
  "Hit_A", "Hit_B", "Spellcast_Shoot", "Spellcast_Long", "Spellcast_Summon", "Spellcasting", "2H_Melee_Attack_Spinning", "2H_Melee_Attack_Chop",
  "2H_Melee_Attack_Slice", "1H_Melee_Attack_Chop", "1H_Melee_Attack_Slice_Horizontal", "Cheer", "Dodge_Forward", "Throw",
  "Unarmed_Melee_Attack_Kick", "Unarmed_Melee_Attack_Punch_A", "Spawn_Ground_Skeletons", "Taunt", "Jump_Full_Short", "Block",
  "Lie_Pose", "Use_Item", "1H_Ranged_Shoot", "2H_Ranged_Shoot",
]);

async function finish(doc, out) {
  await doc.transform(
    weld(),
    resample(),
    dedup(),
    prune({ keepLeaves: true, keepAttributes: false }),
    reorder({ encoder: MeshoptEncoder }),
    quantize({ quantizeNormal: 8, quantizeTexcoord: 12, quantizePosition: 14 }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(out, doc);
  console.log(path.basename(out), Math.round(fs.statSync(out).size / 1024), "KB");
}

async function character(file, outName, keepAnims) {
  const doc = await io.read(file);
  for (const a of doc.getRoot().listAnimations()) if (!keepAnims || !KEEP_ANIMS.has(a.getName())) {
    for (const s of a.listSamplers()) s.dispose();
    for (const c of a.listChannels()) c.dispose();
    a.dispose();
  }
  await finish(doc, path.join(OUT, outName));
}

for (const n of ["Barbarian", "Knight", "Mage", "Rogue", "Rogue_Hooded"]) await character(path.join(ADV, n + ".glb"), n.toLowerCase() + ".glb", false);
await character(path.join(SKE, "Skeleton_Minion.glb"), "skeleton_minion.glb", true);
for (const n of ["Skeleton_Warrior", "Skeleton_Rogue", "Skeleton_Mage"]) await character(path.join(SKE, n + ".glb"), n.toLowerCase() + ".glb", false);

// props: one glb, every prop a root node named after its file
const PROPS = [
  "tree_dead_large", "tree_dead_medium", "tree_dead_small", "tree_pine_orange_large", "tree_pine_orange_medium", "tree_pine_yellow_large",
  "tree_pine_yellow_medium", "tree_pine_yellow_small", "grave_A", "grave_B", "gravestone", "gravemarker_A", "gravemarker_B", "fence", "fence_broken",
  "fence_pillar", "lantern_standing", "post_lantern", "post_skull", "pumpkin_orange", "pumpkin_yellow_small", "pumpkin_orange_jackolantern", "skull",
  "skull_candle", "ribcage", "bone_A", "bone_B", "coffin", "crypt", "shrine", "shrine_candles", "candle_triple", "pillar", "arch", "bench", "floor_dirt_grave",
];
const props = new Document();
props.createBuffer();
const scene = props.createScene("props");
props.getRoot().setDefaultScene(scene);
for (const p of PROPS) {
  const d = await io.read(path.join(HAL, p + ".gltf"));
  const before = new Set(props.getRoot().listNodes());
  const map = mergeDocuments(props, d);
  const srcScene = d.getRoot().getDefaultScene() ?? d.getRoot().listScenes()[0];
  const wrap = props.createNode(p);
  for (const child of srcScene.listChildren()) {
    const n = map.get(child);
    wrap.addChild(n);
  }
  for (const s of props.getRoot().listScenes()) if (s !== scene) s.dispose();
  scene.addChild(wrap);
  void before;
}
await props.transform(unpartition());
await finish(props, path.join(OUT, "props.glb"));
