import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { buildDivisionFixtures } from '../src/lib/fixtures.js'
import { applyResultsToFixtures, computeStandingsFromResults } from '../src/lib/results.js'
import { getActiveSeason, setActiveSeason } from './siteConfigStore.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../public/data')

const DEFAULT_LEAGUE_REGISTRY = {
  'samford-2026': 'samford-2026.json',
  'two-wood-2026': 'two-wood-2026.json',
  'triples-2026': 'triples-2026.json',
}

const REGISTRY_FILENAME = 'leagues-registry.json'

/** @type {Record<string, string>} */
let LEAGUE_FILES = loadLeagueRegistry()

function loadLeagueRegistry() {
  const registryPath = join(DATA_DIR, REGISTRY_FILENAME)
  let merged = { ...DEFAULT_LEAGUE_REGISTRY }
  if (existsSync(registryPath)) {
    try {
      const disk = JSON.parse(readFileSync(registryPath, 'utf8'))
      if (disk && typeof disk === 'object') {
        merged = { ...DEFAULT_LEAGUE_REGISTRY, ...disk }
      }
    } catch {
      /* ignore invalid registry */
    }
  }
  return merged
}

export function persistLeagueRegistry() {
  writeFileSync(
    join(DATA_DIR, REGISTRY_FILENAME),
    `${JSON.stringify(LEAGUE_FILES, null, 2)}\n`,
    'utf8',
  )
}

/** Season a league belongs to — explicit `season` field, else the year suffix of its id. */
export function leagueSeason(leagueId, doc = null) {
  const explicit = Number(doc?.season)
  if (Number.isInteger(explicit)) return explicit
  const m = /-(\d{4})$/.exec(String(leagueId ?? ''))
  return m ? Number(m[1]) : null
}

/** Registry ids for the currently active season (nav order). */
export function activeSeasonLeagueIds() {
  const active = getActiveSeason()
  return Object.keys(LEAGUE_FILES).filter((id) => {
    const season = leagueSeason(id, safeLoadLeague(id))
    return season == null || season === active
  })
}

/** First active-season league whose id starts with a prefix (e.g. 'samford'). */
export function activeLeagueIdByPrefix(prefix) {
  return activeSeasonLeagueIds().find((id) => id.startsWith(prefix)) ?? null
}

function safeLoadLeague(id) {
  try {
    return loadLeague(id)
  } catch {
    return null
  }
}

/** Every season present across registered leagues, newest first. */
export function listKnownSeasons() {
  const seasons = new Set()
  for (const id of Object.keys(LEAGUE_FILES)) {
    const s = leagueSeason(id, safeLoadLeague(id))
    if (s != null) seasons.add(s)
  }
  return [...seasons].sort((a, b) => b - a)
}

/**
 * Public navigation (`/data/leagues-nav.json`) — ids must match league JSON files under
 * `/public/data`. Active-season leagues come first; past seasons follow, newest first.
 */
export function persistLeaguesNav() {
  try {
    const active = getActiveSeason()
    const rows = listLeagues().map((l) => ({ id: l.id, label: l.name, season: l.season }))
    rows.sort((a, b) => {
      const sa = a.season ?? active
      const sb = b.season ?? active
      const rankA = sa === active ? 0 : 1
      const rankB = sb === active ? 0 : 1
      if (rankA !== rankB) return rankA - rankB
      if (sa !== sb) return sb - sa
      return 0
    })
    writeFileSync(join(DATA_DIR, 'leagues-nav.json'), `${JSON.stringify(rows, null, 2)}\n`, 'utf8')
  } catch (e) {
    console.warn('Could not write leagues-nav.json:', e.message)
  }
}

export function slugifyLeagueKey(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
}

function inferTeamSlotCountFromTemplate(tmpl) {
  if (!Array.isArray(tmpl) || tmpl.length === 0) return 8
  let max = 0
  for (const week of tmpl) {
    for (const p of week.pairings ?? []) {
      const h = Number(p.home)
      const a = Number(p.away)
      if (Number.isFinite(h)) max = Math.max(max, h)
      if (Number.isFinite(a)) max = Math.max(max, a)
    }
  }
  return max > 0 ? max : 8
}

function inferTeamSlotCount(league, sectionIdOrNull) {
  if (league.sections?.length && sectionIdOrNull) {
    const sec = league.sections.find((s) => s.id === sectionIdOrNull)
    return inferTeamSlotCountFromTemplate(sec?.scheduleTemplate)
  }
  return inferTeamSlotCountFromTemplate(league.scheduleTemplate)
}

function isPlaceholderFixtureName(name) {
  const s = String(name ?? '').trim()
  return /^Team \d+$/i.test(s)
}

