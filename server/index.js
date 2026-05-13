import express from 'express'
import session from 'express-session'
import multer from 'multer'
import cors from 'cors'
import { timingSafeEqual } from 'crypto'
import {
  getDivision,
  getDivisionFixtures,
  listLeagues,
  loadLeague,
  mergeWeekResults,
  saveLeague,
} from './leagueStore.js'
import { extractTextFromUpload } from './ocr.js'
import { parseScoreSheetText, fuzzyMatchTeam } from './parseScoreText.js'
import { identifyTargetFromText } from './detectTarget.js'
import { parseSamfordResultsForm, isSamfordResultsForm } from './parseSamfordForm.js'
import { validateFormPlayers } from './validatePlayers.js'
import { structuredToSamfordHints } from './visionExtract.js'

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

const PORT = Number(process.env.ADMIN_PORT || 3001)
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
  res.json({ leagues: listLeagues() })
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
      const samfordLeague = loadLeague('samford-2026')
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
        leagueId = leagueId || 'samford-2026'
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
