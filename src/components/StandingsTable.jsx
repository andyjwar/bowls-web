import { Link } from 'react-router-dom'
import { displayStat } from '../lib/standings'

function shotsCell(value, played) {
  return played === 0 ? '—' : String(value)
}

export function StandingsTable({ rows }) {
  return (
    <div className="standings-panel">
      <div className="table-scroll">
        <table className="standings-table">
          <thead>
            <tr>
              <th scope="col" className="standings-table__pos">
                #
              </th>
              <th scope="col">Team</th>
              <th scope="col" className="standings-table__num">
                P
              </th>
              <th scope="col" className="standings-table__num">
                For
              </th>
              <th scope="col" className="standings-table__num">
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
                <td className="standings-table__num">
                  {displayStat(row.played, row.played)}
                </td>
                <td className="standings-table__num">
                  {shotsCell(row.shotsFor ?? 0, row.played)}
                </td>
                <td className="standings-table__num">
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
  )
}
