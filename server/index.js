import express from 'express'
import session from 'express-session'
import multer from 'multer'
import cors from 'cors'
import { timingSafeEqual } from 'crypto'
import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  activeLeagueIdByPrefix,
  deleteLeague,
  getDivision,
  getDivisionFixtures,
  getWeekEditableMatchRows,
  listKnownSeasons,
  listLeagues,
  loadLeague,
  mergeWeekResults,
  persistLeaguesNav,
  removeSeason,
  saveLeague,
  startNewSeason,
  updateDivisionTeamNames,
  updateScheduleDates,
  updateLeagueStructureLabels,
  addLeagueDivision,
  deleteLeagueDivision,
  addLeagueSection,
  createLeagueFromClone,
} from './leagueStore.js'
import { extractTextFromUpload } from './ocr.js'
import { parseScoreSheetText, fuzzyMatchTeam } from './parseScoreText.js'
import { identifyTargetFromText } from './detectTarget.js'
import { parseSamfordResultsForm, isSamfordResultsForm } from './parseSamfordForm.js'
import { validateFormPlayers } from './validatePlayers.js'
import { structuredToSamfordHints } from './visionExtract.js'
import { executeCsvImport } from './csvImport.js'
import { loadRegisteredPlayers, setTeamRegisteredPlayers, seedRosterClubsFromLeague } from './rosterStore.js'
import { parseRosterFromText, parseRosterUploadBuffer } from './rosterUploadParse.js'
import { addFormSubmission, loadFormSubmissions } from './formsStore.js'
import {
  createCompetition,
  createSeasonCompetitionsFile,
  deleteCompetition,
  deleteSeasonCompetitionsFile,
  loadCompetitions,
  replaceCompetitionDraw,
  seasonCupsHaveResults,
  updateCompetitionRounds,
} from './competitionsStore.js'
import { getActiveSeason, setActiveSeason } from './siteConfigStore.js'
import { isGitSyncEnabled, pullDataFromGitHub, scheduleDataPush } from './gitSync.js'

function mergeVisionHints(samfordForm, hints) {
  if (!hints) return samfordForm
  const base = samfordForm ?? {
    formType: 'samford-monday',
    sectionId: 'monday-evening',
    rinkShots: [],
    players: { home: [], away: [] },
  }
  return {
    ...base,
    home: hints.home ?? base.home,
    away: hints.away ?? base.away,
    divisionId: hints.divisionId ?? base.divisionId,
    matchDate: hints.matchDate ?? base.matchDate,
    homePoints: hints.homePoints ?? base.homePoints,
    awayPoints: hints.awayPoints ?? base.awayPoints,
    homeShots: hints.homeShots ?? base.homeShots,
    awayShots: hints.awayShots ?? base.awayShots,
    players: {
      home: hints.players?.home?.length ? hints.players.home : base.players?.home ?? [],
      away: hints.players?.away?.length ? hints.players.away : base.players?.away ?? [],
    },
    visionConfidence: hints.visionConfidence ?? base.visionConfidence,
  }
}

function resolveImportTarget(reqBody, rawText) {
  let { leagueId, sectionId, divisionId, week } = reqBody ?? {}
  let detection = null

  if (!leagueId || !divisionId || !week) {
    detection = identifyTargetFromText(rawText)
    if (detection) {
      leagueId = leagueId || detection.leagueId
      sectionId = sectionId || detection.sectionId || ''
      divisionId = divisionId || detection.divisionId
      week = week || String(detection.week)
    }
  }

  return { leagueId, sectionId, divisionId, week, detection }
}

// Render (and most hosts) assign the port via PORT; ADMIN_PORT is the local-dev override.
const PORT = Number(process.env.PORT || process.env.ADMIN_PORT || 3001)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme'
const SESSION_SECRET = process.env.SESSION_SECRET || 'bowls-dev-secret-change-me'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf'
    cb(ok ? null : new Error('Only images and PDF files are allowed'), ok)
  },
})

