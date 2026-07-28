import { Link } from 'react-router-dom'
import { displayStat } from '../lib/standings'
import { StandingsActions } from './StandingsActions'

function shotsCell(value, played) {
  return played === 0 ? '—' : String(value)
}

export function StandingsTable({ rows, context }) {
  const printedAt = new Date().toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return (
    <div className="standings-export">
      <div className="standings-export__toolbar">
        <StandingsActions rows={rows} context={context} />
      </div>
      <header className="standings-print-head">
        <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" />
        <div>
          <h1>{[context.leagueName, context.sectionLabel, context.divisionLabel].filter(Boolean).join(' · ')}</h1>
          <p>League table as at {printedAt}</p>
        </div>
      </header>
      <div className="standings-panel">
        <div className="table-scroll">
          <table className="standings-table">
          <thead>
            <tr>
              <th scope="col" className="standings-table__pos">
                #
              </th>
              <th scope="col">Team</th>
              <th scope="col" className="standings-table__num standings-table__played">
                P
              </th>
              <th scope="col" className="standings-table__num standings-table__shots">
                For
              </th>
              <th scope="col" className="standings-table__num standings-table__shots">
                Against
              </th>
              <th scope="col" className="standings-table__num standings-table__pts">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.team}>
                <td className="standings-table__pos">
                  <span className="standings-table__pos-badge">{index + 1}</span>
                </td>
                <td className="standings-table__team">
                  <Link
                    className="standings-table__team-link"
                    to={{ search: `?tab=matches&team=${encodeURIComponent(row.team)}` }}
                  >
                    {row.team}
                  </Link>
                </td>
                <td className="standings-table__num standings-table__played">
                  {displayStat(row.played, row.played)}
                </td>
                <td className="standings-table__num standings-table__shots">
                  {shotsCell(row.shotsFor ?? 0, row.played)}
                </td>
                <td className="standings-table__num standings-table__shots">
                  {shotsCell(row.shotsAgainst ?? 0, row.played)}
                </td>
                <td className="standings-table__num standings-table__pts">
                  {displayStat(row.points, row.played)}
                </td>
              </tr>
            ))}
          </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
