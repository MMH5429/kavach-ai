// Tiny module-level store: each module records its latest verdict here so the
// Evidence Export can bundle whatever the analyst currently has on screen.
const results = {};

export function recordResult(module, data) {
  results[module] = { ...data, recorded_at: new Date().toISOString() };
}

export function getResults() {
  return { ...results };
}
