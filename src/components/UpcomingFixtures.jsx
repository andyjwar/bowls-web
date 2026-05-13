import { formatFixtureDate } from '../lib/fixtures'
import { FixtureMatch } from './FixtureMatch'

export function UpcomingFixtures({ fixtureWeeks }) {
  const week = fixtureWeeks?.[0] ?? null

  if (!week) {
    return (
      <div className="upcoming-fixtures">
        <h2 className="tile-title">Upcoming Fixtures</h2>
        <p className="fixtures-empty">No fixtures scheduled.</p>
      </div>
    )
  }

  return (
    <div className="upcoming-fixtures">
      <h2 className="tile-title">Upcoming Fixtures</h2>
      <p className="upcoming-fixtures__week">
        Week {week.week}
        {week.date ? (
          <span className="upcoming-fixtures__date">{formatFixtureDate(week.date)}</span>
        ) : null}
      </p>
      <div className="upcoming-fixtures__grid">
        {week.matches.map((match, i) => (
          <FixtureMatch key={`${week.week}-${i}`} match={match} variant="card" />
        ))}
      </div>
    </div>
  )
}
