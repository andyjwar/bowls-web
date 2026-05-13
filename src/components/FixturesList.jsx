import { useId } from 'react'
import { formatFixtureDate } from '../lib/fixtures'
import { FixtureMatch } from './FixtureMatch'

export function FixturesList({ fixtureWeeks, teamFilter, onTeamFilterChange, teams }) {
  const selectId = useId()

  return (
    <div className="fixtures-panel">
      <div className="fixtures-panel__toolbar">
        <label className="team-filter" htmlFor={selectId}>
          Filter by team
        </label>
        <select
          id={selectId}
          className="team-filter__select"
          value={teamFilter}
          onChange={(e) => onTeamFilterChange(e.target.value)}
        >
          <option value="">All teams</option>
          {teams.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      <div className="fixtures-list">
        {fixtureWeeks.length === 0 ? (
          <p className="fixtures-empty">No fixtures match this filter.</p>
        ) : (
          fixtureWeeks.map((week) => (
            <section key={week.week} className="fixture-week">
              <h3 className="fixture-week__heading">
                Week {week.week}
                {week.date ? (
                  <span className="fixture-week__date">
                    {formatFixtureDate(week.date)}
                  </span>
                ) : null}
              </h3>
              <ul className="fixture-week__matches">
                {week.matches.map((match, i) => (
                  <li key={`${week.week}-${i}`} className="fixture-week__match">
                    <FixtureMatch match={match} variant="row" />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  )
}
