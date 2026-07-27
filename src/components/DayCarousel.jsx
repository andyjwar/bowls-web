import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { colorForLeague } from '../lib/leagueColors'
import { shortLeagueName, toISODate } from '../lib/leagueSchedule'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * FotMob-style seven-day strip. Each day is tagged with the league(s) whose
 * schedule has matches that date; tags link to the league page. Starts today,
 * or jumps forward to the next match day if the coming week is empty.
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

    let start = new Date(today)
    const withinWeek = (iso) => {
      const d = new Date(`${iso}T12:00:00`)
      const diff = (d - today) / 86400000
      return diff >= 0 && diff < 7
    }
    if (![...byDate.keys()].some(withinWeek)) {
      const nextIso = [...byDate.keys()].sort().find((iso) => iso >= todayIso)
      if (!nextIso) return null
      start = new Date(`${nextIso}T12:00:00`)
      start.setHours(0, 0, 0, 0)
    }

    const cells = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
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
    <div className="day-caro" role="list" aria-label="Match days">
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
