import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { colorForLeague } from '../lib/leagueColors'
import { shortLeagueName, toISODate } from '../lib/leagueSchedule'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Monday of the week that should be shown for `today` (Mon–Fri strip). */
function weekStartMonday(today) {
  const d = new Date(today)
  const day = d.getDay()
  if (day === 0) {
    // Sunday → upcoming Monday
    d.setDate(d.getDate() + 1)
  } else if (day === 6) {
    // Saturday → upcoming Monday
    d.setDate(d.getDate() + 2)
  } else {
    d.setDate(d.getDate() - (day - 1))
  }
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

/**
 * Mon–Fri strip for the home "This week" section. Each day is tagged with
 * the league(s) that have matches that date. The current weekday shows
 * "Today" instead of Mon/Tue/…; weekends advance to the next Monday.
 */
export function DayCarousel({ items, summaries }) {
  const days = useMemo(() => {
    const byDate = new Map()
    items.forEach((league, index) => {
      const summary = summaries[league.id]
      if (!summary?.dates?.length) return
      const palette = colorForLeague(league.id, index)
      const tag = {
        id: league.id,
        name: shortLeagueName(league.label),
        color: palette.color,
        foreground: palette.foreground,
      }
      for (const iso of summary.dates) {
        if (!byDate.has(iso)) byDate.set(iso, [])
        const tags = byDate.get(iso)
        if (!tags.some((t) => t.id === tag.id)) tags.push(tag)
      }
    })

    if (byDate.size === 0) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = toISODate(today)

    let start = weekStartMonday(today)
    const weekHasMatches = (monday) => {
      for (let i = 0; i < 5; i++) {
        if (byDate.has(toISODate(addDays(monday, i)))) return true
      }
      return false
    }

    if (!weekHasMatches(start)) {
      const nextIso = [...byDate.keys()].sort().find((iso) => {
        const d = new Date(`${iso}T12:00:00`)
        const dow = d.getDay()
        return iso >= todayIso && dow >= 1 && dow <= 5
      })
      if (!nextIso) return null
      start = weekStartMonday(new Date(`${nextIso}T12:00:00`))
    }

    const cells = []
    for (let i = 0; i < 5; i++) {
      const d = addDays(start, i)
      const iso = toISODate(d)
      cells.push({
        iso,
        isToday: iso === todayIso,
        weekday: DAY_LABELS[d.getDay()],
        dayNum: d.getDate(),
        tags: byDate.get(iso) ?? [],
      })
    }
    return cells
  }, [items, summaries])

  if (!days) return null

  return (
    <div className="day-caro day-caro--weekdays" role="list" aria-label="Match days this week">
      {days.map((day) => (
        <div
          key={day.iso}
          className={`day-caro__cell${day.isToday ? ' day-caro__cell--today' : ''}`}
          role="listitem"
        >
          <span className="day-caro__weekday">{day.isToday ? 'Today' : day.weekday}</span>
          <span className="day-caro__num">{day.dayNum}</span>
          <span className="day-caro__tags">
            {day.tags.length === 0 ? (
              <span className="day-caro__none" aria-hidden="true">
                —
              </span>
            ) : (
              day.tags.map((tag) => (
                <Link
                  key={tag.id}
                  to={`/leagues/${encodeURIComponent(tag.id)}`}
                  className="day-caro__tag"
                  style={{
                    '--tag-color': tag.color,
                    '--tag-foreground': tag.foreground,
                  }}
                >
                  {tag.name}
                </Link>
              ))
            )}
          </span>
        </div>
      ))}
    </div>
  )
}
