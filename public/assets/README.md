# Naija City assets

Everything here is served as-is at `/assets/...`. Register each model in
`src/game/assets.ts` so the game can find it.

## Folders

| Folder | What goes in it |
|---|---|
| `models/characters/men`, `models/characters/women` | Rigged, animated people (player avatars, NPCs) |
| `models/furniture` | Anything placed in Buy mode: beds, sofas, fridges, TVs |
| `models/props` | Small items: suya grill, bucket, generator, kiosk |
| `models/vehicles` | Keke napep, okada, cars, buses |
| `models/buildings` | Generic houses and shops used to fill districts |
| `models/landmarks` | Custom Kaduna landmarks (Lugard Hall, Central Market…) |
| `models/nature` | Trees (neem, mango), bushes, rocks |
| `textures` | Shared colour atlas / palette textures |
| `audio/sfx`, `audio/music` | Sound effects and background music |
| `ui` | Icons and images used in the HTML UI |

## Rules

- **Format:** `.glb` only. Convert FBX/OBJ in Blender (File → Export → glTF Binary).
- **Naming:** lowercase kebab-case, describe the thing: `sofa-3-seater-velvet.glb`, `keke-napep-yellow.glb`.
- **Scale:** 1 unit = 1 metre. Models are fitted to their tile footprint in code, but correct scale saves trouble.
- **Orientation:** model front faces **+Z**, origin at the base centre.
- **Budget:** under ~5k triangles per furniture item, ~10k per character, ~30k per landmark.
- **Compress** big files: `npx @gltf-transform/cli optimize in.glb out.glb --compress meshopt`.
- **Licence:** add every new pack to `CREDITS.md`.
