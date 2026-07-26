<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"

const props = defineProps({
  items: { type: Array, required: true }
})

defineEmits(["click", "contextmenu"])

const viewport = ref(null)
const container = ref(null)
const visibleItems = ref([])
const height = ref(0)
const batchSize = 128
let loadedCount = 0
let resizeObserver

function onResize() {
  const el = container.value
  if (!el) return
  let firstItem = el.children[1]
  if (!firstItem) {
    height.value = 0
    return
  }
  const columnMode = getComputedStyle(firstItem).display === "contents"
  if (columnMode) firstItem = firstItem.children[0]
  const styles = getComputedStyle(el)
  const gap = parseInt(styles.rowGap)
  let itemsPerRow = 1
  if (!columnMode) {
    itemsPerRow = Math.max(1, Math.floor((el.clientWidth - parseInt(styles.padding) * 2 + gap) / (el.children[1].offsetWidth + gap)))
  }
  const loadedRows = Math.ceil(loadedCount / itemsPerRow)
  const remainingRows = Math.ceil((props.items.length - loadedCount - 1) / itemsPerRow)
  let loadedHeight = 0
  for (let i = 0; i < loadedRows; i++) {
    let firstItemInRow = el.children[i * itemsPerRow + 1]
    if (!firstItemInRow) break
    if (columnMode) firstItemInRow = firstItemInRow.children[0]
    loadedHeight += firstItemInRow.offsetHeight
  }
  const remainingHeight = remainingRows > 0 ? remainingRows * loadedHeight / loadedRows : 0
  height.value = loadedHeight + remainingHeight + gap * (loadedRows + Math.max(remainingRows, 0) - 1)
}

function onScroll() {
  const el = container.value
  if (!el) return
  let lastItem = el.children[el.children.length - 1]
  if (!lastItem) return

  if (getComputedStyle(lastItem).display === "contents") lastItem = lastItem.children[0]
  if (!lastItem) return

  const lastItemRect = lastItem.getBoundingClientRect()
  const containerRect = viewport.value.getBoundingClientRect()

  if (lastItemRect.bottom <= containerRect.bottom + 128) {
    return loadMore()
  }

  onResize()
}

function loadMore() {
  if (loadedCount >= props.items.length) return nextTick(onResize)

  const newItems = props.items.slice(loadedCount, loadedCount + batchSize)

  visibleItems.value.push(...newItems)
  loadedCount += newItems.length

  nextTick(onScroll)
}

function reset() {
  visibleItems.value = []
  loadedCount = 0
  loadMore()
}

watch(() => props.items, reset)

onMounted(() => {
  loadMore()
  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

defineExpose({ viewport, container, loadMore, onScroll, onResize, reset })
</script>

<template>
  <div ref="viewport" @scroll="onScroll" @click.self="$emit('click')" @contextmenu.self="$emit('contextmenu', $event)">
    <div ref="container" :style="{ minHeight: height + 'px' }" @click.self="$emit('click')" @contextmenu.self="$emit('contextmenu', $event)">
      <slot name="before-list"></slot>
      <template v-for="item of visibleItems">
        <slot :item="item"></slot>
      </template>
    </div>
  </div>
</template>