const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase()
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      file.mimetype === 'text/plain' ||
      name.endsWith('.csv')
    cb(ok ? null : new Error('Upload a .csv file'), ok)
  },
})

const rosterListUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase()
    const mt = (file.mimetype || '').toLowerCase()
    const extOk = /\.(csv|txt|xlsx|xls)$/i.test(name)
    const ok =
      extOk ||
      name.endsWith('.csv') ||
      name.endsWith('.txt') ||
      name.endsWith('.xlsx') ||
      name.endsWith('.xls') ||
      mt.includes('csv') ||
      mt.includes('text/plain') ||
      mt.includes('spreadsheet') ||
      mt.includes('excel') ||
      mt.includes('officedocument') ||
      (mt === 'application/octet-stream' && extOk)
    cb(ok ? null : new Error('Upload a .csv, .txt, or Excel .xlsx / .xls file'), ok)
  },
})

function optionalRosterListFile(req, res, next) {
  const ct = req.headers['content-type'] || ''
  if (ct.includes('multipart/form-data')) {
    rosterListUpload.single('file')(req, res, (err) => {
      if (err) {
        res.status(400).json({ ok: false, error: err.message || 'Upload failed' })
        return
      }
      next()
    })
  } else {
    next()
  }
}

function safePasswordMatch(given) {
  const a = Buffer.from(String(given ?? ''))
  const b = Buffer.from(ADMIN_PASSWORD)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function requireAuth(req, res, next) {
  if (req.session?.admin) return next()
  res.status(401).json({ error: 'Unauthorized' })
}

const app = express()

// Render terminates HTTPS at its proxy; without this, secure session cookies
// are never set in production.
app.set('trust proxy', 1)

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
)
app.use(express.json({ limit: '1mb' }))
app.use(
  session({
    name: 'bowls.admin.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 12 * 60 * 60 * 1000,
    },
  }),
)

// After any successful admin save, push the changed data files to GitHub.
// No-op unless GITHUB_TOKEN is set (i.e. only on the hosted server); a push
// that finds nothing changed in public/data does nothing.
app.use('/api/admin', (req, res, next) => {
  if (req.method !== 'GET') {
    res.on('finish', () => {
      const isAuthRoute = req.path === '/login' || req.path === '/logout'
      if (res.statusCode < 300 && !isAuthRoute) scheduleDataPush()
    })
  }
  next()
})

app.get('/api/admin/session', (req, res) => {
  res.json({ authenticated: Boolean(req.session?.admin) })
})

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body ?? {}
  if (!safePasswordMatch(password)) {
    res.status(401).json({ error: 'Invalid password' })
    return
  }
  req.session.admin = true
  res.json({ ok: true })
})

app.post('/api/admin/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true })
  })
})

app.get('/api/admin/leagues', requireAuth, (_req, res) => {
  res.json({
    leagues: listLeagues(),
    activeSeason: getActiveSeason(),
    seasons: listKnownSeasons(),
  })
})

/**
 * Create a draft season: clone active leagues (+dates shifted) and a fresh
 * cups file. It remains private until the setup walkthrough explicitly
 * publishes it by switching the active season.
 */
app.post('/api/admin/season', requireAuth, (req, res) => {
  try {
    const year = Number(req.body?.year)
    const fromSeason = getActiveSeason()
    const out = startNewSeason(year, req.body?.structure)
    const cups = createSeasonCompetitionsFile(fromSeason, year)
    persistLeaguesNav()
    res.json({ ok: true, ...out, cups, activeSeason: fromSeason, draftSeason: year })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not start the season' })
  }
})

