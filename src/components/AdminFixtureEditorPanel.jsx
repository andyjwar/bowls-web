import { useEffect, useMemo, useState } from 'react'
import {
  formatCsvImportEntryLabel,
  serializeAdminMatchRows,
  weekResultRowToForm,
} from '../lib/adminMatchPayload'

function formFromEntrySnapshot(entry) {
  const hp =
    entry.homePoints != null && Number.isFinite(entry.homePoints)
      ? String(entry.homePoints)
      : ''
  const ap =
    entry.awayPoints != null && Number.isFinite(entry.awayPoints)
      ? String(entry.awayPoints)
      : ''
  const hs =
    entry.homeShots != null && Number.isFinite(entry.homeShots)
      ? String(entry.homeShots)
      : ''
  const asVal =
    entry.awayShots != null && Number.isFinite(entry.awayShots)
      ? String(entry.awayShots)
      : ''
  const md = entry.matchDateIso != null ? String(entry.matchDateIso).trim() : ''
  return {
    home: entry.scheduleHome ?? '',
    away: entry.scheduleAway ?? '',
    homePoints: hp,
    awayPoints: ap,
    homeShots: hs,
    awayShots: asVal,
    homePlayersText: entry.homePlayersText != null ? String(entry.homePlayersText) : '',
    awayPlayersText: entry.awayPlayersText != null ? String(entry.awayPlayersText) : '',
    matchDate: md,
    rinkShotsJson: entry.rinkShotsJson != null ? String(entry.rinkShotsJson) : '',
    players: null,
  }
}

/** @typedef {{ leagueId: string, sectionId?: string|null, divisionId: string, week?: number|null, csvRow: number, scheduleHome: string, scheduleAway: string, homeShots?: number, awayShots?: number, homePoints?: number, awayPoints?: number, pendingSave?: boolean, pendingIssues?: string[], homePlayersText?: string, awayPlayersText?: string, matchDateIso?: string, rinkShotsJson?: string }} CsvImportEntry */

/**
 * @param {{
 *   entry: CsvImportEntry,
 *   leagues: object[],
 *   admin: object,
 *   onClose: () => void,
 *   onSaved: (msg: string, meta?: { clearedPendingCsvRow?: number }) => void,
 * }} props
 */
