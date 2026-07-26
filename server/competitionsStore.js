import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { getActiveSeason } from './siteConfigStore.js'

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
  writeFileSync(competitionsPath(), `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
  return comp
}