/** Every club appearing in saved `division.results` rows. */
function collectClubNamesFromDivisionResults(division) {
  const out = new Set()
  const weeks = division?.results?.weeks
  if (!weeks || typeof weeks !== 'object') return out
  for (const arr of Object.values(weeks)) {
    if (!Array.isArray(arr)) continue
    for (const m of arr) {
      if (!m || typeof m !== 'object') continue
      const h = String(m.home ?? '').trim()
      const a = String(m.away ?? '').trim()
      if (h && h !== 'Bye') out.add(h)
      if (a && a !== 'Bye') out.add(a)
    }
  }
  return out
}

/** Resolved fixture match rows — needs at least positional `division.teams` for index→name mapping. */
function collectClubNamesFromResolvedFixtures(league, sectionId, divisionId) {
  const out = new Set()
  try {
    const weeks = getDivisionFixtures(league, { sectionId, divisionId })
    for (const w of weeks) {
      for (const m of w.matches ?? []) {
        const h = m.home != null ? String(m.home).trim() : ''
        const a = m.away != null ? String(m.away).trim() : ''
        if (h && h !== 'Bye' && !isPlaceholderFixtureName(h)) out.add(h)
        if (a && a !== 'Bye' && !isPlaceholderFixtureName(a)) out.add(a)
      }
    }
  } catch {
    /* schedule or division missing */
  }
  return out
}

/**
 * Team names for the registered-players picker: master list follows the league **fixture sheet**
 * (`division.teams` rows, skipping blanks and `Bye`) so clubs show up **before any scores**. Any
 * extra club seen only in saved results / resolved fixtures is appended alphabetically.
 */
function divisionTeamsResolvedForListing(league, sectionIdOrNull, division, rawSheetTeams) {
  const raw =
    rawSheetTeams ??
    (Array.isArray(division.teams) ? division.teams.map((t) => String(t ?? '').trim()) : [])
  const fromResults = collectClubNamesFromDivisionResults(division)
  const fromFixtures = collectClubNamesFromResolvedFixtures(league, sectionIdOrNull, division.id)

  const orderedCore = raw.filter((t) => t && t !== 'Bye')

  const known = new Set(orderedCore)
  const extras = []
  for (const n of [...fromResults, ...fromFixtures]) {
    const t = String(n ?? '').trim()
    if (!t || t === 'Bye' || known.has(t)) continue
    known.add(t)
    extras.push(t)
  }
  extras.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))

  const merged = [...orderedCore, ...extras]
  return merged.length > 0 ? merged : raw
}

function divisionListMeta(league, sectionIdOrNull, d) {
  const fixtureSheetTeams = Array.isArray(d.teams)
    ? d.teams.map((t) => String(t ?? '').trim())
    : []
  const sheetLen = fixtureSheetTeams.length
  return {
    id: d.id,
    label: d.label,
    ...(d.playDay != null && d.playDay !== '' ? { playDay: d.playDay } : {}),
    ...(sheetLen > 0 ? { fixtureSlotCount: sheetLen, fixtureSheetTeams } : {}),
    teams: divisionTeamsResolvedForListing(league, sectionIdOrNull, d, fixtureSheetTeams),
  }
}

export function listLeagues() {
  return Object.entries(LEAGUE_FILES).map(([id]) => {
    const data = loadLeague(id)
    const sections = data.sections?.map((s) => ({
      id: s.id,
      label: s.label,
      divisions: (s.divisions ?? []).map((d) => divisionListMeta(data, s.id, d)),
    }))
    const divisions = data.divisions?.map((d) => divisionListMeta(data, null, d))
    return { id, name: data.name, season: leagueSeason(id, data), sections, divisions }
  })
}

