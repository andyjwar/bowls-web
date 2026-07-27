import { useEffect, useMemo, useState } from 'react'

const WEEKDAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

function titleCase(text) {
  return String(text ?? '').replace(/^\w/, (c) => c.toUpperCase())
}

function weekdayForDate(iso) {
  if (!iso) return 'monday'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
  }).toLowerCase()
}

function shiftDate(iso, years) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + years * 364)
  return d.toISOString().slice(0, 10)
}

function alignDateToWeekday(iso, weekday) {
  if (!iso) return iso
  const target = WEEKDAYS.indexOf(weekday)
  if (target < 0) return iso
  const d = new Date(`${iso}T12:00:00Z`)
  const mondayIndex = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() + ((target - mondayIndex + 7) % 7))
  return d.toISOString().slice(0, 10)
}

function planFromDocument(meta, doc, targetYear, activeYear) {
  const years = targetYear - activeYear
  let days
  if (doc.sections?.length) {
    days = doc.sections.map((section) => {
      const first = section.scheduleTemplate?.[0]?.date ?? ''
      return {
        id: section.id,
        label: section.label,
        playDay: weekdayForDate(first),
        startDate: shiftDate(first, years),
        divisionCount: section.divisions?.length ?? 1,
        teamCount: section.divisions?.[0]?.teams?.length ?? 8,
      }
    })
  } else {
    const playDays = [...new Set((doc.divisions ?? []).map((d) => d.playDay).filter(Boolean))]
    if (playDays.length) {
      days = playDays.map((playDay) => ({
        id: playDay,
        label: titleCase(playDay),
        playDay,
        startDate: shiftDate(doc.scheduleTemplate?.[0]?.[`${playDay}Date`] ?? '', years),
        divisionCount: doc.divisions.filter((d) => d.playDay === playDay).length,
        teamCount:
          doc.divisions.find((d) => d.playDay === playDay)?.teams?.length ?? 8,
      }))
    } else {
      const first = doc.scheduleTemplate?.[0]?.date ?? ''
      const playDay = weekdayForDate(first)
      days = [
        {
          id: playDay,
          label: titleCase(playDay),
          playDay,
          startDate: shiftDate(first, years),
          divisionCount: doc.divisions?.length ?? 1,
          teamCount: doc.divisions?.[0]?.teams?.length ?? 8,
        },
      ]
    }
  }
  return {
    sourceLeagueId: meta.id,
    name: meta.name,
    sectioned: Boolean(doc.sections?.length),
    enabled: true,
    days,
  }
}