/** Remove a season started by mistake — refused once anything has results. */
app.delete('/api/admin/season/:year', requireAuth, (req, res) => {
  try {
    const year = Number(req.params.year)
    if (seasonCupsHaveResults(year)) {
      res.status(400).json({
        error: `The ${year} cups already have results entered — the season can't be removed`,
      })
      return
    }
    const out = removeSeason(year)
    deleteSeasonCompetitionsFile(year)
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not remove the season' })
  }
})

/** Point the public site at a different existing season (reversible). */
app.put('/api/admin/active-season', requireAuth, (req, res) => {
  try {
    const year = Number(req.body?.year)
    if (!listKnownSeasons().includes(year)) {
      res.status(400).json({ error: 'No leagues exist for that season' })
      return
    }
    setActiveSeason(year)
    persistLeaguesNav()
    res.json({ ok: true, activeSeason: year })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not switch season' })
  }
})

app.post('/api/admin/leagues', requireAuth, (req, res) => {
  try {
    const { leagueId, name, cloneFromLeagueId } = req.body ?? {}
    const out = createLeagueFromClone({
      leagueId,
      name,
      cloneFromLeagueId,
    })
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not create league' })
  }
})

app.get('/api/admin/league/:leagueId', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.params.leagueId ?? '').trim()
    const league = loadLeague(leagueId)
    res.json({ ok: true, league })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Unknown league' })
  }
})

app.put('/api/admin/league/:leagueId/division-teams', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.params.leagueId ?? '').trim()
    const { sectionId, divisionId, teams } = req.body ?? {}
    if (!divisionId) {
      res.status(400).json({ error: 'divisionId is required' })
      return
    }
    if (!Array.isArray(teams)) {
      res.status(400).json({ error: 'teams must be an array of names' })
      return
    }
    updateDivisionTeamNames(leagueId, {
      sectionId: sectionId ? String(sectionId).trim() : null,
      divisionId: String(divisionId).trim().toLowerCase(),
      teams,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Save failed' })
  }
})

/** Unregister a league (data file stays on disk). */
app.delete('/api/admin/league/:leagueId', requireAuth, (req, res) => {
  try {
    const out = deleteLeague(String(req.params.leagueId ?? '').trim())
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not remove the league' })
  }
})

/** Edit fixture dates on a day's schedule grid (pairings untouched). */
app.put('/api/admin/league/:leagueId/schedule-dates', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.params.leagueId ?? '').trim()
    const { sectionId, rows } = req.body ?? {}
    updateScheduleDates(leagueId, {
      sectionId: sectionId ? String(sectionId).trim() : null,
      rows,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Save failed' })
  }
})

app.put('/api/admin/league/:leagueId/labels', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.params.leagueId ?? '').trim()
    const body = req.body ?? {}
    updateLeagueStructureLabels(leagueId, {
      leagueName: body.leagueName,
      sectionId: body.sectionId != null ? String(body.sectionId).trim() : '',
      sectionLabel: body.sectionLabel,
      divisionId: body.divisionId != null ? String(body.divisionId).trim().toLowerCase() : '',
      divisionLabel: body.divisionLabel,
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Save failed' })
  }
})

app.post('/api/admin/league/:leagueId/divisions', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.params.leagueId ?? '').trim()
    const { sectionId, divisionId, label, playDay } = req.body ?? {}
    const out = addLeagueDivision(leagueId, {
      sectionId: sectionId != null ? String(sectionId).trim() : '',
      divisionId: divisionId != null ? String(divisionId).trim() : '',
      label,
      playDay,
    })
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not add division' })
  }
})

app.delete('/api/admin/league/:leagueId/divisions/:divisionId', requireAuth, (req, res) => {
  try {
    const out = deleteLeagueDivision(String(req.params.leagueId ?? '').trim(), {
      sectionId: req.query.sectionId ? String(req.query.sectionId).trim() : null,
      divisionId: String(req.params.divisionId ?? '').trim(),
    })
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not remove the division' })
  }
})

