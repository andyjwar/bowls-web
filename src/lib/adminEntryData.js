/**
 * Data helpers for the admin score-entry pages: flattening a league document
 * into per-division fixture views, counting what still needs entering, and
 * turning fixture matches into editable form rows.
 */

import { buildDivisionFixtures } from './fixtures.js'
import { applyResultsToFixtures } from './results.js'

/** End of today (local) as a ms timestamp — fixtures dated today count as due. */
export function endOfTodayMs() {
  const d = new Date()
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

function dateMs(isoDate) {
  if (!isoDate) return NaN
  return new Date(`${isoDate}T12:00:00`).getTime()
}

function isPlaceholderTeam(name) {
  return /^Team \d+$/i.test(String(name ?? '').trim())
}

/**
 * Every division of a league flattened with fixtures merged with saved results.
 * Works for sectioned (Samford) and flat play-day (Two Wood / Triples) leagues.
 * @returns {Array<{ sectionId: string|null, sectionLabel: string|null, divisionId: string, divisionLabel: string, playDay: string|null, division: object, fixtures: object[] }>}
 */
export function leagueDivisionViews(leagueDoc) {
  const out = []
  if (!leagueDoc) return out

  if (leagueDoc.sections) {
    for (const sec of leagueDoc.sections) {
      for (const d of sec.divisions ?? []) {
        out.push({
          sectionId: sec.id,
          sectionLabel: sec.label,
          divisionId: d.id,
          divisionLabel: d.label,
          playDay: null,
          division: d,
          fixtures: applyResultsToFixtures(
            buildDivisionFixtures(sec.scheduleTemplate, d.teams),
            d.results,
          ),
        })
      }
    }
    return out
  }

  for (const d of leagueDoc.divisions ?? []) {
    const getDate = (row) => {
      if (d.playDay === 'thursday') return row.thursdayDate
      if (d.playDay === 'tuesday') return row.tuesdayDate
      return row.date
    }
    out.push({
      sectionId: null,
      sectionLabel: null,
      divisionId: d.id,
      divisionLabel: d.label,
      playDay: d.playDay ?? null,
      division: d,
      fixtures: applyResultsToFixtures(
        buildDivisionFixtures(leagueDoc.scheduleTemplate, d.teams, getDate),
        d.results,
      ),
    })
  }
  return out
}

/**
 * Outstanding results for a league: fixtures dated on or before today with no
 * saved result (byes and placeholder "Team N" fixtures excluded). Also returns
 * the week number whose diary date is closest to today, for the tile sub-line.
 */
export function countOutstandingForLeague(leagueDoc) {
  const cutoff = endOfTodayMs()
  let toEnter = 0
  let closestWeek = null
  let closestDelta = Infinity
  const now = Date.now()

  for (const view of leagueDivisionViews(leagueDoc)) {
    for (const week of view.fixtures) {
      const t = dateMs(week.date)
      if (!Number.isFinite(t)) continue

      const delta = Math.abs(t - now)
      if (delta < closestDelta) {
        closestDelta = delta
        closestWeek = week.week
      }

      if (t > cutoff) continue
      for (const m of week.matches ?? []) {
        if (m.isBye || m.played) continue
        if (isPlaceholderTeam(m.home) || isPlaceholderTeam(m.away)) continue
        toEnter += 1
      }
    }
  }

  return { toEnter, closestWeek }
}

/** A cup match is decided when it has a walkover or a full (non-draw) score. */
export function cupMatchDecided(m) {
  if (!m) return false
  if (m.walkover === 'home' || m.walkover === 'away') return true
  const hs = Number(m.homeScore)
  const as = Number(m.awayScore)
  return Number.isFinite(hs) && Number.isFinite(as)
}

function cupSideName(side) {
  // Real club name only — placeholder `label`s ("Winner of Tie 1") don't count.
  const n = side?.name
  return typeof n === 'string' && n.trim() ? n.trim() : null
}

/** Ties in rounds dated on or before today with both sides named but no result. */
export function countAwaitedCupTies(comp) {
  const cutoff = endOfTodayMs()
  let awaited = 0
  for (const round of comp?.rounds ?? []) {
    const t = dateMs(round.date)
    if (!Number.isFinite(t) || t > cutoff) continue
    for (const m of round.matches ?? []) {
      if (cupMatchDecided(m)) continue
      if (!cupSideName(m.home) || !cupSideName(m.away)) continue
      awaited += 1
    }
  }
  return awaited
}

/** Week whose diary date is closest to today (fallback: first week). */
export function pickWeekClosestToToday(fixtureWeeks) {
  if (!fixtureWeeks?.length) return null
  const now = Date.now()
  const dated = fixtureWeeks.filter((w) => w.date && String(w.date).trim())
  if (!dated.length) return Number(fixtureWeeks[0].week)
  let bestWeek = Number(dated[0].week)
  let bestDelta = Infinity
  for (const w of dated) {
    const delta = Math.abs(dateMs(w.date) - now)
    if (delta < bestDelta || (delta === bestDelta && Number(w.week) < bestWeek)) {
      bestDelta = delta
      bestWeek = Number(w.week)
    }
  }
  return bestWeek
}

/**
 * Flat leagues whose divisions carry a playDay (Two Wood: A–D Tuesday, E–G
 * Thursday) grouped into banner tabs per day — same logic as the public page.
 */
export function buildDayGroups(divisions) {
  if (!divisions || divisions.length === 0) return null
  if (divisions.some((d) => !d.playDay)) return null
  const byDay = new Map()
  for (const d of divisions) {
    if (!byDay.has(d.playDay)) byDay.set(d.playDay, [])
    byDay.get(d.playDay).push({ id: d.id, label: d.label })
  }
  if (byDay.size < 2) return null
  const order = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  return [...byDay.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([day, divs]) => ({
      id: day,
      label: day.charAt(0).toUpperCase() + day.slice(1),
      divisions: divs,
    }))
}

/**
 * Editable form row for a fixture match that already has saved results merged
 * in (players / rink shots / sheet date preserved so a re-save keeps them).
 * Matches the shape `serializeAdminMatchRows` expects.
 */
export function matchToFormRow(match) {
  return {
    home: match.home,
    away: match.away,
    homeShots: Number.isFinite(match.homeShots) ? String(match.homeShots) : '',
    awayShots: Number.isFinite(match.awayShots) ? String(match.awayShots) : '',
    homePoints: Number.isFinite(match.homePoints) ? String(match.homePoints) : '',
    awayPoints: Number.isFinite(match.awayPoints) ? String(match.awayPoints) : '',
    homePlayersText: Array.isArray(match.players?.home) ? match.players.home.join('; ') : '',
    awayPlayersText: Array.isArray(match.players?.away) ? match.players.away.join('; ') : '',
    matchDate: match.sheetMatchDate ?? '',
    rinkShotsJson:
      Array.isArray(match.rinkShots) && match.rinkShots.length
        ? JSON.stringify(match.rinkShots)
        : '',
    players: null,
  }
}

/** "20 Jul" — short date for week pills. */
export function shortDayMonth(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** 1 → "1st", 2 → "2nd", 11 → "11th", 21 → "21st", 23 → "23rd" … */
function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

/** "11th May" — ordinal day + full month, for the week picker / navigator. */
export function ordinalDayMonth(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const month = d.toLocaleDateString('en-GB', { month: 'long' })
  return `${ordinal(d.getDate())} ${month}`
}
