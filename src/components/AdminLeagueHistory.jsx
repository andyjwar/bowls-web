import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildDivisionFixtures, formatFixtureDate } from '../lib/fixtures'
import { applyResultsToFixtures, formatMatchScore } from '../lib/results'
import { dateForPlayDay } from '../lib/leagueSchedule'

/** Every registered league serves its JSON at `/data/<id>.json`. */
function leagueDataPath(leagueId) {
  return leagueId
    ? `${import.meta.env.BASE_URL}data/${encodeURIComponent(leagueId)}.json`
    : null
}

/**
 * Fixtures merged with saved results for one division (mirrors useDivisionView).
 *
 * @param {object | null} leagueData
 * @param {string | null | undefined} sectionId
 * @param {string | null | undefined} divisionId
 */
function fixturesMergedForDivision(leagueData, sectionId, divisionId) {
  if (!leagueData || !divisionId) return { division: null, fixtures: [] }

  if (leagueData.sections) {
    const section = leagueData.sections.find((s) => s.id === sectionId)
    if (!section) return { division: null, fixtures: [] }
    const division = section.divisions.find((d) => d.id === divisionId)
    if (!division) return { division: null, fixtures: [] }

    const fixtures = applyResultsToFixtures(
      buildDivisionFixtures(section.scheduleTemplate, division.teams),
      division.results,
    )
    return { division, fixtures }
  }

  const division = leagueData.divisions?.find((d) => d.id === divisionId)
  if (!division) return { division: null, fixtures: [] }

  const getDate = (row) => dateForPlayDay(row, division.playDay)

  const fixtures = applyResultsToFixtures(
    buildDivisionFixtures(leagueData.scheduleTemplate, division.teams, getDate),
    division.results,
  )
  return { division, fixtures }
}

/**
 * Synthetic entry compatible with AdminFixtureEditorPanel — opened from league history.
 */
function leagueHistoryFixtureToEditorEntry(leagueId, sectionId, divisionId, weekNum, rowSynth, match) {
  /** @type {Record<string, unknown>} */
  const md = match.sheetMatchDate
  let isoRaw = ''
  if (typeof md === 'string') isoRaw = md.trim()
  const hp = Number(match.homePoints)
  const ap = Number(match.awayPoints)

  /** @param {string[] | undefined} list */
  const preview = (list) => {
    if (!Array.isArray(list) || !list.length) return ''
    const parts = []
    let len = 0
    for (const name of list) {
      const sep = parts.length ? 2 : 0
      if (len + sep + name.length > 120 && parts.length) break
      parts.push(name)
      len += sep + name.length
    }
    const rest = list.length - parts.length
    return rest > 0 ? `${parts.join('; ')} (+${rest} more)` : parts.join('; ')
  }

  return {
    source: 'league-history',
    leagueId,
    sectionId: sectionId || null,
    divisionId,
    week: weekNum,
    csvRow: rowSynth,
    scheduleHome: match.home,
    scheduleAway: match.away,
    homeShots: Number.isFinite(Number(match.homeShots)) ? Number(match.homeShots) : undefined,
    awayShots: Number.isFinite(Number(match.awayShots)) ? Number(match.awayShots) : undefined,
    homePoints: Number.isFinite(hp) ? hp : undefined,
    awayPoints: Number.isFinite(ap) ? ap : undefined,
    matchDateIso: isoRaw || null,
    displayMatchDate: '',
    homePlayersPreview: preview(match.players?.home),
    awayPlayersPreview: preview(match.players?.away),
  }
}

function PillRow({ ariaLabel, children }) {
  return (
    <nav className="admin-history-pills pill-nav" aria-label={ariaLabel}>
      <div className="pill-nav__scroll admin-history-pills__scroll">{children}</div>
    </nav>
  )
}

/** Week whose diary date is closest to today (by absolute days). Fallback: earliest week number. */
function pickWeekClosestToToday(fixtureWeeks) {
  if (!fixtureWeeks?.length) return null
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const dated = fixtureWeeks.filter((w) => w.date && String(w.date).trim())
  if (!dated.length) {
    return Number(fixtureWeeks[0].week)
  }
  let bestWeek = Number(dated[0].week)
  let bestDelta = Infinity
  for (const w of dated) {
    const t = new Date(`${w.date}T12:00:00`).getTime()
    const delta = Math.abs(t - today.getTime())
    if (delta < bestDelta) {
      bestDelta = delta
      bestWeek = Number(w.week)
    } else if (delta === bestDelta && Number(w.week) < bestWeek) {
      bestWeek = Number(w.week)
    }
  }
  return bestWeek
}

/**
 * Saved fixture history from league JSON (+ manual CSV jump).
 *
 * @param {{
 *   admin: object
 *   leagues: Array<{ id: string, name: string, sections?: object[], divisions?: object[] }>
 *   onEditFixture: (entry: object) => void
 *   onStoredDataChanged: () => void
 *   onManualUploadClick: () => void
 *   dataRevision: number
 * }} props
 */
