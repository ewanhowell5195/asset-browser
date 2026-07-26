import { loadRenderer } from "./renderer.js"
import { inflateSync } from "fflate"

const td = new TextDecoder

const ignoredExtensions = ["class", "nbt", "mcassetsroot", "mf", "sf", "dsa", "rsa", "jfc", "xml", "md", "toml", "itransformationservice", "hex", "jar"]
const ignoredExtensionsRoot = ["txt", "cfg"]
const ignoredExtensionsRegex = new RegExp(`\\.(${ignoredExtensions.join("|")})$|(?:^|\/)[^\/\\.]+$|(?:^|\/)\\.`, "i")
const ignoredExtensionsRootRegex = new RegExp(`^[^\\/]+\\.(?:${ignoredExtensionsRoot.join("|")})$`, "i")

const imageMimes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
}

export const textOf = data => td.decode(data)

export const isImagePath = path => path.endsWith(".png") || path.endsWith(".jpg") || path.endsWith(".jpeg")

export function createImage(content, path) {
  const img = new Image
  img.src = URL.createObjectURL(new Blob([content], { type: imageMimes[path.slice(path.lastIndexOf("."))] ?? "image/png" }))
  return img
}

export async function parseZip(buffer, ignoreRoot = true) {
  const { parseZip: parseZipEntries } = await loadRenderer()
  const entries = parseZipEntries(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer))
  const parsed = { files: {} }

  for (const [filePath, entry] of entries) {
    if (ignoredExtensionsRegex.test(filePath) || (ignoreRoot && ignoredExtensionsRootRegex.test(filePath))) continue

    const file = {
      path: filePath,
      compressionMethod: entry.method,
      compressedContent: entry.data
    }

    if (entry.method === 0) {
      file.content = entry.data
    } else {
      Object.defineProperty(file, "content", {
        configurable: true,
        enumerable: true,
        get() {
          const c = inflateSync(this.compressedContent)
          Object.defineProperty(this, "content", {
            value: c,
            configurable: true,
            enumerable: true
          })
          return c
        }
      })
    }

    if (isImagePath(filePath)) {
      file.image = createImage(file.content, filePath)
    }

    parsed.files[filePath] = file
  }

  return parsed
}
