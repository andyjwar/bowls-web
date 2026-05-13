const EMPTY_STATS = {
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  shotsFor: 0,
  shotsAgainst: 0,
  points: 0,
}

/**
 * Build standings rows from team list + optional per-team overrides.
 * @param {string[]} teams
 * @param {Record<string, object> | object[] | undefined} standingsData
 */
export function buildStandings(teams, standingsData) {
  const overrides = normalizeStandingsInput(standingsData)

  const rows = (teams ?? [])
    .filter((name) => name !== 'Bye')
    .map((name) => {
      const extra = overrides[name] ?? {}
      const played = num(extra.played)
      const won = num(extra.won)
      const drawn = num(extra.drawn)
      const lost = num(extra.lost)
      const shotsFor = num(extra.shotsFor)
      const shotsAgainst = num(extra.shotsAgainst)
      const points = num(extra.points)
      const shotDiff = shotsFor - shotsAgainst

      return {
        team: name,
        played,
        won,
        drawn,
        lost,
        shotsFor,
        shotsAgainst,
        shotDiff,
        points,
      }
    })

  return sortStandings(rows)
}

function normalizeStandingsInput(standingsData) {
  if (!standingsData) return {}
  if (Array.isArray(standingsData)) {
    return Object.fromEntries(
      standingsData.map((row) => [row.team, { ...EMPTY_STATS, ...row }]),
    )
  }
  return standingsData
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

export function sortStandings(rows) {
  return [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.shotDiff !== a.shotDiff) return b.shotDiff - a.shotDiff
    if (b.shotsFor !== a.shotsFor) return b.shotsFor - a.shotsFor
    return a.team.localeCompare(b.team)
  })
}

export function formatShotDiff(diff) {
  if (diff === 0) return '0'
  return diff > 0 ? `+${diff}` : String(diff)
}

export function displayStat(value, played) {
  if (played === 0 && value === 0) return '—'
  return String(value)
}