export function loadLeague(leagueId) {
  const file = LEAGUE_FILES[leagueId]
  if (!file) throw new Error('Unknown league')
  const path = join(DATA_DIR, file)
  if (!existsSync(path)) throw new Error('League file missing')
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function saveLeague(leagueId, data) {
  const file = LEAGUE_FILES[leagueId]
  if (!file) throw new Error('Unknown league')
  const path = join(DATA_DIR, file)
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  persistLeaguesNav()
}

/** Update home/away club strings in saved week results after a spelling rename. */
function replaceClubNameInDivisionResults(division, from, to) {
  if (!from || from === to) return
  const weeks = division.results?.weeks
  if (!weeks || typeof weeks !== 'object') return
  for (const arr of Object.values(weeks)) {
    if (!Array.isArray(arr)) continue
    for (const m of arr) {
      if (!m || typeof m !== 'object') continue
      if (m.home === from) m.home = to
      if (m.away === from) m.away = to
    }
  }
}

/**
 * Replace `division.teams` with edited names — **same length only** (schedule uses indices).
 * Propagates renames through `division.results` match rows where the club name matched.
 */
export function updateDivisionTeamNames(leagueId, { sectionId, divisionId, teams }) {
  const league = loadLeague(leagueId)
  const { division } = getDivision(league, { sectionId: sectionId || null, divisionId })
  if (!division) throw new Error('Division not found')

  const prev = division.teams
  if (!Array.isArray(prev)) throw new Error('Division has no teams array')
  if (!Array.isArray(teams)) throw new Error('teams must be an array')
  if (teams.length !== prev.length) {
    throw new Error(
      `Must keep exactly ${prev.length} team slots — fixtures rely on sheet order. Rename lines only.`,
    )
  }

  const next = teams.map((t) => String(t ?? '').trim())
  for (let i = 0; i < prev.length; i += 1) {
    const oldName = String(prev[i] ?? '').trim()
    const newName = next[i] ?? ''
    if (oldName && newName && oldName !== newName) {
      replaceClubNameInDivisionResults(division, oldName, newName)
    }
  }

  division.teams = next
  saveLeague(leagueId, league)
  return { ok: true }
}

export function updateLeagueStructureLabels(leagueId, payload = {}) {
  const league = loadLeague(leagueId)

  if (payload.leagueName != null && String(payload.leagueName).trim()) {
    league.name = String(payload.leagueName).trim()
  }

  const sid = payload.sectionId != null ? String(payload.sectionId).trim() : ''
  if (sid && payload.sectionLabel != null && league.sections?.length) {
    const sec = league.sections.find((s) => s.id === sid)
    if (sec) sec.label = String(payload.sectionLabel).trim()
  }

  const did = payload.divisionId != null ? String(payload.divisionId).trim().toLowerCase() : ''
  if (did && payload.divisionLabel != null) {
    const { division } = getDivision(league, {
      sectionId: league.sections?.length ? sid || null : null,
      divisionId: did,
    })
    if (!division) throw new Error('Division not found')
    division.label = String(payload.divisionLabel).trim()
  }

  saveLeague(leagueId, league)
  return { ok: true }
}

export function addLeagueDivision(leagueId, { sectionId, divisionId, label, playDay }) {
  const league = loadLeague(leagueId)
  const lbl = String(label ?? '').trim()
  const rawId = String(divisionId ?? '').trim().toLowerCase()
  const did = rawId ? slugifyLeagueKey(rawId) : slugifyLeagueKey(lbl).slice(0, 48)
  if (!did) throw new Error('Division id or label is required')

  if (league.sections?.length) {
    const sid = String(sectionId ?? '').trim()
    const sec = league.sections.find((s) => s.id === sid)
    if (!sec) throw new Error('Section not found')
    const slots = inferTeamSlotCount(league, sid)
    if (sec.divisions.some((d) => d.id === did)) throw new Error('Division id already exists')
    sec.divisions.push({
      id: did,
      label: lbl || did,
      teams: Array.from({ length: slots }, () => 'Bye'),
      results: { weeks: {} },
    })
  } else {
    const slots = inferTeamSlotCount(league, null)
    if (!league.divisions) league.divisions = []
    if (league.divisions.some((d) => d.id === did)) throw new Error('Division id already exists')
    const row = {
      id: did,
      label: lbl || did,
      teams: Array.from({ length: slots }, () => 'Bye'),
      results: { weeks: {} },
    }
    const requestedDay = String(playDay ?? '').trim().toLowerCase()
    if (requestedDay) {
      /* The play day must have a date column in the schedule grid (e.g.
         'tuesday' needs tuesdayDate on Two Wood's rows). */
      if (league.scheduleTemplate?.[0]?.[`${requestedDay}Date`] === undefined) {
        throw new Error(`This league's schedule has no ${requestedDay} dates`)
      }
      row.playDay = requestedDay
    } else {
      const donorPlayDay = league.divisions.find((d) => d.playDay)?.playDay
      if (donorPlayDay) row.playDay = donorPlayDay
    }
    league.divisions.push(row)
  }

  saveLeague(leagueId, league)
  return { ok: true, divisionId: did }
}

export function deleteLeagueDivision(leagueId, { sectionId, divisionId }) {
  const league = loadLeague(leagueId)
  const sid = String(sectionId ?? '').trim()
  const did = String(divisionId ?? '').trim().toLowerCase()
  const divisions = league.sections?.length
    ? league.sections.find((s) => s.id === sid)?.divisions
    : league.divisions
  if (!Array.isArray(divisions)) throw new Error('Playing day not found')
  const index = divisions.findIndex((d) => d.id === did)
  if (index < 0) throw new Error('Division not found')
  if (divisions.length === 1) {
    throw new Error('A playing day must keep at least one division')
  }
  const weeks = divisions[index]?.results?.weeks
  if (weeks && Object.values(weeks).some((rows) => Array.isArray(rows) && rows.length)) {
    throw new Error('This division has results entered and cannot be removed')
  }
  divisions.splice(index, 1)
  saveLeague(leagueId, league)
  return { ok: true, divisionId: did }
}

export function addLeagueSection(leagueId, { sectionId, label, cloneScheduleFromSectionId }) {
  const league = loadLeague(leagueId)

  if (Array.isArray(league.divisions) && league.divisions.length && !league.sections?.length) {
    throw new Error(
      'This league uses top-level divisions only — convert it manually before adding sections.',
    )
  }

  if (!league.sections) league.sections = []

  const sid = slugifyLeagueKey(sectionId)
  if (!sid) throw new Error('Section id is required')
  if (league.sections.some((s) => s.id === sid)) throw new Error('Section id already exists')

  let scheduleTemplate = []
  const cloneSrc = String(cloneScheduleFromSectionId ?? '').trim()
  const donor = league.sections.find((s) => s.id === cloneSrc)
  if (donor?.scheduleTemplate?.length) {
    scheduleTemplate = JSON.parse(JSON.stringify(donor.scheduleTemplate))
  } else if (league.sections[0]?.scheduleTemplate?.length) {
    scheduleTemplate = JSON.parse(JSON.stringify(league.sections[0].scheduleTemplate))
  }

  const slots = inferTeamSlotCountFromTemplate(scheduleTemplate)

  league.sections.push({
    id: sid,
    label: String(label ?? '').trim() || sid,
      scheduleTemplate,
    divisions: [
      {
        id: 'a',
        label: 'Division A',
        teams: Array.from({ length: slots }, () => 'Bye'),
        results: { weeks: {} },
      },
    ],
  })

  saveLeague(leagueId, league)
  return { ok: true, sectionId: sid }
}

export function createLeagueFromClone({ leagueId, name, cloneFromLeagueId }) {
  const lid = slugifyLeagueKey(leagueId)
  if (!lid) throw new Error('League id is required (use letters, numbers and hyphens)')
  if (LEAGUE_FILES[lid]) throw new Error('That league id already exists')

  const donorKey = String(cloneFromLeagueId ?? '').trim()
  if (!donorKey || !LEAGUE_FILES[donorKey]) {
    throw new Error('Pick an existing league to copy fixtures structure from')
  }

  const donor = loadLeague(donorKey)
  const copy = JSON.parse(JSON.stringify(donor))
  copy.id = lid
  copy.name = String(name ?? '').trim() || lid
  copy.season = getActiveSeason()

  function resetDivision(div, sectionIdForSlots) {
    const slots = inferTeamSlotCount(copy, sectionIdForSlots)
    div.teams = Array.from({ length: slots }, () => 'Bye')
    div.results = { weeks: {} }
    delete div.standingsSeed
  }

  if (copy.sections?.length) {
    for (const sec of copy.sections) {
      for (const div of sec.divisions ?? []) resetDivision(div, sec.id)
    }
  } else {
    for (const div of copy.divisions ?? []) resetDivision(div, null)
  }

  const filename = `${lid}.json`
  writeFileSync(join(DATA_DIR, filename), `${JSON.stringify(copy, null, 2)}\n`, 'utf8')

  LEAGUE_FILES[lid] = filename
  persistLeagueRegistry()
  persistLeaguesNav()

  return { ok: true, leagueId: lid }
}

/**
 * Unregister a league: it disappears from the registry, nav, public site and
 * admin. The JSON data file is left on disk so nothing is lost — re-adding the
 * registry entry would bring it straight back.
 */
export function deleteLeague(leagueId) {
  const id = String(leagueId ?? '').trim()
  if (!LEAGUE_FILES[id]) throw new Error('Unknown league')
  delete LEAGUE_FILES[id]
  persistLeagueRegistry()
  persistLeaguesNav()
  return { ok: true, leagueId: id }
}

/** True when any division in the league has saved week results. */
export function leagueHasAnyResults(doc) {
  const divisionLists = doc?.sections?.length
    ? doc.sections.map((s) => s.divisions ?? [])
    : [doc?.divisions ?? []]
  for (const divisions of divisionLists) {
    for (const d of divisions) {
      const weeks = d?.results?.weeks
      if (weeks && Object.values(weeks).some((arr) => Array.isArray(arr) && arr.length)) {
        return true
      }
    }
  }
  return false
}

/**
 * Remove a whole season (e.g. one started by mistake): unregister every league
 * belonging to it — their data files stay on disk, so re-starting the season
 * later works cleanly. Refused when any of its leagues already has results, or
 * when it is the only season. If the removed season was the active one, the
 * newest remaining season becomes active.
 */
export function removeSeason(yearRaw) {
  const year = Number(yearRaw)
  const seasons = listKnownSeasons()
  if (!seasons.includes(year)) throw new Error('No leagues exist for that season')
  if (seasons.length < 2) throw new Error('The only season cannot be removed')

  const ids = Object.keys(LEAGUE_FILES).filter(
    (id) => leagueSeason(id, safeLoadLeague(id)) === year,
  )
  for (const id of ids) {
    const doc = safeLoadLeague(id)
    if (doc && leagueHasAnyResults(doc)) {
      throw new Error(
        `${doc.name ?? id} already has results entered — the ${year} season can't be removed`,
      )
    }
  }

  for (const id of ids) delete LEAGUE_FILES[id]
  persistLeagueRegistry()

  let activeSeason = getActiveSeason()
  if (activeSeason === year) {
    activeSeason = listKnownSeasons()[0]
    setActiveSeason(activeSeason)
  }
  persistLeaguesNav()
  return { removedLeagues: ids, activeSeason }
}

const SEASON_DATE_KEYS = [
  'date',
  'mondayDate',
  'tuesdayDate',
  'wednesdayDate',
  'thursdayDate',
  'fridayDate',
  'saturdayDate',
  'sundayDate',
]

/**
 * Edit fixture dates on a schedule grid. `rows` is a partial update keyed by
 * week number, e.g. `[{ week: 1, date: '2027-05-10' }]` (flat leagues use
 * `tuesdayDate` / `thursdayDate` instead of `date`). Only date columns the
 * template already has can be set — pairings are untouched.
 */
export function updateScheduleDates(leagueId, { sectionId, rows }) {
  const league = loadLeague(leagueId)

  let tmpl
  if (league.sections?.length) {
    const sec = league.sections.find((s) => s.id === String(sectionId ?? '').trim())
    if (!sec) throw new Error('Section not found')
    tmpl = sec.scheduleTemplate
  } else {
    tmpl = league.scheduleTemplate
  }
  if (!Array.isArray(tmpl) || !tmpl.length) throw new Error('League has no fixture schedule')
  if (!Array.isArray(rows) || !rows.length) throw new Error('No date changes supplied')

  const byWeek = new Map(tmpl.map((r) => [String(r.week), r]))
  for (const row of rows) {
    const target = byWeek.get(String(row?.week))
    if (!target) throw new Error(`Unknown week ${row?.week}`)
    for (const key of SEASON_DATE_KEYS) {
      if (row[key] === undefined) continue
      if (target[key] === undefined) {
        throw new Error(`Week ${row.week} has no "${key}" column in this schedule`)
      }
      const value = String(row[key]).trim()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`Week ${row.week}: dates must be YYYY-MM-DD`)
      }
      target[key] = value
    }
  }

  saveLeague(leagueId, league)
  return { ok: true }
}

