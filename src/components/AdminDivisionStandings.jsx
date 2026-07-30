import { useMemo, useState } from 'react'
import { computeStandingsFromResults } from '../lib/results'
import { displayStat } from '../lib/standings'
import { buildDivisionFixtures } from '../lib/fixtures'

function formatAdj(delta) {
  if (!delta) return ''
  return delta > 0 ? `+${delta}` : String(delta)
}

/**
 * Admin league table for one division, with per-team displayed-points editing.
 * Stores a delta on the division so future match results still count.
 */
export function AdminDivisionStandings({
  leagueId,
  sectionId,
  scheduleTemplate,
  division,
  getDate,
  admin,
  onSaved,
}) {
  const [editingTeam, setEditingTeam] = useState(null)
  const [draft, setDraft] = useState('')
  const [msg, setMsg] = useState(null)

  const standings = useMemo(() => {
    if (!division) return []
    const bare = buildDivisionFixtures(scheduleTemplate, division.teams, getDate)
    const scheduledWeekKeys = new Set(bare.map((w) => String(w.week)))
    return computeStandingsFromResults(
      division.teams,
      division.results?.weeks ?? {},
      scheduledWeekKeys,
      division.standingsSeed ?? null,
      division.pointsAdjustments ?? null,
    )
  }, [division, scheduleTemplate, getDate])

  if (!division || standings.length === 0) return null

  function startEdit(row) {
    setEditingTeam(row.team)
    setDraft(String(row.points))
    setMsg(null)
  }

  async function save(row) {
    const points = Number(draft)
    if (!Number.isFinite(points)) {
      setMsg({ kind: 'error', text: 'Enter a valid points total.' })
      return
    }
    try {
      await admin.saveTeamPoints(leagueId, {
        sectionId: sectionId || null,
        divisionId: division.id,
        team: row.team,
        points,
      })
      setEditingTeam(null)
      setMsg({
        kind: 'ok',
        text:
          points === row.matchPoints
            ? `Cleared adjustment for ${row.team}.`
            : `Saved ${points} pts for ${row.team} (${formatAdj(points - row.matchPoints)} vs results).`,
      })
      onSaved?.()
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Could not save points' })
    }
  }

  return (
    <section className="admin-standings">
      <div className="admin-standings__head">
        <h2 className="admin-standings__title">League table</h2>
        <p className="admin-standings__hint">
          Totals come from results. Use Edit points for end-of-season deductions (usually 4).
        </p>
      </div>
      <div className="table-scroll">
        <table className="standings-table admin-standings__table">
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
              <th scope="col" className="admin-standings__actions-col" />
            </tr>
          </thead>
          <tbody>
            {standings.map((row, index) => {
              const editing = editingTeam === row.team
              return (
                <tr key={row.team}>
                  <td className="standings-table__pos">
                    <span className="standings-table__pos-badge">{index + 1}</span>
                  </td>
                  <td className="standings-table__team">{row.team}</td>
                  <td className="standings-table__num">{displayStat(row.played, row.played)}</td>
                  <td className="standings-table__num">
                    {row.played === 0 ? '—' : row.shotsFor}
                  </td>
                  <td className="standings-table__num">
                    {row.played === 0 ? '—' : row.shotsAgainst}
                  </td>
                  <td className="standings-table__num standings-table__pts">
                    {editing ? (
                      <span className="admin-standings__edit">
                        <input
                          className="admin-standings__input"
                          type="number"
                          step="0.5"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          aria-label={`Points for ${row.team}`}
                        />
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost admin-standings__mini"
                          onClick={() => setDraft(String(row.matchPoints - 4))}
                        >
                          -4
                        </button>
                      </span>
                    ) : (
                      <>
                        {displayStat(row.points, row.played)}
                        {row.pointsAdjustment ? (
                          <span className="standings-table__adj">
                            {' '}
                            ({formatAdj(row.pointsAdjustment)})
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="admin-standings__actions">
                    {editing ? (
                      <>
                        <button
                          type="button"
                          className="admin-btn"
                          disabled={admin.busy}
                          onClick={() => save(row)}
                        >
                          {admin.busy ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="admin-btn admin-btn--ghost"
                          onClick={() => {
                            setEditingTeam(null)
                            setMsg(null)
                          }}
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        onClick={() => startEdit(row)}
                      >
                        Edit points
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {msg ? (
        <p
          className={
            msg.kind === 'error' ? 'admin-standings__msg admin-standings__msg--error' : 'admin-standings__msg'
          }
        >
          {msg.text}
        </p>
      ) : null}
    </section>
  )
}
