// Read-only check: for every division carrying a `standingsSeed`, compare the
// seed snapshot against the per-match results actually stored for the weeks it
// covers (week key <= throughWeek). A division where the two agree no longer
// needs the seed — the result cards alone produce the same table.
//
//   node scripts/audit-standings-seeds.mjs
import { readFileSync } from 'fs'

const DATA = new URL('../public/data/', import.meta.url)
const LEAGUES = ['samford-2026', 'two-wood-2026', 'triples-2026']

/** `[label, division]` for every division in a league document. */
function divisionsOf(doc) {
  if (doc.sections) {
    return doc.sections.flatMap((s) => s.divisions.map((d) => [`${s.id}/${d.id}`, d]))
  }
  return (doc.divisions ?? []).map((d) => [d.id, d])
}

/** Aggregate stored match results for weeks in `[1, throughWeek]`. */
function aggregateThroughWeek(division, throughWeek) {
  const weeks = division.results?.weeks ?? {}
  const stats = {}
  for (const team of division.teams.filter((t) => t !== 'Bye')) {
    stats[team] = { played: 0, points: 0, shotsFor: 0, shotsAgainst: 0 }
  }
  for (const [weekKey, matches] of Object.entries(weeks)) {
    if (Number(weekKey) > throughWeek) continue
    for (const m of matches ?? []) {
      if (!m || m.isBye || m.postponed) continue
      if (!Number.isFinite(m.homeShots) || !Number.isFinite(m.awayShots)) continue
      const home = stats[m.home]
      const away = stats[m.away]
      if (!home || !away) continue
      home.played += 1
      away.played += 1
      home.shotsFor += m.homeShots
      home.shotsAgainst += m.awayShots
      away.shotsFor += m.awayShots
      away.shotsAgainst += m.homeShots
      if (Number.isFinite(m.homePoints) && Number.isFinite(m.awayPoints)) {
        home.points += m.homePoints
        away.points += m.awayPoints
      } else if (m.homeShots > m.awayShots) {
        home.points += 2
      } else if (m.awayShots > m.homeShots) {
        away.points += 2
      } else {
        home.points += 1
        away.points += 1
      }
    }
  }
  return stats
}

const FIELDS = ['played', 'points', 'shotsFor', 'shotsAgainst']
let mismatches = 0

for (const leagueId of LEAGUES) {
  const doc = JSON.parse(readFileSync(new URL(`${leagueId}.json`, DATA), 'utf8'))
  for (const [label, division] of divisionsOf(doc)) {
    const seed = division.standingsSeed
    if (!seed?.rows?.length) {
      console.log(`${leagueId}/${label}: no seed — table already comes from results`)
      continue
    }
    const throughWeek = Number(seed.throughWeek)
    if (!Number.isFinite(throughWeek)) {
      console.log(`${leagueId}/${label}: seed has no throughWeek — cannot compare`)
      mismatches += 1
      continue
    }
    const fromResults = aggregateThroughWeek(division, throughWeek)
    const seeded = new Set(seed.rows.map((r) => r.team))
    const diffs = []
    for (const row of seed.rows) {
      const actual = fromResults[row.team]
      if (!actual) {
        diffs.push(`${row.team}: seeded but not in division teams`)
        continue
      }
      for (const field of FIELDS) {
        const want = Number(row[field] ?? 0)
        if (want !== actual[field]) {
          diffs.push(`${row.team} ${field}: seed ${want} vs results ${actual[field]}`)
        }
      }
    }
    for (const team of Object.keys(fromResults)) {
      if (!seeded.has(team)) diffs.push(`${team}: missing seed row`)
    }

    if (diffs.length === 0) {
      console.log(`${leagueId}/${label}: seed matches results through week ${throughWeek} — seed redundant`)
    } else {
      mismatches += 1
      console.log(`${leagueId}/${label}: ${diffs.length} difference(s) through week ${throughWeek}`)
      for (const d of diffs) console.log(`    ${d}`)
    }
  }
}

console.log(mismatches === 0 ? '\nAll seeds agree with stored results.' : `\n${mismatches} division(s) differ.`)