/** Shift an ISO date by whole weeks (keeps the weekday). */
function shiftIsoDateByWeeks(iso, weeks) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim())
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d.toISOString().slice(0, 10)
}

function shiftScheduleTemplateDates(tmpl, weeks) {
  for (const row of tmpl ?? []) {
    for (const [key, value] of Object.entries(row)) {
      if ((key === 'date' || key.endsWith('Date')) && value) {
        row[key] = shiftIsoDateByWeeks(value, weeks)
      }
    }
  }
}

function addWeeksIso(iso, weeks) {
  return shiftIsoDateByWeeks(iso, weeks)
}

function evenSlotCount(teamCount) {
  const n = Math.max(2, Math.min(30, Number(teamCount) || 8))
  return n % 2 === 0 ? n : n + 1
}

/** Standard double round-robin (second half reverses home/away). */
function generatePairingWeeks(teamCount) {
  const slots = evenSlotCount(teamCount)
  let rotation = Array.from({ length: slots }, (_, i) => i + 1)
  const firstLeg = []
  for (let round = 0; round < slots - 1; round += 1) {
    const pairings = []
    for (let i = 0; i < slots / 2; i += 1) {
      let home = rotation[i]
      let away = rotation[slots - 1 - i]
      if ((round + i) % 2 === 1) [home, away] = [away, home]
      pairings.push({ home, away })
    }
    firstLeg.push(pairings)
    rotation = [rotation[0], rotation[slots - 1], ...rotation.slice(1, -1)]
  }
  return [
    ...firstLeg,
    ...firstLeg.map((round) => round.map(({ home, away }) => ({ home: away, away: home }))),
  ]
}

