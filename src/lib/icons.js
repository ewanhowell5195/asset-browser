export const customIcons = {
  creeper: '<svg width="22" height="22" viewBox="0 0 2.91 2.91" fill="currentColor"><path d="M.397.397h2.117v2.117h-.529V1.72H1.72v-.265h.529V.926H1.72v.529h-.529V.926h-.53v.529h.529v.265H.926v.794H.397zm.794 1.852h.529v.265h-.529z"/></svg>'
}

export function iconHTML(name) {
  if (customIcons[name]) return customIcons[name]
  return `<span class="material-icons">${name}</span>`
}

export function getVersionIcon(id) {
  id = id.toLowerCase()
  if (id.includes("preview") || /^\d{2}w\d{2}[a-z]$/.test(id) || /^\d+\.\d+(?:\.\d+)?-(?:snapshot|pre|rc)-?\d+$/.test(id)) return iconHTML("update")
  if (id.startsWith("v")) return iconHTML("deployed_code")
  if (/^[\d\.]+$/.test(id)) return customIcons.creeper
  return iconHTML("history")
}

export function getFileIcon(file, value) {
  if (file.includes(".lang") || value.startsWith("assets/minecraft/lang/")) return "translate"
  if (file.endsWith(".json") || file === "pack.mcmeta") return "data_object"
  if (file.endsWith(".fsh") || file.endsWith(".vsh") || file.endsWith(".glsl")) return "ev_shadow"
  if (file.includes(".mcmeta")) return "theaters"
  if (file.includes(".tga")) return "image"
  if (file.endsWith(".ogg") || file.endsWith(".fsb") || file.endsWith(".mus")) return "volume_up"
  if (file.endsWith(".nbt")) return "account_tree"
  if (file.includes(".zip")) return "folder_zip"
  if (file.includes(".properties")) return "list_alt"
  if (file.includes(".txt")) return "description"
  return "draft"
}

export function getFolderIcon(path, custom) {
  if (custom) {
    return iconHTML(custom)
  }
  if (!Array.isArray(path)) {
    path = [path]
  }
  let icon
  for (let i = path.length - 1; i >= 0; i--) {
    const part = path[i]
    if (part === "textures") icon = "image"
    else if (part === "models" || part === "blocks" || part === "block") icon = "deployed_code"
    else if (part === "items" || part === "item") icon = "swords"
    else if (part === "sounds") icon = "volume_up"
    else if (part === "shaders") icon = "ev_shadow"
    else if (part === "lang") icon = "translate"
    else if (part === "texts") icon = "text_fields"
    else if (part === "particles" || part === "particle") icon = "auto_awesome"
    else if (part === "atlases" || part === "map") icon = "map"
    else if (part === "font") icon = "font_download"
    else if (part === "post_effect") icon = "desktop_windows"
    else if (part === "resourcepacks") icon = "folder_zip"
    else if (part === "equipment") icon = "checkroom"
    else if (part === "blockstates") icon = "view_in_ar"
    else if (part === "entities" || part === "entity" || part === "mob") icon = "creeper"
    else if (part === "painting") icon = "brush"
    else if (part === "gui" || part === "ui") icon = "call_to_action"
    else if (part === "environment") icon = "light_mode"
    else if (part === "colormap" || part === "color_palettes") icon = "palette"
    else if (part === "misc") icon = "help"
    else if (part === "trims") icon = "diamond"
    else if (part === "effect" || part === "mob_effect") icon = "auto_fix"
    else if (part === "persona_thumbnails") icon = "groups"
    else if (part === "animations") icon = "sync"
    else if (part === "animation_controllers") icon = "rule_settings"
    else if (part === "render_controllers") icon = "visibility"
    else if (part === "fogs") icon = "foggy"
    else if (part === "attachables") icon = "electrical_services"
    else if (part === "ctm") icon = "extension"
    else if (part === "waypoint_style") icon = "flag"
    if (icon) break
  }
  if (!icon) return null
  return iconHTML(icon)
}
