import { displayStat, formatShotDiff } from '../lib/standings'

export function StandingsTable({ rows, divisionLabel }) {
  return (
    <div className="standings-panel">
      <h2 className="standings-panel__title">
        {divisionLabel ? `${divisionLabel} — Table` : 'League table'}
      </h2>
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
                W
              </th>
              <th scope="col" className="standings-table__num">
                D
              </th>
              <th scope="col" className="standings-table__num">
                L
              </th>
              <th scope="col" className="standings-table__num">
                +/−
              </th>
              <th scope="col" className="standings-table__num standings-table__pts">
                Pts
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.team}>
                <td className="standings-table__pos">{index + 1}</td>
                <td className="standings-table__team">{row.team}</td>
                <td className="standings-table__num">
                  {displayStat(row.played, row.played)}
                </td>
                <td className="standings-table__num">
                  {displayStat(row.won, row.played)}
                </td>
                <td className="standings-table__num">
                  {displayStat(row.drawn, row.played)}
                </td>
                <td className="standings-table__num">
                  {displayStat(row.lost, row.played)}
                </td>
                <td className="standings-table__num">
                  {row.played === 0 ? '—' : formatShotDiff(row.shotDiff)}
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
