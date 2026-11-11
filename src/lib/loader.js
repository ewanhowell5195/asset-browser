import MinecraftAssets from "minecraft-asset-loader"
import { proxy } from "./net.js"

const PROXIED = ["https://github.com/", "https://resources.download.minecraft.net/"]

const route = url => PROXIED.some(host => url.startsWith(host)) ? proxy(url) : false

let java = null
let bedrock = null

export const javaAssets = () => java ??= new MinecraftAssets({ proxy: route })

export const bedrockAssets = () => bedrock ??= new MinecraftAssets({ type: "bedrock", cacheKey: "bedrock", proxy: route })
