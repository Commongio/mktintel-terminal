// lib/mediaStore.js — IndexedDB blob store for the terminal background VIDEO.
//
// Why not localStorage like the background photo? Photos are downscaled to a
// ~1.5MB data URL, which fits. A video does NOT — even a short loop is tens of
// MB, and localStorage caps around 5MB per origin. So the video is kept as a
// Blob in IndexedDB (quota is orders of magnitude larger) and referenced at
// runtime via URL.createObjectURL.
//
// Tradeoff (documented for the user in the Personal settings tab): the video
// lives on THIS device only — it is not synced to the account like other
// settings, because we're not uploading tens of MB per user to Supabase.

const DB = "kronos_media";
const STORE = "blobs";
const KEY = "bg-video";

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => { db.close(); resolve(req?.result); };
    t.onerror = () => { db.close(); reject(t.error); };
  });
}

export async function saveBgVideo(blob) {
  await tx("readwrite", (s) => s.put(blob, KEY));
}

export async function loadBgVideo() {
  try { return (await tx("readonly", (s) => s.get(KEY))) || null; }
  catch { return null; }
}

export async function clearBgVideo() {
  try { await tx("readwrite", (s) => s.delete(KEY)); } catch {}
}
