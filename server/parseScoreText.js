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
  return overlap / Math.max(ta.size, tb.size, 1)
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
