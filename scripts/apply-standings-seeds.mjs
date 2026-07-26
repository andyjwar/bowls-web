// One-shot: transcribe official divisional tables (screenshots, Jul 2026) into
// `standingsSeed` blocks on divisions. Validates every division against the
// printed totals row (Pld/F/A/Pts checksums) before writing anything.
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
  'two-wood-2026': {
    throughWeek: 12,
    note: 'Official 2-Wood tables, Week 12 (updated 23 July 2026)',
    divisions: {
      a: {
        rows: [
          ['Marlborough Greens', 11, 778, 453, 55.5],
          ['Norbridge A', 12, 701, 618, 47.5],
          ['Felixstowe & Suffolk', 10, 569, 526, 41.5],
          ['Stone Lodge A', 10, 563, 522, 33],
          ['Kirton & Falkenham A', 12, 615, 733, 29],
          ['Bramford A', 11, 532, 657, 21.5],
          ['Thorndon', 11, 583, 671, 19.5],
          ['California A', 11, 532, 693, 16.5],
        ],
        totals: [88, 4873, 4873, 264],
      },
      b: {
        rows: [
          ['IBC Graham Road A', 10, 679, 418, 55],
          ['Ipswich & District A', 11, 602, 579, 42],
          ['Combs Ford', 10, 602, 494, 41.5],
          ['Capel Kites', 12, 602, 638, 32],
          ['Kesgrave Blues', 11, 550, 577, 27.5],
          ['Westerfield Blues', 11, 604, 634, 27],
          ['Norbridge B', 12, 588, 731, 23],
          ['Margaret Catchpole A', 9, 427, 583, 10],
        ],
        totals: [86, 4654, 4654, 258],
      },
      c: {
        rows: [
          ['Holbrook A', 10, 645, 496, 45.5],
          ['Sproughton A', 11, 665, 529, 39.5],
          ['East-of-England Co-op Reds', 10, 574, 536, 36.5],
          ['East Bergholt Herons', 10, 535, 560, 34],
          ['Gipping EE Black Birds', 10, 518, 592, 24.5],
          ['Bramford B', 11, 555, 670, 19.5],
          ['California B', 10, 501, 610, 16.5],
        ],
        totals: [72, 3993, 3993, 216],
      },
      d: {
        rows: [
          ['Hadleigh Shearers', 8, 488, 387, 37],
          ['IBC Graham Road B', 9, 503, 469, 35],
          ['Bealings Blues', 9, 503, 477, 23],
          ['Sproughton B', 8, 416, 490, 22],
          ['Kesgrave Greens', 9, 495, 503, 21],
          ['Roundwood', 9, 443, 522, 18],
        ],
        totals: [52, 2848, 2848, 156],
      },
      e: {
        rows: [
          ['Holywells', 8, 457, 419, 35.5],
          ['Bramford Greens', 7, 369, 389, 23.5],
          ['Hospitals at Ribbans Park', 7, 418, 359, 23],
          ['Copdock & Washbrook', 5, 285, 255, 20.5],
          ['Capel Kingfishers', 6, 304, 339, 11.5],
          ["East of Eng'd Coop Blues", 7, 342, 414, 6],
        ],
        totals: [40, 2175, 2175, 120],
      },
      f: {
        rows: [
          ['Kirton & Falkenham B', 9, 586, 464, 42],
          ['Holbrook B', 7, 387, 341, 32],
          ['Gipping EE Foxes', 8, 484, 459, 27.5],
          ['Capel Kestrels', 8, 471, 456, 22.5],
          ['Westerfield Swans', 8, 408, 458, 14.5],
          ['Ipswich & District B', 8, 357, 515, 5.5],
        ],
        totals: [48, 2693, 2693, 144],
      },
      g: {
        rows: [
          ['Westerfield Whites', 7, 482, 320, 34.5],
          ['Sproughton C', 9, 525, 465, 30],
          ['Newton Road Whites', 7, 430, 378, 28],
          ['Hadleigh Carders', 7, 386, 397, 21],
          ['St Johns URC', 7, 356, 414, 18],
          ['Margaret Catchpole B', 9, 407, 612, 6.5],
        ],
        totals: [46, 2586, 2586, 138],
      },
    },
  },
  'samford-2026': {
    sections: {
      'monday-evening': {
        throughWeek: 11,
        note: 'Official Samford Monday tables, Week 11 (updated 24 July 2026)',
        divisions: {
          a: {
            rows: [
              ['Marlborough', 10, 603, 553, 42.5],
              ['Stone Lodge Blues', 9, 605, 430, 39.5],
              ['Waldringfield Swans', 10, 530, 572, 29.5],
              ['Kirton A', 9, 520, 490, 29],
              ['Westerfield Yellows', 9, 483, 501, 24.5],
              ['Hollbrook', 9, 472, 509, 23],
              ['E-of-E Co-op Reds', 10, 484, 642, 10],
            ],
            totals: [66, 3697, 3697, 198],
          },
          b: {
            rows: [
              ['Kesgrave Blues', 11, 684, 506, 51],
              ['Capel Kites', 10, 581, 479, 41],
              ['Bentley', 11, 623, 559, 39.5],
              ['California', 11, 576, 621, 33],
              ['Sproughton Reds', 11, 582, 572, 28.5],
              ['Westerfield Blues', 10, 529, 557, 26.5],
              ['Bealings', 11, 528, 681, 20],
              ['Stone Lodge Reds', 11, 536, 664, 18.5],
            ],
            totals: [86, 4639, 4639, 258],
          },
          c: {
            rows: [
              ['Waldringfield Ducks', 10, 619, 481, 40.5],
              ['Gipping EE Wolves', 9, 517, 479, 35.5],
              ['Kesgrave Greens', 9, 486, 505, 27.5],
              ['Bredfield', 8, 456, 402, 27],
              ['Margaret Catchpole Blues', 9, 510, 523, 23.5],
              ['Shotley Rose', 8, 428, 432, 23],
              ['Brantham', 9, 438, 632, 9],
            ],
            totals: [62, 3454, 3454, 186],
          },
          d: {
            rows: [
              ['East Bergholt', 11, 731, 477, 56],
              ['Margaret Catchpole Reds', 11, 580, 602, 40],
              ['Newton Road', 11, 609, 569, 37.5],
              ['Sproughton Blues', 11, 580, 607, 31.5],
              ['Copdock & Washbrook', 11, 620, 604, 29],
              ['Gipping EE Wrens', 11, 583, 624, 28.5],
              ['Martlesham', 11, 584, 637, 25],
              ['Roundwood', 11, 519, 686, 16.5],
            ],
            totals: [88, 4806, 4806, 264],
          },
          e: {
            rows: [
              ['Felixstowe BC', 11, 891, 444, 53],
              ['Norbridge', 11, 646, 531, 47.5],
              ['Kirton B', 11, 600, 566, 39],
              ['Hospitals Ribbans Park', 11, 573, 621, 36],
              ['Capel Kestrels', 11, 552, 647, 26],
              ['Ipswich & District', 10, 537, 561, 24.5],
              ['E-of-E Co-op Blues', 10, 494, 606, 22],
              ["St John's URC", 11, 463, 780, 8],
            ],
            totals: [86, 4756, 4756, 256],
          },
        },
      },
      'wednesday-afternoon': {
        throughWeek: 11,
        note: 'Official Samford Wednesday tables, Week 11 (updated 24 July 2026)',
        divisions: {
          1: {
            rows: [
              ['Melton Purples', 8, 334, 201, 34],
              ['Westerfield', 10, 338, 342, 30.5],
              ['Woodbridge', 10, 381, 315, 30],
              ['Kirton & Falkenham', 9, 344, 287, 28],
              ['Holbrook', 10, 314, 441, 21],
              ['Stone Lodge', 10, 312, 339, 18.5],
              ['Felixstowe BC', 8, 286, 304, 15],
              ['Kesgrave', 9, 284, 364, 14],
            ],
            totals: [74, 2593, 2593, 191],
          },
        },
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
