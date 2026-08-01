/**
 * Build public/data/club-locations.json — one entry per club green with the
 * team names that play there (grouped by league) and map coordinates.
 *
 * Team names come from the 2026 league files. Coordinates come from
 * postcodes.io (postcode centroid), refined by a Nominatim search for the
 * club's green where it finds a bowls club nearby. Existing coordinates in
 * the output file are reused, so re-runs are cheap and offline-safe unless
 * `--regeocode` is passed.
 *
 *   node scripts/build-club-locations.mjs [--regeocode]
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'

const OUT = 'public/data/club-locations.json'

/** Club → postcode master list (league handbook). */
const CLUBS = [
  { name: 'Bealings', postcode: 'IP13 6LT' },
  { name: 'Bentley', postcode: 'IP9 2DD' },
  { name: 'Bramford', postcode: 'IP8 4HU' },
  { name: 'Brantham Athletic', postcode: 'CO11 1RZ' },
  { name: 'Bredfield', postcode: 'IP13 6AX' },
  { name: 'California', postcode: 'IP3 8LB' },
  { name: 'Capel St Mary', postcode: 'IP9 2JR' },
  { name: 'Combs Ford', postcode: 'IP14 2BL' },
  { name: 'Copdock & Washbrook', postcode: 'IP8 3JN' },
  { name: 'East Bergholt', postcode: 'CO7 6TP' },
  { name: 'East-of-England Co-op', postcode: 'IP4 5AZ' },
  { name: 'Felixstowe', postcode: 'IP11 7PB' },
  { name: 'Felixstowe & Suffolk', postcode: 'IP11 8DJ' },
  { name: 'Gipping Valley', postcode: 'IP6 0LB' },
  { name: 'Hadleigh', postcode: 'IP7 6DN' },
  { name: 'Holbrook', postcode: 'IP9 2PZ' },
  { name: 'Hollesley', postcode: null },
  { name: 'Holywells', postcode: 'IP3 0PG' },
  { name: 'Ipswich BC', postcode: 'IP1 3QE', aka: 'Graham Road' },
  { name: 'Ipswich & District', postcode: 'IP4 4JU' },
  { name: 'Ipswich Hospitals', postcode: 'IP3 8LS', aka: 'Ribbans Park' },
  { name: 'Kesgrave', postcode: 'IP5 2HJ', aka: 'also Rushmere' },
  { name: 'Kirton & Falkenham', postcode: 'IP10 0QW' },
  { name: 'Margaret Catchpole', postcode: 'IP3 0PQ' },
  { name: 'Marlborough', postcode: 'IP4 5AZ' },
  { name: 'Martlesham', postcode: 'IP12 4RG' },
  { name: 'Melton', postcode: 'IP12 1PE' },
  { name: 'Needham Market', postcode: 'IP6 8BX' },
  { name: 'Newton Road', postcode: 'IP3 8HQ' },
  { name: 'Norbridge', postcode: 'IP1 4HA' },
  { name: 'Roundwood', postcode: null },
  { name: 'Shotley Rose', postcode: 'IP9 1NL' },
  { name: 'Sproughton', postcode: 'IP8 3BB' },
  { name: "St John's URC", postcode: 'IP4 4RH' },
  { name: 'Stone Lodge', postcode: 'IP2 9BA', aka: 'also Delta' },
  { name: 'Thorndon', postcode: 'IP23 7JJ' },
  { name: 'Waldringfield', postcode: 'IP4 4JJ' },
  { name: 'Westerfield', postcode: 'IP6 9BE' },
  { name: 'Wickham Market', postcode: 'IP13 0HE' },
  { name: 'Woodbridge', postcode: 'IP12 1DB' },
]

const LEAGUES = [
  { key: 'samford', label: 'Samford', file: 'public/data/samford-2026.json' },
  { key: 'triples', label: 'Triples', file: 'public/data/triples-2026.json' },
  { key: 'two-wood', label: 'Two Wood', file: 'public/data/two-wood-2026.json' },
]

/** Map a team display name to its parent club (same normalisation the
 *  location audit used). */
