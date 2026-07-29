// One-shot: transcribe official divisional tables (screenshots, Jul 2026) into
// `standingsSeed` blocks on divisions. Validates every division against the
// printed totals row (Pld/F/A/Pts checksums) before writing anything.
//
// A seed is only a stand-in for weeks whose result cards have not been entered
// yet: once a division has every week entered, its seed is deleted and the
// table is computed from the results alone. Samford (Monday and Wednesday) and
// Two Wood reached that point, so only Triples is seeded here — re-adding a
// retired seed would silently overwrite entered results with a stale snapshot.
// Run `scripts/audit-standings-seeds.mjs` to see where each division stands.
import { readFileSync, writeFileSync } from 'fs'

const DATA = new URL('../public/data/', import.meta.url)

// row = [canonical team name, played, shotsFor, shotsAgainst, points]
// totals = [Pld, F, A, Pts] as printed at the bottom of each division table.
const SEEDS = {
  'triples-2026': {
    throughWeek: 12,
    note: 'Official Triples tables, Week 12 (updated 26 July 2026)',
    divisions: {
      a: {
        rows: [
          ['Capel St Mary Kites', 11, 572, 494, 42],
          ['Stone Lodge', 9, 520, 363, 41.5],
          ['Westerfield Greens', 10, 507, 427, 39.5],
          ['Bealings', 10, 476, 548, 29],
          ['Kirton & Falkenham', 9, 443, 384, 28],
          ['E-of-E Co-op A', 10, 475, 539, 24],
          ['Waldringfield', 9, 410, 430, 23.5],
          ['Norbridge', 10, 376, 594, 6.5],
        ],
        totals: [78, 3779, 3779, 234],
      },
      b: {
        rows: [
          ['Bredfield', 8, 423, 337, 34.5],
          ['Kesgrave Blues', 8, 389, 293, 34.5],
          ['Bentley', 9, 454, 457, 27.5],
          ['California', 9, 421, 437, 24],
          ['Kesgrave Greens', 9, 435, 460, 23.5],
          ['Copdock & Washbrook', 9, 384, 414, 22.5],
          ['Bramford', 8, 336, 443, 13.5],
        ],
        totals: [60, 2842, 2841, 180],
      },
      c: {
        rows: [
          ['Newton Road A', 10, 536, 456, 35.5],
          ['IBC Graham Road', 8, 424, 330, 31.5],
          ['Holbrook', 10, 486, 453, 29.5],
          ['Sproughton', 8, 385, 401, 28.5],
          ['Westerfield Oranges', 8, 345, 406, 20.5],
          ['Ipswich & District', 7, 303, 351, 19],
          ['Roundwood', 9, 400, 482, 15.5],
        ],
        totals: [60, 2879, 2879, 180],
      },
      d: {
        rows: [
          ['Hadleigh', 8, 429, 365, 32],
          ['Woodbridge', 7, 387, 294, 27.5],
          ['Capel Kestrels', 10, 472, 524, 25.5],
          ['Hospitals Ribbans Park', 8, 407, 374, 25.5],
          ['Wickham Market', 8, 378, 407, 21],
          ['Shotley Rose', 7, 316, 381, 17.5],
        ],
        totals: [48, 2389, 2345, 149],
      },
      e: {
        rows: [
          ['Felixstowe BC', 10, 878, 379, 56.5],
          ['Melton', 8, 517, 335, 37.5],
          ['Hollesley', 9, 499, 422, 33],
          ['Needham Market', 10, 488, 541, 32.5],
          ['Martlesham', 10, 405, 604, 15.5],
          ['E-of-E Co-op B', 8, 310, 491, 13],
          ['Newton Road B', 8, 274, 599, 4],
        ],
        totals: [63, 3371, 3371, 192],
      },
    },
  },
}

let failures = 0

function checkAndBuild(label, spec, teams) {
  const { rows, totals } = spec
  const sum = [0, 0, 0, 0]
  for (const [, p, f, a, pts] of rows) {
    sum[0] += p
    sum[1] += f
    sum[2] += a
    sum[3] += pts
  }
  const names = ['Pld', 'F', 'A', 'Pts']
  for (let i = 0; i < 4; i += 1) {
    if (sum[i] !== totals[i]) {
      failures += 1
      console.error(
        `CHECKSUM FAIL ${label}: ${names[i]} sum ${sum[i]} != printed total ${totals[i]}`,
      )
    }
  }
  for (const [team] of rows) {
    if (!teams.includes(team)) {
      failures += 1
      console.error(`NAME FAIL ${label}: "${team}" not in division teams ${JSON.stringify(teams)}`)
    }
  }
  console.log(`${label}: ${rows.length} rows, sums [${sum.join(', ')}] vs printed [${totals.join(', ')}]`)
  return rows.map(([team, played, shotsFor, shotsAgainst, points]) => ({
    team,
    played,
    shotsFor,
    shotsAgainst,
    points,
  }))
}

function applyToDivision(label, division, spec, throughWeek, note) {
  const rows = checkAndBuild(label, spec, division.teams)
  division.standingsSeed = { throughWeek, note, rows }
}

for (const [leagueId, leagueSpec] of Object.entries(SEEDS)) {
  const path = new URL(`${leagueId}.json`, DATA)
  const doc = JSON.parse(readFileSync(path, 'utf8'))

  if (leagueSpec.sections) {
    for (const [sectionId, secSpec] of Object.entries(leagueSpec.sections)) {
      const section = doc.sections.find((s) => s.id === sectionId)
      if (!section) throw new Error(`Section ${sectionId} missing in ${leagueId}`)
      for (const [divId, spec] of Object.entries(secSpec.divisions)) {
        const division = section.divisions.find((d) => d.id === String(divId))
        if (!division) throw new Error(`Division ${divId} missing in ${leagueId}/${sectionId}`)
        applyToDivision(
          `${leagueId}/${sectionId}/${divId}`,
          division,
          spec,
          secSpec.throughWeek,
          secSpec.note,
        )
      }
    }
  } else {
    // Fixture-code 5 in 2-Wood Division F is "Capel Kestrels" on the official
    // sheet; the file had a duplicate "Capel Kingfishers" (already Div E's team).
    if (leagueId === 'two-wood-2026') {
      const f = doc.divisions.find((d) => d.id === 'f')
      if (f.teams[4] === 'Capel Kingfishers') f.teams[4] = 'Capel Kestrels'
    }
    for (const [divId, spec] of Object.entries(leagueSpec.divisions)) {
      const division = doc.divisions.find((d) => d.id === String(divId))
      if (!division) throw new Error(`Division ${divId} missing in ${leagueId}`)
      applyToDivision(
        `${leagueId}/${divId}`,
        division,
        spec,
        leagueSpec.throughWeek,
        leagueSpec.note,
      )
    }
  }

  if (failures === 0) {
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8')
    console.log(`WROTE ${leagueId}.json`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} validation failure(s) — nothing written for failing league.`)
  process.exit(1)
}
console.log('\nAll checksums passed.')