function generatedSchedule(teamCount, dateStarts) {
  return generatePairingWeeks(teamCount).map((pairings, i) => {
    const row = { week: i + 1 }
    for (const [key, start] of Object.entries(dateStarts)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(String(start ?? ''))) {
        row[key] = addWeeksIso(start, i)
      }
    }
    row.pairings = pairings
    return row
  })
}

function divisionId(index) {
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1)
}

function blankDivision(index, slots, playDay = null) {
  const id = divisionId(index)
  return {
    id,
    label: `Division ${id.toUpperCase()}`,
    ...(playDay ? { playDay } : {}),
    teams: Array.from({ length: slots }, () => 'Bye'),
    results: { weeks: {} },
  }
}

function structureLeague(copy, plan) {
  const days = (plan?.days ?? []).filter((d) => d && Number(d.divisionCount) > 0)
  if (!days.length) throw new Error(`${copy.name}: choose at least one playing day`)

  if (copy.sections?.length) {
    let divisionIndex = 0
    const donorSections = copy.sections
    copy.sections = days.map((day, dayIndex) => {
      const donor =
        donorSections.find((s) => s.id === String(day.id ?? '')) ??
        donorSections[dayIndex] ??
        donorSections[0]
      const slots = evenSlotCount(day.teamCount)
      const divisions = Array.from({ length: Number(day.divisionCount) }, () => {
        const row = blankDivision(divisionIndex, slots)
        divisionIndex += 1
        return row
      })
      return {
        ...JSON.parse(JSON.stringify(donor ?? {})),
        id: slugifyLeagueKey(day.id || day.label || `day-${dayIndex + 1}`),
        label: String(day.label || `Playing day ${dayIndex + 1}`).trim(),
        scheduleTemplate: generatedSchedule(slots, { date: day.startDate }),
        divisions,
      }
    })
    delete copy.divisions
    delete copy.scheduleTemplate
    return
  }

  const hasMultiplePlayDays = days.length > 1 || copy.divisions?.some((d) => d.playDay)
  const maxSlots = Math.max(...days.map((d) => evenSlotCount(d.teamCount)))
  const dateStarts = {}
  if (hasMultiplePlayDays) {
    for (const day of days) {
      const playDay = slugifyLeagueKey(day.playDay || day.label)
      dateStarts[`${playDay}Date`] = day.startDate
    }
  } else {
    dateStarts.date = days[0].startDate
  }
  copy.scheduleTemplate = generatedSchedule(maxSlots, dateStarts)

  let divisionIndex = 0
  copy.divisions = days.flatMap((day) => {
    const playDay = hasMultiplePlayDays
      ? slugifyLeagueKey(day.playDay || day.label)
      : null
    return Array.from({ length: Number(day.divisionCount) }, () => {
      const row = blankDivision(divisionIndex, maxSlots, playDay)
      divisionIndex += 1
      return row
    })
  })
  delete copy.sections
}

