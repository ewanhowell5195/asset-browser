import * as THREE from "three"

// pinned to the major so the bundled packs track new Minecraft versions on
// their own. an unversioned url serves a stale cached build for days
const LIB_URL = "https://cdn.jsdelivr.net/npm/block-model-renderer@2/dist/block-model-renderer.min.js"

let promise = null

export function loadRenderer() {
  promise ??= import(/* @vite-ignore */ LIB_URL).then(lib => {
    lib.configure({ three: THREE })
    return lib
  })
  return promise
}
