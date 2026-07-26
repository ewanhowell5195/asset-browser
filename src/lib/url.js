import { storage } from "./storage.js"

export function prettyParams(params) {
  return params.toString().replaceAll("%2F", "/").replace(/=(?=&|$)/g, "")
}

export function buildLink({ version, path, file, download }) {
  const params = new URLSearchParams()
  params.set("version", version)
  if (!storage.objects) {
    params.set("objects", "0")
  }
  if (path) {
    params.set("path", path)
  }
  if (file) {
    params.set("file", file)
  }
  if (download) {
    params.set("download", "")
  }
  return `${location.pathname}?${prettyParams(params)}`
}

export const absoluteLink = args => location.origin + buildLink(args)

export function updateUrlParams(mutator) {
  const url = new URL(location)
  mutator(url.searchParams)
  const query = prettyParams(url.searchParams)
  history.replaceState(null, "", url.pathname + (query ? "?" + query : ""))
}
