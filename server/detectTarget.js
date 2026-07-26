import { activeSeasonLeagueIds, loadLeague } from './leagueStore.js'
import { getDivisionFixtures } from './leagueStore.js'

function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9&'\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameScore(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.88
  const ta = new Set(na.split(' ').filter((w) => w.length > 2))
  const tb = new Set(nb.split(' ').filter((w) => w.length > 2))
  let overlap = 0
  for (const w of ta) if (tb.has(w)) overlap += 1
  return overlap / Math.max(ta.size, tb.size, 1)
}

function textContainsTeam(text, team) {
  const normText = normalizeName(text)
  const normTeam = normalizeName(team)
  if (!normTeam || normTeam === 'bye') return false
  if (normText.includes(normTeam)) return true
  const tokens = normTeam.split(' ').filter((w) => w.length > 3)
  if (tokens.length === 0) return false
  const hits = tokens.filter((t) => normText.includes(t))
  return hits.length >= Math.min(2, tokens.length)
}

function teamsFoundInText(text, teams) {
  return (teams ?? []).filter((t) => t !== 'Bye' && textContainsTeam(text, t))
}

function parseWeekNumber(text) {
  const m = text.match(/\bweek\s*(\d{1,2})\b/i)
  return m ? Number(m[1]) : null
}

function parseDatesFromText(text) {
  const dates = []
  const patterns = [
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/gi,
    /\b(\d{4})-(\d{2})-(\d{2})\b/g,
  ]
  for (const m of text.matchAll(patterns[0])) {
    const months = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    }
    const month = months[m[2].slice(0, 3).toLowerCase()]
    if (month == null) continue
    dates.push(new Date(Number(m[3]), month, Number(m[1])))
  }
  for (const m of text.matchAll(patterns[1])) {
    dates.push(new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`))
  }
  return dates
}

function dateMatches(isoDate, candidates) {
  if (!isoDate || !candidates.length) return false
  const target = new Date(`${isoDate}T12:00:00`).setHours(0, 0, 0, 0)
  return candidates.some((d) => d.setHours(0, 0, 0, 0) === target)
}

function scoreWeek(text, fixtureWeek, parsedDates) {
  let pairingHits = 0
  let playable = 0
  for (const m of fixtureWeek.matches ?? []) {
    if (m.isBye) continue
    playable += 1
    if (textContainsTeam(text, m.home) && textContainsTeam(text, m.away)) {
      pairingHits += 1
    }
  }
  const pairingScore = playable ? pairingHits / playable : 0
  const dateScore = dateMatches(fixtureWeek.date, parsedDates) ? 1 : 0
  const explicitWeek = parseWeekNumber(text)
  const weekNumScore = explicitWeek === fixtureWeek.week ? 1 : 0
  return pairingScore * 0.7 + dateScore * 0.2 + weekNumScore * 0.1
}

function iterDivisionTargets() {
  const targets = []
  for (const leagueId of activeSeasonLeagueIds()) {
    const league = loadLeague(leagueId)
    if (league.sections) {
      for (const section of league.sections) {
        for (const division of section.divisions) {
          targets.push({
            leagueId,
            leagueName: league.name,
            sectionId: section.id,
            sectionLabel: section.label,
            divisionId: division.id,
            divisionLabel: division.label,
            teams: division.teams,
            fixtures: getDivisionFixtures(league, {
              sectionId: section.id,
              divisionId: division.id,
            }),
          })
        }
      }
    } else {
      for (const division of league.divisions ?? []) {
        targets.push({
          leagueId,
          leagueName: league.name,
          sectionId: null,
          sectionLabel: null,
          divisionId: division.id,
          divisionLabel: division.label,
          teams: division.teams,
          fixtures: getDivisionFixtures(league, {
            sectionId: null,
            divisionId: division.id,
          }),
        })
      }
    }
  }
  return targets
}

/**
 * Guess league, section, division and week from OCR text.
 */
export function identifyTargetFromText(rawText) {
  const text = String(rawText ?? '')
  if (!text.trim()) return null

  const parsedDates = parseDatesFromText(text)
  const targets = iterDivisionTargets()
  let best = null

  for (const target of targets) {
    const matchedTeams = teamsFoundInText(text, target.teams)
    const teamRatio = matchedTeams.length / Math.max(
      target.teams.filter((t) => t !== 'Bye').length,
      1,
    )

    if (matchedTeams.length < 2) continue

    let bestWeek = null
    let bestWeekScore = 0
    for (const fixtureWeek of target.fixtures) {
      const ws = scoreWeek(text, fixtureWeek, parsedDates)
      if (ws > bestWeekScore) {
        bestWeekScore = ws
        bestWeek = fixtureWeek
      }
    }

    const overall = teamRatio * 0.45 + bestWeekScore * 0.55
    if (!best || overall > best.confidence) {
      best = {
        ...target,
        week: bestWeek?.week ?? 1,
        weekDate: bestWeek?.date ?? null,
        confidence: overall,
        matchedTeams,
        weekScore: bestWeekScore,
      }
    }
  }

  if (!best || best.confidence < 0.25) return null

  return {
    leagueId: best.leagueId,
    leagueName: best.leagueName,
    sectionId: best.sectionId,
    sectionLabel: best.sectionLabel,
    divisionId: best.divisionId,
    divisionLabel: best.divisionLabel,
    week: best.week,
    weekDate: best.weekDate,
    confidence: Math.round(best.confidence * 100),
    matchedTeams: best.matchedTeams,
  }
}

export { normalizeName, nameScore, textContainsTeam }