/**
 * Clone every active-season league into a new season: same structure and team
 * slots, fixture dates shifted forward by whole years (52 weeks each, keeping
 * play days), results emptied, standings seeds dropped. Old season files stay
 * on disk and in the registry, so past seasons remain browsable.
 */
export function startNewSeason(yearRaw, structure = null) {
  const year = Number(yearRaw)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Season must be a 4-digit year (e.g. 2027)')
  }

  const fromSeason = getActiveSeason()
  if (year === fromSeason) throw new Error(`${year} is already the active season`)

  const sourceIds = activeSeasonLeagueIds()
  if (!sourceIds.length) throw new Error('No leagues found for the current season')

  const yearsAhead = year - fromSeason
  if (yearsAhead < 1) {
    throw new Error(
      `New season must be after the current one (${fromSeason}) — to view an old season, switch the active season instead`,
    )
  }
  const weeksToShift = yearsAhead * 52

  /* Validate all target ids before writing anything. */
  const requested = Array.isArray(structure) ? structure : null
  const plans = sourceIds
    .filter((id) => !requested || requested.find((p) => p.sourceLeagueId === id)?.enabled !== false)
    .map((id) => {
    const newId = /-\d{4}$/.test(id)
      ? id.replace(/-\d{4}$/, `-${year}`)
      : `${id}-${year}`
    if (LEAGUE_FILES[newId]) throw new Error(`League ${newId} already exists`)
      return { id, newId, structure: requested?.find((p) => p.sourceLeagueId === id) ?? null }
    })
  if (!plans.length) throw new Error('Keep at least one league in the new season')

  const created = []
  for (const { id, newId, structure: leaguePlan } of plans) {
    const donor = loadLeague(id)
    const copy = JSON.parse(JSON.stringify(donor))
    copy.id = newId
    copy.season = year
    copy.name = String(copy.name ?? '').includes(String(fromSeason))
      ? String(copy.name).replaceAll(String(fromSeason), String(year))
      : `${String(copy.name ?? newId).trim()} ${year}`

    if (leaguePlan) {
      structureLeague(copy, leaguePlan)
    } else if (copy.sections?.length) {
      for (const sec of copy.sections) {
        shiftScheduleTemplateDates(sec.scheduleTemplate, weeksToShift)
        for (const div of sec.divisions ?? []) {
          div.results = { weeks: {} }
          delete div.standingsSeed
        }
      }
    } else {
      shiftScheduleTemplateDates(copy.scheduleTemplate, weeksToShift)
      for (const div of copy.divisions ?? []) {
        div.results = { weeks: {} }
        delete div.standingsSeed
      }
    }

    const filename = `${newId}.json`
    writeFileSync(join(DATA_DIR, filename), `${JSON.stringify(copy, null, 2)}\n`, 'utf8')
    LEAGUE_FILES[newId] = filename
    created.push(newId)
  }

  persistLeagueRegistry()
  return { created, fromSeason, year }
}

