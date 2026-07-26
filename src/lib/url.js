import { storage } from "./storage.js"

export function prettyParams(params) {
  return params.toString().replaceAll("%2F", "/").replaceAll("%3A", ":").replace(/=(?=&|$)/g, "")
}

export function buildLink({ version, zip, path, file, download }) {
  const params = new URLSearchParams()
  if (zip) {
    params.set("zip", zip)
  } else {
    params.set("version", version)
    if (!storage.objects) {
      params.set("objects", "0")
    }
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
