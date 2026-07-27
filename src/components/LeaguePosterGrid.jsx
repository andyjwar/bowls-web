import { Link } from 'react-router-dom'
import { colorForLeague } from '../lib/leagueColors'
import { shortLeagueName, formatPlayDaysFull } from '../lib/leagueSchedule'

/** One flat colour block: name (sub line under it), bold days on the bottom
    row level with the arrow. */
export function PosterTile({ to, color, foreground, name, days, sub }) {
  return (
    <Link
      to={to}
      className="poster"
      style={{ '--poster-color': color, '--poster-foreground': foreground }}
    >
      <span className="poster__name">{name}</span>
      <span className="poster__sub">{sub || '\u00a0'}</span>
      <span className="poster__days">{days || '\u00a0'}</span>
      <svg
        className="poster__arrow"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 10h11M10.5 4.5L16 10l-5.5 5.5" />
      </svg>
    </Link>
  )
}

/**
 * Poster tiles for the leagues nav — colours assigned by nav order.
 */
export function LeaguePosterGrid({ items, summaries }) {
  return (
    <div className="poster-grid">
      {items.map((league, index) => {
        const summary = summaries[league.id]
        const palette = colorForLeague(league.id, index)
        return (
          <PosterTile
            key={league.id}
            to={`/leagues/${encodeURIComponent(league.id)}`}
            color={palette.color}
            foreground={palette.foreground}
            name={shortLeagueName(league.label)}
            days={formatPlayDaysFull(summary?.playDays)}
          />
        )
      })}
    </div>
  )
}
