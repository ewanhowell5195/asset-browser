let dbPromise

function getDB() {
  return dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("asset_browser", 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore("jars")
      req.result.createObjectStore("objects")
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGet(store, key) {
  const db = await getDB()
  return promisify(db.transaction(store).objectStore(store).get(key))
}

export async function idbKeys(store) {
  const db = await getDB()
  return promisify(db.transaction(store).objectStore(store).getAllKeys())
}

export async function idbPut(store, key, value) {
  const db = await getDB()
  return promisify(db.transaction(store, "readwrite").objectStore(store).put(value, key))
}

export async function idbDelete(store, key) {
  const db = await getDB()
  return promisify(db.transaction(store, "readwrite").objectStore(store).delete(key))
}
