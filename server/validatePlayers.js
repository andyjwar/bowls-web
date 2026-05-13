import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { normalizeName, nameScore } from './parseSamfordForm.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROSTER_PATH = join(__dirname, '../public/data/registered-players.json')

let rosterCache = null

export function loadRegisteredPlayers() {
  if (rosterCache) return rosterCache
  if (!existsSync(ROSTER_PATH)) return {}
  rosterCache = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'))
  return rosterCache
}

function rosterForTeam(leagueId, sectionId, teamName) {
  const roster = loadRegisteredPlayers()
  const league = roster[leagueId]
  if (!league) return []
  const section = sectionId ? league[sectionId] : league
  if (!section) return []
  return section[teamName] ?? []
}

function matchPlayerName(ocrName, rosterNames) {
  const cleaned = String(ocrName ?? '').trim()
  if (!cleaned) return { status: 'empty', ocrName: cleaned }

  let best = null
  let bestScore = 0
  for (const registered of rosterNames) {
    const score = nameScore(cleaned, registered)
    if (score > bestScore) {
      bestScore = score
      best = registered
    }
  }

  if (bestScore >= 0.72) {
    return { status: 'registered', ocrName: cleaned, matchedName: best, score: bestScore }
  }
  if (bestScore >= 0.45) {
    return {
      status: 'possible',
      ocrName: cleaned,
      matchedName: best,
      score: bestScore,
      warning: `Possible match to ${best} — please verify`,
    }
  }
  return {
    status: 'unregistered',
    ocrName: cleaned,
    warning: 'Not found on registered player list',
  }
}

export function validateFormPlayers({ leagueId, sectionId, homeTeam, awayTeam, players }) {
  const homeRoster = rosterForTeam(leagueId, sectionId, homeTeam)
  const awayRoster = rosterForTeam(leagueId, sectionId, awayTeam)

  const homeChecks = (players?.home ?? []).map((name) =>
    matchPlayerName(name, homeRoster),
  )
  const awayChecks = (players?.away ?? []).map((name) =>
    matchPlayerName(name, awayRoster),
  )

  const unregistered = [...homeChecks, ...awayChecks].filter(
    (c) => c.status === 'unregistered',
  )
  const possible = [...homeChecks, ...awayChecks].filter((c) => c.status === 'possible')

  return {
    home: homeChecks,
    away: awayChecks,
    rosterEmpty: homeRoster.length === 0 && awayRoster.length === 0,
    summary:
      unregistered.length || possible.length
        ? `${unregistered.length} unregistered, ${possible.length} need verification`
        : homeChecks.length + awayChecks.length > 0
          ? 'All listed players matched the roster'
          : 'No player names extracted — check OCR or enter manually',
  }
}

export { normalizeName }
