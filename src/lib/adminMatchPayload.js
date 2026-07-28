/**
 * Shared helpers for building POST /api/admin/results payloads from admin form rows.
 */

import { formatFixtureDate } from './fixtures.js'

/** @param {string | undefined | null} s */
export function parsePlayersBlob(s) {
  if (!s || typeof s !== 'string') return []
  return s
    .split(/[;\n]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

/**
 * @param {object[]} rows — form rows with home, away, shots, etc.
 * @returns {object[]} mergeWeekResults `matches` entries
 */
export function serializeAdminMatchRows(rows) {
  const matchRows = rows.filter((m) => m.home && m.away)
  /** @type {object[]} */
  const outgoing = []

  for (const m of matchRows) {
    if (m.postponed) {
      const row = {
        home: m.home,
        away: m.away,
        postponed: true,
      }
      const md = String(m.matchDate ?? '').trim()
      if (md) row.matchDate = md
      outgoing.push(row)
      continue
    }

    const homeEmpty = String(m.homeShots ?? '').trim() === ''
    const awayEmpty = String(m.awayShots ?? '').trim() === ''

    if (homeEmpty && awayEmpty) {
      // Two blank shot boxes mean "remove any saved result", so a row that has
      // points typed into it must not take this path — standings need shots, so
      // clearing would throw away what was just entered and still report a save.
      const pointsTyped =
        String(m.homePoints ?? '').trim() !== '' || String(m.awayPoints ?? '').trim() !== ''
      if (pointsTyped) {
        throw new Error(
          `"${m.home}" v "${m.away}": enter both shot totals as well as the points, or clear the points too to remove a saved result.`,
        )
      }
      outgoing.push({ home: m.home, away: m.away, clear: true })
      continue
    }

    const hs = Number(m.homeShots)
    const asVal = Number(m.awayShots)
    if (homeEmpty !== awayEmpty || !Number.isFinite(hs) || !Number.isFinite(asVal)) {
      throw new Error(
        `"${m.home}" v "${m.away}": enter both shot totals or clear both blanks to remove a saved result.`,
      )
    }

    const row = {
      home: m.home,
      away: m.away,
      homeShots: hs,
      awayShots: asVal,
    }

    // Points are optional: blank fields are omitted so the server / standings
    // treat the result as a plain win (2–0) rather than an explicit 0–0.
    const hpRaw = String(m.homePoints ?? '').trim()
    const apRaw = String(m.awayPoints ?? '').trim()
    const hp = Number(hpRaw)
    const ap = Number(apRaw)
    if (hpRaw !== '' && apRaw !== '' && Number.isFinite(hp) && Number.isFinite(ap)) {
      row.homePoints = hp
      row.awayPoints = ap
    }

    const ph = parsePlayersBlob(m.homePlayersText)
    const pa = parsePlayersBlob(m.awayPlayersText)
    if (ph.length || pa.length) {
      row.players = { home: ph, away: pa }
    } else if (m.players && typeof m.players === 'object') {
      row.players = m.players
    }

    const md = String(m.matchDate ?? '').trim()
    if (md) row.matchDate = md

    const rinkRaw = String(m.rinkShotsJson ?? '').trim()
    if (rinkRaw) {
      let parsed
      try {
        parsed = JSON.parse(rinkRaw)
      } catch {
        throw new Error(
          `"${m.home}" v "${m.away}": rink shots must be valid JSON (array).`,
        )
      }
      if (!Array.isArray(parsed) || !parsed.length) {
        throw new Error(
          `"${m.home}" v "${m.away}": rink shots JSON must be a non-empty array or left blank.`,
        )
      }
      row.rinkShots = parsed
    }

    outgoing.push(row)
  }

  return outgoing
}

/** Map GET week-results row into admin form row */
export function weekResultRowToForm(r) {
  return {
    home: r.home,
    away: r.away,
    homePoints: r.homePoints ?? '',
    awayPoints: r.awayPoints ?? '',
    homeShots: r.homeShots ?? '',
    awayShots: r.awayShots ?? '',
    homePlayersText: r.homePlayersText ?? '',
    awayPlayersText: r.awayPlayersText ?? '',
    matchDate: r.matchDate ?? '',
    rinkShotsJson: r.rinkShotsJson ?? '',
    postponed: Boolean(r.postponed),
    players: null,
  }
}

/** Human-readable row label for CSV import entry list */
export function formatCsvImportEntryLabel(leagues, e) {
  const lg = leagues.find((l) => l.id === e.leagueId)
  const leagueName = lg?.name ?? e.leagueId
  let sectionBit = ''
  let divLabel = e.divisionId
  if (lg?.sections?.length) {
    const sec = lg.sections.find((s) => s.id === e.sectionId) ?? null
    if (sec?.label) sectionBit = `${sec.label} · `
    const d = sec?.divisions?.find((d) => d.id === e.divisionId)
    divLabel = d?.label ?? e.divisionId
  } else {
    const d = lg?.divisions?.find((d) => d.id === e.divisionId)
    divLabel = d?.label ?? e.divisionId
  }
  let tail =
    typeof e.csvRow === 'number' ? `CSV row ${e.csvRow}` : 'Fixture'
  if (e.source === 'league-history') {
    tail = 'League data'
  }
  const iso = e.matchDateIso != null ? String(e.matchDateIso).trim() : ''
  const diaryBit = iso ? formatFixtureDate(iso) || iso : 'No diary date'
  return `${leagueName} · ${sectionBit}${divLabel} · ${diaryBit} · ${tail}`
}

function csvImportEntryResolvedLeague(leagues, e) {
  return leagues.find((l) => l.id === e.leagueId) ?? null
}

/** Single league column (imports table). */
export function csvImportEntryLeagueName(leagues, e) {
  return csvImportEntryResolvedLeague(leagues, e)?.name ?? e.leagueId ?? '—'
}

/** Section/session label ("Monday Evening") or weekday from match diary date when no section row. */
export function csvImportEntryDayLabel(leagues, e) {
  const lg = csvImportEntryResolvedLeague(leagues, e)
  if (lg?.sections?.length && e.sectionId) {
    const sec = lg.sections.find((s) => s.id === e.sectionId)
    if (sec?.label) return sec.label
  }
  const iso = e.matchDateIso != null ? String(e.matchDateIso).trim() : ''
  if (iso) {
    const d = new Date(`${iso}T12:00:00`)
    return d.toLocaleDateString('en-GB', { weekday: 'long' })
  }
  return '—'
}

/** Resolution label ("Division A") from admin league snapshot. */
export function csvImportEntryDivisionLabel(leagues, e) {
  const lg = csvImportEntryResolvedLeague(leagues, e)
  if (!lg) return e.divisionId ?? '—'
  if (lg.sections?.length) {
    const sec = lg.sections.find((s) => s.id === e.sectionId)
    const d = sec?.divisions?.find((d) => d.id === e.divisionId)
    return d?.label ?? e.divisionId ?? '—'
  }
  const d = lg.divisions?.find((d) => d.id === e.divisionId)
  return d?.label ?? e.divisionId ?? '—'
}

/** Home vs away totals only — no pts line. */
export function csvImportEntryShotsLine(e) {
  if (e?.postponed) return 'P-P'
  const hs = Number(e.homeShots)
  const asVal = Number(e.awayShots)
  if (Number.isFinite(hs) && Number.isFinite(asVal)) return `${hs} · ${asVal}`
  if (Number.isFinite(hs) || Number.isFinite(asVal)) {
    const left = Number.isFinite(hs) ? String(hs) : '—'
    const right = Number.isFinite(asVal) ? String(asVal) : '—'
    return `${left} · ${right}`
  }
  return '—'
}