app.post('/api/admin/league/:leagueId/sections', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.params.leagueId ?? '').trim()
    const { sectionId, label, cloneScheduleFromSectionId } = req.body ?? {}
    const out = addLeagueSection(leagueId, {
      sectionId,
      label,
      cloneScheduleFromSectionId,
    })
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not add section' })
  }
})

app.get('/api/admin/registered-players', requireAuth, (_req, res) => {
  res.json({ ok: true, roster: loadRegisteredPlayers() })
})

app.put('/api/admin/registered-players/team', requireAuth, (req, res) => {
  try {
    const { leagueId, sectionId, teamName, players } = req.body ?? {}
    const lid = String(leagueId ?? '').trim()
    if (!lid) {
      res.status(400).json({ error: 'leagueId is required' })
      return
    }
    const tn = String(teamName ?? '').trim()
    if (!tn) {
      res.status(400).json({ error: 'teamName is required' })
      return
    }
    const sid = String(sectionId ?? '').trim() || '_'
    const out = setTeamRegisteredPlayers(lid, sid, tn, players)
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Save failed' })
  }
})

app.post('/api/admin/registered-players/seed-league', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.body?.leagueId ?? '').trim()
    if (!leagueId) {
      res.status(400).json({ error: 'leagueId is required' })
      return
    }
    const out = seedRosterClubsFromLeague(leagueId)
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Seed failed' })
  }
})

app.post(
  '/api/admin/registered-players/parse-upload',
  requireAuth,
  optionalRosterListFile,
  (req, res) => {
    try {
      if (req.file?.buffer) {
        const names = parseRosterUploadBuffer(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
        )
        res.json({ ok: true, names, count: names.length })
        return
      }
      const text = req.body?.text
      if (typeof text !== 'string') {
        res.status(400).json({
          ok: false,
          error: 'Upload a file (field name "file") or send JSON { "text": "..." }',
        })
        return
      }
      if (text.length > 800_000) {
        res.status(400).json({ ok: false, error: 'Pasted text is too long (max ~800k characters)' })
        return
      }
      const names = parseRosterFromText(text)
      res.json({ ok: true, names, count: names.length })
    } catch (e) {
      res.status(400).json({ ok: false, error: e.message || 'Could not read that list' })
    }
  },
)

app.get('/api/admin/week-results', requireAuth, (req, res) => {
  try {
    const leagueId = String(req.query?.leagueId ?? '').trim()
    const divisionId = String(req.query?.divisionId ?? '').trim().toLowerCase()
    const weekRaw = req.query?.week
    const sectionId = String(req.query?.sectionId ?? '').trim()
    if (!leagueId || !divisionId || weekRaw === '' || weekRaw === undefined) {
      res.status(400).json({ error: 'leagueId, divisionId and week query params are required' })
      return
    }
    const league = loadLeague(leagueId)
    const payload = getWeekEditableMatchRows(league, {
      sectionId: sectionId || null,
      divisionId,
      week: weekRaw,
    })
    res.json({ ok: true, ...payload })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not load week results' })
  }
})