export function getDivision(league, { sectionId, divisionId }) {
  if (league.sections) {
    const section = league.sections.find((s) => s.id === sectionId)
    const division = section?.divisions?.find((d) => d.id === divisionId)
    return { section, division }
  }
  const division = league.divisions?.find((d) => d.id === divisionId)
  return { section: null, division }
}

export function getDivisionFixtures(league, { sectionId, divisionId }) {
  const { section, division } = getDivision(league, { sectionId, divisionId })
  if (!division) return []

  if (section) {
    return buildDivisionFixtures(section.scheduleTemplate, division.teams)
  }

  const getDate = (row) => {
    if (division.playDay === 'thursday') return row.thursdayDate
    if (division.playDay === 'tuesday') return row.tuesdayDate
    return row.date
  }

  return buildDivisionFixtures(league.scheduleTemplate, division.teams, getDate)
}

/**
 * Fixtures for one week paired with editable fields from saved JSON.
 * Order follows fixture sheet (home clubs as scheduled).
 */
export function getWeekEditableMatchRows(league, { sectionId, divisionId, week }) {
  const { division } = getDivision(league, { sectionId, divisionId })
  if (!division) throw new Error('Division not found')

  const fixtures = getDivisionFixtures(league, { sectionId, divisionId })
  const weekFx = fixtures.find((w) => String(w.week) === String(week))
  const savedWeek = division.results?.weeks?.[String(week)] ?? []

  /** @type {object[]} */
  const rows = []
  for (const m of weekFx?.matches ?? []) {
    if (m.isBye || !m.away) continue

    const saved = savedWeek.find(
      (r) =>
        r &&
        ((r.home === m.home && r.away === m.away) ||
          (r.home === m.away && r.away === m.home)),
    )

    let homePoints = ''
    let awayPoints = ''
    let homeShots = ''
    let awayShots = ''
    let homePlayersText = ''
    let awayPlayersText = ''
    let matchDate = ''
    let rinkShotsJson = ''
    let postponed = false

    if (saved) {
      postponed = Boolean(saved.postponed)
      const flipped = saved.home === m.away && saved.away === m.home
      const hs = flipped ? saved.awayShots : saved.homeShots
      const asVal = flipped ? saved.homeShots : saved.awayShots

      homeShots = Number.isFinite(hs) ? String(hs) : ''
      awayShots = Number.isFinite(asVal) ? String(asVal) : ''

      const hpSave = flipped ? saved.awayPoints : saved.homePoints
      const apSave = flipped ? saved.homePoints : saved.awayPoints
      if (Number.isFinite(hpSave)) homePoints = String(hpSave)
      if (Number.isFinite(apSave)) awayPoints = String(apSave)

      matchDate = saved.matchDate ?? ''
      rinkShotsJson =
        saved.rinkShots && Array.isArray(saved.rinkShots) && saved.rinkShots.length
          ? JSON.stringify(saved.rinkShots)
          : ''

      if (saved.players && typeof saved.players === 'object') {
        const hList = flipped ? saved.players.away : saved.players.home
        const aList = flipped ? saved.players.home : saved.players.away
        homePlayersText = Array.isArray(hList) ? hList.join('; ') : ''
        awayPlayersText = Array.isArray(aList) ? aList.join('; ') : ''
      }
    }

    rows.push({
      home: m.home,
      away: m.away,
      homePoints,
      awayPoints,
      homeShots,
      awayShots,
      homePlayersText,
      awayPlayersText,
      matchDate,
      rinkShotsJson,
      postponed,
    })
  }

  return { fixtureWeekDate: weekFx?.date ?? null, matches: rows }
}

