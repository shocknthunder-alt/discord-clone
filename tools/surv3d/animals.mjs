// Builds client/public/surv3d/a_*.glb from CC0 animal models (oosawak/cc0-monsters: OpenGameArt + Grab3D)
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTMeshoptCompression } from "@gltf-transform/extensions";
import { prune, dedup, quantize, reorder, resample, weld, simplify, textureCompress } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from "meshoptimizer";
import fs from "fs";
import path from "path";
const [, , SRC, OUT] = process.argv;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
// [source file, out name, animations to keep (null = all), simplify ratio]
const LIST = [
  ["converted_rat-pack_rat.glb", "a_rat", [], 1],
  ["converted_vampire-bat-animated_bat_v5.glb", "a_vbat", ["Bat_Flying"], 0.12],
  ["converted_animated-animales-low-poly_wolf.glb", "a_wolf", ["Walking", "Idle"], 1],
  ["converted_white-bear-low-poly_bear.glb", "a_bear", [], 1],
  ["grab3d_werewolf_rigged_werewolf-rigged.glb", "a_werewolf", ["walk", "run"], 0.035],
  ["grab3d_low-poly-dragon_low-poly-dragon.glb", "a_dragon", [], 0.35],
];
for (const [src, name, keep, ratio] of LIST) {
  const doc = await io.read(path.join(SRC, src));
  for (const a of doc.getRoot().listAnimations()) {
    if (keep && keep.includes(a.getName()) && !doc.getRoot().listAnimations().some((b) => b !== a && b.getName() === a.getName() && doc.getRoot().listAnimations().indexOf(b) < doc.getRoot().listAnimations().indexOf(a))) continue;
    for (const s of a.listSamplers()) s.dispose();
    for (const c of a.listChannels()) c.dispose();
    a.dispose();
  }
  const steps = [weld(), resample(), dedup()];
  if (ratio < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }));
  steps.push(prune({ keepAttributes: false }));
  steps.push(textureCompress({ targetFormat: "webp", resize: [512, 512] }).bind?.(null) ?? ((d) => d));
  await doc.transform(...steps);
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize({ quantizeNormal: 8, quantizeTexcoord: 12, quantizePosition: 14 }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const out = path.join(OUT, name + ".glb");
  await io.write(out, doc);
  let verts = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) verts += p.getAttribute("POSITION")?.getCount() ?? 0;
  console.log(name, Math.round(fs.statSync(out).size / 1024), "KB", "verts", verts, "anims", doc.getRoot().listAnimations().map((a) => a.getName()).join(","));
}