app.post('/api/admin/import', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err.message || 'Upload failed' })
      return
    }
    next()
  })
}, async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' })
      return
    }

    const { rawText, method, warning, ocrMeta, structured } = await extractTextFromUpload(
      req.file.buffer,
      req.file.mimetype,
    )

    const visionHints = structuredToSamfordHints(structured)

    let leagueId = req.body?.leagueId
    let sectionId = req.body?.sectionId || ''
    let divisionId = req.body?.divisionId
    let week = req.body?.week
    let detection = null
    let samfordForm = null
    let playerValidation = null

    if (isSamfordResultsForm(rawText) || visionHints) {
      const samfordLeagueId = activeLeagueIdByPrefix('samford') ?? 'samford-2026'
      const samfordLeague = loadLeague(samfordLeagueId)
      const mondayTeams =
        samfordLeague.sections
          ?.find((s) => s.id === 'monday-evening')
          ?.divisions.flatMap((d) => d.teams) ?? []
      const prelimTeams = []
      if (leagueId && divisionId) {
        const lg = loadLeague(leagueId)
        const { division } = getDivision(lg, { sectionId: sectionId || null, divisionId })
        if (division) prelimTeams.push(...division.teams)
      }
      samfordForm = parseSamfordResultsForm(
        rawText,
        prelimTeams.length ? prelimTeams : mondayTeams,
      )
      samfordForm = mergeVisionHints(samfordForm, visionHints)

      if (samfordForm) {
        leagueId = leagueId || samfordLeagueId
        sectionId = sectionId || samfordForm.sectionId || 'monday-evening'
        divisionId = divisionId || samfordForm.divisionId || null

        if (samfordForm.matchDate || divisionId) {
          const league = loadLeague(leagueId)
          const fixtures = getDivisionFixtures(league, {
            sectionId: sectionId || null,
            divisionId: divisionId || samfordForm.divisionId,
          })
          if (samfordForm.matchDate) {
            const hit = fixtures.find((w) => w.date === samfordForm.matchDate)
            if (hit) week = String(hit.week)
          }
          if (!week && divisionId && samfordForm.home && samfordForm.away) {
            for (const fixtureWeek of fixtures) {
              const pairing = fixtureWeek.matches?.find(
                (m) =>
                  !m.isBye &&
                  ((m.home === samfordForm.home && m.away === samfordForm.away) ||
                    (m.home === samfordForm.away && m.away === samfordForm.home)),
              )
              if (pairing) {
                week = String(fixtureWeek.week)
                break
              }
            }
          }
        }
      }
    }

    const resolved = resolveImportTarget(
      { leagueId, sectionId, divisionId, week },
      rawText,
    )
    leagueId = resolved.leagueId
    sectionId = resolved.sectionId
    divisionId = resolved.divisionId
    week = resolved.week
    detection = resolved.detection ?? detection

    if (!leagueId || !divisionId || !week) {
      const partialSuggestions = samfordForm?.home
        ? [
            {
              home: samfordForm.home,
              away: samfordForm.away ?? '',
              homePoints: samfordForm.homePoints ?? '',
              awayPoints: samfordForm.awayPoints ?? '',
              homeShots: samfordForm.homeShots ?? '',
              awayShots: samfordForm.awayShots ?? '',
              players: samfordForm.players,
            },
          ]
        : []
      res.status(422).json({
        error:
          'Could not identify the league and division from this upload. Select them manually and try again.',
        rawText,
        method,
        warning,
        ocrMeta,
        detection,
        samfordForm,
        suggestions: partialSuggestions,
      })
      return
    }

    const league = loadLeague(leagueId)
    const { division } = getDivision(league, { sectionId: sectionId || null, divisionId })
    if (!division) {
      res.status(404).json({ error: 'Division not found' })
      return
    }

    const fixtures = getDivisionFixtures(league, {
      sectionId: sectionId || null,
      divisionId,
    })
    const weekFixtures = fixtures.find((w) => String(w.week) === String(week))
    const expectedMatches = weekFixtures?.matches ?? []

    const suggestions = parseScoreSheetText(rawText, division.teams, expectedMatches)

    if (isSamfordResultsForm(rawText)) {
      const refined = parseSamfordResultsForm(rawText, division.teams)
      if (refined) samfordForm = refined
    }

    let formMatch = null
    if (samfordForm?.home && samfordForm?.away) {
      const home = fuzzyMatchTeam(samfordForm.home, division.teams) ?? samfordForm.home
      const away = fuzzyMatchTeam(samfordForm.away, division.teams) ?? samfordForm.away
      formMatch = {
        home,
        away,
        homeShots: samfordForm.homeShots ?? '',
        awayShots: samfordForm.awayShots ?? '',
        homePoints: samfordForm.homePoints ?? '',
        awayPoints: samfordForm.awayPoints ?? '',
        players: samfordForm.players,
        sourceLine: 'Samford results form',
      }
      playerValidation = validateFormPlayers({
        leagueId,
        sectionId: sectionId || samfordForm.sectionId,
        homeTeam: home,
        awayTeam: away,
        players: samfordForm.players,
      })
    }

    const finalSuggestions = formMatch ? [formMatch] : suggestions

    res.json({
      rawText,
      method,
      warning,
      ocrMeta,
      suggestions: finalSuggestions,
      samfordForm,
      playerValidation,
      expectedMatches: expectedMatches.filter((m) => !m.isBye),
      detection,
      target: {
        leagueId,
        sectionId: sectionId || null,
        divisionId,
        week: Number(week),
      },
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Import failed' })
  }
})

