// Central API base URL.
//  - VITE_API_URL set  -> use it (split frontend/backend deployments)
//  - production build   -> same origin ("" base), since Vercel serves /api/* from
//                          the Python function on this domain
//  - dev                -> the local uvicorn server
const CONFIGURED_API_URL = import.meta.env.VITE_API_URL?.trim();

export const API_BASE = CONFIGURED_API_URL
  ? CONFIGURED_API_URL.replace(/\/$/, "")
  : import.meta.env.PROD
    ? ""
    : "http://localhost:8000";

export const apiUrl = (path) =>
  `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;

// Helpers take paths relative to /api (e.g. getJson('/health') → GET {base}/api/health).
const prefixed = (path) => apiUrl(`/api${path.startsWith("/") ? path : `/${path}`}`);

export async function getJson(path) {
  const res = await fetch(prefixed(path));
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || `HTTP ${res.status}`);
  return res.json();
}

export async function postJson(path, body) {
  const res = await fetch(prefixed(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || `HTTP ${res.status}`);
  return res.json();
}

export async function postForm(path, formData) {
  const res = await fetch(prefixed(path), { method: "POST", body: formData });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.detail || `HTTP ${res.status}`);
  return res.json();
}
