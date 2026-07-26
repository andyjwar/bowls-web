import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AdminFixtureEditorPanel } from './AdminFixtureEditorPanel'
import { colorForLeague } from '../lib/leagueColors'
import { shortLeagueName } from '../lib/leagueSchedule'
import { formatFixtureDate } from '../lib/fixtures'
import { formatResultHeadlineScore } from '../lib/results'
import { serializeAdminMatchRows } from '../lib/adminMatchPayload'
import {
  buildDayGroups,
  endOfTodayMs,
  leagueDivisionViews,
  matchToFormRow,
  ordinalDayMonth,
  pickWeekClosestToToday,
} from '../lib/adminEntryData'

/** "Division A" → "A"; anything else shown as-is (same as the public page). */
function divisionShortLabel(label) {
  const m = /^division\s+(.+)$/i.exec(label ?? '')
  return m ? m[1].trim() : label
}

function rowKey(week, match) {
  return `${week}|${match.home}|${match.away}`
}

/**
 * Score entry for one league — the public league page anatomy (banner tabs,
 * division letters, week tiles) with editable score boxes in the fixture rows.
 */
export function AdminScoreEntry({ admin }) {
  const { leagueId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [revision, setRevision] = useState(0)

  /** @type {[Record<string, {homeShots:string,awayShots:string,homePoints:string,awayPoints:string}>, Function]} */
  const [edits, setEdits] = useState({})
  const [weekMsg, setWeekMsg] = useState(null) // { week, kind: 'success'|'error', text }
  const [savingWeek, setSavingWeek] = useState(null)
  const [savingRow, setSavingRow] = useState(null) // rowKey currently saving
  const [editorEntry, setEditorEntry] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    fetch(`${import.meta.env.BASE_URL}data/${encodeURIComponent(leagueId)}.json`, {
      cache: 'no-store',
    })
      .then((r) => {
        if (!r.ok) throw new Error('Could not load league data')
        return r.json()
      })
      .then((json) => {
        if (!cancelled) setDoc(json)
      })
      .catch((e) => {
        if (!cancelled) setFetchError(e.message || 'Could not load league data')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, revision])

  const structured = Boolean(doc?.sections)
  const views = useMemo(() => leagueDivisionViews(doc), [doc])

  /* ── resolve section / day tab ── */
  const sectionItems = structured
    ? doc.sections.map((s) => ({ id: s.id, label: s.label }))
    : []
  const dayGroups = structured ? null : buildDayGroups(doc?.divisions)

  const sectionParam = searchParams.get('section') ?? ''
  const currentSectionId = structured
    ? sectionItems.some((s) => s.id === sectionParam)
      ? sectionParam
      : (sectionItems[0]?.id ?? null)
    : null
  const currentDayGroup = dayGroups
    ? (dayGroups.find((g) => g.id === sectionParam) ?? dayGroups[0])
    : null

  const bannerTabs = structured
    ? sectionItems
    : (dayGroups ?? []).map((g) => ({ id: g.id, label: g.label }))
  const activeBannerTab = structured ? currentSectionId : currentDayGroup?.id

  /* ── resolve division ── */
  const divisionItems = structured
    ? (doc?.sections.find((s) => s.id === currentSectionId)?.divisions ?? []).map((d) => ({
        id: d.id,
        label: d.label,
      }))
    : currentDayGroup
      ? currentDayGroup.divisions
      : (doc?.divisions ?? []).map((d) => ({ id: d.id, label: d.label }))

  const divisionParam = searchParams.get('division') ?? ''
  const currentDivisionId = divisionItems.some((d) => d.id === divisionParam)
    ? divisionParam
    : (divisionItems[0]?.id ?? null)

  const view = views.find(
    (v) =>
      v.divisionId === currentDivisionId &&
      (structured ? v.sectionId === currentSectionId : true),
  )
  const fixtures = view?.fixtures ?? []

  /* ── resolve week ── */
  const defaultWeek = useMemo(() => pickWeekClosestToToday(fixtures), [fixtures])
  const weekParam = searchParams.get('week') ?? ''
  const selectedWeek =
    weekParam === 'all'
      ? 'all'
      : fixtures.some((w) => String(w.week) === weekParam)
        ? Number(weekParam)
        : defaultWeek

  const weeksToRender =
    selectedWeek === 'all'
      ? fixtures
      : fixtures.filter((w) => Number(w.week) === Number(selectedWeek))

  /* ── week stats for the navigator / picker ── */
  const weekStats = useMemo(() => {
    const cutoff = endOfTodayMs()
    return fixtures.map((w) => {
      const playable = w.matches.filter((m) => !m.isBye && m.away)
      const missing = playable.filter((m) => !m.played).length
      const t = w.date ? new Date(`${w.date}T12:00:00`).getTime() : NaN
      const due = Number.isFinite(t) && t <= cutoff
      return {
        week: Number(w.week),
        date: w.date,
        missing,
        due,
        complete: playable.length > 0 && missing === 0,
      }
    })
  }, [fixtures])

  /* Outstanding results per division (all divisions in the current section),
     for the status dots above the division letters. Same missing logic as
     weekStats: non-bye, has an opponent, unplayed, week dated on/before today. */
  const divisionOutstanding = useMemo(() => {
    const cutoff = endOfTodayMs()
    const counts = {}
    for (const v of views) {
      if (structured && v.sectionId !== currentSectionId) continue
      let n = 0
      for (const week of v.fixtures) {
        const t = week.date ? new Date(`${week.date}T12:00:00`).getTime() : NaN
        if (!Number.isFinite(t) || t > cutoff) continue
        for (const m of week.matches ?? []) {
          if (m.isBye || !m.away || m.played) continue
          n += 1
        }
      }
      counts[v.divisionId] = n
    }
    return counts
  }, [views, structured, currentSectionId])

  const shownIdx =
    selectedWeek === 'all'
      ? -1
      : fixtures.findIndex((w) => Number(w.week) === Number(selectedWeek))
  const earlierGaps = shownIdx > 0 ? weekStats.slice(0, shownIdx).filter((s) => s.due && s.missing > 0) : []
  const earlierMissing = earlierGaps.reduce((sum, s) => sum + s.missing, 0)
  const oldestGapWeek = earlierGaps[0]?.week ?? null

  /* ── week picker popover ── */
  const [pickerOpen, setPickerOpen] = useState(false)
  const navRef = useRef(null)

  useEffect(() => {
    setPickerOpen(false)
  }, [leagueId, currentSectionId, currentDivisionId, selectedWeek])

  useEffect(() => {
    if (!pickerOpen) return
    function onDocDown(ev) {
      if (navRef.current && !navRef.current.contains(ev.target)) setPickerOpen(false)
    }
    function onKey(ev) {
      if (ev.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  /* Reset pending edits when switching league / section / division. */
  useEffect(() => {
    setEdits({})
    setWeekMsg(null)
  }, [leagueId, currentSectionId, currentDivisionId])

  const navIndex = (admin.leagues ?? []).findIndex((l) => l.id === leagueId)
  const palette = colorForLeague(leagueId, navIndex >= 0 ? navIndex : undefined)

  function setParams(next) {
    const sp = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(next)) {
      if (v == null) sp.delete(k)
      else sp.set(k, v)
    }
    setSearchParams(sp, { replace: true })
  }

  function stepWeek(delta) {
    const target = fixtures[shownIdx + delta]
    if (target) setParams({ week: String(Number(target.week)) })
  }

  function editFor(week, match) {
    const key = rowKey(week, match)
    return edits[key] ?? null
  }

  function seedEdit(week, match) {
    const key = rowKey(week, match)
    setEdits((prev) =>
      prev[key]
        ? prev
        : {
            ...prev,
            [key]: {
              homeShots: Number.isFinite(match.homeShots) ? String(match.homeShots) : '',
              awayShots: Number.isFinite(match.awayShots) ? String(match.awayShots) : '',
              homePoints: Number.isFinite(match.homePoints) ? String(match.homePoints) : '',
              awayPoints: Number.isFinite(match.awayPoints) ? String(match.awayPoints) : '',
            },
          },
    )
  }

  function updateEdit(week, match, field, value) {
    const key = rowKey(week, match)
    setEdits((prev) => {
      const cur = prev[key] ?? {
        homeShots: Number.isFinite(match.homeShots) ? String(match.homeShots) : '',
        awayShots: Number.isFinite(match.awayShots) ? String(match.awayShots) : '',
        homePoints: Number.isFinite(match.homePoints) ? String(match.homePoints) : '',
        awayPoints: Number.isFinite(match.awayPoints) ? String(match.awayPoints) : '',
      }
      return { ...prev, [key]: { ...cur, [field]: value } }
    })
  }

  function rowIsDirty(week, match) {
    const e = editFor(week, match)
    if (!e) return false
    const savedShots = [
      Number.isFinite(match.homeShots) ? String(match.homeShots) : '',
      Number.isFinite(match.awayShots) ? String(match.awayShots) : '',
      Number.isFinite(match.homePoints) ? String(match.homePoints) : '',
      Number.isFinite(match.awayPoints) ? String(match.awayPoints) : '',
    ]
    const current = [
      e.homeShots.trim(),
      e.awayShots.trim(),
      e.homePoints.trim(),
      e.awayPoints.trim(),
    ]
    return savedShots.join('|') !== current.join('|')
  }

  /** Drop a single row's edit — a saved row falls back to its printed chip. */
  function cancelRow(week, match) {
    const key = rowKey(week, match)
    setEdits((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  /**
   * Save just this row — the server merges single rows into the stored week.
   * Pass `override` values (e.g. all-blank to clear) instead of the row's edit.
   */
  async function saveRow(weekFx, match, override = null) {
    const weekNum = Number(weekFx.week)
    const key = rowKey(weekFx.week, match)
    const e = override ?? edits[key]

    const fr = matchToFormRow(match)
    if (e) {
      fr.homeShots = e.homeShots
      fr.awayShots = e.awayShots
      fr.homePoints = e.homePoints
      fr.awayPoints = e.awayPoints
    }

    let outgoing
    try {
      outgoing = serializeAdminMatchRows([fr])
    } catch (err) {
      setWeekMsg({ week: weekNum, kind: 'error', text: err.message })
      return
    }

    setSavingRow(key)
    setWeekMsg(null)
    try {
      await admin.applyResults({
        leagueId,
        sectionId: structured ? currentSectionId : null,
        divisionId: currentDivisionId,
        week: weekNum,
        matches: outgoing,
      })
      cancelRow(weekFx.week, match)
      setRevision((x) => x + 1)
      setWeekMsg({
        week: weekNum,
        kind: 'success',
        text: override
          ? `Removed ${match.home} v ${match.away} — the fixture is back to “to enter”.`
          : `Saved ${match.home} v ${match.away} — public tables update straight away.`,
      })
    } catch (err) {
      setWeekMsg({ week: weekNum, kind: 'error', text: err.message || 'Save failed' })
    } finally {
      setSavingRow(null)
    }
  }

  function discardWeek(weekNum) {
    setEdits((prev) => {
      const next = {}
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`${weekNum}|`)) next[k] = v
      }
      return next
    })
    setWeekMsg(null)
  }

  async function saveWeek(weekFx) {
    const weekNum = Number(weekFx.week)
    const matches = weekFx.matches.filter((m) => !m.isBye && m.away)
    const rows = matches.map((m) => {
      const fr = matchToFormRow(m)
      const e = editFor(weekFx.week, m)
      if (e) {
        fr.homeShots = e.homeShots
        fr.awayShots = e.awayShots
        fr.homePoints = e.homePoints
        fr.awayPoints = e.awayPoints
      }
      return fr
    })

    let outgoing
    try {
      outgoing = serializeAdminMatchRows(rows)
    } catch (err) {
      setWeekMsg({ week: weekNum, kind: 'error', text: err.message })
      return
    }

    setSavingWeek(weekNum)
    setWeekMsg(null)
    try {
      await admin.applyResults({
        leagueId,
        sectionId: structured ? currentSectionId : null,
        divisionId: currentDivisionId,
        week: weekNum,
        matches: outgoing,
      })
      const savedCount = matches.filter((m) => rowIsDirty(weekFx.week, m)).length
      discardWeek(weekNum)
      setRevision((x) => x + 1)
      setWeekMsg({
        week: weekNum,
        kind: 'success',
        text: `Saved${savedCount ? ` ${savedCount} result${savedCount !== 1 ? 's' : ''}` : ''} — public tables update straight away.`,
      })
    } catch (err) {
      setWeekMsg({ week: weekNum, kind: 'error', text: err.message || 'Save failed' })
    } finally {
      setSavingWeek(null)
    }
  }

  function openDetails(weekFx, match, idx) {
    setEditorEntry({
      source: 'league-history',
      leagueId,
      sectionId: structured ? currentSectionId : null,
      divisionId: currentDivisionId,
      week: Number(weekFx.week),
      csvRow: idx,
      scheduleHome: match.home,
      scheduleAway: match.away,
      homeShots: Number.isFinite(match.homeShots) ? match.homeShots : undefined,
      awayShots: Number.isFinite(match.awayShots) ? match.awayShots : undefined,
      homePoints: Number.isFinite(match.homePoints) ? match.homePoints : undefined,
      awayPoints: Number.isFinite(match.awayPoints) ? match.awayPoints : undefined,
      matchDateIso: typeof match.sheetMatchDate === 'string' ? match.sheetMatchDate : null,
    })
  }

  const closestWeek = defaultWeek

  return (
    <div
      className="page page--leagues page--admin-entry"
      style={{
        '--league-color': palette.color,
        '--league-color-soft': palette.soft,
      }}
    >
      {editorEntry ? (
        <AdminFixtureEditorPanel
          key={`entry-${editorEntry.week}-${editorEntry.scheduleHome}-${editorEntry.scheduleAway}`}
          entry={editorEntry}
          leagues={admin.leagues}
          admin={admin}
          onClose={() => setEditorEntry(null)}
          onSaved={() => {
            setEditorEntry(null)
            setRevision((x) => x + 1)
          }}
        />
      ) : null}

      <header
        className={`league-banner${bannerTabs.length > 0 ? ' league-banner--tabbed' : ''}`}
      >
        <Link to="/admin" className="league-banner__back">
          ← Admin
        </Link>
        <h1 className="league-banner__title">
          {shortLeagueName(doc?.name) || leagueId.replace(/-/g, ' ')}
        </h1>
        {bannerTabs.length > 0 ? (
          <nav className="league-banner__tabs" aria-label="Section">
            {bannerTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`league-banner__tab league-banner__tab--btn${
                  t.id === activeBannerTab ? ' league-banner__tab--active' : ''
                }`}
                aria-current={t.id === activeBannerTab ? 'page' : undefined}
                onClick={() => setParams({ section: t.id, division: null, week: null })}
              >
                {t.label}
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      {loading && !doc ? <p className="page-state">Loading…</p> : null}
      {fetchError ? <p className="page-state page-state--error">{fetchError}</p> : null}

      {doc && view ? (
        <>
          <div className="league-toolbar">
            <nav className="div-letters" aria-label="Division">
              {divisionItems.map((d) => {
                const missing = divisionOutstanding[d.id] ?? 0
                return (
                  <button
                    key={d.id}
                    type="button"
                    className={`div-letters__item div-letters__item--btn div-letters__item--dotted${
                      d.id === currentDivisionId ? ' div-letters__item--active' : ''
                    }`}
                    aria-current={d.id === currentDivisionId ? 'page' : undefined}
                    title={`${d.label} — ${missing > 0 ? `${missing} to enter` : 'Up to date'}`}
                    onClick={() => setParams({ division: d.id, week: null })}
                  >
                    <span
                      className={`div-dot ${missing > 0 ? 'div-dot--todo' : 'div-dot--ok'}`}
                      aria-hidden="true"
                    />
                    {divisionShortLabel(d.label)}
                  </button>
                )
              })}
            </nav>

            {selectedWeek === 'all' ? (
              <button
                type="button"
                className="entry-allback"
                onClick={() => setParams({ week: null })}
              >
                ← Back to one week
              </button>
            ) : null}
          </div>

          <div className="match-weeks">
            {weeksToRender.map((weekFx) => {
              const weekNum = Number(weekFx.week)
              const playable = weekFx.matches.filter((m) => !m.isBye && m.away)
              const dirtyCount = playable.filter((m) => rowIsDirty(weekFx.week, m)).length
              const msg = weekMsg && weekMsg.week === weekNum ? weekMsg : null
              const isClosestWeek = closestWeek != null && weekNum === Number(closestWeek)
              const headDate = ordinalDayMonth(weekFx.date)
              const weekComplete = Boolean(
                weekStats.find((s) => s.week === weekNum)?.complete,
              )
              return (
                <section key={weekFx.week} className="match-week">
                  {selectedWeek === 'all' ? (
                    <div className="match-week__head">
                      <h3
                        className={`match-week__title${
                          weekComplete ? ' match-week__title--done' : ''
                        }`}
                        title={weekComplete ? 'All results entered' : undefined}
                      >
                        Week {weekFx.week}
                      </h3>
                      <span className="match-week__date">
                        {formatFixtureDate(weekFx.date) || 'Date TBC'}
                      </span>
                    </div>
                  ) : (
                    <div className="match-week__head wknav" ref={navRef}>
                      <button
                        type="button"
                        className="wknav__btn"
                        aria-label="Previous week"
                        disabled={shownIdx <= 0}
                        onClick={() => stepWeek(-1)}
                      >
                        ‹
                        {earlierMissing > 0 ? (
                          <span className="wknav__missbadge" title={`${earlierMissing} missing in earlier weeks`}>
                            {earlierMissing}
                          </span>
                        ) : null}
                      </button>
                      <span className="wknav__mid">
                        <button
                          type="button"
                          className={`wknav__pick${
                            weekComplete ? ' wknav__pick--done' : ''
                          }`}
                          title={weekComplete ? 'All results entered' : undefined}
                          aria-haspopup="menu"
                          aria-expanded={pickerOpen}
                          onClick={() => setPickerOpen((o) => !o)}
                        >
                          {isClosestWeek ? <span className="wknav__nowdot" aria-hidden="true" /> : null}
                          Week {weekFx.week}
                          {headDate ? ` · ${headDate}` : ''}
                          <span className="wknav__caret" aria-hidden="true">
                            ▾
                          </span>
                        </button>
                      </span>
                      <button
                        type="button"
                        className="wknav__btn"
                        aria-label="Next week"
                        disabled={shownIdx < 0 || shownIdx >= fixtures.length - 1}
                        onClick={() => stepWeek(1)}
                      >
                        ›
                      </button>
                      <button
                        type="button"
                        className="wknav__all"
                        onClick={() => setParams({ week: 'all' })}
                      >
                        All weeks
                      </button>

                      {pickerOpen ? (
                        <div className="wk-pop" role="menu" aria-label="Pick a week">
                          {weekStats.map((s) => {
                            const isNow = closestWeek != null && s.week === Number(closestWeek)
                            const cls = `wk-pop__row${isNow ? ' wk-pop__row--now' : ''}${
                              !s.due && !isNow ? ' wk-pop__row--future' : ''
                            }`
                            return (
                              <button
                                key={s.week}
                                type="button"
                                role="menuitem"
                                className={cls}
                                onClick={() => {
                                  setPickerOpen(false)
                                  setParams({ week: String(s.week) })
                                }}
                              >
                                <span className="wk-pop__date">
                                  <small>({s.week})</small> {ordinalDayMonth(s.date) || '—'}
                                </span>
                                {s.due && s.missing > 0 ? (
                                  <span className="wk-pop__miss">{s.missing} missing</span>
                                ) : s.complete ? (
                                  <span className="wk-pop__ok">✓</span>
                                ) : isNow ? (
                                  <span className="wk-pop__now">NOW</span>
                                ) : (
                                  <span aria-hidden="true" />
                                )}
                              </button>
                            )
                          })}
                          <button
                            type="button"
                            role="menuitem"
                            className="wk-pop__all"
                            onClick={() => {
                              setPickerOpen(false)
                              setParams({ week: 'all' })
                            }}
                          >
                            All weeks
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}

                  {selectedWeek !== 'all' && earlierMissing > 0 && oldestGapWeek != null ? (
                    <button
                      type="button"
                      className="entry-catchup"
                      onClick={() => setParams({ week: String(oldestGapWeek) })}
                    >
                      <span className="entry-catchup__dot" aria-hidden="true" />
                      {earlierMissing} missing in earlier weeks
                      <span className="entry-catchup__go">Wk {oldestGapWeek} →</span>
                    </button>
                  ) : null}

                  {weekFx.matches.map((match, idx) => {
                    if (match.isBye) {
                      return (
                        <div
                          key={`bye-${idx}`}
                          className="match-row match-row--entry match-row--bye"
                        >
                          <span className="match-row__home">{match.home}</span>
                          <span className="match-row__mid match-row__mid--bye">Bye</span>
                          <span className="match-row__away" />
                          <span className="match-row__state" />
                        </div>
                      )
                    }

                    const key = rowKey(weekFx.week, match)
                    const e = editFor(weekFx.week, match)
                    const open = Boolean(e)
                    const dirty = rowIsDirty(weekFx.week, match)
                    const rowSaving = savingRow === key
                    const headline = formatResultHeadlineScore(match)
                    const hasPoints =
                      Number.isFinite(match.homePoints) && Number.isFinite(match.awayPoints)
                    const shotsSub =
                      hasPoints &&
                      Number.isFinite(match.homeShots) &&
                      Number.isFinite(match.awayShots)
                        ? `${match.homeShots}–${match.awayShots} shots`
                        : null
                    const tappable = !match.played && !open

                    const homeCls = `match-row__home${
                      match.played && match.homeWon
                        ? ' match-row__team--win'
                        : match.played && match.awayWon
                          ? ' match-row__team--lose'
                          : ''
                    }`
                    const awayCls = `match-row__away${
                      match.played && match.awayWon
                        ? ' match-row__team--win'
                        : match.played && match.homeWon
                          ? ' match-row__team--lose'
                          : ''
                    }`

                    return (
                      <Fragment key={`${match.home}-${match.away}`}>
                        <div
                          className={`match-row match-row--entry${
                            tappable ? ' match-row--tap' : ''
                          }${open ? ' match-row--editing' : ''}`}
                          onClick={
                            tappable
                              ? (ev) => {
                                  if (ev.target.closest('button, input, a')) return
                                  seedEdit(weekFx.week, match)
                                }
                              : undefined
                          }
                        >
                          <span className={homeCls}>
                            <button
                              type="button"
                              className="entry-team-btn"
                              title="Players, rinks & details"
                              onClick={() => openDetails(weekFx, match, idx)}
                            >
                              {match.home}
                            </button>
                          </span>

                          {open ? (
                            <span className="match-row__mid match-row__mid--vs">v</span>
                          ) : match.played ? (
                            <span className="match-row__mid entry-result">
                              <button
                                type="button"
                                className={`match-row__mid--score entry-score-btn${
                                  match.drawn ? ' match-row__mid--draw' : ''
                                }`}
                                title="Click to edit"
                                onClick={() => seedEdit(weekFx.week, match)}
                              >
                                {headline}
                              </button>
                              {shotsSub ? (
                                <span className="entry-result__shots">{shotsSub}</span>
                              ) : null}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="match-row__mid entry-open-btn"
                              onClick={() => seedEdit(weekFx.week, match)}
                            >
                              enter score
                            </button>
                          )}

                          <span className={awayCls}>
                            <button
                              type="button"
                              className="entry-team-btn"
                              title="Players, rinks & details"
                              onClick={() => openDetails(weekFx, match, idx)}
                            >
                              {match.away}
                            </button>
                          </span>

                          <span
                            className={`match-row__state${
                              dirty
                                ? ' match-row__state--dirty'
                                : match.played
                                  ? ' match-row__state--saved'
                                  : ''
                            }`}
                          >
                            {open ? (
                              dirty ? (
                                'Not saved'
                              ) : match.played ? (
                                'Editing…'
                              ) : (
                                'Entering…'
                              )
                            ) : match.played ? (
                              <button
                                type="button"
                                className="entry-rowact entry-rowact--edit"
                                aria-label={`Edit ${match.home} v ${match.away}`}
                                onClick={() => seedEdit(weekFx.week, match)}
                              >
                                Edit
                              </button>
                            ) : null}
                          </span>
                        </div>

                        {open ? (
                          <div
                            className="entry-strip"
                            role="group"
                            aria-label={`${match.home} v ${match.away} score entry`}
                          >
                            <span className="entry-strip__main">
                              <span className="entry-strip__group">
                                <span className="entry-strip__label">Points</span>
                                <input
                                  className="entry-strip__box entry-strip__box--pts"
                                  inputMode="numeric"
                                  autoFocus
                                  aria-label={`${match.home} points`}
                                  title="Points (optional)"
                                  value={e.homePoints}
                                  onChange={(ev) =>
                                    updateEdit(weekFx.week, match, 'homePoints', ev.target.value)
                                  }
                                />
                                <span className="entry-strip__dash">–</span>
                                <input
                                  className="entry-strip__box entry-strip__box--pts"
                                  inputMode="numeric"
                                  aria-label={`${match.away} points`}
                                  title="Points (optional)"
                                  value={e.awayPoints}
                                  onChange={(ev) =>
                                    updateEdit(weekFx.week, match, 'awayPoints', ev.target.value)
                                  }
                                />
                              </span>
                              <span className="entry-strip__group">
                                <span className="entry-strip__label">Shots</span>
                                <input
                                  className="entry-strip__box entry-strip__box--shots"
                                  inputMode="numeric"
                                  aria-label={`${match.home} shots`}
                                  value={e.homeShots}
                                  onChange={(ev) =>
                                    updateEdit(weekFx.week, match, 'homeShots', ev.target.value)
                                  }
                                />
                                <span className="entry-strip__dash">–</span>
                                <input
                                  className="entry-strip__box entry-strip__box--shots"
                                  inputMode="numeric"
                                  aria-label={`${match.away} shots`}
                                  value={e.awayShots}
                                  onChange={(ev) =>
                                    updateEdit(weekFx.week, match, 'awayShots', ev.target.value)
                                  }
                                />
                              </span>
                            </span>
                            <span className="entry-strip__acts">
                              {dirty ? (
                                <button
                                  type="button"
                                  className="entry-rowact entry-rowact--save"
                                  disabled={rowSaving || savingWeek === weekNum}
                                  onClick={() => saveRow(weekFx, match)}
                                >
                                  {rowSaving ? 'Saving…' : '✓ Save'}
                                </button>
                              ) : null}
                              {match.played ? (
                                <button
                                  type="button"
                                  className="entry-rowact entry-rowact--clear"
                                  aria-label={`Clear the saved score for ${match.home} v ${match.away}`}
                                  title="Remove this saved result"
                                  disabled={rowSaving || savingWeek === weekNum}
                                  onClick={() =>
                                    saveRow(weekFx, match, {
                                      homeShots: '',
                                      awayShots: '',
                                      homePoints: '',
                                      awayPoints: '',
                                    })
                                  }
                                >
                                  Clear score
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="entry-rowact entry-rowact--cancel"
                                aria-label={`Cancel editing ${match.home} v ${match.away}`}
                                disabled={rowSaving}
                                onClick={() => cancelRow(weekFx.week, match)}
                              >
                                Cancel
                              </button>
                            </span>
                          </div>
                        ) : null}
                      </Fragment>
                    )
                  })}

                  {dirtyCount >= 2 || msg ? (
                    <div className="match-week__foot">
                      {dirtyCount >= 2 ? (
                        <>
                          <button
                            type="button"
                            className="entry-save-btn"
                            disabled={savingWeek === weekNum || savingRow != null}
                            onClick={() => saveWeek(weekFx)}
                          >
                            {savingWeek === weekNum
                              ? 'Saving…'
                              : `Save ${dirtyCount} results`}
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost"
                            onClick={() => discardWeek(weekNum)}
                          >
                            Discard changes
                          </button>
                        </>
                      ) : null}
                      {msg ? (
                        <span
                          className={
                            msg.kind === 'error'
                              ? 'match-week__foot-msg match-week__foot-msg--error'
                              : 'match-week__foot-msg'
                          }
                        >
                          {msg.text}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </>
      ) : null}

      {doc && !view && !loading ? (
        <p className="page-state page-state--error">No divisions found for this league.</p>
      ) : null}
    </div>
  )
}