export function AdminFixtureEditorPanel({ entry, leagues, admin, onClose, onSaved }) {
  const needsTargetPick = Boolean(entry.pendingSave)

  const [pickLeagueId, setPickLeagueId] = useState(() =>
    String(entry.leagueId ?? '').trim(),
  )
  const [pickSectionId, setPickSectionId] = useState(() => entry.sectionId ?? '')
  const [pickDivisionId, setPickDivisionId] = useState(() =>
    String(entry.divisionId ?? '').trim(),
  )
  const [pickWeek, setPickWeek] = useState(() =>
    entry.week != null && Number.isFinite(entry.week) ? String(entry.week) : '',
  )

  const [form, setForm] = useState(() => formFromEntrySnapshot(entry))
  const [fixtureWeekDate, setFixtureWeekDate] = useState(null)
  const [loading, setLoading] = useState(true)

  const resolvedLeague = leagues.find((l) => l.id === pickLeagueId) ?? null
  const sectionList = resolvedLeague?.sections ?? []
  const flatDivisions = resolvedLeague?.divisions ?? []
  const divisionOptions = useMemo(() => {
    if (sectionList.length > 0) {
      const sec = sectionList.find((s) => s.id === pickSectionId)
      return sec?.divisions ?? []
    }
    return flatDivisions
  }, [sectionList, flatDivisions, pickSectionId])

  useEffect(() => {
    if (!needsTargetPick) return
    const lg = leagues.find((l) => l.id === pickLeagueId)
    const secs = lg?.sections ?? []
    if (!secs.length) return
    if (!pickSectionId || !secs.some((s) => s.id === pickSectionId)) {
      setPickSectionId(secs[0].id)
    }
  }, [needsTargetPick, leagues, pickLeagueId, pickSectionId])

  const loadWeekParams = useMemo(() => {
    if (!needsTargetPick) {
      return {
        leagueId: entry.leagueId,
        sectionId: entry.sectionId ?? undefined,
        divisionId: entry.divisionId,
        week: entry.week,
      }
    }
    const lg = leagues.find((l) => l.id === pickLeagueId.trim())
    const secs = lg?.sections ?? []
    const sid = secs.length > 0 ? pickSectionId || secs[0]?.id : undefined
    return {
      leagueId: pickLeagueId.trim(),
      sectionId: sid,
      divisionId: pickDivisionId.trim(),
      week: Number(pickWeek),
    }
  }, [
    needsTargetPick,
    entry.leagueId,
    entry.sectionId,
    entry.divisionId,
    entry.week,
    leagues,
    pickLeagueId,
    pickSectionId,
    pickDivisionId,
    pickWeek,
  ])

  const canLoadSaved = useMemo(() => {
    if (!needsTargetPick) return true
    const { leagueId: lid, divisionId: did, week: wk } = loadWeekParams
    if (!lid || !did || !Number.isFinite(wk) || wk < 1) return false
    const lg = leagues.find((l) => l.id === lid)
    const secs = lg?.sections ?? []
    if (secs.length > 0 && !loadWeekParams.sectionId) return false
    return true
  }, [needsTargetPick, loadWeekParams, leagues])

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    const snapshotForm = formFromEntrySnapshot(entry)

    if (!needsTargetPick) {
      setForm(snapshotForm)
      admin
        .loadWeekResults({
          leagueId: entry.leagueId,
          sectionId: entry.sectionId ?? undefined,
          divisionId: entry.divisionId,
          week: entry.week,
        })
        .then((data) => {
          if (cancelled) return
          setFixtureWeekDate(data.fixtureWeekDate ?? null)
          const found = data.matches?.find(
            (r) =>
              r.home === entry.scheduleHome &&
              r.away === entry.scheduleAway,
          )
          setForm(found ? weekResultRowToForm(found) : snapshotForm)
        })
        .catch(() => {
          if (cancelled) return
          setForm(snapshotForm)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
      return () => {
        cancelled = true
      }
    }

    setForm(snapshotForm)

    if (!canLoadSaved) {
      setFixtureWeekDate(null)
      setLoading(false)
      return () => {
        cancelled = true
      }
    }

    admin
      .loadWeekResults({
        leagueId: loadWeekParams.leagueId,
        sectionId: loadWeekParams.sectionId,
        divisionId: loadWeekParams.divisionId,
        week: loadWeekParams.week,
      })
      .then((data) => {
        if (cancelled) return
        setFixtureWeekDate(data.fixtureWeekDate ?? null)
        const found = data.matches?.find(
          (r) =>
            r.home === entry.scheduleHome &&
            r.away === entry.scheduleAway,
        )
        setForm(found ? weekResultRowToForm(found) : snapshotForm)
      })
      .catch(() => {
        if (cancelled) return
        setForm(snapshotForm)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [admin, entry, needsTargetPick, canLoadSaved, loadWeekParams])

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    try {
      const outgoing = serializeAdminMatchRows([form])
      if (!outgoing.length) {
        throw new Error('Home and away team names are required.')
      }

      const saveLeagueId = needsTargetPick ? loadWeekParams.leagueId : entry.leagueId
      const saveSectionId = needsTargetPick
        ? loadWeekParams.sectionId
        : entry.sectionId || undefined
      const saveDivisionId = needsTargetPick ? loadWeekParams.divisionId : entry.divisionId
      const saveWeek = needsTargetPick ? loadWeekParams.week : entry.week

      if (
        needsTargetPick &&
        (!String(saveLeagueId).trim() ||
          !String(saveDivisionId).trim() ||
          !Number.isFinite(saveWeek) ||
          saveWeek < 1)
      ) {
        throw new Error('Choose league, division and schedule round before saving.')
      }

      await admin.applyResults({
        leagueId: saveLeagueId,
        sectionId: saveSectionId,
        divisionId: saveDivisionId,
        week: saveWeek,
        matches: outgoing,
      })
      const msg =
        outgoing.length === 1 && outgoing[0].clear
          ? 'Cleared saved result for this fixture.'
          : needsTargetPick
            ? 'Saved fixture (was awaiting confirmation). Refresh league pages to see updates.'
            : 'Saved fixture. Refresh league pages to see updates.'
      onSaved(
        msg,
        entry.pendingSave && entry.csvRow != null
          ? { clearedPendingCsvRow: entry.csvRow }
          : undefined,
      )
      onClose()
    } catch (err) {
      admin.setError(err.message || String(err))
    }
  }

  const title = formatCsvImportEntryLabel(leagues, {
    ...entry,
    leagueId: pickLeagueId.trim() || entry.leagueId,
    sectionId: sectionList.length > 0 ? pickSectionId : entry.sectionId,
    divisionId: pickDivisionId.trim() || entry.divisionId,
    week:
      Number.isFinite(Number(pickWeek)) && String(pickWeek).trim() !== ''
        ? Number(pickWeek)
        : entry.week,
  })

  const modalEyebrow = needsTargetPick ? 'Confirm CSV row' : 'Edit fixture'

  return (
    <div
      className="admin-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!admin.busy) onClose()
      }}
    >
      <div
        className="admin-modal-surface"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-fixture-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div>
            <p className="admin-modal-eyebrow">{modalEyebrow}</p>
            <h2 id="admin-fixture-editor-title" className="admin-modal-title">
              {entry.scheduleHome} v {entry.scheduleAway}
            </h2>
            <p className="admin-modal-meta">{title}</p>
            {fixtureWeekDate != null && String(fixtureWeekDate).trim() !== '' ? (
              <p className="admin-modal-meta">Fixture sheet date {fixtureWeekDate}</p>
            ) : null}
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={onClose}
            disabled={admin.busy}
          >
            Close
          </button>
        </div>

        {needsTargetPick && entry.pendingIssues?.length ? (
          <div className="admin-pending-issues" role="status">
            <p className="admin-pending-issues__title">CSV flagged this row — finish below, then save.</p>
            <ul className="admin-pending-issues__list">
              {entry.pendingIssues.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {needsTargetPick ? (
          <div className="admin-grid admin-grid--fixture-meta">
            <label className="admin-field">
              <span className="admin-label">League</span>
              <select
                className="admin-input"
                value={pickLeagueId}
                onChange={(e) => {
                  const v = e.target.value
                  setPickLeagueId(v)
                  setPickDivisionId('')
                }}
              >
                <option value="">Select…</option>
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? l.id}
                  </option>
                ))}
              </select>
            </label>
            {sectionList.length > 0 ? (
              <label className="admin-field">
                <span className="admin-label">Section</span>
                <select
                  className="admin-input"
                  value={pickSectionId}
                  onChange={(e) => {
                    setPickSectionId(e.target.value)
                    setPickDivisionId('')
                  }}
                >
                  {sectionList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="admin-field">
              <span className="admin-label">Division</span>
              <select
                className="admin-input"
                value={pickDivisionId}
                onChange={(e) => setPickDivisionId(e.target.value)}
              >
                <option value="">Select…</option>
                {divisionOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span className="admin-label">Schedule round</span>
              <input
                className="admin-input"
                type="number"
                min={1}
                max={52}
                value={pickWeek}
                onChange={(e) => setPickWeek(e.target.value)}
                placeholder="Fixture list position (1–52)"
              />
            </label>
          </div>
        ) : null}

        {loading ? (
          <p className="page-lead">Loading saved numbers…</p>
        ) : (
          <form className="admin-fixture-edit-form" onSubmit={handleSave}>
            <div className="admin-grid admin-grid--fixture-editor">
              <label className="admin-field admin-field--span2">
                <span className="admin-label">Home club</span>
                <input
                  className="admin-input"
                  value={form.home}
                  onChange={(e) => update('home', e.target.value)}
                  required
                />
              </label>
              <label className="admin-field admin-field--span2">
                <span className="admin-label">Away club</span>
                <input
                  className="admin-input"
                  value={form.away}
                  onChange={(e) => update('away', e.target.value)}
                  required
                />
              </label>

              <label className="admin-field">
                <span className="admin-label">Home pts</span>
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  value={form.homePoints}
                  onChange={(e) => update('homePoints', e.target.value)}
                />
              </label>
              <label className="admin-field">
                <span className="admin-label">Away pts</span>
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  value={form.awayPoints}
                  onChange={(e) => update('awayPoints', e.target.value)}
                />
              </label>

              <label className="admin-field">
                <span className="admin-label">Home shots</span>
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  value={form.homeShots}
                  onChange={(e) => update('homeShots', e.target.value)}
                />
              </label>
              <label className="admin-field">
                <span className="admin-label">Away shots</span>
                <input
                  className="admin-input"
                  type="number"
                  min="0"
                  value={form.awayShots}
                  onChange={(e) => update('awayShots', e.target.value)}
                />
              </label>

              <label className="admin-field admin-field--span2">
                <span className="admin-label">Home players (; or newline)</span>
                <textarea
                  className="admin-input admin-textarea--cell"
                  rows={3}
                  value={form.homePlayersText}
                  onChange={(e) => update('homePlayersText', e.target.value)}
                  placeholder=""
                />
              </label>
              <label className="admin-field admin-field--span2">
                <span className="admin-label">Away players (; or newline)</span>
                <textarea
                  className="admin-input admin-textarea--cell"
                  rows={3}
                  value={form.awayPlayersText}
                  onChange={(e) => update('awayPlayersText', e.target.value)}
                  placeholder=""
                />
              </label>

              <label className="admin-field admin-field--span2">
                <span className="admin-label">Match date (optional)</span>
                <input
                  className="admin-input"
                  value={form.matchDate}
                  onChange={(e) => update('matchDate', e.target.value)}
                  placeholder=""
                />
              </label>

              <label className="admin-field admin-field--span2">
                <span className="admin-label">Rink shots JSON (optional)</span>
                <textarea
                  className="admin-input admin-textarea--cell admin-textarea--rink"
                  rows={3}
                  value={form.rinkShotsJson}
                  onChange={(e) => update('rinkShotsJson', e.target.value)}
                  placeholder=""
                />
              </label>
            </div>

            <p className="page-lead admin-note">
              Leave <strong>both</strong> shot fields blank and save to remove this result from saved
              scores.
            </p>

            <div className="admin-actions">
              <button type="submit" className="admin-btn" disabled={admin.busy}>
                {admin.busy ? 'Saving…' : needsTargetPick ? 'Confirm and save fixture' : 'Save fixture'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
