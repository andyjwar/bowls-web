import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { loadLeague } from './leagueStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const ROSTER_PATH = join(__dirname, '../public/data/registered-players.json')

let rosterCache = null

export function loadRegisteredPlayers() {
  if (rosterCache) return rosterCache
  if (!existsSync(ROSTER_PATH)) return {}
  rosterCache = JSON.parse(readFileSync(ROSTER_PATH, 'utf8'))
  return rosterCache
}

export function saveRegisteredPlayers(data) {
  writeFileSync(ROSTER_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  rosterCache = data
}

export function clearRegisteredPlayersCache() {
  rosterCache = null
}

function normalizeTeamKey(teamName) {
  return String(teamName ?? '').trim()
}

/**
 * Merge many roster rows then save once.
 * Structure: roster[leagueId][sectionKey][teamName] = string[]
 *
 * sectionKey '_' is used for leagues with no nested sections section in the roster file.
 *
 * Returns { playersAdded, duplicatesSkipped }
 */
export function mergeRosterBatch(entries) {
  const roster = loadRegisteredPlayers()
  let playersAdded = 0
  let duplicatesSkipped = 0

  for (const { leagueId, sectionKey, teamName, playerName } of entries) {
    const team = normalizeTeamKey(teamName)
    const trimmed = String(playerName ?? '').trim()
    if (!trimmed || !team) continue

    if (!roster[leagueId]) roster[leagueId] = {}
    if (!roster[leagueId][sectionKey]) roster[leagueId][sectionKey] = {}
    const list = roster[leagueId][sectionKey][team] ?? []
    const dup = list.some((n) => n.toLowerCase() === trimmed.toLowerCase())
    if (dup) {
      duplicatesSkipped += 1
      continue
    }
    roster[leagueId][sectionKey][team] = [...list, trimmed]
    playersAdded += 1
  }

  saveRegisteredPlayers(roster)
  return { playersAdded, duplicatesSkipped }
}

/**
 * Replace the full registered-player list for one club (admin editor).
 *
 * sectionKey '_' is stored for leagues without sectional rosters or when using the fallback bucket.
 */
export function setTeamRegisteredPlayers(leagueId, sectionKey, teamName, playerNames) {
  const roster = loadRegisteredPlayers()
  const team = normalizeTeamKey(teamName)
  if (!team) throw new Error('teamName required')

  const sec = String(sectionKey ?? '').trim() || '_'

  const list = (Array.isArray(playerNames) ? playerNames : [])
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)

  if (!roster[leagueId]) roster[leagueId] = {}
  if (!roster[leagueId][sec]) roster[leagueId][sec] = {}
  roster[leagueId][sec][team] = list

  saveRegisteredPlayers(roster)
  return { ok: true, count: list.length }
}

/**
 * Ensure every club from division team lists + saved match rows exists under the correct
 * league + section/day key with an array (empty lists for new clubs). Does not remove or
 * overwrite existing player names.
 */
export function seedRosterClubsFromLeague(leagueId) {
  const id = String(leagueId ?? '').trim()
  if (!id) throw new Error('leagueId required')

  const league = loadLeague(id)
  const roster = loadRegisteredPlayers()
  let clubsAdded = 0

  function ensureTeam(secKey, teamRaw) {
    const team = normalizeTeamKey(teamRaw)
    if (!team || team === 'Bye') return

    if (!roster[id]) roster[id] = {}
    if (!roster[id][secKey]) roster[id][secKey] = {}

    if (roster[id][secKey][team] === undefined) {
      roster[id][secKey][team] = []
      clubsAdded += 1
    }
  }

  function harvestResults(division, secKey) {
    const weeks = division?.results?.weeks
    if (!weeks || typeof weeks !== 'object') return
    for (const arr of Object.values(weeks)) {
      if (!Array.isArray(arr)) continue
      for (const m of arr) {
        if (!m || typeof m !== 'object') continue
        if (m.home) ensureTeam(secKey, m.home)
        if (m.away) ensureTeam(secKey, m.away)
      }
    }
  }

  if (league.sections?.length) {
    for (const sec of league.sections) {
      const sk = String(sec.id ?? '').trim() || '_'
      for (const div of sec.divisions ?? []) {
        for (const name of div.teams ?? []) ensureTeam(sk, name)
        harvestResults(div, sk)
      }
    }
  } else {
    const sk = '_'
    for (const div of league.divisions ?? []) {
      for (const name of div.teams ?? []) ensureTeam(sk, name)
      harvestResults(div, sk)
    }
  }

  saveRegisteredPlayers(roster)
  return { ok: true, clubsAdded }
}
