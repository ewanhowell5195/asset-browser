export function formatBytes(bytes) {
  if (!bytes) return "0 B"
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(1)) + " " + ["B", "KB", "MB", "GB", "TB"][i]
}

export function saveBlob(name, data, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement("a")
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

// drawn into a 2d probe rather than read directly, since the player's canvas
// may be webgl-backed
function isBlankCanvas(canvas) {
  if (!canvas?.width || !canvas.height) return true
  const probe = document.createElement("canvas")
  probe.width = canvas.width
  probe.height = canvas.height
  const ctx = probe.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0)
  const { data } = ctx.getImageData(0, 0, probe.width, probe.height)
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]) return false
  }
  return true
}

// a model with no visible geometry renders as an empty canvas; check a second
// frame too, so an animation that merely starts empty isn't thrown away
export function isBlankRender(player) {
  const canvas = player?.canvas
  if (!isBlankCanvas(canvas)) return false
  const frames = player.frames?.length ?? 0
  if (player.animated && frames > 1) {
    player.renderFrame(Math.floor(frames / 2))
    return isBlankCanvas(canvas)
  }
  return true
}

export function titleCase(str) {
  return str.replace(/_|-/g, " ").replace(/\w\S*/g, str => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase())
}