export function AdminLeagueHistory({
  admin,
  leagues,
  onEditFixture,
  onStoredDataChanged,
  onManualUploadClick,
  dataRevision,
}) {
  const [hlLeagueId, setHlLeagueId] = useState('')
  const [hlSectionId, setHlSectionId] = useState('')
  const [hlDivisionId, setHlDivisionId] = useState('')
  const [payload, setPayload] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)

  const meta = useMemo(() => leagues.find((l) => l.id === hlLeagueId) ?? null, [leagues, hlLeagueId])

  const sectionList = meta?.sections ?? null
  const divisionList = useMemo(() => {
    if (!meta) return []
    if (sectionList && hlSectionId) {
      const sec = sectionList.find((s) => s.id === hlSectionId)
      return sec?.divisions ?? []
    }
    if (sectionList?.length) {
      const first = sectionList[0]
      return first?.divisions ?? []
    }
    return meta.divisions ?? []
  }, [meta, sectionList, hlSectionId])

  useEffect(() => {
    if (!leagues.length) return
    setHlLeagueId((id) => id || leagues[0].id)
  }, [leagues])

  useEffect(() => {
    if (!hlLeagueId || !meta) return
    if (sectionList?.length) {
      setHlSectionId((sid) => {
        if (sid && sectionList.some((s) => s.id === sid)) return sid
        return sectionList[0].id
      })
    } else {
      setHlSectionId('')
    }
  }, [hlLeagueId, meta, sectionList])

  useEffect(() => {
    if (!divisionList.length) {
      setHlDivisionId('')
      return
    }
    setHlDivisionId((did) => (did && divisionList.some((d) => d.id === did) ? did : divisionList[0].id))
  }, [divisionList, hlSectionId, hlLeagueId])

  const loadJson = useCallback(async () => {
    if (!hlLeagueId) {
      setPayload(null)
      setFetchError(null)
      setLoading(false)
      return
    }
    const path = leagueDataPath(hlLeagueId)
    if (!path) {
      setPayload(null)
      setFetchError('No data file mapped for this league.')
      setLoading(false)
      return
    }
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(path, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Could not load ${path}`)
      setPayload(await res.json())
    } catch (e) {
      setPayload(null)
      setFetchError(e?.message || 'Failed to load league data')
    } finally {
      setLoading(false)
    }
  }, [hlLeagueId])

  useEffect(() => {
    loadJson()
  }, [loadJson, dataRevision])

  const { division, fixtures } = useMemo(
    () => fixturesMergedForDivision(payload, hlSectionId || null, hlDivisionId || null),
    [payload, hlSectionId, hlDivisionId],
  )

  const weeksOrdered = useMemo(
    () => [...fixtures].sort((a, b) => Number(a.week) - Number(b.week)),
    [fixtures],
  )

  const defaultOpenWeek = useMemo(() => pickWeekClosestToToday(weeksOrdered), [weeksOrdered])

  const [openWeekNums, setOpenWeekNums] = useState(() => new Set())

  const panelResetKey = `${hlLeagueId}|${hlSectionId}|${hlDivisionId}|${dataRevision}`

  useEffect(() => {
    if (defaultOpenWeek != null && Number.isFinite(defaultOpenWeek)) {
      setOpenWeekNums(new Set([defaultOpenWeek]))
    } else {
      setOpenWeekNums(new Set())
    }
  }, [panelResetKey, defaultOpenWeek])

  async function removeSavedFixture(weekNum, m) {
    if (!m.played || m.isBye || !m.away) return
    const ok = window.confirm(
      `Remove this saved result from league data?\n\n${m.home} v ${m.away}\n\nYou can upload or edit again later.`,
    )
    if (!ok) return
    try {
      await admin.applyResults({
        leagueId: hlLeagueId,
        sectionId: hlSectionId || undefined,
        divisionId: hlDivisionId,
        week: weekNum,
        matches: [{ home: m.home, away: m.away, clear: true }],
      })
      onStoredDataChanged?.()
    } catch {
      /* surfaced via admin.error */
    }
  }

  return (
    <section className="tile admin-league-history">
      <div className="admin-header admin-header--compact admin-league-history__head">
        <div>
          <h2 className="tile-title tile-title--tight">Results List</h2>
        </div>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={onManualUploadClick}>
          Manual CSV upload
        </button>
      </div>

      <div className="admin-league-history__filters">
        <p className="admin-history-eyebrow">League</p>
        <PillRow ariaLabel="League">
          {leagues.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`pill-nav__btn${l.id === hlLeagueId ? ' pill-nav__btn--active' : ''}`}
              onClick={() => setHlLeagueId(l.id)}
            >
              {l.name}
            </button>
          ))}
        </PillRow>

        {sectionList?.length ? (
          <>
            <p className="admin-history-eyebrow">Section</p>
            <PillRow ariaLabel="Section">
              {sectionList.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`pill-nav__btn${s.id === hlSectionId ? ' pill-nav__btn--active' : ''}`}
                  onClick={() => setHlSectionId(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </PillRow>
          </>
        ) : null}

        {divisionList.length ? (
          <>
            <p className="admin-history-eyebrow">Division</p>
            <PillRow ariaLabel="Division">
              {divisionList.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`pill-nav__btn${d.id === hlDivisionId ? ' pill-nav__btn--active' : ''}`}
                  onClick={() => setHlDivisionId(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </PillRow>
          </>
        ) : (
          <p className="admin-warning admin-league-history__warn-inline">No divisions for this league.</p>
        )}
      </div>

      {loading ? <p className="page-lead admin-note">Loading league data…</p> : null}
      {fetchError ? <p className="admin-error">{fetchError}</p> : null}

      {!loading && !fetchError && division && hlDivisionId ? (
        weeksOrdered.length === 0 ? (
          <p className="admin-league-history__empty page-lead admin-note">
            No fixture schedule found for this division.
          </p>
        ) : (
          <div className="admin-history-weeks">
            {weeksOrdered.map((weekFx) => {
              const weekNum = Number(weekFx.week)
              const dateLabel = weekFx.date ? formatFixtureDate(weekFx.date) : ''
              const iso = weekFx.date
              const matches = weekFx.matches ?? []
              const storedRows = (division.results?.weeks?.[String(weekNum)] ?? []).length
              const headToHead = matches.filter((m) => !m.isBye && m.away)
              const playedCount = headToHead.filter((m) => m.played).length
              const isOpen = openWeekNums.has(weekNum)

              return (
                <details key={weekNum} className="admin-history-week-details" open={isOpen}>
                  <summary
                    className="admin-history-week-details__summary"
                    onClick={(e) => {
                      e.preventDefault()
                      setOpenWeekNums((prev) => {
                        const n = new Set(prev)
                        if (n.has(weekNum)) n.delete(weekNum)
                        else n.add(weekNum)
                        return n
                      })
                    }}
                  >
                    <span className="admin-history-week-details__summary-text">
                      <span className="admin-history-week-card__title">
                        {dateLabel ? (
                          <>
                            {dateLabel}
                            {iso ? (
                              <span className="admin-history-week-card__iso">{` (${iso})`}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="admin-history-week-card__title--missing">Diary date not set</span>
                        )}
                      </span>
                      <span className="admin-history-week-details__meta">
                        <span className="admin-history-week-card__badge">
                          {[
                            storedRows ? `${storedRows} row(s) on file` : null,
                            headToHead.length ? `${playedCount}/${headToHead.length} scored` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </span>
                    <span className="admin-history-week-details__chevron" aria-hidden>
                      ▼
                    </span>
                  </summary>
                  <div className="admin-history-week-details__panel">
                    <ul className="admin-history-fixture-list">
                      {matches.map((m, idx) =>
                        m.isBye ? (
                          <li
                            key={`bye-${weekNum}-${idx}`}
                            className="admin-history-fixture admin-history-fixture--bye"
                          >
                            <span className="admin-history-fixture__teams">{m.home}</span>
                            <span className="admin-history-fixture__meta">Bye</span>
                          </li>
                        ) : (
                          <li
                            key={`${weekNum}-${m.home}-${m.away}-${idx}`}
                            className="admin-history-fixture"
                          >
                            <div className="admin-history-fixture__main">
                              <span className="admin-history-fixture__teams">
                                <span className="admin-history-fixture__home">{m.home}</span>
                                <span className="admin-history-fixture__vs">v</span>
                                <span className="admin-history-fixture__away">{m.away}</span>
                              </span>
                              <span
                                className={`admin-history-fixture__score${m.played ? '' : ' admin-history-fixture__score--pending'}`}
                              >
                                {m.played ? formatMatchScore(m) : ''}
                              </span>
                            </div>
                            <div className="admin-history-fixture__actions">
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-history-fixture-btn"
                                disabled={admin.busy}
                                onClick={() =>
                                  onEditFixture(
                                    leagueHistoryFixtureToEditorEntry(
                                      hlLeagueId,
                                      hlSectionId,
                                      hlDivisionId,
                                      weekNum,
                                      weekNum * 1000 + idx + 1,
                                      m,
                                    ),
                                  )
                                }
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="admin-btn admin-btn--ghost admin-history-fixture-btn admin-history-fixture-btn--danger"
                                disabled={!m.played || admin.busy}
                                title={
                                  m.played
                                    ? 'Remove this saved result from league data'
                                    : 'Nothing saved yet for this fixture'
                                }
                                onClick={() => removeSavedFixture(weekNum, m)}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                </details>
              )
            })}
          </div>
        )
      ) : null}
    </section>
  )
}
