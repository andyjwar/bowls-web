import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AddInline } from './AddInline'
import { colorForLeague } from '../lib/leagueColors'
import { shortLeagueName } from '../lib/leagueSchedule'
import { buildDivisionFixtures } from '../lib/fixtures'

const BYE = 'Bye'
const DATE_COLUMNS = [
  { key: 'date', label: 'Date' },
  { key: 'tuesdayDate', label: 'Tuesday' },
  { key: 'thursdayDate', label: 'Thursday' },
]

/** "Pairs League" → "pairs-league" (league/section ids). */
function slugify(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function weekdayShort(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? ''))) return ''
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })
}

function shortDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso ?? ''))) return ''
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function addDaysIso(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Stored slot value → what the input shows ("Bye" slots are blank). */
function slotDisplayValue(name) {
  const n = String(name ?? '').trim()
  return n === BYE ? '' : n
}

/** Input values → stored teams array (blank slot = "Bye"). */
function slotsToTeams(values) {
  return values.map((v) => {
    const n = String(v ?? '').trim()
    return n || BYE
  })
}

function divisionKey(sectionId, divisionId) {
  return `${sectionId ?? ''}::${divisionId}`
}

/* ────────────────────────── Season panel ────────────────────────── */

/**
 * Season controls: switch which season the public site shows, and start the
 * next season. Starting hands off to the guided setup (league-by-league
 * teams + dates walkthrough) via `onSeasonStarted`.
 */
function SeasonPanel({ admin, onSeasonStarted }) {
  const seasons = admin.seasons ?? []
  const active = admin.activeSeason
  const [newYear, setNewYear] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg] = useState(null)

  const suggestedYear = active != null ? active + 1 : new Date().getFullYear() + 1
  const startYear = Number(newYear || suggestedYear)

  async function handleStart() {
    if (!confirming) {
      setConfirming(true)
      setMsg(null)
      return
    }
    setConfirming(false)
    setMsg(null)
    try {
      await admin.startSeason(startYear)
      setNewYear('')
      onSeasonStarted?.(startYear)
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'Could not start the season' })
    }
  }

  async function handleSwitch(year) {
    setMsg(null)
    try {
      await admin.switchActiveSeason(Number(year))
      setMsg({ kind: 'success', text: `Public site now shows the ${year} season.` })
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'Could not switch season' })
    }
  }

  return (
    <section className="home-section">
      <h2 className="home-section__title">Season</h2>
      <div className="tile season-panel">
        <div className="season-panel__row">
          <label className="season-panel__field">
            <span className="season-panel__label">Active season</span>
            <select
              className="admin-input season-panel__select"
              value={active ?? ''}
              disabled={admin.busy || seasons.length < 2}
              onChange={(ev) => handleSwitch(ev.target.value)}
            >
              {(seasons.length ? seasons : [active]).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <span className="season-panel__divider" aria-hidden="true" />

          <label className="season-panel__field">
            <span className="season-panel__label">Start new season</span>
            <span className="season-panel__start">
              <input
                type="text"
                inputMode="numeric"
                className="admin-input season-panel__year"
                placeholder={String(suggestedYear)}
                value={newYear}
                onChange={(ev) => {
                  setNewYear(ev.target.value)
                  setConfirming(false)
                }}
              />
              <button
                type="button"
                className="entry-rowact entry-rowact--save"
                disabled={admin.busy}
                onClick={handleStart}
              >
                {confirming ? `Confirm — start ${startYear}?` : `Start ${startYear}`}
              </button>
              {confirming ? (
                <button
                  type="button"
                  className="entry-rowact entry-rowact--cancel"
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </button>
              ) : null}
            </span>
          </label>
        </div>

        <p className="season-panel__hint">
          Starting a season copies every league (divisions, team slots, weekly schedule
          moved forward a year) with no results, then walks you through each league to
          check team names and fixture dates. The old season is kept and stays viewable
          under past seasons.
        </p>

        {msg ? (
          <p className={msg.kind === 'error' ? 'admin-error' : 'admin-success'}>
            {msg.text}
          </p>
        ) : null}
      </div>
    </section>
  )
}

/* ────────────────────────── Fixture dates tile ────────────────────────── */

/**
 * Editable fixture dates for one day's schedule grid. Every week's date can be
 * changed; "cascade" refills weeks 2+ at weekly intervals from week 1.
 */