function clubForTeam(teamName) {
  let s = String(teamName)
    .toLowerCase()
    .replace(/[.’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  s = s.replace(/\s+(a|b|c)$/, '')
  s = s.replace(
    /\s+(blues|reds|greens|yellows|oranges|whites|purples|swans|ducks|kites|kestrels|kingfishers|herons|carders|shearers|black birds|foxes|wolves|wrens)$/,
    '',
  )
  s = s.replace(/\s+at ribbans park$/, '').replace(/\s+ribbans park$/, '')
  const MAP = {
    bealings: 'Bealings',
    bentley: 'Bentley',
    bramford: 'Bramford',
    brantham: 'Brantham Athletic',
    bredfield: 'Bredfield',
    california: 'California',
    capel: 'Capel St Mary',
    'capel st mary': 'Capel St Mary',
    'combs ford': 'Combs Ford',
    'copdock & washbrook': 'Copdock & Washbrook',
    'e-of-e co-op': 'East-of-England Co-op',
    'east-of-england co-op': 'East-of-England Co-op',
    "east of eng'd coop": 'East-of-England Co-op',
    'east bergholt': 'East Bergholt',
    'felixstowe bc': 'Felixstowe',
    'felixstowe & suffolk': 'Felixstowe & Suffolk',
    'gipping ee': 'Gipping Valley',
    hadleigh: 'Hadleigh',
    holbrook: 'Holbrook',
    hollbrook: 'Holbrook',
    hollesley: 'Hollesley',
    holywells: 'Holywells',
    hospitals: 'Ipswich Hospitals',
    'ibc graham road': 'Ipswich BC',
    'ipswich & district': 'Ipswich & District',
    kesgrave: 'Kesgrave',
    kirton: 'Kirton & Falkenham',
    'kirton & falkenham': 'Kirton & Falkenham',
    'margaret catchpole': 'Margaret Catchpole',
    marlborough: 'Marlborough',
    martlesham: 'Martlesham',
    melton: 'Melton',
    'needham market': 'Needham Market',
    'newton road': 'Newton Road',
    norbridge: 'Norbridge',
    roundwood: 'Roundwood',
    'shotley rose': 'Shotley Rose',
    sproughton: 'Sproughton',
    "st john's urc": "St John's URC",
    'st johns urc': "St John's URC",
    'stone lodge': 'Stone Lodge',
    thorndon: 'Thorndon',
    waldringfield: 'Waldringfield',
    westerfield: 'Westerfield',
    'wickham market': 'Wickham Market',
    woodbridge: 'Woodbridge',
  }
  return MAP[s] ?? null
}

function walkDivisions(doc) {
  const out = []
  if (Array.isArray(doc.divisions)) for (const d of doc.divisions) out.push(d)
  if (Array.isArray(doc.sections))
    for (const s of doc.sections) for (const d of s.divisions ?? []) out.push(d)
  return out
}

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function distanceKm(a, b) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLon = ((b.lon - a.lon) * Math.PI) / 180
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

async function main() {
  const regeocode = process.argv.includes('--regeocode')
  const previous = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, 'utf8'))
    : { clubs: [] }
  const prevByName = new Map(previous.clubs.map((c) => [c.name, c]))

  /* 1 — team names per club per league */
  const teamsByClub = new Map()
  const unmapped = []
  for (const { key, file } of LEAGUES) {
    const doc = JSON.parse(readFileSync(file, 'utf8'))
    for (const div of walkDivisions(doc)) {
      for (const t of div.teams ?? []) {
        if (!t || t === 'Bye') continue
        const club = clubForTeam(t)
        if (!club) {
          unmapped.push(`${t} (${file})`)
          continue
        }
        if (!teamsByClub.has(club)) teamsByClub.set(club, {})
        const perLeague = teamsByClub.get(club)
        if (!perLeague[key]) perLeague[key] = new Set()
        perLeague[key].add(t)
      }
    }
  }
  if (unmapped.length) {
    console.error('Unmapped team names:\n  ' + unmapped.join('\n  '))
    process.exit(1)
  }

  /* 2 — postcode groups so shared greens can cross-reference */
  const byPostcode = new Map()
  for (const c of CLUBS) {
    if (!c.postcode) continue
    if (!byPostcode.has(c.postcode)) byPostcode.set(c.postcode, [])
    byPostcode.get(c.postcode).push(c.name)
  }

  /* 3 — geocode */
  const clubs = []
  for (const c of CLUBS) {
    const prev = prevByName.get(c.name)
    const leagues = teamsByClub.get(c.name) ?? {}
    const entry = {
      id: slug(c.name),
      name: c.name,
      ...(c.aka ? { aka: c.aka } : {}),
      postcode: c.postcode,
      lat: prev?.lat ?? null,
      lon: prev?.lon ?? null,
      ...(prev?.pinned ? { pinned: prev.pinned } : {}),
      leagues: Object.fromEntries(
        LEAGUES.filter((l) => leagues[l.key]).map((l) => [
          l.key,
          [...leagues[l.key]].sort((a, b) => a.localeCompare(b)),
        ]),
      ),
    }
    const shared = c.postcode
      ? byPostcode.get(c.postcode).filter((n) => n !== c.name)
      : []
    if (shared.length) entry.sharesGreenWith = shared

    if (c.postcode && (regeocode || entry.lat == null)) {
      try {
        const pc = await fetchJson(
          `https://api.postcodes.io/postcodes/${encodeURIComponent(c.postcode)}`,
        )
        entry.lat = pc.result.latitude
        entry.lon = pc.result.longitude
        entry.pinned = 'postcode'
        await sleep(150)
        // Refine: does Nominatim know the actual bowls club nearby?
        try {
          const q = `${c.name} bowls club, Suffolk`
          const hits = await fetchJson(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=gb&limit=5&q=${encodeURIComponent(q)}`,
            { 'User-Agent': 'ipswich-bowls-site/1.0 (club locations page)' },
          )
          const near = hits.find(
            (h) =>
              /bowl/i.test(h.display_name || '') &&
              distanceKm(
                { lat: entry.lat, lon: entry.lon },
                { lat: Number(h.lat), lon: Number(h.lon) },
              ) < 2.5,
          )
          if (near) {
            entry.lat = Number(near.lat)
            entry.lon = Number(near.lon)
            entry.pinned = 'club'
          }
          await sleep(1100) // Nominatim usage policy: max 1 req/s
        } catch (e) {
          console.error(`  nominatim skip ${c.name}: ${e.message}`)
        }
        console.log(
          `${c.name}: ${entry.lat}, ${entry.lon} (${entry.pinned})`,
        )
      } catch (e) {
        console.error(`  postcode lookup failed ${c.name}: ${e.message}`)
      }
    }
    clubs.push(entry)
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      { updated: new Date().toISOString().slice(0, 10), clubs },
      null,
      2,
    ) + '\n',
  )
  console.log(`\nWrote ${OUT} — ${clubs.length} clubs`)
}

main()
