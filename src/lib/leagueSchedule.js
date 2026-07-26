/**
 * Schedule-derived facts about a league document: which ISO dates it plays on,
 * which weekdays those fall on, and how many divisions it has.
 * Used by the home poster tiles and the day carousel.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEK_ORDER = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }

const DATE_KEYS = ['date', 'tuesdayDate', 'thursdayDate']

function datesFromTemplate(rows) {
  const out = []
  for (const row of rows ?? []) {
    for (const key of DATE_KEYS) {
      if (row[key]) out.push(row[key])
    }
  }
  return out
}

/** All scheduled ISO dates for a league document (deduped, sorted). */
export function collectLeagueDates(doc) {
  if (!doc) return []
  const dates = Array.isArray(doc.sections)
    ? doc.sections.flatMap((s) => datesFromTemplate(s.scheduleTemplate))
    : datesFromTemplate(doc.scheduleTemplate)
  return [...new Set(dates)].sort()
}

/** Weekday labels (Mon-first order) a league plays on, e.g. ['Mon', 'Wed']. */
export function playDayLabels(dates) {
  const seen = new Set()
  for (const iso of dates) {
    const d = new Date(`${iso}T12:00:00`)
    if (!Number.isNaN(d.getTime())) seen.add(DAY_LABELS[d.getDay()])
  }
  return [...seen].sort((a, b) => WEEK_ORDER[a] - WEEK_ORDER[b])
}

/** Total division count across sections (or flat divisions). */
export function countDivisions(doc) {
  if (!doc) return 0
  if (Array.isArray(doc.sections)) {
    return doc.sections.reduce(
      (n, s) => n + (Array.isArray(s.divisions) ? s.divisions.length : 0),
      0,
    )
  }
  return Array.isArray(doc.divisions) ? doc.divisions.length : 0
}

const FULL_DAY_NAMES = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
}

/**
 * Full-word play days: "Monday & Wednesday" for ['Mon', 'Wed'], "Wednesday"
 * for a single day; three or more joined with ' · '.
 */
export function formatPlayDaysFull(days) {
  if (!days?.length) return null
  const full = days.map((d) => FULL_DAY_NAMES[d] ?? d)
  return full.length <= 2 ? full.join(' & ') : full.join(' · ')
}

/** "Samford League 2026" -> "Samford"; keeps names without the suffix intact. */
export function shortLeagueName(label) {
  if (!label) return ''
  return (
    label
      .replace(/\s*league\s*/i, ' ')
      .replace(/\s*\d{4}\s*$/, '')
      .trim() || label
  )
}

/** Local YYYY-MM-DD for a Date. */
export function toISODate(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
