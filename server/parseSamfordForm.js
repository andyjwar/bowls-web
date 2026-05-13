import { fuzzyMatchTeam } from './parseScoreText.js'
import { normalizeName, nameScore } from './detectTarget.js'

const SAMFORD_MARKERS = /samford\s+section|results\s+form\s*\(monday\)/i

export function isSamfordResultsForm(rawText) {
  return SAMFORD_MARKERS.test(String(rawText ?? ''))
}

function cleanOcrLine(line) {
  return String(line ?? '')
    .replace(/[|]/g, 'I')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDivisionLetter(text) {
  const m = text.match(/division\s*[:-]?\s*-?\s*([a-e1-5])\b/i)
  return m ? m[1].toLowerCase() : null
}

function parseMatchDate(text) {
  const labeled = text.match(
    /date\s+of\s+match\s*[:-]?\s*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]?\s*(\d{2,4})?/i,
  )
  if (labeled) {
    const day = Number(labeled[1])
    const month = Number(labeled[2])
    let year = labeled[3] ? Number(labeled[3]) : 2026
    if (year < 100) year += 2000
    if (day && month) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  const loose = text.match(/\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2})\b/)
  if (loose) {
    const day = Number(loose[1])
    const month = Number(loose[2])
    let year = Number(loose[3])
    if (year < 100) year += 2000
    if (day && month) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  return null
}

function extractClubField(text, labelPattern) {
  const re = new RegExp(
    `${labelPattern}\\s*[:-]?\\s*([^\\n]+?)(?=\\s+(?:visitors|result|print|home\\s+team|away\\s+team|$))`,
    'i',
  )
  const m = text.match(re)
  return m ? cleanOcrLine(m[1]) : null
}

function parseResultPoints(text) {
  const lineMatch = text.match(
    /result\s*:-\s*(\d{1,2})\s*points?[\s\S]{0,60}?result\s*:-\s*(\d{1,2})\s*points?/i,
  )
  if (lineMatch) {
    return { homePoints: Number(lineMatch[1]), awayPoints: Number(lineMatch[2]) }
  }
  const nums = [...text.matchAll(/\bresult\s*:-\s*(\d{1,2})\s*points?/gi)].map(
    (m) => Number(m[1]),
  )
  if (nums.length >= 2) return { homePoints: nums[0], awayPoints: nums[1] }
  return null
}

function parseTotalShots(text) {
  const m = text.match(
    /total\s+shots?\s*[:-]?\s*(\d{2,3})\s+(\d{2,3})/i,
  )
  if (m) return { homeShots: Number(m[1]), awayShots: Number(m[2]) }
  const loose = text.match(/total\s+shots?[\s\S]{0,40}?(\d{2,3})[^\d]{0,12}(\d{2,3})/i)
  if (loose) return { homeShots: Number(loose[1]), awayShots: Number(loose[2]) }
  const ocrLoose = text.match(/total\s+shots?[^\d]*(\d)[^\d]*(\d{2})[^\d]*(\d{2})/i)
  if (ocrLoose) {
    const home = Number(`${ocrLoose[1]}${ocrLoose[2]}`)
    const away = Number(ocrLoose[3])
    if (home >= 20 && away >= 20) return { homeShots: home, awayShots: away }
  }
  return null
}

