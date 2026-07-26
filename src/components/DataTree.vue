<script setup>
import { computed, ref, watch } from "vue"

const props = defineProps({
  value: { type: null, required: true }
})

const collapsed = ref(new Set())

watch(() => props.value, () => collapsed.value = new Set())

const isTypedArray = v => ArrayBuffer.isView(v) && !(v instanceof DataView)
const isLeaf = v => v === null || typeof v !== "object" || isTypedArray(v)

function leaf(v) {
  if (v === null) return { text: "null", cls: "null" }
  if (typeof v === "string") return { text: `"${v}"`, cls: "str" }
  if (typeof v === "boolean") return { text: String(v), cls: "bool" }
  if (typeof v === "bigint") return { text: `${v}L`, cls: "num" }
  if (typeof v === "number") return { text: String(Number.isInteger(v) ? v : Math.round(v * 1e5) / 1e5), cls: "num" }
  if (isTypedArray(v)) {
    const shown = Array.from(v.subarray(0, 64), n => String(n)).join(", ")
    return { text: `[${shown}${v.length > 64 ? `, …${v.length - 64} more` : ""}]`, cls: "num" }
  }
  return { text: String(v), cls: "pun" }
}

const entriesOf = v => Array.isArray(v) ? v.map((e, i) => [String(i), e]) : Object.entries(v)

const INLINE_LIMIT = 64

function inlineParts(list) {
  const parts = [{ text: "[", cls: "pun" }]
  list.slice(0, INLINE_LIMIT).forEach((entry, i) => {
    if (i) parts.push({ text: ", ", cls: "pun" })
    parts.push(leaf(entry))
  })
  if (list.length > INLINE_LIMIT) parts.push({ text: `, …${list.length - INLINE_LIMIT} more`, cls: "pun" })
  parts.push({ text: "]", cls: "pun" })
  return parts
}

const rows = computed(() => {
  const out = []
  const hidden = collapsed.value

  function walk(key, value, depth, path) {
    if (isLeaf(value)) {
      out.push({ path, key, depth, parts: [leaf(value)] })
      return
    }
    if (Array.isArray(value) && value.length && value.every(isLeaf)) {
      out.push({ path, key, depth, parts: inlineParts(value) })
      return
    }
    const entries = entriesOf(value)
    const open = !hidden.has(path)
    out.push({
      path,
      key,
      depth,
      open,
      empty: !entries.length,
      mark: Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`
    })
    if (!open) return
    for (const [childKey, childValue] of entries) {
      walk(childKey, childValue, depth + 1, `${path}/${childKey}`)
    }
  }

  const root = props.value
  if (root === undefined) return out
  if (isLeaf(root)) {
    out.push({ path: "", key: "", depth: 0, parts: [leaf(root)] })
    return out
  }
  for (const [key, value] of entriesOf(root)) walk(key, value, 0, key)
  return out
})

function toggle(row) {
  if (row.mark === undefined || row.empty) return
  const next = new Set(collapsed.value)
  if (next.has(row.path)) next.delete(row.path)
  else next.add(row.path)
  collapsed.value = next
}

function collapseAll() {
  const next = new Set()
  const walk = (value, path) => {
    if (isLeaf(value)) return
    for (const [key, child] of entriesOf(value)) {
      const childPath = path ? `${path}/${key}` : key
      if (!isLeaf(child)) {
        next.add(childPath)
        walk(child, childPath)
      }
    }
  }
  walk(props.value ?? {}, "")
  collapsed.value = next
}

defineExpose({ collapseAll, expandAll: () => collapsed.value = new Set() })
</script>

<template>
  <div class="data-tree">
    <div
      v-for="row in rows"
      :key="row.path"
      class="data-row"
      :class="{ container: row.mark !== undefined && !row.empty }"
      :style="{ paddingLeft: 4 + row.depth * 14 + 'px' }"
      @click="toggle(row)"
    >
      <i v-if="row.mark !== undefined && !row.empty" class="material-icons chevron">{{ row.open ? "expand_more" : "chevron_right" }}</i>
      <span v-else class="chevron-space"></span>
      <span v-if="row.key !== ''" class="data-key">{{ row.key }}</span>
      <span v-if="row.mark !== undefined" class="data-mark">{{ row.empty ? (row.mark === "[0]" ? "[]" : "{}") : row.mark }}</span>
      <span v-else class="data-value"><span v-for="(p, i) in row.parts" :key="i" :class="p.cls">{{ p.text }}</span></span>
    </div>
  </div>
</template>

<style scoped>
.data-tree {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 0;
}

.data-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 1px 8px 1px 0;
}

.data-row:nth-child(even) {
  background-color: #ffffff08;
}

.data-row.container {
  cursor: pointer;
}

.data-row.container:hover {
  background-color: var(--color-selected);
}

.chevron {
  font-size: 16px;
  align-self: center;
  color: var(--color-subtle_text);
}

.chevron-space {
  width: 16px;
  flex-shrink: 0;
}

.data-key {
  color: var(--color-subtle_text);
  flex-shrink: 0;
}

.data-key::after {
  content: ":";
}

.data-value {
  overflow-wrap: anywhere;
}

.data-mark {
  color: var(--color-subtle_text);
  opacity: 0.7;
}

.num { color: var(--color-accent); }
.str { color: #7ec98a; }
.bool { color: #d9a05b; }
.null { color: #c586c0; }
.pun { color: var(--color-subtle_text); }
</style>
