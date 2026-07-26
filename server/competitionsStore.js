import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getActiveSeason } from './siteConfigStore.js'
import { slugifyLeagueKey } from './leagueStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../public/data')

function competitionsPath(season = getActiveSeason()) {
  return join(DATA_DIR, `competitions-${season}.json`)
}

/** Cups file for the active season (empty when the season has no draws yet). */
export function loadCompetitions(season = getActiveSeason()) {
  const path = competitionsPath(season)
  if (!existsSync(path)) return { competitions: [] }
  return JSON.parse(readFileSync(path, 'utf8'))
}

/**
 * Cups file for a new season: same competitions (names/days), but no rounds —
 * each season's draw is entered fresh. Never overwrites an existing file.
 */
export function createSeasonCompetitionsFile(fromSeason, year) {
  const target = competitionsPath(year)
  if (existsSync(target)) return { created: false }
  const donor = loadCompetitions(fromSeason)
  const competitions = (donor.competitions ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    ...(c.days ? { days: c.days } : {}),
    rounds: [],
  }))
  writeFileSync(target, `${JSON.stringify({ competitions }, null, 2)}\n`, 'utf8')
  return { created: true, competitions: competitions.length }
}

function writeCompetitions(doc, season = getActiveSeason()) {
  writeFileSync(competitionsPath(season), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
}

/**
 * Add a knockout cup to the active season (empty draw — set up via the draw
 * builder). Returns the new competition.
 */
export function createCompetition({ name, days }) {
  const nm = String(name ?? '').trim()
  if (!nm) throw new Error('Give the competition a name')
  const id = slugifyLeagueKey(nm)
  if (!id) throw new Error('The name needs some letters or numbers')

  const doc = loadCompetitions()
  if (!Array.isArray(doc.competitions)) doc.competitions = []
  if (doc.competitions.some((c) => c.id === id)) {
    throw new Error('A competition with that name already exists this season')
  }

  const daysText = String(days ?? '').trim()
  const comp = { id, name: nm, ...(daysText ? { days: daysText } : {}), rounds: [] }
  doc.competitions.push(comp)
  writeCompetitions(doc)
  return comp
}

/** True once any tie has a saved result (score or walkover). */
export function competitionHasResults(comp) {
  for (const round of comp?.rounds ?? []) {
    for (const m of round.matches ?? []) {
      if (m.walkover === 'home' || m.walkover === 'away') return true
      if (Number.isFinite(Number(m.homeScore)) && Number.isFinite(Number(m.awayScore))) return true
    }
  }
  return false
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function normalizeDrawSide(side) {
  const name = typeof side?.name === 'string' && side.name.trim() ? side.name.trim() : null
  if (name) return { name }
  const label = typeof side?.label === 'string' && side.label.trim() ? side.label.trim() : null
  if (label) return { label }
  return {}
}

/** Keep only the known draw fields; throw on structural nonsense. */
function normalizeDrawRounds(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) {
    throw new Error('The draw needs at least one round')
  }
  return rounds.map((round, i) => {
    const name = typeof round?.name === 'string' ? round.name.trim() : ''
    if (!name) throw new Error(`Round ${i + 1} needs a name`)
    const matches = round?.matches
    if (!Array.isArray(matches) || matches.length === 0) {
      throw new Error(`${name} has no ties`)
    }
    const date = typeof round?.date === 'string' && ISO_DATE.test(round.date) ? round.date : null
    const venue = typeof round?.venue === 'string' && round.venue.trim() ? round.venue.trim() : null
    return {
      name,
      ...(date ? { date } : {}),
      ...(venue ? { venue } : {}),
      matches: matches.map((m) => {
        const tie = m?.tie != null && String(m.tie).trim() ? String(m.tie).trim() : null
        const from =
          Array.isArray(m?.from) && m.from.length === 2
            ? m.from.map((f) => (f != null && String(f).trim() ? String(f).trim() : null))
            : null
        return {
          ...(tie ? { tie } : {}),
          ...(from && from.some((f) => f != null) ? { from } : {}),
          home: normalizeDrawSide(m?.home),
          away: normalizeDrawSide(m?.away),
        }
      }),
    }
  })
}

/** "Final Sat 12 Sept" — card sub-line derived from the final round's date. */
function finalSubLine(rounds) {
  const date = rounds[rounds.length - 1]?.date
  if (!date) return null
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return null
  return `Final ${d
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\bSep\b/, 'Sept')}`
}

/**
 * Replace a competition's whole round structure (the draw). Refused once any
 * result has been entered — clear results first, or use updateCompetitionRounds
 * for score edits.
 */
export function replaceCompetitionDraw(compId, rounds) {
  const doc = loadCompetitions()
  const comp = (doc.competitions ?? []).find((c) => c.id === compId)
  if (!comp) throw new Error('Unknown competition')
  if (competitionHasResults(comp)) {
    throw new Error('Results have already been entered — clear them before redoing the draw')
  }
  comp.rounds = normalizeDrawRounds(rounds)
  const sub = finalSubLine(comp.rounds)
  if (sub) comp.sub = sub
  else delete comp.sub
  writeCompetitions(doc)
  return comp
}

/** Remove a cup from the season file. Refused once results exist. */
export function deleteCompetition(compId) {
  const doc = loadCompetitions()
  const comp = (doc.competitions ?? []).find((c) => c.id === compId)
  if (!comp) throw new Error('Unknown competition')
  if (competitionHasResults(comp)) {
    throw new Error('This competition has results entered — it can only be removed by hand')
  }
  doc.competitions = doc.competitions.filter((c) => c.id !== compId)
  writeCompetitions(doc)
  return { removed: compId }
}

function sideName(side) {
  // Real club name only — placeholder `label`s ("Winner of Tie 1") never advance.
  const n = side?.name
  return typeof n === 'string' && n.trim() ? n.trim() : null
}

/** Winner name for a decided cup match (walkover or score), else null. */
export function matchWinnerName(m) {
  if (!m) return null
  if (m.walkover === 'home') return sideName(m.home)
  if (m.walkover === 'away') return sideName(m.away)
  const hs = Number(m.homeScore)
  const as = Number(m.awayScore)
  if (Number.isFinite(hs) && Number.isFinite(as) && hs !== as) {
    return hs > as ? sideName(m.home) : sideName(m.away)
  }
  return null
}

/**
 * Fill `from`-linked slots in later rounds with the winners of decided ties.
 * Slots whose source tie is undecided keep whatever name they already have
 * (or stay TBC) — nothing is cleared.
 */
export function advanceWinners(rounds) {
  for (let i = 1; i < rounds.length; i += 1) {
    const prev = rounds[i - 1]
    for (const m of rounds[i].matches ?? []) {
      if (!Array.isArray(m.from) || m.from.length !== 2) continue
      const [homeTie, awayTie] = m.from
      const homeSrc = (prev.matches ?? []).find((p) => String(p.tie) === String(homeTie))
      const awaySrc = (prev.matches ?? []).find((p) => String(p.tie) === String(awayTie))
      const homeWinner = matchWinnerName(homeSrc)
      const awayWinner = matchWinnerName(awaySrc)
      if (homeWinner) m.home = { name: homeWinner }
      if (awayWinner) m.away = { name: awayWinner }
    }
  }
  return rounds
}

/**
 * Replace one competition's rounds (scores / walkovers edited in admin),
 * advance winners into `from`-linked slots, and write the file.
 */
export function updateCompetitionRounds(compId, rounds) {
  if (!Array.isArray(rounds)) throw new Error('rounds must be an array')
  const doc = loadCompetitions()
  const comp = (doc.competitions ?? []).find((c) => c.id === compId)
  if (!comp) throw new Error('Unknown competition')
  if (rounds.length !== (comp.rounds ?? []).length) {
    throw new Error('Round count mismatch — refresh the page and try again')
  }
  comp.rounds = advanceWinners(rounds)
  const sub = finalSubLine(comp.rounds)
  if (sub) comp.sub = sub
  writeCompetitions(doc)
  return comp
}
