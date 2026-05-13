import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { buildDivisionFixtures } from '../src/lib/fixtures.js'
import { applyResultsToFixtures, computeStandingsFromResults } from '../src/lib/results.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../public/data')

const LEAGUE_FILES = {
  'samford-2026': 'samford-2026.json',
  'two-wood-2026': 'two-wood-2026.json',
  'triples-2026': 'triples-2026.json',
}

export function listLeagues() {
  return Object.entries(LEAGUE_FILES).map(([id]) => {
    const data = loadLeague(id)
    const sections = data.sections?.map((s) => ({
      id: s.id,
      label: s.label,
      divisions: s.divisions.map((d) => ({ id: d.id, label: d.label })),
    }))
    const divisions = data.divisions?.map((d) => ({ id: d.id, label: d.label }))
    return { id, name: data.name, sections, divisions }
  })
}

export function loadLeague(leagueId) {
  const file = LEAGUE_FILES[leagueId]
  if (!file) throw new Error('Unknown league')
  const path = join(DATA_DIR, file)
  if (!existsSync(path)) throw new Error('League file missing')
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function saveLeague(leagueId, data) {
  const file = LEAGUE_FILES[leagueId]
  if (!file) throw new Error('Unknown league')
  const path = join(DATA_DIR, file)
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

export function getDivision(league, { sectionId, divisionId }) {
  if (league.sections) {
    const section = league.sections.find((s) => s.id === sectionId)
    const division = section?.divisions.find((d) => d.id === divisionId)
    return { section, division }
  }
  const division = league.divisions?.find((d) => d.id === divisionId)
  return { section: null, division }
}

export function getDivisionFixtures(league, { sectionId, divisionId }) {
  const { section, division } = getDivision(league, { sectionId, divisionId })
  if (!division) return []

  if (section) {
    return buildDivisionFixtures(section.scheduleTemplate, division.teams)
  }

  const getDate = (row) => {
    if (division.playDay === 'thursday') return row.thursdayDate
    if (division.playDay === 'tuesday') return row.tuesdayDate
    return row.date
  }

  return buildDivisionFixtures(league.scheduleTemplate, division.teams, getDate)
}

export function mergeWeekResults(league, { sectionId, divisionId, week, matches }) {
  const { division } = getDivision(league, { sectionId, divisionId })
  if (!division) throw new Error('Division not found')

  if (!division.results) division.results = { weeks: {} }
  if (!division.results.weeks) division.results.weeks = {}

  const weekKey = String(week)
  const existing = division.results.weeks[weekKey] ?? []
  const merged = [...existing]

  for (const incoming of matches) {
    if (!incoming?.home || !incoming?.away) continue
    const homeShots = Number(incoming.homeShots)
    const awayShots = Number(incoming.awayShots)
    if (!Number.isFinite(homeShots) || !Number.isFinite(awayShots)) continue

    const homePoints = Number(incoming.homePoints)
    const awayPoints = Number(incoming.awayPoints)

    const idx = merged.findIndex(
      (r) =>
        r &&
        ((r.home === incoming.home && r.away === incoming.away) ||
          (r.home === incoming.away && r.away === incoming.home)),
    )
    const row = {
      home: incoming.home,
      away: incoming.away,
      homeShots,
      awayShots,
    }
    if (Number.isFinite(homePoints) && Number.isFinite(awayPoints)) {
      row.homePoints = homePoints
      row.awayPoints = awayPoints
    }
    if (incoming.players) row.players = incoming.players
    if (idx >= 0) merged[idx] = row
    else merged.push(row)
  }

  division.results.weeks[weekKey] = merged

  const fixtures = applyResultsToFixtures(
    getDivisionFixtures(league, { sectionId, divisionId }),
    division.results.weeks,
  )
  const standings = computeStandingsFromResults(division.teams, division.results.weeks)

  return { league, fixtures, standings, savedWeek: weekKey, matchCount: merged.length }
}
