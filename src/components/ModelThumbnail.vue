<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue"
import { useAssets } from "../composables/useAssets.js"

const props = defineProps({
  path: { type: String, required: true },
  icon: { type: String, default: "data_object" }
})

const { renderModelThumbnail } = useAssets()
const done = ref(false)
const placeholder = ref(null)
const holder = ref(null)
let job
let thumb
let unmounted = false

// a shared observer keeps one callback for the whole grid instead of one per tile
const callbacks = new WeakMap()
let observer

function observe(el, callback) {
  observer ??= new IntersectionObserver(entries => {
    for (const entry of entries) {
      callbacks.get(entry.target)?.(entry.isIntersecting)
    }
  }, { rootMargin: "400px" })
  callbacks.set(el, callback)
  observer.observe(el)
}

function unobserve(el) {
  if (!el) return
  callbacks.delete(el)
  observer?.unobserve(el)
}

async function request() {
  if (thumb || job) return
  const current = job = renderModelThumbnail(props.path)
  const result = await current.promise
  if (job === current) job = null
  if (!result || unmounted || thumb) return
  thumb = result
  done.value = true
  unobserve(placeholder.value)
  await nextTick()
  // the thumbnail owns this canvas; re-appending a cached one moves it here
  if (holder.value) {
    holder.value.append(thumb.canvas)
    // players built in a worker have no DOM to watch, so drive their playback
    // from here instead of the library's own offscreen pausing
    observe(holder.value, visible => thumb.setVisible(visible))
  }
}

onMounted(() => {
  // render on mount so tiles always resolve; requests render top-down as the
  // grid mounts. the observer only trims: a still-pending job for a tile
  // scrolled out of view is dropped and re-requested on return
  request()
  observe(placeholder.value, visible => {
    if (visible) {
      request()
    } else if (job && !job.started) {
      job.cancelled = true
      job = null
    }
  })
})

onBeforeUnmount(() => {
  // thumbnails live in the per-jar cache; don't dispose here, just detach
  unmounted = true
  unobserve(placeholder.value)
  unobserve(holder.value)
  thumb?.setVisible(false)
  if (job) {
    job.cancelled = true
    job = null
  }
})
</script>

<template>
  <div v-if="done" ref="holder" class="model-thumbnail"></div>
  <i v-else ref="placeholder" class="material-icons">{{ icon }}</i>
</template>