function DatesTile({ admin, leagueId, section, template, onSaved }) {
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const columns = useMemo(
    () => DATE_COLUMNS.filter((c) => template?.[0]?.[c.key] !== undefined),
    [template],
  )

  useEffect(() => {
    setDrafts({})
    setMsg(null)
  }, [leagueId, template])

  if (!template?.length || !columns.length) return null

  const cellKey = (week, key) => `${week}:${key}`
  const valueFor = (row, key) => drafts[cellKey(row.week, key)] ?? row[key] ?? ''
  const dirty = Object.entries(drafts).some(([k, v]) => {
    const [week, key] = k.split(':')
    const row = template.find((r) => String(r.week) === week)
    return row && String(v) !== String(row[key] ?? '')
  })

  const first = template[0]
  const last = template[template.length - 1]
  const summary = `${shortDate(valueFor(first, columns[0].key))} – ${shortDate(
    valueFor(last, columns[0].key),
  )} · ${template.length} weeks`

  function setCell(week, key, value) {
    setDrafts((prev) => ({ ...prev, [cellKey(week, key)]: value }))
    setMsg(null)
  }

  function cascade() {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const col of columns) {
        const start = next[cellKey(first.week, col.key)] ?? first[col.key]
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(start ?? ''))) continue
        template.forEach((row, i) => {
          if (i === 0) return
          next[cellKey(row.week, col.key)] = addDaysIso(start, i * 7)
        })
      }
      return next
    })
    setMsg(null)
  }

  function cancel() {
    setDrafts({})
    setMsg(null)
  }

  async function save() {
    const rows = []
    for (const row of template) {
      const changed = {}
      for (const col of columns) {
        const v = drafts[cellKey(row.week, col.key)]
        if (v !== undefined && String(v) !== String(row[col.key] ?? '')) {
          changed[col.key] = v
        }
      }
      if (Object.keys(changed).length) rows.push({ week: row.week, ...changed })
    }
    if (!rows.length) return
    setSaving(true)
    try {
      await admin.saveScheduleDates(leagueId, {
        sectionId: section ? section.id : null,
        rows,
      })
      setDrafts({})
      setMsg({ kind: 'success', text: 'Dates saved — fixtures use them straight away.' })
      onSaved?.()
    } catch (err) {
      setMsg({ kind: 'error', text: err.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="tile dates-tile">
      <div className="dates-tile__head">
        <h3 className="team-slots__title">Fixture dates</h3>
        <span className="team-slots__count">{summary}</span>
        <button
          type="button"
          className="dates-tile__toggle"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Close' : 'Edit dates'}
        </button>
      </div>

      {open ? (
        <>
          {columns.length > 1 ? (
            <div className="dates-tile__cols" aria-hidden="true">
              <span className="dates-tile__wk" />
              {columns.map((c) => (
                <span key={c.key} className="dates-tile__collabel">
                  {c.label}
                </span>
              ))}
            </div>
          ) : null}

          <ol className="dates-tile__list">
            {template.map((row) => (
              <li key={row.week} className="dates-tile__row">
                <span className="dates-tile__wk">Wk {row.week}</span>
                {columns.map((col) => {
                  const v = valueFor(row, col.key)
                  return (
                    <span key={col.key} className="dates-tile__cell">
                      <input
                        type="date"
                        className="dates-tile__input"
                        value={v}
                        aria-label={`Week ${row.week} ${col.label.toLowerCase()}`}
                        onChange={(ev) => setCell(row.week, col.key, ev.target.value)}
                      />
                      <span className="dates-tile__dow">{weekdayShort(v)}</span>
                    </span>
                  )
                })}
              </li>
            ))}
          </ol>

          <div className="team-slots__foot">
            <button type="button" className="dates-tile__cascade" onClick={cascade}>
              Refill weekly from week 1
            </button>
            {dirty ? (
              <>
                <button
                  type="button"
                  className="entry-rowact entry-rowact--save"
                  disabled={saving}
                  onClick={save}
                >
                  {saving ? 'Saving…' : '✓ Save dates'}
                </button>
                <button
                  type="button"
                  className="entry-rowact entry-rowact--cancel"
                  disabled={saving}
                  onClick={cancel}
                >
                  Cancel
                </button>
              </>
            ) : null}
            {msg ? (
              <span
                className={
                  msg.kind === 'error'
                    ? 'team-slots__msg team-slots__msg--error'
                    : 'team-slots__msg'
                }
              >
                {msg.text}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}

/* ────────────────────────── Fixtures preview ────────────────────────── */

/** Read-only who-plays-who list, computed live from the slot values above it. */
function FixturePreview({ template, teams, playDay }) {
  const weeks = useMemo(() => {
    if (!template?.length) return []
    const getDate = (row) => {
      if (playDay === 'thursday') return row.thursdayDate
      if (playDay === 'tuesday') return row.tuesdayDate
      return row.date
    }
    return buildDivisionFixtures(template, teams, getDate)
  }, [template, teams, playDay])

  if (!weeks.length) return <p className="fixture-preview__empty">No schedule yet.</p>

  return (
    <ol className="fixture-preview">
      {weeks.map((w) => (
        <li key={w.week} className="fixture-preview__week">
          <span className="fixture-preview__date">
            ({w.week}) {shortDate(w.date) || '—'}
          </span>
          <span className="fixture-preview__matches">
            {w.matches.length ? (
              w.matches.map((m, i) => (
                <span
                  key={i}
                  className={`fixture-preview__match${m.isBye ? ' fixture-preview__match--bye' : ''}`}
                >
                  {m.isBye ? `${m.home} — bye` : `${m.home} v ${m.away}`}
                </span>
              ))
            ) : (
              <span className="fixture-preview__match fixture-preview__match--bye">
                no matches — add team names
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

/* ────────────────────────── Quiet "+ add" forms ────────────────────────── */

/** Two-step "Remove league" — unregisters it; the data file stays on disk. */
function RemoveLeague({ admin, leagueId, leagueName, onRemoved }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)

  async function handleClick() {
    if (!confirming) {
      setConfirming(true)
      setError(null)
      return
    }
    setConfirming(false)
    try {
      await admin.removeLeague(leagueId)
      onRemoved?.()
    } catch (err) {
      setError(err.message || 'Could not remove the league')
    }
  }

  return (
    <div className="remove-league">
      <button
        type="button"
        className={`remove-league__btn${confirming ? ' remove-league__btn--armed' : ''}`}
        disabled={admin.busy}
        onClick={handleClick}
      >
        {confirming ? `Confirm — remove ${leagueName}?` : `Remove ${leagueName}…`}
      </button>
      {confirming ? (
        <button
          type="button"
          className="entry-rowact entry-rowact--cancel"
          onClick={() => setConfirming(false)}
        >
          Cancel
        </button>
      ) : null}
      {error ? (
        <span className="team-slots__msg team-slots__msg--error">{error}</span>
      ) : (
        <span className="team-slots__hint">
          {confirming
            ? 'It leaves the site and admin — the data file is kept, so it can be restored.'
            : ''}
        </span>
      )}
    </div>
  )
}

/* ────────────────────────── Setup wizard banner ────────────────────────── */

function SetupBanner({ year, stepIndex, leagues, onStep, onFinish }) {
  const league = leagues[stepIndex]
  return (
    <div className="setup-banner">
      <div className="setup-banner__text">
        <p className="setup-banner__title">Setting up the {year} season</p>
        <p className="setup-banner__step">
          League {stepIndex + 1} of {leagues.length} —{' '}
          <strong>{shortLeagueName(league?.name) || league?.id}</strong>
        </p>
        <p className="setup-banner__hint">
          Check the team names in each slot, open <em>Fixture dates</em> to set when each
          week is played, then use <em>Fixtures</em> on any division to preview who plays
          who. Everything stays editable after setup.
        </p>
      </div>
      <div className="setup-banner__actions">
        <button
          type="button"
          className="entry-rowact entry-rowact--cancel"
          disabled={stepIndex === 0}
          onClick={() => onStep(stepIndex - 1)}
        >
          ← Back
        </button>
        {stepIndex < leagues.length - 1 ? (
          <button
            type="button"
            className="entry-rowact entry-rowact--save"
            onClick={() => onStep(stepIndex + 1)}
          >
            Next league →
          </button>
        ) : (
          <button type="button" className="entry-rowact entry-rowact--save" onClick={onFinish}>
            ✓ Finish setup
          </button>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────── Page ────────────────────────── */

/**
 * Season & leagues — one place for season structure:
 * team slots per division (blank = bye), editable fixture dates per day,
 * live fixture previews, quiet add-league/day/division controls, and the
 * start-new-season flow with a league-by-league guided setup.
 */
export function AdminSeasonPage({ admin }) {
  const leagues = (admin.leagues ?? []).filter(
    (l) => l.season == null || admin.activeSeason == null || l.season === admin.activeSeason,
  )
  const [searchParams, setSearchParams] = useSearchParams()

  /* Guided setup mode (?setup=2027&step=0) — steps through the leagues. */
  const setupYear = searchParams.get('setup')
  const setupStep = Math.min(
    Math.max(0, Number(searchParams.get('step')) || 0),
    Math.max(0, leagues.length - 1),
  )
  const inSetup = Boolean(setupYear) && leagues.length > 0

  const leagueId = inSetup
    ? leagues[setupStep].id
    : searchParams.get('league') || leagues[0]?.id || ''
  const leagueIndex = Math.max(
    0,
    leagues.findIndex((l) => l.id === leagueId),
  )
  const palette = colorForLeague(leagueId, leagueIndex)

  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState(null)
  const [revision, setRevision] = useState(0)

  /** Draft slot values per division: key → string[] (display values, '' = bye). */
  const [drafts, setDrafts] = useState({})
  const [msgs, setMsgs] = useState({})
  const [savingKey, setSavingKey] = useState(null)
  const [previewKey, setPreviewKey] = useState(null)

  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    admin
      .loadLeagueDocument(leagueId)
      .then((d) => {
        if (cancelled) return
        setDoc(d.league ?? null)
      })
      .catch((e) => {
        if (!cancelled) setFetchError(e.message || String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, revision, admin])

  /* Selecting another league drops unsaved slot edits. */
  useEffect(() => {
    setDrafts({})
    setMsgs({})
    setPreviewKey(null)
  }, [leagueId])

  /** [{ section: {...} | null, divisions: [...] }] for flat and sectioned leagues. */
  const groups = useMemo(() => {
    if (!doc) return []
    if (doc.sections?.length) {
      return doc.sections.map((s) => ({ section: s, divisions: s.divisions ?? [] }))
    }
    return [{ section: null, divisions: doc.divisions ?? [] }]
  }, [doc])

  function baseValues(division) {
    return (division.teams ?? []).map(slotDisplayValue)
  }

  function valuesFor(key, division) {
    return drafts[key] ?? baseValues(division)
  }

  function isDirty(key, division) {
    const d = drafts[key]
    if (!d) return false
    const base = baseValues(division)
    return d.some((v, i) => v.trim() !== (base[i] ?? '').trim())
  }

  function updateSlot(key, division, idx, value) {
    setDrafts((prev) => {
      const cur = prev[key] ?? baseValues(division)
      const next = [...cur]
      next[idx] = value
      return { ...prev, [key]: next }
    })
    setMsgs((prev) => (prev[key] ? { ...prev, [key]: null } : prev))
  }

  function cancelDivision(key) {
    setDrafts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
    setMsgs((prev) => (prev[key] ? { ...prev, [key]: null } : prev))
  }

  async function saveDivision(key, section, division) {
    const values = valuesFor(key, division)
    setSavingKey(key)
    try {
      await admin.saveDivisionTeams(leagueId, {
        sectionId: section ? section.id : null,
        divisionId: division.id,
        teams: slotsToTeams(values),
      })
      cancelDivision(key)
      setRevision((x) => x + 1)
      setMsgs((prev) => ({
        ...prev,
        [key]: { kind: 'success', text: 'Saved — fixtures and tables use the new names straight away.' },
      }))
    } catch (err) {
      setMsgs((prev) => ({
        ...prev,
        [key]: { kind: 'error', text: err.message || 'Save failed' },
      }))
    } finally {
      setSavingKey(null)
    }
  }

  function selectLeague(id) {
    setSearchParams({ league: id }, { replace: true })
  }

  function setStep(step) {
    setSearchParams({ setup: setupYear, step: String(step) }, { replace: true })
  }

  function finishSetup() {
    setSearchParams({ league: leagueId }, { replace: true })
  }

  return (
    <div
      className="page page--leagues page--admin-entry"
      style={{
        '--league-color': palette.color,
        '--league-color-soft': palette.soft,
      }}
    >
      <header className={`league-banner${leagues.length > 1 ? ' league-banner--tabbed' : ''}`}>
        <Link to="/admin" className="league-banner__back">
          ← Admin
        </Link>
        <h1 className="league-banner__title">Season &amp; leagues</h1>
        {leagues.length > 1 && !inSetup ? (
          <nav className="league-banner__tabs" aria-label="League">
            {leagues.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`league-banner__tab league-banner__tab--btn${
                  l.id === leagueId ? ' league-banner__tab--active' : ''
                }`}
                aria-current={l.id === leagueId ? 'page' : undefined}
                onClick={() => selectLeague(l.id)}
              >
                {shortLeagueName(l.name) || l.id}
              </button>
            ))}
          </nav>
        ) : null}
      </header>

      {inSetup ? (
        <SetupBanner
          year={setupYear}
          stepIndex={setupStep}
          leagues={leagues}
          onStep={setStep}
          onFinish={finishSetup}
        />
      ) : null}

      {loading && !doc ? <p className="page-state">Loading…</p> : null}
      {fetchError ? <p className="page-state page-state--error">{fetchError}</p> : null}

      {doc
        ? groups.map((grp) => {
            const template = grp.section ? grp.section.scheduleTemplate : doc.scheduleTemplate
            return (
              <section key={grp.section?.id ?? '_flat'} className="home-section">
                {(() => {
                  /* Two Wood-style flat leagues have Tuesday/Thursday date
                     columns — a new division must pick which day it plays. */
                  const playDayOptions = grp.section
                    ? []
                    : DATE_COLUMNS.filter(
                        (c) => c.key !== 'date' && template?.[0]?.[c.key] !== undefined,
                      ).map((c) => ({
                        value: c.label.toLowerCase(),
                        label: c.label,
                      }))
                  return (
                    <div className="home-section__head home-section__head--row">
                      <h2 className="home-section__title">
                        {grp.section ? (grp.section.label ?? grp.section.id) : 'Divisions'}
                      </h2>
                      <AddInline
                        label="Add division"
                        submitLabel="Add division"
                        hint={
                          grp.section
                            ? 'New divisions get the same team slots and weekly schedule as the other divisions on this day. Slots start empty (all byes) until you type team names in.'
                            : 'New divisions get the same team slots and weekly schedule as the rest of the league. Slots start empty (all byes) until you type team names in.'
                        }
                        fields={[
                          { name: 'label', label: 'Division name', placeholder: 'e.g. Division F' },
                          ...(playDayOptions.length > 1
                            ? [{ name: 'playDay', label: 'Plays on', options: playDayOptions }]
                            : []),
                        ]}
                        onSubmit={async ({ label, playDay }) => {
                          if (!String(label ?? '').trim())
                            throw new Error('Give the division a name')
                          await admin.addLeagueDivision(leagueId, {
                            sectionId: grp.section ? grp.section.id : null,
                            label: label.trim(),
                            ...(playDayOptions.length > 1
                              ? { playDay: playDay || playDayOptions[0].value }
                              : {}),
                          })
                          setRevision((x) => x + 1)
                        }}
                      />
                    </div>
                  )
                })()}

                <DatesTile
                  admin={admin}
                  leagueId={leagueId}
                  section={grp.section}
                  template={template}
                  onSaved={() => setRevision((x) => x + 1)}
                />

                <div className="team-slots-grid">
                  {grp.divisions.map((division) => {
                    const key = divisionKey(grp.section?.id ?? null, division.id)
                    const values = valuesFor(key, division)
                    const dirty = isDirty(key, division)
                    const saving = savingKey === key
                    const named = values.filter((v) => v.trim()).length
                    const byes = values.length - named
                    const msg = msgs[key]
                    const previewOpen = previewKey === key
                    return (
                      <section key={key} className="tile team-slots">
                        <div className="team-slots__head">
                          <h3 className="team-slots__title">{division.label ?? division.id}</h3>
                          <span className="team-slots__count">
                            {named} team{named !== 1 ? 's' : ''}
                            {byes > 0 ? ` · ${byes} bye${byes !== 1 ? 's' : ''}` : ''}
                          </span>
                        </div>

                        <ol className="team-slots__list">
                          {values.map((v, idx) => (
                            <li key={idx} className="team-slot">
                              <span className="team-slot__num" aria-hidden="true">
                                {idx + 1}
                              </span>
                              <input
                                type="text"
                                className={`team-slot__input${!v.trim() ? ' team-slot__input--bye' : ''}`}
                                value={v}
                                placeholder="bye"
                                aria-label={`${division.label ?? division.id} slot ${idx + 1}`}
                                spellCheck={false}
                                onChange={(ev) => updateSlot(key, division, idx, ev.target.value)}
                              />
                            </li>
                          ))}
                        </ol>

                        <div className="team-slots__foot">
                          <button
                            type="button"
                            className="dates-tile__toggle"
                            aria-expanded={previewOpen}
                            onClick={() => setPreviewKey(previewOpen ? null : key)}
                          >
                            {previewOpen ? 'Hide fixtures' : 'Fixtures'}
                          </button>
                          {dirty ? (
                            <>
                              <button
                                type="button"
                                className="entry-rowact entry-rowact--save"
                                disabled={saving}
                                onClick={() => saveDivision(key, grp.section, division)}
                              >
                                {saving ? 'Saving…' : '✓ Save'}
                              </button>
                              <button
                                type="button"
                                className="entry-rowact entry-rowact--cancel"
                                disabled={saving}
                                onClick={() => cancelDivision(key)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : null}
                          {msg ? (
                            <span
                              className={
                                msg.kind === 'error'
                                  ? 'team-slots__msg team-slots__msg--error'
                                  : 'team-slots__msg'
                              }
                            >
                              {msg.text}
                            </span>
                          ) : !dirty ? (
                            <span className="team-slots__hint">blank slot = bye</span>
                          ) : null}
                        </div>

                        {previewOpen ? (
                          <FixturePreview
                            template={template}
                            teams={slotsToTeams(values)}
                            playDay={division.playDay}
                          />
                        ) : null}
                      </section>
                    )
                  })}
                </div>
              </section>
            )
          })
        : null}

      {doc?.sections?.length ? (
        <div className="home-section add-day-row">
          <AddInline
            label="Add day"
            submitLabel="Add day"
            hint="Adds another play day to this league (like Monday Evening / Wednesday Afternoon). It starts with one empty division and plays the same number of weeks and the same who-plays-who pattern as the day you pick — then set its own match dates in its Fixture dates panel."
            fields={[
              { name: 'label', label: 'Day name', placeholder: 'e.g. Thursday Evening' },
              {
                name: 'cloneFrom',
                label: 'Use the same weekly pattern as',
                options: doc.sections.map((s) => ({
                  value: s.id,
                  label: s.label ?? s.id,
                })),
              },
            ]}
            onSubmit={async ({ label, cloneFrom }) => {
              const lbl = String(label ?? '').trim()
              if (!lbl) throw new Error('Give the day a name (e.g. Thursday Evening)')
              await admin.addLeagueSection(leagueId, {
                sectionId: slugify(lbl),
                label: lbl,
                cloneScheduleFromSectionId: cloneFrom || doc.sections[0]?.id,
              })
              setRevision((x) => x + 1)
            }}
          />
        </div>
      ) : null}

      {!inSetup ? (
        <>
          <SeasonPanel
            admin={admin}
            onSeasonStarted={(year) =>
              setSearchParams({ setup: String(year), step: '0' }, { replace: true })
            }
          />

          <div className="home-section add-day-row">
            <AddInline
              label="New league"
              submitLabel="Create league"
              hint="Creates another league in the current season. It copies the chosen league's shape — play days, divisions and the weekly fixture pattern — with every team slot empty, ready for names and its own dates."
              fields={[
                { name: 'name', label: 'League name', placeholder: 'e.g. Pairs League' },
                {
                  name: 'cloneFrom',
                  label: 'Copy the shape of',
                  options: leagues.map((l) => ({
                    value: l.id,
                    label: shortLeagueName(l.name) || l.id,
                  })),
                },
              ]}
              onSubmit={async ({ name, cloneFrom }) => {
                const nm = String(name ?? '').trim()
                if (!nm) throw new Error('Give the league a name')
                const year = admin.activeSeason
                const withYear = /\b\d{4}\b/.test(nm) ? nm : `${nm} ${year ?? ''}`.trim()
                const out = await admin.createLeague({
                  leagueId: `${slugify(nm)}${year ? `-${year}` : ''}`,
                  name: withYear,
                  cloneFromLeagueId: cloneFrom || leagues[0]?.id,
                })
                if (out?.leagueId) selectLeague(out.leagueId)
              }}
            />

            {doc && leagues.length > 1 ? (
              <RemoveLeague
                admin={admin}
                leagueId={leagueId}
                leagueName={shortLeagueName(doc.name) || leagueId}
                onRemoved={() => {
                  const remaining = leagues.filter((l) => l.id !== leagueId)
                  selectLeague(remaining[0]?.id ?? '')
                }}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
