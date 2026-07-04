// Sprite loader/registry. This is the ONLY module allowed to touch the DOM
// Image constructor for sprite assets; renderer.js consumes it via get().
// No enemy/weapon/crate id strings live here — callers pass arbitrary paths
// pulled from data fields.

const registry = new Map(); // path -> { img, status: 'loading'|'loaded'|'failed' }

// preload(paths: string[]): create Image objects for each distinct path.
// Safe to call multiple times / with paths already registered (no-op re-add).
export function preload(paths) {
  for (const path of paths) {
    if (!path || registry.has(path)) continue;
    const entry = { img: null, status: 'loading' };
    const img = new Image();
    img.onload = () => {
      entry.status = (img.naturalWidth > 0) ? 'loaded' : 'failed';
    };
    img.onerror = () => {
      entry.status = 'failed';
    };
    img.src = path;
    entry.img = img;
    registry.set(path, entry);
  }
}

// get(path): returns the HTMLImageElement only if fully loaded, else null.
export function get(path) {
  if (!path) return null;
  const entry = registry.get(path);
  if (!entry) return null;
  if (entry.img && entry.img.naturalWidth > 0) return entry.img;
  return null;
}
