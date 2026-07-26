/**
 * Client-side fixture list exports: iCalendar (.ics) and spreadsheet (.csv).
 *
 * fixtureWeeks shape:
 *   [{ week, date (ISO), matches: [{ home, away, played, homeWon, awayWon,
 *      homePoints, awayPoints, homeShots, awayShots, isBye }] }]
 */

/** Big score shown elsewhere in the app: league points if finite, else shots. */
function scorePair(match) {
  const hasPoints =
    Number.isFinite(match.homePoints) && Number.isFinite(match.awayPoints)
  const hasShots =
    Number.isFinite(match.homeShots) && Number.isFinite(match.awayShots)
  if (hasPoints) return [match.homePoints, match.awayPoints]
  if (hasShots) return [match.homeShots, match.awayShots]
  return [null, null]
}

/** 'Samford Division A' → 'samford-division-a' */
export function slugify(parts) {
  return parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Base filename (no extension) from the export context. */
export function exportFileName(context = {}) {
  const slug = slugify([
    context.leagueName,
    context.sectionLabel,
    context.divisionLabel,
    context.teamFilter,
  ])
  return `${slug || 'matches'}-fixtures`
}

/* ---------------------------------------------------------------- iCal --- */

/** RFC 5545 TEXT escaping: backslash, semicolon, comma, newline. */
function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/** '2026-04-13' → '20260413' */
function icsDate(isoDate) {
  return isoDate.replace(/-/g, '')
}

/** ISO date + n days, as a compact ics date. */
function icsDatePlusDays(isoDate, days) {
  const d = new Date(`${isoDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

function icsTimestampNow() {
  return `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`
}

/**
 * Build an iCalendar file (string) with one all-day VEVENT per non-bye match
 * that has a date. Works for both iPhone (Apple Calendar) and Android
 * (Google Calendar) via file import.
 */
export function buildIcs(fixtureWeeks, context = {}) {
  const contextLabel = [
    context.leagueName,
    context.sectionLabel,
    context.divisionLabel,
  ]
    .filter(Boolean)
    .join(' — ')
  const slug = exportFileName(context)
  const dtstamp = icsTimestampNow()

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bowls Web//Fixtures//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]
  if (contextLabel) {
    lines.push(`X-WR-CALNAME:${escapeIcsText(`${contextLabel} fixtures`)}`)
  }

  for (const week of fixtureWeeks ?? []) {
    if (!week.date) continue
    week.matches.forEach((match, i) => {
      if (match.isBye) return
      const description = [
        contextLabel,
        `Week ${week.week}`,
        context.teamFilter ? `${context.teamFilter} fixture` : null,
      ]
        .filter(Boolean)
        .join('\n')
      lines.push(
        'BEGIN:VEVENT',
        `UID:${slug}-w${week.week}-m${i}-${icsDate(week.date)}@bowls-web`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${icsDate(week.date)}`,
        `DTEND;VALUE=DATE:${icsDatePlusDays(week.date, 1)}`,
        `SUMMARY:${escapeIcsText(`${match.home} v ${match.away}`)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        'END:VEVENT',
      )
    })
  }

  lines.push('END:VCALENDAR')
  return `${lines.join('\r\n')}\r\n`
}

/* ----------------------------------------------------------------- CSV --- */

function csvField(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

/**
 * Build a CSV (string, with UTF-8 BOM) of the fixture list. Columns:
 * Week, Date, Home, Home Score, Away Score, Away — plus Venue and Result
 * from the selected team's perspective when a team filter is active.
 */
export function buildCsv(fixtureWeeks, { teamFilter = '' } = {}) {
  const single = Boolean(teamFilter)
  const header = single
    ? ['Week', 'Date', 'Home', 'Home Score', 'Away Score', 'Away', 'Venue', 'Result']
    : ['Week', 'Date', 'Home', 'Home Score', 'Away Score', 'Away']

  const rows = [header]
  for (const week of fixtureWeeks ?? []) {
    for (const match of week.matches) {
      if (match.isBye) continue
      const [homeScore, awayScore] = scorePair(match)
      const played = match.played && homeScore != null && awayScore != null
      const row = [
        week.week,
        week.date ?? '',
        match.home,
        played ? homeScore : '',
        played ? awayScore : '',
        match.away,
      ]
      if (single) {
        const isHome = match.home === teamFilter
        const won = isHome ? match.homeWon : match.awayWon
        const draw = played && !match.homeWon && !match.awayWon
        row.push(isHome ? 'Home' : 'Away')
        row.push(!played ? '' : draw ? 'D' : won ? 'W' : 'L')
      }
      rows.push(row)
    }
  }

  return `\uFEFF${rows.map((row) => row.map(csvField).join(',')).join('\r\n')}\r\n`
}

/* ------------------------------------------------------------ download --- */

/** Trigger a browser download of a generated text file. */
export function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