function matchClubName(raw, teams) {
  if (!raw) return null
  const cleaned = cleanOcrLine(raw)
    .replace(/\//g, '')
    .replace(/\bv\b/gi, '')
    .replace(/^[-–—\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const direct = fuzzyMatchTeam(cleaned, teams)
  if (direct) return direct

  const normCleaned = normalizeName(cleaned)
  let bestTeam = null
  let bestScore = 0
  for (const team of teams) {
    if (team === 'Bye') continue
    const score = nameScore(cleaned, team)
    if (score > bestScore) {
      bestScore = score
      bestTeam = team
    }
    const normTeam = normalizeName(team)
    const teamTokens = normTeam.split(' ').filter((w) => w.length > 3)
    const hits = teamTokens.filter(
      (t) => normCleaned.includes(t) || nameScore(t, normCleaned) >= 0.6,
    )
    if (hits.length >= 1 && hits.length / teamTokens.length >= 0.4) {
      const tokenScore = hits.length / teamTokens.length
      if (tokenScore > bestScore) {
        bestScore = tokenScore
        bestTeam = team
      }
    }
  }
  if (bestScore >= 0.35 && bestTeam) return bestTeam

  if (/^hol\b/i.test(cleaned)) {
    const holbrook = teams.find((t) => /holbrook/i.test(t))
    if (holbrook) return holbrook
  }
  if (/swan/i.test(cleaned) || /waldr/i.test(cleaned) || /sens/i.test(cleaned)) {
    const swans = teams.find((t) => /waldringfield/i.test(t))
    if (swans) return swans
  }

  return cleaned || null
}

function parseRinkShots(text) {
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean)
  const rinkShots = []
  for (const line of lines) {
    const m = line.match(/^(.+?)\s+(\d{1,2})\s+(.+?)\s+(\d{1,2})$/)
    if (!m) continue
    const homeShots = Number(m[2])
    const awayShots = Number(m[4])
    if (homeShots > 30 || awayShots > 30) continue
    if (homeShots < 5 || awayShots < 5) continue
    rinkShots.push({ homeShots, awayShots, sourceLine: line })
  }
  return rinkShots
}

function looksLikePlayerName(token) {
  const t = cleanOcrLine(token)
  if (!t || t.length < 2) return false
  if (/^\d+$/.test(t)) return false
  if (/^(shots|home|away|team|total|note|signed)$/i.test(t)) return false
  return /[a-zA-Z]/.test(t)
}

function parsePlayerNames(text) {
  const lines = text.split(/\r?\n/).map(cleanOcrLine).filter(Boolean)
  const homePlayers = []
  const awayPlayers = []
  let inPlayerSection = false

  for (const line of lines) {
    if (/print\s+names|home\s+team.*away\s+team/i.test(line)) {
      inPlayerSection = true
      continue
    }
    if (/total\s+shots|signed|note\s*:-/i.test(line)) break
    if (!inPlayerSection) continue

    const rinkMatch = line.match(/^(.+?)\s+(\d{1,2})\s+(.+?)\s+(\d{1,2})$/)
    if (rinkMatch) {
      const homePart = rinkMatch[1]
      const awayPart = rinkMatch[3]
      for (const chunk of homePart.split(/\s{2,}|,/)) {
        if (looksLikePlayerName(chunk)) homePlayers.push(chunk.trim())
      }
      for (const chunk of awayPart.split(/\s{2,}|,/)) {
        if (looksLikePlayerName(chunk)) awayPlayers.push(chunk.trim())
      }
    }
  }

  return { homePlayers, awayPlayers }
}

/**
 * Parse a Samford Section Monday results form from OCR text.
 */
export function parseSamfordResultsForm(rawText, teams = []) {
  const text = String(rawText ?? '')
  if (!isSamfordResultsForm(text)) return null

  const homeRaw =
    extractClubField(text, 'home\\s+club') ??
    extractClubField(text, 'home\\s+cLuB') ??
    null
  const awayRaw = extractClubField(text, 'visitors?') ?? null

  const home = matchClubName(homeRaw, teams)
  const away = matchClubName(awayRaw, teams)

  const divisionLetter = parseDivisionLetter(text)
  const matchDate = parseMatchDate(text)
  const resultPoints = parseResultPoints(text)
  const totalShots = parseTotalShots(text)
  const rinkShots = parseRinkShots(text)
  const { homePlayers, awayPlayers } = parsePlayerNames(text)

  if (!totalShots && rinkShots.length >= 2) {
    const homeShots = rinkShots.reduce((s, r) => s + r.homeShots, 0)
    const awayShots = rinkShots.reduce((s, r) => s + r.awayShots, 0)
    return buildResult({
      home,
      away,
      divisionLetter,
      matchDate,
      resultPoints,
      totalShots: { homeShots, awayShots },
      rinkShots,
      homePlayers,
      awayPlayers,
      homeRaw,
      awayRaw,
    })
  }

  return buildResult({
    home,
    away,
    divisionLetter,
    matchDate,
    resultPoints,
    totalShots,
    rinkShots,
    homePlayers,
    awayPlayers,
    homeRaw,
    awayRaw,
  })
}

function buildResult(fields) {
  const {
    home,
    away,
    divisionLetter,
    matchDate,
    resultPoints,
    totalShots,
    rinkShots,
    homePlayers,
    awayPlayers,
    homeRaw,
    awayRaw,
  } = fields

  if (!home && !away && !totalShots) return null

  return {
    formType: 'samford-monday',
    sectionId: 'monday-evening',
    divisionId: divisionLetter,
    matchDate,
    home,
    away,
    homeRaw,
    awayRaw,
    homePoints: resultPoints?.homePoints ?? null,
    awayPoints: resultPoints?.awayPoints ?? null,
    homeShots: totalShots?.homeShots ?? null,
    awayShots: totalShots?.awayShots ?? null,
    rinkShots,
    players: {
      home: homePlayers,
      away: awayPlayers,
    },
  }
}

export { normalizeName, nameScore }
