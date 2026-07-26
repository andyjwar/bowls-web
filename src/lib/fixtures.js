const BYE = 'Bye'

function teamAt(teams, slot) {
  const name = teams[slot - 1]
  return name ?? `Team ${slot}`
}

function isByeName(name) {
  return name === BYE
}

/**
 * Resolve one schedule row for a division's team list.
 * @param {{ week: number, date?: string, pairings: { home: number, away: number }[] }} row
 * @param {string[]} teams
 * @returns {{ week: number, date: string | undefined, matches: object[] }}
 */
export function resolveFixtureWeek(row, teams) {
  const matches = []

  for (const { home, away } of row.pairings ?? []) {
    const homeName = teamAt(teams, home)
    const awayName = teamAt(teams, away)
    const homeBye = isByeName(homeName)
    const awayBye = isByeName(awayName)

    if (homeBye && awayBye) continue

    if (homeBye || awayBye) {
      matches.push({
        home: homeBye ? awayName : homeName,
        away: null,
        isBye: true,
      })
    } else {
      matches.push({ home: homeName, away: awayName, isBye: false })
    }
  }

  return { week: row.week, date: row.date, matches }
}

/**
 * Build full fixture list for a division.
 * @param {object[]} scheduleTemplate
 * @param {string[]} teams
 * @param {(row: object) => string | undefined} [getDate] optional date resolver per row
 */
export function buildDivisionFixtures(scheduleTemplate, teams, getDate) {
  return (scheduleTemplate ?? []).map((row) => {
    const date = getDate ? getDate(row) : row.date
    const week = resolveFixtureWeek({ ...row, date }, teams)
    return week
  })
}

/**
 * Filter fixture weeks to those involving a team name (case-insensitive).
 */
export function filterFixturesByTeam(fixtureWeeks, teamName) {
  if (!teamName) return fixtureWeeks
  const needle = teamName.toLowerCase()
  return fixtureWeeks
    .map((week) => ({
      ...week,
      matches: week.matches.filter(
        (m) =>
          m.home.toLowerCase() === needle ||
          (m.away && m.away.toLowerCase() === needle),
      ),
    }))
    .filter((week) => week.matches.length > 0)
}

export function formatFixtureDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T12:00:00`)
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * Next fixture week on or after today, otherwise the first week.
 */
export function getUpcomingFixtureWeek(fixtureWeeks) {
  if (!fixtureWeeks?.length) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const upcoming = fixtureWeeks.find((week) => {
    if (!week.date) return false
    const d = new Date(`${week.date}T12:00:00`)
    return d >= today
  })

  return upcoming ?? fixtureWeeks[0]
}

/**
 * Index used with {@link #getLastWeekFixture} / {@link #getNextWeekFixture}: first dated week ≥ today,
 * otherwise 0 (same fallback as {@link #getUpcomingFixtureWeek}).
 */
export function getUpcomingFixtureWeekIndex(fixtureWeeks) {
  if (!fixtureWeeks?.length) return -1

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const idx = fixtureWeeks.findIndex((week) => {
    if (!week.date) return false
    const d = new Date(`${week.date}T12:00:00`)
    return d >= today
  })

  if (idx >= 0) return idx
  return 0
}

/** Completed / prior round on the schedule (week before upcoming), or null. */
export function getLastWeekFixture(fixtureWeeks) {
  const up = getUpcomingFixtureWeekIndex(fixtureWeeks)
  if (up <= 0) return null
  return fixtureWeeks[up - 1] ?? null
}

/** Round that is next on the diary (aligned with legacy “Upcoming fixtures”). */
export function getNextWeekFixture(fixtureWeeks) {
  const up = getUpcomingFixtureWeekIndex(fixtureWeeks)
  if (up < 0) return null
  return fixtureWeeks[up] ?? null
}

/**
 * Split schedule into completed rounds (before upcoming) vs upcoming-and-later rounds,
 * using {@link #getUpcomingFixtureWeekIndex} (same boundary as league snapshot panels).
 * @returns {{ completed: typeof fixtureWeeks, upcoming: typeof fixtureWeeks }}
 */
export function splitFixtureWeeksCompletedAndUpcoming(fixtureWeeks) {
  const full = fixtureWeeks ?? []
  if (!full.length) return { completed: [], upcoming: [] }
  const up = getUpcomingFixtureWeekIndex(full)
  return {
    completed: up > 0 ? full.slice(0, up) : [],
    upcoming: full.slice(up),
  }
}

export { BYE }
