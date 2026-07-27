import { loadLeague, mergeWeekResults, saveLeague, getDivision, getDivisionFixtures } from './leagueStore.js'
import { formatFixtureDate } from '../src/lib/fixtures.js'
import { fuzzyMatchTeam } from './parseScoreText.js'
import { mergeRosterBatch, clearRegisteredPlayersCache } from './rosterStore.js'
import { validateMatchPlayersForCsvImport } from './validatePlayers.js'

export function splitCsvRecords(text) {
  const trimmed = text.replace(/^\ufeff/, '')
  const lines = trimmed.split(/\r?\n/).filter((ln) => {
    const s = ln.trim()
    return s.length > 0 && !s.startsWith('#')
  })
  return lines
}

export function parseCsvLine(line) {
  const cells = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        cur += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      cells.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  cells.push(cur.trim())
  return cells
}

function normalizeHeader(cell) {
  return String(cell ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
}

const HEADER_SYNONYMS = {
  record_type: 'type',
  type: 'type',
  record: 'type',
  league_id: 'league_id',
  league: 'league_id',
  section_id: 'section_id',
  section: 'section_id',
  division_id: 'division_id',
  division: 'division_id',
  week: 'week',
  home: 'home',
  home_team: 'home',
  away: 'away',
  away_team: 'away',
  home_points: 'home_points',
  home_pts: 'home_points',
  home_result: 'home_points',
  result_home: 'home_points',
  away_points: 'away_points',
  away_pts: 'away_points',
  away_result: 'away_points',
  result_away: 'away_points',
  home_shots: 'home_shots',
  away_shots: 'away_shots',
  total_home_shots: 'home_shots',
  total_away_shots: 'away_shots',
  total_shots_home: 'home_shots',
  total_shots_away: 'away_shots',
  shots_home: 'home_shots',
  shots_away: 'away_shots',
  match_date: 'match_date',
  date_of_match: 'match_date',
  date: 'match_date',
  home_players: 'home_players',
  away_players: 'away_players',
  team: 'team',
  club: 'team',
  player: 'player',
  player_name: 'player',
  name: 'player',
}

function mapHeader(h) {
  const n = normalizeHeader(h)
  return HEADER_SYNONYMS[n] ?? n
}

function rowToObject(headers, cells) {
  const o = {}
  headers.forEach((h, i) => {
    o[h] = cells[i] ?? ''
  })
  return o
}

export function inferSectionForLeague(league, explicitSectionId) {
  const ex = explicitSectionId != null ? String(explicitSectionId).trim() : ''
  if (ex) return { sectionId: ex, inferred: false, error: null }
  const sections = league.sections ?? []
  if (sections.length === 0) return { sectionId: '', inferred: false, error: null }
  if (sections.length === 1) return { sectionId: sections[0].id, inferred: true, error: null }
  return {
    sectionId: '',
    inferred: false,
    error: 'section_id required (this league has multiple sections)',
  }
}

function splitPlayerList(s) {
  if (s == null || String(s).trim() === '') return []
  return String(s)
    .split(/[;|]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

function firstNonempty(...vals) {
  for (const v of vals) {
    if (v == null) continue
    const s = String(v).trim()
    if (s !== '') return s
  }
  return ''
}

function parseNum(s) {
  if (s == null || String(s).trim() === '') return { ok: true, val: NaN }
  const n = Number(String(s).trim())
  return Number.isFinite(n) ? { ok: true, val: n } : { ok: false, val: NaN }
}

/** Sheet markers for postponed / void fixtures (shown as P-P). */
function isPostponedMarker(s) {
  return /^(pp|p\/p|postponed|void|cancelled|canceled)$/i.test(String(s ?? '').trim())
}

/** @returns {string} YYYY-MM-DD or '' */
export function parseFlexibleDateToIso(s) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const lo = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(t.replace(/\s/g, ''))
  if (lo) {
    let d = Number(lo[1])
    let mo = Number(lo[2])
    let y = Number(lo[3])
    if (y < 100) y += 2000
    if (
      Number.isFinite(d) &&
      Number.isFinite(mo) &&
      Number.isFinite(y) &&
      mo >= 1 &&
      mo <= 12 &&
      d >= 1 &&
      d <= 31
    ) {
      return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }
  return ''
}

export function resolveWeekFromFixtureDate(league, sectionId, divisionId, isoDate) {
  if (!isoDate) return null
  const fixtures = getDivisionFixtures(league, {
    sectionId: sectionId || null,
    divisionId,
  })
  const hit = fixtures.find((w) => w.date === isoDate)
  return hit ? hit.week : null
}

function playersFromRow(raw, side, rowIndex, warnings) {
  const indexed = []
  for (let i = 1; i <= 12; i += 1) {
    const v = raw[`${side}_player_${i}`]
    if (v != null && String(v).trim() !== '') indexed.push(String(v).trim())
  }
  const pooled = splitPlayerList(raw[`${side}_players`])
  if (indexed.length && pooled.length) {
    warnings.push(
      `Row ${rowIndex}: both ${side}_player_* columns and ${side}_players are set — combining (numbered columns first, then extras from list).`,
    )
    const seen = new Set(indexed.map((x) => x.toLowerCase()))
    for (const n of pooled) {
      const k = n.toLowerCase()
      if (!seen.has(k)) {
        indexed.push(n)
        seen.add(k)
      }
    }
    return indexed
  }
  if (indexed.length) return indexed
  return pooled
}

function rinkShotsFromRow(raw, rowIndex, warnings, totalHome, totalAway) {
  /** @type {Map<number, { homeShots?: number, awayShots?: number }>} */
  const byRink = new Map()

  for (const [kRaw, cell] of Object.entries(raw)) {
    const k = String(kRaw).trim()
    const m = /^rink_(\d+)_(home|away)(?:_shots)?$/.exec(k)
    if (!m) continue
    const r = Number(m[1])
    const side = m[2].toLowerCase()
    const p = parseNum(cell)
    if (!p.ok) {
      warnings.push(`Row ${rowIndex}: ${k}: expected a number`)
      continue
    }
    if (!byRink.has(r)) byRink.set(r, {})
    const bucket = byRink.get(r)
    if (side === 'home') bucket.homeShots = p.val
    else bucket.awayShots = p.val
  }

  const list = [...byRink.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, shots]) =>
      shots.homeShots != null &&
      shots.awayShots != null &&
      Number.isFinite(shots.homeShots) &&
      Number.isFinite(shots.awayShots)
        ? { homeShots: shots.homeShots, awayShots: shots.awayShots }
        : null,
    )
    .filter(Boolean)

  if (!list.length) return null

  if (Number.isFinite(totalHome) && Number.isFinite(totalAway)) {
    const sumH = list.reduce((s, x) => s + x.homeShots, 0)
    const sumA = list.reduce((s, x) => s + x.awayShots, 0)
    if (
      Math.abs(sumH - totalHome) >= 4 ||
      Math.abs(sumA - totalAway) >= 4
    ) {
      warnings.push(
        `Row ${rowIndex}: sum of rink shots (${sumH}–${sumA}) differs from total match shots (${totalHome}–${totalAway}); rinks stored for records only.`,
      )
    }
  }

  return list.length ? list : null
}

/**
 * Align CSV team names to scheduled home/away for this week (for admin drill-down keys).
 */
function playersPreview(list, maxNames = 5, maxChars = 140) {
  if (!list?.length) return ''
  const parts = []
  let len = 0
  for (let i = 0; i < list.length && i < maxNames; i += 1) {
    const s = list[i]
    const sep = parts.length ? 2 : 0
    if (parts.length && len + sep + s.length > maxChars) break
    if (!parts.length && s.length > maxChars) {
      return `${s.slice(0, maxChars)}…`
    }
    parts.push(s)
    len += sep + s.length
  }
  const rest = list.length - parts.length
  return rest > 0 ? `${parts.join('; ')} (+${rest} more)` : parts.join('; ')
}

/**
 * Among equal top scores, pick one row. Returns null if the tie spans different sections/divisions.
 *
 * @param {{ sectionId?: string|null, divisionId: string, week: number, diaryDate?: string, scheduleHome: string, scheduleAway: string, score: number }[]} winners
 * @returns {{ winner: (typeof winners)[0], alternateWeeks: number[] } | null}
 */
function pickFixtureWinnerFromTie(winners, isoDate, explicitWeek) {
  if (!winners.length) return null
  if (winners.length === 1) {
    return { winner: winners[0], alternateWeeks: [Number(winners[0].week)] }
  }

  const divKeys = new Set(
    winners.map((w) => `${w.sectionId ?? ''}\t${w.divisionId}`),
  )
  if (divKeys.size !== 1) return null

  let pool = [...winners]
  if (isoDate) {
    const byDate = pool.filter((h) => h.diaryDate && h.diaryDate === isoDate)
    if (byDate.length === 1) return { winner: byDate[0], alternateWeeks: [Number(byDate[0].week)] }
    if (byDate.length > 1) pool = byDate
  }
  if (Number.isFinite(explicitWeek)) {
    const byW = pool.filter((h) => Number(h.week) === explicitWeek)
    if (byW.length === 1) return { winner: byW[0], alternateWeeks: [Number(byW[0].week)] }
    if (byW.length > 1) pool = byW
  }

  pool.sort((a, b) => Number(a.week) - Number(b.week))
  const alternateWeeks = [...new Set(winners.map((w) => Number(w.week)))].sort((a, b) => a - b)
  return { winner: pool[0], alternateWeeks }
}

/**
 * Match CSV home/away to a single scheduled pairing in the diary.
 * Prefer rows where diary date equals isoDate CSV, then week equals explicitWeek.
 * If several weeks share that pairing in the same division, pick the earliest week and set alternateWeeks for a warning.
 *
 * @returns {{ sectionId: string|null, divisionId: string, week: number, matchDateIso: string, scheduleHome: string, scheduleAway: string, score: number, alternateWeeks?: number[] } | null}
 */
function resolveFixtureSlotFromTeams(
  league,
  { hintSectionId, csvHomeRaw, csvAwayRaw, isoDate, explicitWeek },
) {
  /** @type {{ sectionId?: string|null, divisionId: string, week: number, diaryDate?: string, scheduleHome: string, scheduleAway: string, score: number }[]} */
  const hits = []

  function consider(sectionIdNullable, divisionId, templateTeams, fixtures) {
    if (!csvHomeRaw || !csvAwayRaw || !templateTeams?.length) return
    const mh = fuzzyMatchTeam(csvHomeRaw, templateTeams)
    const ma = fuzzyMatchTeam(csvAwayRaw, templateTeams)
    const canonH = mh || String(csvHomeRaw).trim()
    const canonA = ma || String(csvAwayRaw).trim()

    for (const wk of fixtures ?? []) {
      const wNum = Number(wk.week)
      const diary = wk.date && String(wk.date).trim() !== '' ? String(wk.date) : ''

      for (const m of wk.matches ?? []) {
        if (m?.isBye || !m?.away) continue
        const set = new Set([m.home, m.away])
        if (!set.has(canonH) || !set.has(canonA)) continue

        let score = 1
        if (isoDate && diary && isoDate === diary) score += 200
        if (Number.isFinite(explicitWeek) && explicitWeek === wNum) score += 100

        hits.push({
          sectionId: sectionIdNullable,
          divisionId,
          week: wNum,
          diaryDate: diary,
          scheduleHome: m.home,
          scheduleAway: m.away,
          score,
        })
      }
    }
  }

  if (league.sections?.length) {
    const hint = hintSectionId != null ? String(hintSectionId).trim() : ''
    const sections = hint ? league.sections.filter((s) => s.id === hint) : league.sections

    if (hint && sections.length === 0) return null

    for (const sec of sections) {
      for (const div of sec.divisions ?? []) {
        const fixtures = getDivisionFixtures(league, { sectionId: sec.id, divisionId: div.id })
        consider(sec.id, div.id, div.teams, fixtures)
      }
    }
  } else if (league.divisions?.length) {
    for (const div of league.divisions) {
      const fixtures = getDivisionFixtures(league, { sectionId: null, divisionId: div.id })
      consider(null, div.id, div.teams, fixtures)
    }
  }

  if (!hits.length) return null

  hits.sort((a, b) => b.score - a.score)
  const topScore = hits[0].score
  const winners = hits.filter((h) => h.score === topScore)

  const picked = pickFixtureWinnerFromTie(winners, isoDate, explicitWeek)
  if (!picked) return null

  const win = picked.winner
  const alternateWeeks = picked.alternateWeeks ?? [Number(win.week)]
  return {
    sectionId: win.sectionId ?? null,
    divisionId: win.divisionId,
    week: win.week,
    matchDateIso: win.diaryDate || '',
    scheduleHome: win.scheduleHome,
    scheduleAway: win.scheduleAway,
    score: win.score,
    ...(alternateWeeks.length > 1 ? { alternateWeeks } : {}),
  }
}

function resolveScheduleSides(league, sectionId, divisionId, week, teamA, teamB) {
  const fixtures = getDivisionFixtures(league, {
    sectionId: sectionId || null,
    divisionId,
  })
  const weekFx = fixtures.find((w) => Number(w.week) === Number(week))
  if (!weekFx) {
    return { scheduleHome: teamA, scheduleAway: teamB, onSchedule: false }
  }
  for (const m of weekFx.matches ?? []) {
    if (m?.isBye || !m?.away) continue
    const pair = new Set([m.home, m.away])
    if (pair.has(teamA) && pair.has(teamB)) {
      return { scheduleHome: m.home, scheduleAway: m.away, onSchedule: true }
    }
  }
  return { scheduleHome: teamA, scheduleAway: teamB, onSchedule: false }
}

/**
 * Stash a CSV result row so the admin can fix league/division/week before saving.
 * @param {{ csvRow: number, issues: string[], leagueId: string, sectionId: string|null, divisionId: string, week: number|null, home: string, away: string, matchPartial?: object|null }} p
 */
export function buildFixturePendingEntry({
  csvRow,
  issues,
  leagueId,
  sectionId,
  divisionId,
  week,
  home,
  away,
  matchPartial,
  registrationNeedsReview = false,
}) {
  const uniq = [...new Set((issues ?? []).filter(Boolean))]
  const m = matchPartial && typeof matchPartial === 'object' ? matchPartial : {}
  const ph = Array.isArray(m.players?.home) ? m.players.home : []
  const pa = Array.isArray(m.players?.away) ? m.players.away : []
  return {
    csvRow,
    pendingIssues: uniq.length ? uniq : ['Complete missing fields below, then save.'],
    pendingSave: true,
    leagueId: leagueId ? String(leagueId) : '',
    sectionId: sectionId ?? null,
    divisionId: divisionId ? String(divisionId).toLowerCase() : '',
    week: Number.isFinite(week) ? week : null,
    scheduleHome: home ?? '',
    scheduleAway: away ?? '',
    registrationNeedsReview: Boolean(registrationNeedsReview),
    homeShots: Number.isFinite(m.homeShots) ? m.homeShots : undefined,
    awayShots: Number.isFinite(m.awayShots) ? m.awayShots : undefined,
    homePoints: Number.isFinite(m.homePoints) ? m.homePoints : undefined,
    awayPoints: Number.isFinite(m.awayPoints) ? m.awayPoints : undefined,
    matchDateIso: m.matchDate || '',
    homePlayersPreview: playersPreview(ph),
    awayPlayersPreview: playersPreview(pa),
    homePlayersText: ph.length ? ph.join('; ') : '',
    awayPlayersText: pa.length ? pa.join('; ') : '',
    rinkShotsJson:
      Array.isArray(m.rinkShots) && m.rinkShots.length ? JSON.stringify(m.rinkShots) : '',
  }
}

export function executeCsvImport(buffer, defaults = {}) {
  const warnings = []
  const pendingFixtures = []
  const text = Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer ?? '')
  const lines = splitCsvRecords(text)

  if (lines.length < 2) {
    return {
      ok: false,
      errors: ['CSV needs a header row and at least one data row'],
      warnings,
      batches: [],
      entries: [],
      fixtureRows: [],
      roster: { entries: [], playersAdded: 0, duplicatesSkipped: 0 },
      pendingFixtures: [],
    }
  }

  const headerCells = parseCsvLine(lines[0]).map(mapHeader)

  /** @type {{ leagueId?: string, sectionId?: string }} */
  const def = {
    leagueId: String(defaults.leagueId ?? defaults.defaultLeagueId ?? '').trim(),
    sectionId: String(defaults.sectionId ?? defaults.defaultSectionId ?? '').trim(),
  }

  /** @type {Map<string, object[]>} */
  const batches = new Map()
  /** @type {{ leagueId: string, sectionKey: string, teamName: string, playerName: string }[]} */
  const rosterAdds = []

  /** @type {object[]} — one row per saved result once import succeeds */
  const importEntries = []
  /** @type Map<string, object[]> same keys as `batches` Map */
  const snapshotsByBatchKey = new Map()

  for (let r = 1; r < lines.length; r += 1) {
    const rowIndex = r + 1 /* 1-based for humans */
    let cells = parseCsvLine(lines[r])
    if (cells.length === 1 && cells[0] === '') continue

    while (cells.length > headerCells.length && cells.at(-1) === '') cells.pop()
    while (cells.length < headerCells.length) cells.push('')
    if (cells.length !== headerCells.length) {
      warnings.push(
        `Row ${rowIndex}: column mismatch — queued for manual review (${cells.length} vs ${headerCells.length} columns).`,
      )
      pendingFixtures.push(
        buildFixturePendingEntry({
          csvRow: rowIndex,
          issues: [
            `Found ${cells.length} columns — expected ${headerCells.length} (check commas).`,
          ],
          leagueId: def.leagueId,
          sectionId: def.sectionId ? def.sectionId : null,
          divisionId: '',
          week: null,
          home: '',
          away: '',
          matchPartial: null,
          registrationNeedsReview: false,
        }),
      )
      continue
    }
    const raw = rowToObject(headerCells, cells)

    const type = String(raw.type || 'result').trim().toLowerCase() || 'result'

    if (type === 'player') {
      const leagueIdP = String(raw.league_id || def.leagueId || '').trim()
      let sectionKey =
        raw.section_id != null && String(raw.section_id).trim() !== ''
          ? String(raw.section_id).trim()
          : def.sectionId || ''
      const teamName = String(raw.team || '').trim()
      const playerName = String(raw.player || '').trim()

      if (!leagueIdP) {
        warnings.push(`Row ${rowIndex} (player): missing league_id — skipped`)
        continue
      }
      if (!teamName) {
        warnings.push(`Row ${rowIndex} (player): missing team — skipped`)
        continue
      }
      if (!playerName) {
        warnings.push(`Row ${rowIndex} (player): missing player — skipped`)
        continue
      }

      if (!sectionKey) {
        try {
          const lg = loadLeague(leagueIdP)
          const inf = inferSectionForLeague(lg, '')
          if (inf.error && (lg.sections?.length ?? 0) > 1) {
            warnings.push(`Row ${rowIndex} (player): ${inf.error} — skipped`)
            continue
          }
          sectionKey = inf.sectionId || '_'
          if (inf.inferred && sectionKey && sectionKey !== '_') {
            warnings.push(`Row ${rowIndex} (player): inferred roster section "${sectionKey}"`)
          }
        } catch (e) {
          warnings.push(`Row ${rowIndex} (player): ${e.message} — skipped`)
          continue
        }
      }

      rosterAdds.push({
        leagueId: leagueIdP,
        sectionKey,
        teamName,
        playerName,
      })
      continue
    }

    if (type !== 'result') {
      warnings.push(`Row ${rowIndex}: skipped unknown record type "${type}"`)
      continue
    }

    const leagueId = String(raw.league_id || def.leagueId || '').trim()
    let divisionCandidate = String(raw.division_id || '').trim().toLowerCase()
    /** @type {Set<string>} */
    const issueSet = new Set()

    const homeRaw = String(raw.home || '').trim()
    const awayRaw = String(raw.away || '').trim()
    if (!homeRaw || !awayRaw) issueSet.add('home and away team names required')

    const isoFromCsv = parseFlexibleDateToIso(firstNonempty(raw.match_date))
    const weekExplicitRaw = String(raw.week ?? '').trim()
    const weekExplicit = weekExplicitRaw === '' ? NaN : Number(weekExplicitRaw)

    const hpRaw = firstNonempty(raw.home_points)
    const apRaw = firstNonempty(raw.away_points)
    const hp = parseNum(hpRaw)
    const ap = parseNum(apRaw)

    const homeShotsCell = firstNonempty(
      raw.home_shots,
      raw.total_shots_home,
      raw.shots_home,
    )
    const awayShotsCell = firstNonempty(
      raw.away_shots,
      raw.total_shots_away,
      raw.shots_away,
    )
    const postponed =
      isPostponedMarker(homeShotsCell) ||
      isPostponedMarker(awayShotsCell) ||
      isPostponedMarker(firstNonempty(raw.status, raw.result_status, raw.match_status))
    const hs = parseNum(homeShotsCell)
    const as = parseNum(awayShotsCell)

    const hpProvided = hpRaw !== ''
    const apProvided = apRaw !== ''
    if (!postponed) {
      if (hpProvided && !hp.ok) issueSet.add('home_points must be numeric')
      if (apProvided && !ap.ok) issueSet.add('away_points must be numeric')
    }
    const shotsOk = postponed || (hs.ok && as.ok)
    if (!shotsOk) {
      issueSet.add('total match shots (home_shots and away_shots) must be numeric')
    }

    let league = null
    if (!leagueId) {
      issueSet.add('missing league_id (or choose default league in admin)')
    } else {
      try {
        league = loadLeague(leagueId)
      } catch (e) {
        issueSet.add(String(e.message))
      }
    }

    const csvSectionExplicit =
      raw.section_id != null && String(raw.section_id).trim() !== ''
        ? String(raw.section_id).trim()
        : ''

    let fixtureSlot = null
    if (league && homeRaw && awayRaw) {
      const hintSec = csvSectionExplicit || def.sectionId || ''

      function tryResolveSlot(hint) {
        return resolveFixtureSlotFromTeams(league, {
          hintSectionId: hint,
          csvHomeRaw: homeRaw,
          csvAwayRaw: awayRaw,
          isoDate: isoFromCsv || '',
          explicitWeek: weekExplicit,
        })
      }

      fixtureSlot = tryResolveSlot(hintSec)
      if (
        !fixtureSlot &&
        !csvSectionExplicit &&
        String(def.sectionId || '').trim() !== ''
      ) {
        fixtureSlot = tryResolveSlot('')
        if (fixtureSlot?.sectionId && fixtureSlot.sectionId !== String(def.sectionId).trim()) {
          warnings.push(
            `Row ${rowIndex}: matched this pairing in section "${fixtureSlot.sectionId}" (admin default "${String(def.sectionId).trim()}" has no such fixture — widen day in admin or set section_id in the CSV).`,
          )
        }
      }

      if (fixtureSlot?.alternateWeeks?.length) {
        warnings.push(
          `Row ${rowIndex}: this pairing appears in diary weeks ${fixtureSlot.alternateWeeks.join(', ')} — using week ${fixtureSlot.week}${
            fixtureSlot.matchDateIso ? ` (${fixtureSlot.matchDateIso})` : ''
          }. Add week or match_date to the CSV to pick a round.`,
        )
      }

      if (
        fixtureSlot &&
        !divisionCandidate &&
        (!csvSectionExplicit || csvSectionExplicit === fixtureSlot.sectionId)
      ) {
        warnings.push(
          `Row ${rowIndex}: matched "${homeRaw}" v "${awayRaw}" to diary — division "${fixtureSlot.divisionId}", week ${fixtureSlot.week}${
            fixtureSlot.matchDateIso ? ` (${fixtureSlot.matchDateIso})` : ''
          }.`,
        )
      }
    }

    let sectionId = ''
    if (league) {
      const sectionInf = inferSectionForLeague(league, csvSectionExplicit || def.sectionId || '')
      const multiSec = Boolean((league.sections?.length ?? 0) > 1)
      if (multiSec && sectionInf.error && fixtureSlot?.sectionId) {
        sectionId = fixtureSlot.sectionId
        warnings.push(
          `Row ${rowIndex}: inferred section "${sectionId}" from team names vs fixture diary (CSV had no section_id).`,
        )
      } else if (multiSec && sectionInf.error) {
        issueSet.add(sectionInf.error)
      } else {
        sectionId = sectionInf.sectionId
        if (sectionInf.inferred && sectionId) {
          warnings.push(`Row ${rowIndex}: inferred section "${sectionId}"`)
        }
      }
    }

    if (league && !csvSectionExplicit && fixtureSlot?.sectionId) {
      const slotSec = fixtureSlot.sectionId
      if (slotSec && sectionId !== slotSec) {
        if (sectionId) {
          warnings.push(
            `Row ${rowIndex}: using section "${slotSec}" from the scheduled pairing (was "${sectionId}" from admin default / inferred day).`,
          )
        }
        sectionId = slotSec
      }
    }

    if (!divisionCandidate && fixtureSlot) divisionCandidate = String(fixtureSlot.divisionId || '').trim().toLowerCase()

    let division = null
    if (league) {
      if (!divisionCandidate) {
        issueSet.add('missing division_id')
      } else {
        const got = getDivision(league, {
          sectionId: sectionId || null,
          divisionId: divisionCandidate,
        })
        division = got.division
        if (!division) issueSet.add(`division "${divisionCandidate}" not found`)
      }
    }

    let isoEffective = isoFromCsv
    if (!isoEffective && fixtureSlot?.matchDateIso) {
      isoEffective = fixtureSlot.matchDateIso
      warnings.push(`Row ${rowIndex}: inferred match_date from diary (${isoEffective}).`)
    }

    let weekResolved = null
    if (division && isoEffective) {
      weekResolved = resolveWeekFromFixtureDate(
        league,
        sectionId,
        divisionCandidate || '',
        isoEffective,
      )
    }

    let week = weekResolved ?? (Number.isFinite(weekExplicit) ? weekExplicit : NaN)

    if (division && isoFromCsv && weekResolved == null) {
      if (Number.isFinite(weekExplicit)) {
        warnings.push(
          `Row ${rowIndex}: match_date "${firstNonempty(raw.match_date)}" does not appear on fixtures — using week column (${weekExplicit}).`,
        )
      } else {
        issueSet.add(
          `match_date "${firstNonempty(raw.match_date)}" is not on the diary for this division`,
        )
      }
    }

    if (division && !isoFromCsv && isoEffective && weekResolved === null && !Number.isFinite(weekExplicit)) {
      warnings.push(
        `Row ${rowIndex}: using diary date ${isoEffective} from fixture lookup (CSV had no match_date).`,
      )
    }

    const weekIssueMsg =
      'missing or invalid week — add week column or a match_date listed on fixtures'
    if (division && !Number.isFinite(week)) {
      issueSet.add(weekIssueMsg)
    }

    if (fixtureSlot && division && Number.isFinite(fixtureSlot.week) && !Number.isFinite(week)) {
      issueSet.delete(weekIssueMsg)
      week = fixtureSlot.week
      warnings.push(
        `Row ${rowIndex}: inferred week ${fixtureSlot.week} from scheduled pairing (team names mapped uniquely).`,
      )
    }

    if (
      division &&
      isoFromCsv &&
      Number.isFinite(weekExplicit) &&
      weekResolved != null &&
      weekExplicit !== weekResolved
    ) {
      warnings.push(
        `Row ${rowIndex}: week column says ${weekExplicit} but match_date (${isoFromCsv}) is scheduled as week ${weekResolved} — using week ${weekResolved}.`,
      )
    }

    let home = homeRaw
    let away = awayRaw
    if (division?.teams?.length && homeRaw && awayRaw) {
      const mh = fuzzyMatchTeam(homeRaw, division.teams)
      const ma = fuzzyMatchTeam(awayRaw, division.teams)
      home = mh || homeRaw
      away = ma || awayRaw
      if (!mh || !ma) {
        warnings.push(
          `Row ${rowIndex}: team name alignment uncertain — CSV "${homeRaw}" vs "${awayRaw}" (check spelling).`,
        )
      }
    }

    /** @type {object | null} */
    let builtPartial = null
    if (shotsOk && homeRaw && awayRaw) {
      if (postponed) {
        builtPartial = { home, away, postponed: true }
        if (isoEffective) builtPartial.matchDate = isoEffective
      } else {
        builtPartial = {
          home,
          away,
          homeShots: hs.val,
          awayShots: as.val,
        }
        if (isoEffective) builtPartial.matchDate = isoEffective
        if (Number.isFinite(hp.val) && Number.isFinite(ap.val)) {
          builtPartial.homePoints = hp.val
          builtPartial.awayPoints = ap.val
        }
        const homePlayers = playersFromRow(raw, 'home', rowIndex, warnings)
        const awayPlayers = playersFromRow(raw, 'away', rowIndex, warnings)
        if (homePlayers.length || awayPlayers.length) {
          builtPartial.players = { home: homePlayers, away: awayPlayers }
        }
        const rinks = rinkShotsFromRow(raw, rowIndex, warnings, builtPartial.homeShots, builtPartial.awayShots)
        if (rinks?.length) builtPartial.rinkShots = rinks
      }
    }

    let registrationNeedsReview = false
    if (builtPartial?.players && leagueId) {
      const hasNames =
        (builtPartial.players.home?.length ?? 0) > 0 ||
        (builtPartial.players.away?.length ?? 0) > 0
      if (hasNames) {
        const rv = validateMatchPlayersForCsvImport({
          leagueId,
          sectionId: sectionId || '',
          homeTeam: home,
          awayTeam: away,
          players: builtPartial.players,
        })
        registrationNeedsReview = rv.registrationNeedsReview
        for (const msg of rv.messages) {
          warnings.push(`Row ${rowIndex}: ${msg}`)
        }
      }
    }

    const blockingIssues = [...issueSet]

    const mustQueue =
      blockingIssues.length > 0 ||
      !leagueId ||
      !league ||
      !division ||
      !shotsOk ||
      !homeRaw ||
      !awayRaw ||
      !Number.isFinite(week)

    if (mustQueue) {
      pendingFixtures.push(
        buildFixturePendingEntry({
          csvRow: rowIndex,
          issues: blockingIssues,
          leagueId,
          sectionId: sectionId || null,
          divisionId: divisionCandidate || '',
          week: Number.isFinite(week) ? week : null,
          home,
          away,
          matchPartial: builtPartial,
          registrationNeedsReview,
        }),
      )
      continue
    }

    const isoDateEffective = isoEffective
    /** @type {object} — builtPartial validated same refs */
    const match = postponed
      ? {
          home,
          away,
          postponed: true,
          ...(isoDateEffective ? { matchDate: isoDateEffective } : {}),
        }
      : {
          home,
          away,
          homeShots: hs.val,
          awayShots: as.val,
        }
    if (!postponed) {
      if (isoDateEffective) match.matchDate = isoDateEffective
      if (Number.isFinite(hp.val) && Number.isFinite(ap.val)) {
        match.homePoints = hp.val
        match.awayPoints = ap.val
      }
      if (builtPartial?.players) match.players = builtPartial.players
      if (builtPartial?.rinkShots) match.rinkShots = builtPartial.rinkShots
    }

    const { scheduleHome, scheduleAway, onSchedule } = resolveScheduleSides(
      league,
      sectionId,
      divisionCandidate,
      week,
      home,
      away,
    )
    if (!onSchedule) {
      warnings.push(
        `Row ${rowIndex}: "${home}" v "${away}" did not match a week ${week} fixture in this division (saved — verify spelling / section_id).`,
      )
    }

    const batchKey = `${leagueId}\t${sectionId}\t${divisionCandidate}\t${week}`

    const rowSnapshot = {
      leagueId,
      sectionId: sectionId || null,
      divisionId: divisionCandidate,
      week: Number(week),
      csvRow: rowIndex,
      scheduleHome,
      scheduleAway,
      postponed: Boolean(postponed),
      homeShots: postponed ? undefined : match.homeShots,
      awayShots: postponed ? undefined : match.awayShots,
      homePoints: postponed ? undefined : match.homePoints,
      awayPoints: postponed ? undefined : match.awayPoints,
      matchDateIso: isoDateEffective || null,
      displayMatchDate:
        isoDateEffective && String(isoDateEffective).trim() !== ''
          ? formatFixtureDate(isoDateEffective) || isoDateEffective
          : '',
      homePlayersPreview: postponed ? '' : playersPreview(match.players?.home ?? []),
      awayPlayersPreview: postponed ? '' : playersPreview(match.players?.away ?? []),
      registrationNeedsReview,
    }

    importEntries.push(rowSnapshot)
    const snapList = snapshotsByBatchKey.get(batchKey) ?? []
    snapList.push(rowSnapshot)
    snapshotsByBatchKey.set(batchKey, snapList)
    const list = batches.get(batchKey) ?? []
    list.push(match)
    batches.set(batchKey, list)
  }

  /** @type {{ leagueId: string, sectionId: string, divisionId: string, week: number, matchCount: number }[]} */
  const applied = []

  /** @type {Set<string>} */
  const leaguesTouched = new Set()

  for (const [key, matches] of batches) {
    const [leagueId, sectionId, divisionId, weekStr] = key.split('\t')
    leaguesTouched.add(leagueId)
    let lg = loadLeague(leagueId)
    const res = mergeWeekResults(lg, {
      sectionId: sectionId || null,
      divisionId,
      week: Number(weekStr),
      matches,
    })
    saveLeague(leagueId, res.league)
    applied.push({
      leagueId,
      sectionId: sectionId || null,
      divisionId,
      week: Number(weekStr),
      matchCount: res.matchCount,
      fixtures: snapshotsByBatchKey.get(key) ?? [],
    })
  }

  let rosterOut = {
    attempted: rosterAdds.length,
    playersAdded: 0,
    duplicatesSkipped: 0,
  }
  if (rosterAdds.length) {
    rosterOut = { ...mergeRosterBatch(rosterAdds), attempted: rosterAdds.length }
    clearRegisteredPlayersCache()
  }

  return {
    ok: true,
    errors: [],
    warnings,
    batches: applied,
    entries: importEntries,
    fixtureRows: importEntries,
    pendingFixtures,
    roster: rosterOut,
  }
}