app.post('/api/admin/import-csv', requireAuth, (req, res, next) => {
  csvUpload.single('file')(req, res, (err) => {
    if (err) {
      res.status(400).json({ ok: false, error: err.message || 'Upload failed' })
      return
    }
    next()
  })
}, (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: 'No file uploaded' })
      return
    }
    const defaultLeagueId = String(req.body?.defaultLeagueId ?? '').trim()
    const defaultSectionId = String(req.body?.defaultSectionId ?? '').trim()
    const result = executeCsvImport(req.file.buffer, {
      leagueId: defaultLeagueId,
      sectionId: defaultSectionId,
    })
    if (!result.ok) {
      res.status(400).json({
        ok: false,
        errors: result.errors,
        warnings: result.warnings,
        pendingFixtures: result.pendingFixtures ?? [],
      })
      return
    }
    res.json({
      ok: true,
      warnings: result.warnings,
      batches: result.batches,
      entries: result.entries ?? result.fixtureRows ?? [],
      fixtureRows: result.fixtureRows ?? result.entries ?? [],
      pendingFixtures: result.pendingFixtures ?? [],
      roster: result.roster,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || 'CSV import failed' })
  }
})

/* ── Public form submissions (no auth — this is the website's fillable forms) ── */

const FORM_TYPES = {
  'player-transfer': {
    required: ['playerName', 'fromClub', 'toClub', 'contact'],
  },
  'weekly-results': {
    required: [
      'league',
      'division',
      'matchDate',
      'homeTeam',
      'awayTeam',
      'rinkScores',
      'homeTotal',
      'awayTotal',
      'submittedBy',
      'contact',
    ],
  },
  'cup-results': {
    required: [
      'cup',
      'round',
      'matchDate',
      'homeTeam',
      'awayTeam',
      'homeScore',
      'awayScore',
      'submittedBy',
      'contact',
    ],
  },
  'competitions-entry': {
    required: ['entrantName', 'club', 'contact', 'competitions'],
  },
  'player-registration': {
    required: ['league', 'team', 'players', 'secretaryName', 'contact'],
  },
  'league-application': {
    required: ['clubName', 'section', 'contactName', 'contact'],
  },
}

