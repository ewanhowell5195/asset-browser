const TAG = {
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12
}

const td = new TextDecoder()
const plainKey = /^[A-Za-z0-9_.+-]+$/

function quote(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
}

function decimal(value) {
  return Number.isFinite(value) && Number.isInteger(value) ? value.toFixed(1) : String(value)
}

async function inflate(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function decompress(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  if (bytes.length < 2) return bytes
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return inflate(bytes, "gzip")
  if (bytes[0] === 0x78 && ((bytes[0] << 8) | bytes[1]) % 31 === 0) return inflate(bytes, "deflate")
  return bytes
}

export async function readNbt(input) {
  const bytes = await decompress(input)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let o = 0

  function string() {
    const len = dv.getUint16(o)
    o += 2
    const value = td.decode(bytes.subarray(o, o + len))
    o += len
    return value
  }

  function payload(type) {
    switch (type) {
      case TAG.BYTE: return dv.getInt8(o++)
      case TAG.SHORT: { const v = dv.getInt16(o); o += 2; return v }
      case TAG.INT: { const v = dv.getInt32(o); o += 4; return v }
      case TAG.LONG: { const v = dv.getBigInt64(o); o += 8; return v }
      case TAG.FLOAT: { const v = dv.getFloat32(o); o += 4; return v }
      case TAG.DOUBLE: { const v = dv.getFloat64(o); o += 8; return v }
      case TAG.STRING: return string()
      case TAG.BYTE_ARRAY: {
        const len = dv.getInt32(o)
        o += 4
        const v = new Int8Array(bytes.slice(o, o + len).buffer)
        o += len
        return v
      }
      case TAG.INT_ARRAY: {
        const len = dv.getInt32(o)
        o += 4
        const v = new Int32Array(len)
        for (let i = 0; i < len; i++) { v[i] = dv.getInt32(o); o += 4 }
        return v
      }
      case TAG.LONG_ARRAY: {
        const len = dv.getInt32(o)
        o += 4
        const v = new BigInt64Array(len)
        for (let i = 0; i < len; i++) { v[i] = dv.getBigInt64(o); o += 8 }
        return v
      }
      case TAG.LIST: {
        const elementType = dv.getUint8(o++)
        const len = dv.getInt32(o)
        o += 4
        const v = new Array(len)
        for (let i = 0; i < len; i++) v[i] = payload(elementType)
        return v
      }
      case TAG.COMPOUND: {
        const v = {}
        for (;;) {
          const entryType = dv.getUint8(o++)
          if (entryType === TAG.END) return v
          v[string()] = payload(entryType)
        }
      }
      default: throw new Error(`Unknown NBT tag type ${type} at byte ${o - 1}`)
    }
  }

  const rootType = dv.getUint8(o++)
  if (rootType !== TAG.COMPOUND) throw new Error(`NBT root is tag type ${rootType}, expected a compound`)
  string()
  return payload(TAG.COMPOUND)
}

export async function nbtToSnbt(input, indent = "  ") {
  const bytes = await decompress(input)
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let o = 0

  function string() {
    const len = dv.getUint16(o)
    o += 2
    const value = td.decode(bytes.subarray(o, o + len))
    o += len
    return value
  }

  function primitiveArray(prefix, size, read) {
    const len = dv.getInt32(o)
    o += 4
    const parts = new Array(len)
    for (let i = 0; i < len; i++) {
      parts[i] = read()
      o += size
    }
    return `[${prefix};${parts.join(",")}]`
  }

  function payload(type, depth) {
    const pad = indent.repeat(depth + 1)
    const close = indent.repeat(depth)
    switch (type) {
      case TAG.BYTE: return `${dv.getInt8(o++)}b`
      case TAG.SHORT: { const v = dv.getInt16(o); o += 2; return `${v}s` }
      case TAG.INT: { const v = dv.getInt32(o); o += 4; return String(v) }
      case TAG.LONG: { const v = dv.getBigInt64(o); o += 8; return `${v}L` }
      case TAG.FLOAT: { const v = dv.getFloat32(o); o += 4; return `${decimal(v)}f` }
      case TAG.DOUBLE: { const v = dv.getFloat64(o); o += 8; return `${decimal(v)}d` }
      case TAG.STRING: return quote(string())
      case TAG.BYTE_ARRAY: return primitiveArray("B", 1, () => `${dv.getInt8(o)}b`)
      case TAG.INT_ARRAY: return primitiveArray("I", 4, () => String(dv.getInt32(o)))
      case TAG.LONG_ARRAY: return primitiveArray("L", 8, () => `${dv.getBigInt64(o)}L`)
      case TAG.LIST: {
        const elementType = dv.getUint8(o++)
        const len = dv.getInt32(o)
        o += 4
        if (!len) return "[]"
        const parts = new Array(len)
        for (let i = 0; i < len; i++) parts[i] = payload(elementType, depth + 1)
        if (elementType !== TAG.COMPOUND && elementType !== TAG.LIST && parts.every(p => p.length < 24)) {
          return `[${parts.join(", ")}]`
        }
        return `[\n${parts.map(p => pad + p).join(",\n")}\n${close}]`
      }
      case TAG.COMPOUND: {
        const parts = []
        for (;;) {
          const entryType = dv.getUint8(o++)
          if (entryType === TAG.END) break
          const name = string()
          parts.push(`${plainKey.test(name) ? name : quote(name)}: ${payload(entryType, depth + 1)}`)
        }
        if (!parts.length) return "{}"
        return `{\n${parts.map(p => pad + p).join(",\n")}\n${close}}`
      }
      default: throw new Error(`Unknown NBT tag type ${type} at byte ${o - 1}`)
    }
  }

  const rootType = dv.getUint8(o++)
  if (rootType !== TAG.COMPOUND) throw new Error(`NBT root is tag type ${rootType}, expected a compound`)
  string()
  return payload(TAG.COMPOUND, 0)
}
