const API_BASE = '/api/admin'

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || res.statusText)
  return data
}

export async function checkAdminSession() {
  return api('/session')
}

export async function adminLogin(password) {
  return api('/login', { method: 'POST', body: JSON.stringify({ password }) })
}

export async function adminLogout() {
  return api('/logout', { method: 'POST' })
}

export async function fetchAdminLeagues() {
  return api('/leagues')
}

export async function importScoreSheet(formData) {
  const res = await fetch(`${API_BASE}/import`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (res.ok) return data
  // OCR ran but league/division could not be auto-detected — still return parsed text
  if (res.status === 422 && (data.rawText != null || data.suggestions)) {
    return { ...data, partial: true }
  }
  throw new Error(data.error || res.statusText)
}

export async function saveResults(payload) {
  return api('/results', { method: 'POST', body: JSON.stringify(payload) })
}
