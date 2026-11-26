# Шмиркленд 3D models

`client/public/surv3d/*.glb` are made from three free **CC0** packs by Kay Lousberg (www.kaylousberg.com):
KayKit Character Pack *Adventurers 1.0*, *Skeletons 1.0* and *Halloween Bits 1.0* (GitHub: `KayKit-Game-Assets`).
Licences are in `client/public/surv3d/LICENSE-*.txt`.

`build.mjs` strips the unused animations (only `skeleton_minion.glb` keeps the shared clips; every model uses
the same 41-bone rig), merges the scenery into `props.glb`, then welds, quantizes and meshopt-compresses
everything (~2.5 MB in total). To rebuild, in an empty folder outside the repo:

```sh
npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions meshoptimizer
# download + unzip the three packs into ./assets (repo archives: .../archive/refs/heads/main.zip)
node /path/to/tools/surv3d/build.mjs ./assets /path/to/client/public/surv3d
```