export function mergeWeekResults(league, { sectionId, divisionId, week, matches }) {
  const { division } = getDivision(league, { sectionId, divisionId })
  if (!division) throw new Error('Division not found')

  if (!division.results) division.results = { weeks: {} }
  if (!division.results.weeks) division.results.weeks = {}

  const weekKey = String(week)
  const existing = division.results.weeks[weekKey] ?? []
  const merged = [...existing]

  for (const incoming of matches) {
    if (!incoming?.home || !incoming?.away) continue

    const idx = merged.findIndex(
      (r) =>
        r &&
        ((r.home === incoming.home && r.away === incoming.away) ||
          (r.home === incoming.away && r.away === incoming.home)),
    )

    if (incoming.clear) {
      if (idx >= 0) merged.splice(idx, 1)
      continue
    }

    const prev = idx >= 0 ? merged[idx] : null
    // Keep schedule home/away orientation if we already have a result for this pairing
    // (CSV may list sides either way).
    let home = incoming.home
    let away = incoming.away
    if (prev && prev.home === incoming.away && prev.away === incoming.home) {
      home = prev.home
      away = prev.away
    }

    if (incoming.postponed) {
      const row = {
        home,
        away,
        postponed: true,
      }
      if (incoming.matchDate) row.matchDate = incoming.matchDate
      else if (prev?.matchDate) row.matchDate = prev.matchDate
      if (idx >= 0) merged[idx] = row
      else merged.push(row)
      continue
    }

    const homeShots = Number(incoming.homeShots)
    const awayShots = Number(incoming.awayShots)

    if (!Number.isFinite(homeShots) || !Number.isFinite(awayShots)) continue

    const homePoints = Number(incoming.homePoints)
    const awayPoints = Number(incoming.awayPoints)

    let homeShotsOriented = homeShots
    let awayShotsOriented = awayShots
    let homePointsOriented = homePoints
    let awayPointsOriented = awayPoints
    if (prev && prev.home === incoming.away && prev.away === incoming.home) {
      homeShotsOriented = awayShots
      awayShotsOriented = homeShots
      homePointsOriented = awayPoints
      awayPointsOriented = homePoints
    }

    const row = {
      home,
      away,
      homeShots: homeShotsOriented,
      awayShots: awayShotsOriented,
    }
    if (Number.isFinite(homePointsOriented) && Number.isFinite(awayPointsOriented)) {
      row.homePoints = homePointsOriented
      row.awayPoints = awayPointsOriented
    }
    if (incoming.players && typeof incoming.players === 'object') {
      const h = incoming.players.home ?? []
      const a = incoming.players.away ?? []
      const hasPlayers =
        (Array.isArray(h) && h.length > 0) || (Array.isArray(a) && a.length > 0)
      if (hasPlayers) {
        const flipped = Boolean(prev && prev.home === incoming.away && prev.away === incoming.home)
        row.players = {
          home: Array.isArray(flipped ? a : h) ? (flipped ? a : h) : [],
          away: Array.isArray(flipped ? h : a) ? (flipped ? h : a) : [],
        }
      }
    }
    // Preserve richer prior detail when a bulk CSV re-import omits players / rinks.
    if (!row.players && prev?.players) row.players = prev.players
    if (incoming.matchDate) row.matchDate = incoming.matchDate
    else if (prev?.matchDate) row.matchDate = prev.matchDate
    if (incoming.rinkShots && Array.isArray(incoming.rinkShots) && incoming.rinkShots.length) {
      row.rinkShots = incoming.rinkShots
    } else if (prev?.rinkShots?.length) {
      row.rinkShots = prev.rinkShots
    }
    if (idx >= 0) merged[idx] = row
    else merged.push(row)
  }

  division.results.weeks[weekKey] = merged

  // Admin / CSV results inside a seed window become the source of truth.
  // Leaving the seed in place would silently ignore those saved weeks.
  const seedThrough = Number(division.standingsSeed?.throughWeek)
  if (division.standingsSeed && Number.isFinite(seedThrough) && Number(week) <= seedThrough) {
    delete division.standingsSeed
  }

  const fxWeeks = getDivisionFixtures(league, { sectionId, divisionId })
  const fixtures = applyResultsToFixtures(fxWeeks, division.results.weeks)
  const scheduledWeekKeys = new Set(fxWeeks.map((w) => String(w.week)))
  const standings = computeStandingsFromResults(
    division.teams,
    division.results.weeks,
    scheduledWeekKeys,
    division.standingsSeed ?? null,
  )

  return { league, fixtures, standings, savedWeek: weekKey, matchCount: merged.length }
}
