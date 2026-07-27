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

      if (stored.postponed) {
        return {
          ...match,
          postponed: true,
          played: false,
          sheetMatchDate: stored.matchDate ?? undefined,
        }
      }

      const flipped = stored.home === match.away && stored.away === match.home
      const homeShots = flipped ? stored.awayShots : stored.homeShots
      const awayShots = flipped ? stored.homeShots : stored.awayShots
      const homePoints = flipped ? stored.awayPoints : stored.homePoints
      const awayPoints = flipped ? stored.homePoints : stored.awayPoints

      /** @type {{ home?: string[], away?: string[] } | undefined} */
      let players
      if (stored.players && typeof stored.players === 'object') {
        players = flipped
          ? {
              home: stored.players.away ?? [],
              away: stored.players.home ?? [],
            }
          : {
              home: stored.players.home ?? [],
              away: stored.players.away ?? [],
            }
        const hasNames =
          (players.home?.length ?? 0) + (players.away?.length ?? 0) > 0
        if (!hasNames) players = undefined
      }

      if (!Number.isFinite(homeShots) || !Number.isFinite(awayShots)) return match

      const hasFormPoints =
        Number.isFinite(homePoints) && Number.isFinite(awayPoints)

      return {
        ...match,
        homeShots,
        awayShots,
        homePoints: hasFormPoints ? homePoints : undefined,
        awayPoints: hasFormPoints ? awayPoints : undefined,
        players,
        rinkShots: stored.rinkShots ?? undefined,
        sheetMatchDate: stored.matchDate ?? undefined,
        postponed: false,
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
 * Normalize a division `standingsSeed` (aggregate baseline from official tables).
 * Accepts either a plain array of rows or `{ throughWeek, rows }`.
 * Rows: `{ team, played, shotsFor, shotsAgainst, points }` (won/drawn/lost optional).
 * `throughWeek` marks the week the snapshot covers: stored per-match results with a
 * week key <= throughWeek are already inside the seed totals and are not re-counted.
 */
function normalizeStandingsSeed(standingsSeed) {
  if (!standingsSeed) return null
  const rowsArr = Array.isArray(standingsSeed) ? standingsSeed : standingsSeed.rows
  if (!Array.isArray(rowsArr) || rowsArr.length === 0) return null
  const throughWeekRaw = Array.isArray(standingsSeed)
    ? null
    : standingsSeed.throughWeek
  const throughWeek = Number.isFinite(Number(throughWeekRaw))
    ? Number(throughWeekRaw)
    : null
  const rows = {}
  for (const r of rowsArr) {
    if (r && typeof r.team === 'string') rows[r.team] = r
  }
  return { throughWeek, rows }
}

function seedNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Compute standings from all week results (form points when present; else shots).
 * @param {Set<string> | string[] | null | undefined} scheduledWeekKeys — when set and non-empty, only count results whose week key appears on the division fixture list (excludes orphan buckets like "0").
 * @param {object[] | { throughWeek?: number, rows: object[] } | null} standingsSeed — optional aggregate baseline (see normalizeStandingsSeed); per-match results are added on top.
 */
export function computeStandingsFromResults(
  teams,
  resultsByWeek,
  scheduledWeekKeys = null,
  standingsSeed = null,
) {
  const byWeek = normalizeResultsMap(resultsByWeek) ?? {}
  const seed = normalizeStandingsSeed(standingsSeed)
  const allowSet =
    scheduledWeekKeys instanceof Set
      ? scheduledWeekKeys
      : Array.isArray(scheduledWeekKeys)
        ? new Set(scheduledWeekKeys.map(String))
        : null
  const stats = {}

  for (const name of (teams ?? []).filter((t) => t !== 'Bye')) {
    const base = seed?.rows[name] ?? null
    stats[name] = {
      team: name,
      played: seedNum(base?.played),
      won: seedNum(base?.won),
      drawn: seedNum(base?.drawn),
      lost: seedNum(base?.lost),
      shotsFor: seedNum(base?.shotsFor),
      shotsAgainst: seedNum(base?.shotsAgainst),
      shotDiff: 0,
      points: seedNum(base?.points),
    }
  }

  for (const [weekKey, weekMatches] of Object.entries(byWeek)) {
    if (allowSet && allowSet.size > 0 && !allowSet.has(String(weekKey))) continue
    // Weeks covered by the seed snapshot are already counted in its totals.
    if (seed?.throughWeek != null && Number(weekKey) <= seed.throughWeek) continue
    for (const m of weekMatches ?? []) {
      if (!m || m.isBye || m.postponed) continue
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
  if (match?.postponed) return 'P-P'
  if (!match?.played) return null
  if (Number.isFinite(match.homePoints) && Number.isFinite(match.awayPoints)) {
    return `${match.homePoints}–${match.awayPoints} (${match.homeShots}–${match.awayShots})`
  }
  return `${match.homeShots}–${match.awayShots}`
}

/** Headline score for a played match: form points (5–1) when present, else shots. */
export function formatResultHeadlineScore(match) {
  if (match?.postponed) return 'P-P'
  if (!match?.played) return null
  if (Number.isFinite(match.homePoints) && Number.isFinite(match.awayPoints)) {
    return `${match.homePoints}–${match.awayPoints}`
  }
  if (Number.isFinite(match.homeShots) && Number.isFinite(match.awayShots)) {
    return `${match.homeShots}–${match.awayShots}`
  }
  return null
}

/** Total shots wrapped for detail lines e.g. (59–46). */
export function formatResultShotsTotal(match) {
  if (
    !match?.played ||
    !Number.isFinite(match.homeShots) ||
    !Number.isFinite(match.awayShots)
  )
    return null
  return `(${match.homeShots}–${match.awayShots})`
}
