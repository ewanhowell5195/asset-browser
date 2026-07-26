export function basename(path, ext) {
  let base = path.slice(path.lastIndexOf("/") + 1)
  if (ext && base.endsWith(ext)) {
    base = base.slice(0, -ext.length)
  }
  return base
}

export function dirname(path) {
  const i = path.lastIndexOf("/")
  return i === -1 ? "." : path.slice(0, i)
}

export function extname(path) {
  const base = basename(path)
  const i = base.lastIndexOf(".")
  return i <= 0 ? "" : base.slice(i)
}
