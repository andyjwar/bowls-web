import { normalizeName, nameScore } from './parseSamfordForm.js'
import { loadRegisteredPlayers } from './rosterStore.js'

function rosterForTeam(leagueId, sectionId, teamName) {
  const roster = loadRegisteredPlayers()
  const league = roster[leagueId]
  if (!league) return []

  const sid = sectionId ? String(sectionId).trim() : ''

  if (sid) {
    const section = league[sid]
    if (!section) return []
    return section[teamName] ?? []
  }

  const flatBucket = league._
  if (flatBucket?.[teamName]?.length) {
    return flatBucket[teamName]
  }

  const sectionKeys = Object.keys(league).filter(
    (k) => league[k] && typeof league[k] === 'object' && !Array.isArray(league[k]),
  )
  if (sectionKeys.length === 1) {
    return league[sectionKeys[0]][teamName] ?? []
  }

  return []
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

/**
 * CSV/import path: checks each listed player against the registered sheet for that club.
 * Skips enforcement when no list exists for that side (avoid false positives).
 *
 * @returns {{ registrationNeedsReview: boolean, messages: string[] }}
 */
export function validateMatchPlayersForCsvImport({
  leagueId,
  sectionId,
  homeTeam,
  awayTeam,
  players,
}) {
  const messages = []
  const homeTeamName = String(homeTeam ?? '').trim()
  const awayTeamName = String(awayTeam ?? '').trim()
  const hList = players?.home ?? []
  const aList = players?.away ?? []

  const homeRoster = rosterForTeam(leagueId, sectionId, homeTeamName)
  const awayRoster = rosterForTeam(leagueId, sectionId, awayTeamName)
  const bothEmpty = homeRoster.length === 0 && awayRoster.length === 0

  if (bothEmpty && (hList.length > 0 || aList.length > 0)) {
    messages.push(
      `No registered-player lists configured for "${homeTeamName}" / "${awayTeamName}" in this league/section — add names under Registered teams (or CSV player rows).`,
    )
    return { registrationNeedsReview: false, messages }
  }

  if (hList.length > 0 && homeRoster.length === 0) {
    messages.push(
      `No registered list for home team "${homeTeamName}" — skipped registration check for home players.`,
    )
  }
  if (aList.length > 0 && awayRoster.length === 0) {
    messages.push(
      `No registered list for away team "${awayTeamName}" — skipped registration check for away players.`,
    )
  }

  const homeChecks = hList.map((name) =>
    homeRoster.length ? matchPlayerName(name, homeRoster) : { status: 'skipped', ocrName: name },
  )
  const awayChecks = aList.map((name) =>
    awayRoster.length ? matchPlayerName(name, awayRoster) : { status: 'skipped', ocrName: name },
  )

  let registrationNeedsReview = false

  for (const c of homeChecks) {
    if (c.status === 'unregistered') {
      registrationNeedsReview = true
      messages.push(
        `Home player "${c.ocrName}" is not on the registered sheet for "${homeTeamName}".`,
      )
    }
    if (c.status === 'possible') {
      registrationNeedsReview = true
      messages.push(
        `Home player "${c.ocrName}" may match "${c.matchedName}" — verify against the registered list.`,
      )
    }
  }
  for (const c of awayChecks) {
    if (c.status === 'unregistered') {
      registrationNeedsReview = true
      messages.push(
        `Away player "${c.ocrName}" is not on the registered sheet for "${awayTeamName}".`,
      )
    }
    if (c.status === 'possible') {
      registrationNeedsReview = true
      messages.push(
        `Away player "${c.ocrName}" may match "${c.matchedName}" — verify against the registered list.`,
      )
    }
  }

  return { registrationNeedsReview, messages }
}

export { normalizeName }
