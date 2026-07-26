function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9&'\s-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function nameScore(a, b) {
  const na = normalizeName(a)
  const nb = normalizeName(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  const ta = new Set(na.split(' '))
  const tb = new Set(nb.split(' '))
  let overlap = 0
  for (const w of ta) if (tb.has(w) && w.length > 2) overlap += 1
  const tokenScore = overlap / Math.max(ta.size, tb.size, 1)
  const ca = na.replace(/\s/g, '')
  const cb = nb.replace(/\s/g, '')
  const wholeDist = levDistance(ca, cb)
  const wholeMax = Math.max(ca.length, cb.length, 1)
  const wholeSimilarity = 1 - wholeDist / wholeMax
  const wholeBoost = wholeSimilarity >= 0.82 ? Math.min(1, wholeSimilarity + 0.05) : wholeSimilarity * 0.8
  return Math.max(tokenScore, wholeBoost)
}

/** Levenshtein distance (bounded string length for CSV team typos). */
function levDistance(a, b) {
  const m = a.length
  const n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1))
  for (let i = 0; i <= m; i += 1) dp[i][0] = i
  for (let j = 0; j <= n; j += 1) dp[0][j] = j
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    }
  }
  return dp[m][n]
}

export function fuzzyMatchTeam(text, teams) {
  let best = null
  let bestScore = 0
  for (const team of teams) {
    if (team === 'Bye') continue
    const score = nameScore(text, team)
    if (score > bestScore) {
      bestScore = score
      best = team
    }
  }
  return bestScore >= 0.45 ? best : null
}

export function extractShotsFromLine(line) {
  const m = line.match(/(\d{1,3})\s*[-–—:]\s*(\d{1,3})/)
  if (m) return { homeShots: Number(m[1]), awayShots: Number(m[2]) }
  const nums = [...line.matchAll(/\b(\d{1,3})\b/g)].map((x) => Number(x[1]))
  if (nums.length >= 2) return { homeShots: nums[0], awayShots: nums[1] }
  return null
}

export function parseScoreSheetText(rawText, teams, expectedMatches = []) {
  const lines = String(rawText ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const suggestions = []

  for (const line of lines) {
    const shots = extractShotsFromLine(line)
    if (!shots) continue

    let home = null
    let away = null

    for (const exp of expectedMatches) {
      if (exp.isBye) continue
      const homeHit = line.toLowerCase().includes(exp.home.toLowerCase().slice(0, 6))
      const awayHit = line.toLowerCase().includes(exp.away.toLowerCase().slice(0, 6))
      if (homeHit && awayHit) {
        home = exp.home
        away = exp.away
        break
      }
    }

    if (!home || !away) {
      const parts = line.split(/\s+[-–—:v]\s+/i)
      if (parts.length >= 2) {
        home = fuzzyMatchTeam(parts[0], teams)
        away = fuzzyMatchTeam(parts[1], teams)
      }
    }

    if (home && away) {
      suggestions.push({ home, away, ...shots, sourceLine: line })
    }
  }

  if (suggestions.length === 0 && expectedMatches.length > 0) {
    return expectedMatches
      .filter((m) => !m.isBye)
      .map((m) => ({
        home: m.home,
        away: m.away,
        homeShots: '',
        awayShots: '',
        sourceLine: '',
      }))
  }

  return suggestions
}