app.post('/api/forms/:formType', (req, res) => {
  try {
    const formType = String(req.params.formType ?? '').trim()
    const spec = FORM_TYPES[formType]
    if (!spec) {
      res.status(404).json({ error: 'Unknown form' })
      return
    }
    const raw = req.body?.fields
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      res.status(400).json({ error: 'fields object is required' })
      return
    }
    const fields = {}
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k).slice(0, 60)
      const val = String(v ?? '').trim().slice(0, 2000)
      if (val) fields[key] = val
    }
    const missing = spec.required.filter((k) => !fields[k])
    if (missing.length) {
      res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` })
      return
    }
    const record = addFormSubmission(formType, fields)
    res.json({ ok: true, id: record.id })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not save the form' })
  }
})

app.get('/api/admin/form-submissions', requireAuth, (_req, res) => {
  try {
    const submissions = [...loadFormSubmissions()].sort((a, b) =>
      String(b.submittedAt).localeCompare(String(a.submittedAt)),
    )
    res.json({ ok: true, submissions })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not load submissions' })
  }
})

app.get('/api/admin/competitions', requireAuth, (_req, res) => {
  try {
    const doc = loadCompetitions()
    res.json({ ok: true, competitions: doc.competitions ?? [] })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Could not load competitions' })
  }
})

/** Add a knockout cup to the active season (empty draw). */
app.post('/api/admin/competitions', requireAuth, (req, res) => {
  try {
    const competition = createCompetition({
      name: req.body?.name,
      days: req.body?.days,
    })
    res.json({ ok: true, competition })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not create the competition' })
  }
})

app.put('/api/admin/competition/:compId', requireAuth, (req, res) => {
  try {
    const compId = String(req.params.compId ?? '').trim()
    const competition = updateCompetitionRounds(compId, req.body?.rounds)
    res.json({ ok: true, competition })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Save failed' })
  }
})

/** Replace a cup's whole draw (round structure). Refused once results exist. */
app.put('/api/admin/competition/:compId/draw', requireAuth, (req, res) => {
  try {
    const compId = String(req.params.compId ?? '').trim()
    const competition = replaceCompetitionDraw(compId, req.body?.rounds)
    res.json({ ok: true, competition })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Save failed' })
  }
})

/** Remove a cup from the season. Refused once results exist. */
app.delete('/api/admin/competition/:compId', requireAuth, (req, res) => {
  try {
    const out = deleteCompetition(String(req.params.compId ?? '').trim())
    res.json({ ok: true, ...out })
  } catch (e) {
    res.status(400).json({ error: e.message || 'Could not remove the competition' })
  }
})

app.post('/api/admin/results', requireAuth, (req, res) => {
  try {
    const { leagueId, sectionId, divisionId, week, matches } = req.body ?? {}
    if (!leagueId || !divisionId || !week || !Array.isArray(matches)) {
      res.status(400).json({ error: 'leagueId, divisionId, week and matches are required' })
      return
    }

    let league = loadLeague(leagueId)
    const result = mergeWeekResults(league, {
      sectionId: sectionId || null,
      divisionId,
      week,
      matches,
    })
    league = result.league
    saveLeague(leagueId, league)

    res.json({
      ok: true,
      savedWeek: result.savedWeek,
      matchCount: result.matchCount,
      standings: result.standings,
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Save failed' })
  }
})

// ---------------------------------------------------------------------------
// Static site hosting (used on Render, harmless in local dev where Vite serves
// the frontend on its own port).
// ---------------------------------------------------------------------------
const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST_DIR = join(__dirname, '../dist')
const PUBLIC_DATA_DIR = join(__dirname, '../public/data')

// Serve /data from public/data ahead of dist/: admin saves write to
// public/data, and the copy baked into dist/ at build time goes stale.
app.use('/data', express.static(PUBLIC_DATA_DIR))

if (existsSync(join(DIST_DIR, 'index.html'))) {
  app.use(express.static(DIST_DIR))
  // SPA fallback so refreshing /admin, /leagues etc. still loads the app.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(join(DIST_DIR, 'index.html'))
  })
}

// On hosts with an ephemeral disk the checked-out data files may be stale
// (they're whatever was on the branch at build time) — pull the latest
// committed data before accepting any traffic.
if (isGitSyncEnabled()) {
  try {
    await pullDataFromGitHub()
  } catch (e) {
    console.error(`[git-sync] Startup pull failed: ${e.message}`)
    // Editing (and later pushing) stale data is worse than not starting.
    process.exit(1)
  }
}

const server = app.listen(PORT, () => {
  console.log(`Bowls admin API listening on http://localhost:${PORT}`)
})

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Stop the other admin API process (lsof -i :${PORT}) and retry.`,
    )
    process.exit(1)
  }
  throw err
})
