import { basename, dirname, extname } from "./path.js"
import { textOf } from "./zip.js"
import { titleCase } from "./util.js"

export function getFileLabel(jar, path, value) {
  const file = basename(path)
  const ext = file.includes(".") ? file.split(".").pop() : null
  switch (path) {
    case "assets": return "Resource Pack Assets"
    case "data": return "Data Pack Assets"
    case "doc": return "Documentation"
    case "pack.png": return "Pack Icon"
    case "pack.mcmeta": return "Pack Metadata"
    case "version.json": return "Version Information"
    case "assets/icons":
    case "assets/minecraft/icons": return "System Icons"
    case "assets/icons/snapshot": return "Snapshot Icons"
    case "assets/minecraft": return "Minecraft Assets"
    case "assets/realms": return "Realms Assets"
    case "assets/minecraft/atlases": return "Atlas Definitions"
    case "assets/minecraft/equipment": return "Equipment Definitions"
    case "assets/minecraft/font": return "Font Definitions"
    case "assets/minecraft/items": return "Item Definitions"
    case "assets/minecraft/particles":
    case "resource_pack/particles": return "Particle Definitions"
    case "assets/minecraft/post_effect": return "Post-Processing Effects"
    case "assets/minecraft/resourcepacks": return "Built-in Resource Packs"
    case "assets/minecraft/sounds": return "Sound Files"
    case "assets/minecraft/sounds.json":
    case "resource_pack/sounds_client.json": return "Sound Definitions"
    case "assets/minecraft/shaders/core": return "Core Shaders"
    case "assets/minecraft/shaders/include": return "Include Shaders"
    case "assets/minecraft/shaders/post": return "Post Shaders"
    case "assets/minecraft/shaders/program": return "Program Shaders"
    case "assets/minecraft/texts/credits.json": return "Credits"
    case "assets/minecraft/texts/splashes.txt": return "Splash Texts"
    case "assets/minecraft/texts/postcredits.txt": return "Post Credits Text"
    case "assets/minecraft/texts/end.txt": return "End Poem"
    case "assets/minecraft/textures/environment": return "Sky & Weather"
    case "assets/minecraft/textures/entity/enderdragon": return "Ender Dragon"
    case "assets/minecraft/textures/entity/enderman": return "Enderman"
    case "assets/minecraft/models/block": return "Block Models"
    case "assets/minecraft/models/item": return "Item Models"
    case "assets/minecraft/resourcepacks/programmer_art.zip": return "Programmer Art Resource Pack"
    case "assets/minecraft/resourcepacks/high_contrast.zip": return "High Contrast Resource Pack"
    case "assets/minecraft/lang/en_us.json":
    case "assets/minecraft/lang/en_us.lang": return "English (US)"
    case "assets/minecraft/lang/deprecated.json": return "Deprecated Language Keys"
    case "behaviour_pack": return "Behaviour Pack Assets"
    case "resource_pack": return "Resource Pack Assets"
    case "resource_pack/blocks.json": return "Block Definitions"
    case "resource_pack/biomes_client.json": return "Biome Definitions"
    case "resource_pack/textures/flipbook_textures.json": return "Texture Animation Definitions"
    case "resource_pack/textures/item_texture.json": return "Item Texture Definitions"
    case "resource_pack/textures/terrain_texture.json": return "Block Texture Definitions"
    case "resource_pack/entity": return "Entity Definitions"
    case "resource_pack/models/entity":
    case "resource_pack/models/mobs.json": return "Entity Models"
    case "resource_pack/texts/languages.json": return "Languages"
    case "resource_pack/texts/language_names.json": return "Language Names"
    case "resource_pack/texts/ja_JP": return "Japanese Assets"
    case "resource_pack/texts/zh_TW": return "Chinese (Traditional) Assets"
  }
  switch (dirname(path)) {
    case "assets/minecraft/atlases": return "Atlas Definition"
    case "assets/minecraft/blockstates": return "Blockstate"
    case "assets/minecraft/equipment": return "Equipment Definition"
    case "assets/minecraft/items": return "Item Definition"
    case "assets/minecraft/particles": return "Particle Definition"
    case "assets/minecraft/models/block": return "Block Model"
    case "assets/minecraft/models/item": return "Item Model"
    case "assets/minecraft/shaders/core":
    case "assets/minecraft/shaders/program":
    case "assets/minecraft/shaders/post":
      if (ext === "json") return "Shader Program Definition"
    case "doc/images": return "Template"
    case "resource_pack/models/entity": return "Entity Model"
    case "resource_pack/entity": return "Entity Definition"
    case "resource_pack/animations": return "Animation"
    case "resource_pack/animation_controllers": return "Animation Controller"
    case "assets/minecraft/lang":
      try {
        const content = jar.files["pack.mcmeta"]?.content
        if (content) {
          const data = JSON.parse(textOf(content))
          const lang = data.language?.[basename(file, extname(file))]
          if (lang) {
            return `${lang.name} (${lang.region})`
          }
        }
      } catch {}
      return "Language File"
    case "resource_pack/texts":
      try {
        const content = jar.files["resource_pack/texts/language_names.json"]?.content
        if (content) {
          const data = JSON.parse(textOf(content))
          const id = basename(file, extname(file))
          const lang = data.find(e => e[0] === id)
          if (lang) {
            return lang[1]
          }
        }
      } catch {}
  }
  switch (file) {
    case "lang": return "Language Files"
    case "gui":
    case "ui": return "User Interface"
    case "equipment": return "Equipment"
    case "fish": return "Fish"
    case "sheep": return "Sheep"
    case "wolf": return "Wolves"
    case "hud": return "Heads Up Display"
    case "documentation": return "Documentation"
    case "metadata": return "Metadata"
    case "manifest.json": return "Pack Metadata"
    case "misc": return "Miscellaneous"
    case "ambient": return "Ambient"
    case "fire": return "Fire"
    case "music": return "Music"
    case "game": return "Game"
    case "menu": return "Menu"
  }
  switch (ext) {
    case "png": return "Texture"
    case "jpg": return "Texture"
    case "tga": return "Texture"
    case "mcmeta": return "Texture Metadata"
    case "json": return "JSON File"
    case "txt": return "Text File"
    case "properties": return "Properties File"
    case "lang": return "Language File"
    case "ogg":
    case "fsb": return "Sound File"
    case "vsh": return "Vertex Shader"
    case "fsh": return "Fragment Shader"
    case "glsl": return "Shader"
    case "icns": return "Icon"
  }
  if (typeof value === "object") {
    let label = titleCase(file)
    if (!label.endsWith("s")) {
      label += "s"
    }
    label = label.replaceAll("Json", "JSON")
                 .replaceAll("Entitys", "Entities")
                 .replaceAll("Bodys", "Bodies")
    return label
  }
}