export function SeasonStructureWizard({ admin, onCreated, onContinueDraft }) {
  const active = Number(admin.activeSeason)
  const suggestedYear = active + 1
  const [yearText, setYearText] = useState(String(suggestedYear))
  const [step, setStep] = useState(0)
  const [docs, setDocs] = useState(null)
  const [plans, setPlans] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const activeLeagues = useMemo(
    () => (admin.leagues ?? []).filter((l) => l.season == null || l.season === active),
    [admin.leagues, active],
  )
  const draftSeasons = (admin.seasons ?? []).filter((s) => s > active)
  const year = Number(yearText)

  useEffect(() => {
    let cancelled = false
    Promise.all(activeLeagues.map((league) => admin.loadLeagueDocument(league.id)))
      .then((rows) => {
        if (cancelled) return
        setDocs(Object.fromEntries(rows.map((row, i) => [activeLeagues[i].id, row.league])))
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the current season')
      })
    return () => {
      cancelled = true
    }
  }, [admin, activeLeagues])

  function beginStructure() {
    if (!Number.isInteger(year) || year <= active || year > 2100) {
      setError(`Enter a year after ${active}`)
      return
    }
    if (!docs) {
      setError('The current season is still loading')
      return
    }
    setPlans(activeLeagues.map((league) => planFromDocument(league, docs[league.id], year, active)))
    setError(null)
    setStep(1)
  }

  function updatePlan(index, updater) {
    setPlans((prev) => prev.map((plan, i) => (i === index ? updater(plan) : plan)))
    setError(null)
  }

  function updateDay(planIndex, dayIndex, patch) {
    updatePlan(planIndex, (plan) => ({
      ...plan,
      days: plan.days.map((day, i) =>
        i === dayIndex || (!plan.sectioned && patch.teamCount != null)
          ? { ...day, ...patch }
          : day,
      ),
    }))
  }

  function changePlayDay(planIndex, dayIndex, playDay) {
    const day = plans[planIndex].days[dayIndex]
    const suffix = day.label.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/i, '').trim()
    updateDay(planIndex, dayIndex, {
      playDay,
      id: `${playDay}-${dayIndex + 1}`,
      label: [titleCase(playDay), suffix].filter(Boolean).join(' '),
      startDate: alignDateToWeekday(day.startDate, playDay),
    })
  }

  function addDay(planIndex) {
    const defaultDate = alignDateToWeekday(`${year}-05-01`, 'friday')
    updatePlan(planIndex, (plan) => ({
      ...plan,
      days: [
        ...plan.days,
        {
          id: `friday-${plan.days.length + 1}`,
          label: 'Friday',
          playDay: 'friday',
          startDate: defaultDate,
          divisionCount: 1,
          teamCount: 8,
        },
      ],
    }))
  }

  function removeDay(planIndex, dayIndex) {
    updatePlan(planIndex, (plan) => ({
      ...plan,
      days: plan.days.filter((_, i) => i !== dayIndex),
    }))
  }

  async function buildDraft() {
    const enabled = plans.filter((plan) => plan.enabled)
    if (!enabled.length) {
      setError('Keep at least one league')
      return
    }
    for (const plan of enabled) {
      if (!plan.days.length) {
        setError(`${plan.name}: choose at least one playing day`)
        return
      }
      for (const day of plan.days) {
        if (!day.startDate) {
          setError(`${plan.name} · ${day.label}: choose a start date`)
          return
        }
      }
    }
    setBusy(true)
    setError(null)
    try {
      await admin.startSeason(year, plans)
      onCreated?.(year)
    } catch (err) {
      setError(err.message || 'Could not build the season')
    } finally {
      setBusy(false)
    }
  }

  if (step === 0) {
    return (
      <section className="home-section season-wizard">
        <p className="season-wizard__step">Step 1 of 3</p>
        <h2 className="season-wizard__title">Which season are you creating?</h2>
        <p className="season-wizard__lead">
          Nothing becomes public until the final Publish step.
        </p>
        <div className="tile season-wizard__year">
          <label>
            <span>Season year</span>
            <input
              type="text"
              inputMode="numeric"
              className="admin-input season-panel__year"
              value={yearText}
              onChange={(ev) => setYearText(ev.target.value)}
            />
          </label>
          <button type="button" className="entry-rowact entry-rowact--save" onClick={beginStructure}>
            Choose league structure →
          </button>
        </div>
        {draftSeasons.length ? (
          <div className="season-wizard__drafts">
            <strong>Already started:</strong>
            {draftSeasons.map((draft) => (
              <button
                key={draft}
                type="button"
                className="dates-tile__toggle"
                onClick={() => onContinueDraft?.(draft)}
              >
                Continue {draft} →
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="admin-error">{error}</p> : null}
      </section>
    )
  }

  const totalDivisions = plans
    .filter((plan) => plan.enabled)
    .flatMap((plan) => plan.days)
    .reduce((sum, day) => sum + Number(day.divisionCount || 0), 0)

  return (
    <section className="home-section season-wizard">
      <p className="season-wizard__step">Step 2 of 3</p>
      <h2 className="season-wizard__title">Set this season’s shape</h2>
      <p className="season-wizard__lead">
        Choose playing days, divisions and team slots. We’ll build blank division forms next.
      </p>

      <div className="season-wizard__leagues">
        {plans.map((plan, planIndex) => (
          <section key={plan.sourceLeagueId} className={`tile season-plan${!plan.enabled ? ' season-plan--off' : ''}`}>
            <header className="season-plan__head">
              <label className="season-plan__keep">
                <input
                  type="checkbox"
                  checked={plan.enabled}
                  onChange={(ev) =>
                    updatePlan(planIndex, (old) => ({ ...old, enabled: ev.target.checked }))
                  }
                />
                <strong>{plan.name.replace(/\s+\d{4}\b/, '')}</strong>
              </label>
              <span>{plan.days.reduce((n, d) => n + Number(d.divisionCount || 0), 0)} divisions</span>
            </header>

            {plan.enabled ? (
              <>
                <div className="season-plan__labels" aria-hidden="true">
                  <span>Playing day</span>
                  <span>Start date</span>
                  <span>Divisions</span>
                  <span>Teams in each</span>
                  <span />
                </div>
                <div className="season-plan__days">
                  {plan.days.map((day, dayIndex) => (
                    <div key={`${day.id}-${dayIndex}`} className="season-plan__day">
                      <span className="season-plan__dayname">
                        <select
                          className="admin-input"
                          value={day.playDay}
                          aria-label={`${plan.name} playing day`}
                          onChange={(ev) => changePlayDay(planIndex, dayIndex, ev.target.value)}
                        >
                          {WEEKDAYS.map((weekday) => (
                            <option key={weekday} value={weekday}>{titleCase(weekday)}</option>
                          ))}
                        </select>
                        {plan.sectioned ? (
                          <input
                            className="admin-input"
                            value={day.label}
                            aria-label={`${titleCase(day.playDay)} session name`}
                            onChange={(ev) => updateDay(planIndex, dayIndex, { label: ev.target.value })}
                          />
                        ) : null}
                      </span>
                      <input
                        type="date"
                        className="dates-tile__input"
                        value={day.startDate}
                        aria-label={`${day.label} start date`}
                        onChange={(ev) => updateDay(planIndex, dayIndex, { startDate: ev.target.value })}
                      />
                      <input
                        type="number"
                        min="1"
                        max="26"
                        className="admin-input season-plan__number"
                        value={day.divisionCount}
                        aria-label={`${day.label} number of divisions`}
                        onChange={(ev) => updateDay(planIndex, dayIndex, { divisionCount: ev.target.value })}
                      />
                      <span className="season-plan__teams">
                        <input
                          type="number"
                          min="2"
                          max="30"
                          className="admin-input season-plan__number"
                          value={day.teamCount}
                          aria-label={`${day.label} teams per division`}
                          onChange={(ev) => updateDay(planIndex, dayIndex, { teamCount: ev.target.value })}
                        />
                        {Number(day.teamCount) % 2 === 1 ? <small>+ 1 bye slot</small> : null}
                      </span>
                      <button
                        type="button"
                        className="entry-rowact entry-rowact--clear"
                        disabled={plan.days.length === 1}
                        onClick={() => removeDay(planIndex, dayIndex)}
                      >
                        Remove day
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" className="add-inline__open" onClick={() => addDay(planIndex)}>
                  + Add playing day
                </button>
              </>
            ) : (
              <p className="team-slots__hint">This league will not be included in {year}.</p>
            )}
          </section>
        ))}
      </div>

      <footer className="season-wizard__foot">
        <button type="button" className="entry-rowact entry-rowact--cancel" onClick={() => setStep(0)}>
          ← Back
        </button>
        <span>{totalDivisions} blank division forms will be created</span>
        <button
          type="button"
          className="entry-rowact entry-rowact--save"
          disabled={busy}
          onClick={buildDraft}
        >
          {busy ? 'Building…' : 'Build blank leagues →'}
        </button>
      </footer>
      {error ? <p className="admin-error">{error}</p> : null}
    </section>
  )
}
