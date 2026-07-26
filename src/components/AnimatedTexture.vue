<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue"
import { loadRenderer } from "../lib/renderer.js"
import { useAssets } from "../composables/useAssets.js"

const props = defineProps({
  path: { type: String, required: true }
})

const { preparedAssets } = useAssets()
const container = ref(null)
let player

onMounted(async () => {
  try {
    const { renderTexture } = await loadRenderer()
    player = await renderTexture({ texture: props.path, assets: await preparedAssets(), animated: true })
  } catch (e) {
    console.error(e)
    return
  }
  if (!container.value) {
    player.dispose()
    return
  }
  player.canvas.classList.add("checkerboard")
  container.value.append(player.canvas)
})

onBeforeUnmount(() => player?.dispose())
</script>

<template>
  <div ref="container" class="animated-texture"></div>
</template>
