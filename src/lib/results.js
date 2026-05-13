/**
 * Match result + standings helpers (shared client/server logic).
 */

export function normalizeResultsMap(results) {
  if (!results) return {}
  if (results.weeks) return results.weeks
  return results
}

/**
 * Merge stored week results onto resolved fixture weeks.
 */
export function applyResultsToFixtures(fixtureWeeks, resultsByWeek) {
  const byWeek = normalizeResultsMap(resultsByWeek) ?? {}

  return fixtureWeeks.map((week) => ({
    ...week,
    matches: week.matches.map((match) => {
      if (match.isBye) return match

      const weekResults = byWeek[String(week.week)] ?? []
      const stored =
        weekResults.find(
          (r) =>
            r &&
            ((r.home === match.home && r.away === match.away) ||
              (r.home === match.away && r.away === match.home)),
        ) ?? null

      if (!stored) return match

      const flipped = stored.home === match.away && stored.away === match.home
      const homeShots = flipped ? stored.awayShots : stored.homeShots
      const awayShots = flipped ? stored.homeShots : stored.awayShots
      const homePoints = flipped ? stored.awayPoints : stored.homePoints
      const awayPoints = flipped ? stored.homePoints : stored.awayPoints

      if (!Number.isFinite(homeShots) || !Number.isFinite(awayShots)) return match

      const hasFormPoints =
        Number.isFinite(homePoints) && Number.isFinite(awayPoints)

      return {
        ...match,
        homeShots,
        awayShots,
        homePoints: hasFormPoints ? homePoints : undefined,
        awayPoints: hasFormPoints ? awayPoints : undefined,
        played: true,
        homeWon: hasFormPoints ? homePoints > awayPoints : homeShots > awayShots,
        awayWon: hasFormPoints ? awayPoints > homePoints : awayShots > homeShots,
        drawn: hasFormPoints
          ? homePoints === awayPoints
          : homeShots === awayShots,
      }
    }),
  }))
}

/**
 * Compute standings from all week results.
 * Uses form result points (homePoints/awayPoints) when present; otherwise 2/1/0 from shots.
 */
export function computeStandingsFromResults(teams, resultsByWeek) {
  const byWeek = normalizeResultsMap(resultsByWeek) ?? {}
  const stats = {}

  for (const name of (teams ?? []).filter((t) => t !== 'Bye')) {
    stats[name] = {
      team: name,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      shotsFor: 0,
      shotsAgainst: 0,
      shotDiff: 0,
      points: 0,
    }
  }

  for (const weekMatches of Object.values(byWeek)) {
    for (const m of weekMatches ?? []) {
      if (!m || m.isBye) continue
      const { home, away, homeShots, awayShots, homePoints, awayPoints } = m
      if (!stats[home] || !stats[away]) continue
      if (!Number.isFinite(homeShots) || !Number.isFinite(awayShots)) continue

      stats[home].played += 1
      stats[away].played += 1
      stats[home].shotsFor += homeShots
      stats[home].shotsAgainst += awayShots
      stats[away].shotsFor += awayShots
      stats[away].shotsAgainst += homeShots

      const hasFormPoints =
        Number.isFinite(homePoints) && Number.isFinite(awayPoints)

      if (hasFormPoints) {
        stats[home].points += homePoints
        stats[away].points += awayPoints
        if (homePoints > awayPoints) {
          stats[home].won += 1
          stats[away].lost += 1
        } else if (awayPoints > homePoints) {
          stats[away].won += 1
          stats[home].lost += 1
        } else {
          stats[home].drawn += 1
          stats[away].drawn += 1
        }
      } else if (homeShots > awayShots) {
        stats[home].won += 1
        stats[home].points += 2
        stats[away].lost += 1
      } else if (awayShots > homeShots) {
        stats[away].won += 1
        stats[away].points += 2
        stats[home].lost += 1
      } else {
        stats[home].drawn += 1
        stats[away].drawn += 1
        stats[home].points += 1
        stats[away].points += 1
      }
    }
  }

  const rows = Object.values(stats).map((row) => ({
    ...row,
    shotDiff: row.shotsFor - row.shotsAgainst,
  }))

  return rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.shotDiff !== a.shotDiff) return b.shotDiff - a.shotDiff
    if (b.shotsFor !== a.shotsFor) return b.shotsFor - a.shotsFor
    return a.team.localeCompare(b.team)
  })
}

export function formatMatchScore(match) {
  if (!match?.played) return null
  if (Number.isFinite(match.homePoints) && Number.isFinite(match.awayPoints)) {
    return `${match.homePoints}–${match.awayPoints} (${match.homeShots}–${match.awayShots})`
  }
  return `${match.homeShots}–${match.awayShots}`
}
