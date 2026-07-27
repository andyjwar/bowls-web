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

/** Full league JSON (fixtures JSON file) — admin edits only */
export async function fetchAdminLeagueDocument(leagueId) {
  return api(`/league/${encodeURIComponent(leagueId)}`)
}

/** Renames clubs in-place (same roster length). Stored results updated when names change. */
export async function saveAdminDivisionTeams(leagueId, { sectionId, divisionId, teams }) {
  return api(`/league/${encodeURIComponent(leagueId)}/division-teams`, {
    method: 'PUT',
    body: JSON.stringify({ sectionId, divisionId, teams }),
  })
}

/** Edit fixture dates on a day's schedule grid — rows like `[{ week, date }]`. */
export async function saveAdminScheduleDates(leagueId, { sectionId, rows }) {
  return api(`/league/${encodeURIComponent(leagueId)}/schedule-dates`, {
    method: 'PUT',
    body: JSON.stringify({ sectionId, rows }),
  })
}

/** Display labels only — league title, section/day title, division title */
export async function saveAdminLeagueLabels(leagueId, payload) {
  return api(`/league/${encodeURIComponent(leagueId)}/labels`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function addAdminLeagueDivision(leagueId, payload) {
  return api(`/league/${encodeURIComponent(leagueId)}/divisions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function deleteAdminLeagueDivision(leagueId, { sectionId, divisionId }) {
  const query = sectionId ? `?sectionId=${encodeURIComponent(sectionId)}` : ''
  return api(
    `/league/${encodeURIComponent(leagueId)}/divisions/${encodeURIComponent(divisionId)}${query}`,
    { method: 'DELETE' },
  )
}

export async function addAdminLeagueSection(leagueId, payload) {
  return api(`/league/${encodeURIComponent(leagueId)}/sections`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createAdminLeague(payload) {
  return api('/leagues', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Unregister a league — it leaves the site and admin; the data file stays on disk. */
export async function deleteAdminLeague(leagueId) {
  return api(`/league/${encodeURIComponent(leagueId)}`, { method: 'DELETE' })
}

/** Build a draft season from a reviewed league/day/division structure. */
export async function startAdminSeason(year, structure) {
  return api('/season', { method: 'POST', body: JSON.stringify({ year, structure }) })
}

/** Point the public site at another existing season (reversible switch). */
export async function setAdminActiveSeason(year) {
  return api('/active-season', { method: 'PUT', body: JSON.stringify({ year }) })
}

/** Remove a season started by mistake (refused once anything has results). */
export async function deleteAdminSeason(year) {
  return api(`/season/${encodeURIComponent(year)}`, { method: 'DELETE' })
}

/** Full registered-player map for all leagues */
export async function fetchAdminRegisteredPlayers() {
  return api('/registered-players')
}

/** Form submissions received from the public Forms pages (newest first) */
export async function fetchAdminFormSubmissions() {
  return api('/form-submissions')
}

export async function saveAdminRegisteredTeam({ leagueId, sectionId, teamName, players }) {
  return api('/registered-players/team', {
    method: 'PUT',
    body: JSON.stringify({ leagueId, sectionId, teamName, players }),
  })
}

/** Add empty roster buckets for every club in fixture lists + saved results (per section/day). */
export async function seedAdminRegisteredPlayersFromLeague(leagueId) {
  return api('/registered-players/seed-league', {
    method: 'POST',
    body: JSON.stringify({ leagueId }),
  })
}

/** Parse pasted roster lines into `{ ok, names, count }`. */
export async function parseRegisteredPlayersText(text) {
  return api('/registered-players/parse-upload', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

/** Parse uploaded roster file (.csv / .txt / .xlsx). */
export async function parseRegisteredPlayersFile(formData) {
  const res = await fetch(`${API_BASE}/registered-players/parse-upload`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const fallback =
      res.status === 404
        ? 'Admin API not found — run npm run dev (starts Vite + API on port 3001), or npm run dev:admin with Vite dev proxy / preview proxy so /api reaches the API.'
        : res.statusText
    throw new Error(data.error || fallback)
  }
  return data
}

export async function fetchWeekResults({ leagueId, sectionId, divisionId, week }) {
  const q = new URLSearchParams({
    leagueId,
    divisionId,
    week: String(week ?? ''),
  })
  if (sectionId) q.set('sectionId', sectionId)
  return api(`/week-results?${q}`)
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

/** Knockout competitions (cups) — fresh read for admin editing */
export async function fetchAdminCompetitions() {
  return api('/competitions')
}

/** Replace one cup's rounds; the server advances winners into `from`-linked slots. */
export async function saveAdminCompetitionRounds(compId, rounds) {
  return api(`/competition/${encodeURIComponent(compId)}`, {
    method: 'PUT',
    body: JSON.stringify({ rounds }),
  })
}

/** Add a knockout cup to the active season (empty draw — set it up next). */
export async function createAdminCompetition(payload) {
  return api('/competitions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Replace a cup's whole draw structure. The server refuses once results exist. */
export async function saveAdminCompetitionDraw(compId, rounds) {
  return api(`/competition/${encodeURIComponent(compId)}/draw`, {
    method: 'PUT',
    body: JSON.stringify({ rounds }),
  })
}

/** Remove a cup from the season (only while it has no results). */
export async function deleteAdminCompetition(compId) {
  return api(`/competition/${encodeURIComponent(compId)}`, { method: 'DELETE' })
}

export async function importCsv(formData) {
  const res = await fetch(`${API_BASE}/import-csv`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })
  const text = await res.text()
  /** @type {Record<string, unknown>} */
  let data = {}
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      return {
        ok: false,
        error:
          'Import response was not JSON — run `npm run dev` (Vite + admin API) or `npm run dev:admin` on port 3001 with the Vite `/api` proxy, then retry.',
      }
    }
  }

  const batchList = Array.isArray(data.batches) ? data.batches : []

  if (!res.ok) {
    const errMsg =
      (Array.isArray(data.errors) && data.errors.join('; ')) ||
      data.error ||
      `HTTP ${res.status}`
    return {
      ok: false,
      error: errMsg,
      errors: data.errors,
      warnings: data.warnings,
      batches: batchList,
    }
  }

  let rowList = Array.isArray(data.fixtureRows)
    ? [...data.fixtureRows]
    : Array.isArray(data.entries)
      ? [...data.entries]
      : []

  if (
    rowList.length === 0 &&
    batchList.some((b) => Array.isArray(b.fixtures) && b.fixtures.length > 0)
  ) {
    rowList = batchList.flatMap((b) =>
      Array.isArray(b.fixtures) ? [...b.fixtures] : [],
    )
  }

  const ok = data.ok !== false

  return {
    ...data,
    ok,
    batches: batchList,
    fixtureRows: rowList,
    entries: rowList,
  }
}
