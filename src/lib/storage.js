import { reactive } from "vue"

export const defaultSavedFolders = () => [
  [["assets", "minecraft", "textures"], "Textures"],
  [["assets", "minecraft", "textures", "block"], "Block Textures"],
  [["assets", "minecraft", "textures", "item"], "Item Textures"],
  [["assets", "minecraft", "textures", "blocks"], "Block Textures"],
  [["assets", "minecraft", "textures", "items"], "Item Textures"],
  [["assets", "minecraft", "textures", "entity"], "Entity Textures"],
  [["assets", "minecraft", "models"], "Models"],
  [["assets", "minecraft", "models", "block"], "Block Models"],
  [["assets", "minecraft", "models", "item"], "Item Models"],
  [["resource_pack", "textures"], "Textures"],
  [["resource_pack", "textures", "blocks"], "Block Textures"],
  [["resource_pack", "textures", "items"], "Item Textures"],
  [["resource_pack", "textures", "entity"], "Entity Textures"],
  [["resource_pack", "models", "entity"], "Entity Models"],
  [["item"], "Item Textures"],
  [["mob"], "Entity Textures"]
]

export const storage = reactive(JSON.parse(localStorage.getItem("asset_browser") ?? "{}"))
storage.recents ??= []
storage.cached ??= []
storage.savedFolders ??= defaultSavedFolders()
storage.objects ??= true

export function save() {
  localStorage.setItem("asset_browser", JSON.stringify(storage))
}
