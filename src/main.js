import { createApp } from "vue"
import App from "./App.vue"
import "./styles.css"

createApp(App).mount("#app")

if (import.meta.env.DEV) {
  Promise.all([
    import("./composables/useAssets.js"),
    import("./composables/useViewer.js")
  ]).then(([assets, viewer]) => {
    window.__ab = {
      assets: assets.useAssets(),
      viewer: viewer.useViewer()
    }
  })
}
