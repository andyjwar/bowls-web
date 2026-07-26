import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { joinPlayerNameParts, sortPlayerRowsForDisplay, splitStoredPlayerName } from '../lib/rosterNameFields'

/** Playable club names in league list order (excluding blanks and Bye). */
function teamNamesForRosterUi(teamsOrdered) {
  if (!teamsOrdered?.length) return []
  return teamsOrdered
    .map((name) => String(name ?? '').trim())
    .filter((n) => n && n !== 'Bye')
}

const emptyNameRow = () => ({ first: '', last: '' })

/** Default roster grid height (two balanced columns). Rows always padded to even length so left/right stay aligned. */
const REGISTERED_ROWS_PER_COLUMN = 6

const DEFAULT_PLAYER_ROWS = REGISTERED_ROWS_PER_COLUMN * 2

const makeEmptyPlayerGrid = () => Array.from({ length: DEFAULT_PLAYER_ROWS }, () => emptyNameRow())

function padPlayerRows(rows, min = DEFAULT_PLAYER_ROWS) {
  const next = rows.map((r) => ({ ...r }))
  while (next.length < min) next.push(emptyNameRow())
  while (next.length % 2 === 1) next.push(emptyNameRow())
  return next
}

/**
 * `registered-players.json` — master authorised list per club, edited on this tab only.
 * Names from results spreadsheets and other flows are compared against this data; it is not
 * created or owned by the Results & CSV import step (though optional player-lines in a sheet
 * may still append to the same file when present).
 *
 * @param {{ admin: object }} props
 */
export function AdminRegisteredTeamsPanel({ admin }) {
  const leagues = admin.leagues ?? []
  /** When true, skip re-hydrating the grid from `roster` (avoids wiping paste/upload after async roster reload). */
  const skipServerHydrateRef = useRef(false)
  const playersShellRef = useRef(null)
  const [leagueId, setLeagueId] = useState(() => leagues[0]?.id ?? '')
  const [sectionId, setSectionId] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [teamName, setTeamName] = useState('')
  const [roster, setRoster] = useState(null)
  /** @type {Array<{ first: string, last: string }>} */
  const [playerRows, setPlayerRows] = useState(makeEmptyPlayerGrid)
  const [msg, setMsg] = useState('')
  const [localError, setLocalError] = useState('')
  const [teamUploadPaste, setTeamUploadPaste] = useState('')
  const [teamUploadError, setTeamUploadError] = useState('')

  const leagueMeta = useMemo(() => leagues.find((l) => l.id === leagueId) ?? null, [leagues, leagueId])
  const sectionList = leagueMeta?.sections ?? []

  const divisionOptions = useMemo(() => {
    if (!leagueMeta) return []
    if (sectionList.length) {
      const sec = sectionList.find((s) => s.id === sectionId)
      return sec?.divisions ?? []
    }
    return leagueMeta.divisions ?? []
  }, [leagueMeta, sectionId, sectionList])

  const teamOptions = useMemo(() => {
    const div = divisionOptions.find((d) => d.id === divisionId)
    if (!div?.teams) return []
    return teamNamesForRosterUi(div.teams)
  }, [divisionOptions, divisionId])

  useEffect(() => {
    if (leagues.length && !leagueId) setLeagueId(leagues[0].id)
  }, [leagues, leagueId])

  useEffect(() => {
    let cancelled = false
    admin
      .loadRegisteredPlayersMap()
      .then((d) => {
        if (!cancelled) setRoster(d.roster ?? {})
      })
      .catch(() => {
        if (!cancelled) setRoster({})
      })
    return () => {
      cancelled = true
    }
  }, [admin])

  useEffect(() => {
    setLocalError('')
  }, [leagueId])

  useEffect(() => {
    if (!leagueMeta) return

    if (!sectionList.length) {
      if (sectionId) setSectionId('')
      return
    }

    const valid = sectionList.some((s) => s.id === sectionId)
    if (!valid) {
      setSectionId(sectionList[0].id)
    }
  }, [leagueMeta, leagueId, sectionList, sectionId])

  useEffect(() => {
    if (!divisionOptions.length) {
      setDivisionId('')
      return
    }
    if (divisionId && !divisionOptions.some((d) => d.id === divisionId)) {
      setDivisionId('')
    }
  }, [divisionOptions, divisionId])

  useEffect(() => {
    if (!teamOptions.length) {
      setTeamName('')
      return
    }
    if (!teamOptions.includes(teamName)) {
      setTeamName(teamOptions[0] ?? '')
    }
  }, [teamOptions, teamName])

  useEffect(() => {
    skipServerHydrateRef.current = false
  }, [leagueId, sectionId, divisionId, teamName])

  const applyRosterToRows = useCallback(() => {
    if (!roster || !leagueId || !teamName) {
      setPlayerRows(makeEmptyPlayerGrid())
      return
    }
    const secKey = sectionList.length ? sectionId : '_'
    const bucket = roster[leagueId] ?? {}
    const list = bucket[secKey]?.[teamName] ?? bucket._?.[teamName] ?? []
    const arr = Array.isArray(list) ? list.map((s) => splitStoredPlayerName(String(s ?? ''))) : []
    if (!arr.length) {
      setPlayerRows(makeEmptyPlayerGrid())
      return
    }
    setPlayerRows(padPlayerRows(arr, DEFAULT_PLAYER_ROWS))
  }, [roster, leagueId, sectionId, teamName, sectionList.length])

  useEffect(() => {
    if (skipServerHydrateRef.current) return
    applyRosterToRows()
  }, [applyRosterToRows])

  function markLocalGridEdits() {
    skipServerHydrateRef.current = true
  }

  function scrollRosterGridIntoView() {
    queueMicrotask(() =>
      playersShellRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }),
    )
  }

  const reloadRoster = useCallback(async () => {
    const d = await admin.loadRegisteredPlayersMap()
    setRoster(d.roster ?? {})
  }, [admin])

  const seededLeaguesRef = useRef(new Set())

  /** One quiet pass per league: ensure every playable club gets a roster bucket ([] if new). */
  useEffect(() => {
    if (!leagueId) return
    if (seededLeaguesRef.current.has(leagueId)) return
    seededLeaguesRef.current.add(leagueId)

    let cancelled = false
    admin
      .seedRegisteredPlayersFromLeague(leagueId)
      .then(() => {
        if (!cancelled) return reloadRoster()
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [leagueId, admin, reloadRoster])

  function updatePlayerField(index, field, value) {
    markLocalGridEdits()
    setPlayerRows((prev) => {
      const next = prev.map((row, i) =>
        i === index ? { ...row, [field]: value } : row,
      )
      return next
    })
  }

  function removePlayerRow(index) {
    markLocalGridEdits()
    setPlayerRows((prev) => {
      let next = prev.filter((_, i) => i !== index)
      return padPlayerRows(next, DEFAULT_PLAYER_ROWS)
    })
  }

  function addPlayerRow() {
    markLocalGridEdits()
    setPlayerRows((prev) => padPlayerRows([...prev, emptyNameRow()], DEFAULT_PLAYER_ROWS))
  }

  function applyParsedNamesToGrid(names) {
    markLocalGridEdits()
    const trimmed = names.map((n) => String(n ?? '').trim()).filter(Boolean)
    const rows = sortPlayerRowsForDisplay(trimmed.map((full) => splitStoredPlayerName(full)))
    setPlayerRows(padPlayerRows(rows, Math.max(DEFAULT_PLAYER_ROWS, rows.length)))
    scrollRosterGridIntoView()
  }

  function sortRosterGridAZ() {
    if (!teamName) return
    markLocalGridEdits()
    const nonempty = playerRows.filter(
      (r) => String(r.first ?? '').trim() || String(r.last ?? '').trim(),
    )
    if (!nonempty.length) {
      setTeamUploadError('')
      setMsg('Add or paste names before sorting.')
      return
    }
    const sorted = sortPlayerRowsForDisplay(nonempty)
    setPlayerRows(padPlayerRows(sorted, Math.max(DEFAULT_PLAYER_ROWS, sorted.length)))
    setMsg('Sorted registered players A–Z (surname, then initial).')
    setTeamUploadError('')
  }

  async function handleApplyPastedTeamList() {
    if (!teamName) return
    setTeamUploadError('')
    setMsg('')
    try {
      const d = await admin.parseRegisteredTeamListText(teamUploadPaste)
      const names = Array.isArray(d.names) ? d.names : []
      if (!names.length) {
        setTeamUploadError('No names found — try one name per line, or commas between columns.')
        return
      }
      applyParsedNamesToGrid(names)
      setMsg(`Loaded ${names.length} name(s) from pasted text (sorted A–Z). Review and Save when ready.`)
    } catch (err) {
      setTeamUploadError(err.message || String(err))
    }
  }

  async function handleTeamListFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!teamName) {
      setTeamUploadError('Choose a club above first — upload applies names to that club\'s grid.')
      return
    }
    setTeamUploadError('')
    setMsg('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const d = await admin.parseRegisteredTeamListFile(fd)
      const names = Array.isArray(d.names) ? d.names : []
      if (!names.length) {
        setTeamUploadError('No names found in that file.')
        return
      }
      applyParsedNamesToGrid(names)
      setMsg(`Loaded ${names.length} name(s) from “${file.name}” (sorted A–Z). Review and Save when ready.`)
    } catch (err) {
      setTeamUploadError(err.message || String(err))
    }
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!teamName) return
    setMsg('')
    setLocalError('')
    const players = playerRows
      .map((row) => joinPlayerNameParts(row.first, row.last))
      .filter(Boolean)
    const secKey = sectionList.length ? sectionId : '_'
    try {
      await admin.saveRegisteredTeamSheet({
        leagueId,
        sectionId: secKey,
        teamName,
        players,
      })
      skipServerHydrateRef.current = false
      await reloadRoster()
      setPlayerRows(
        players.length
          ? padPlayerRows(
              players.map((full) => splitStoredPlayerName(full)),
              DEFAULT_PLAYER_ROWS,
            )
          : makeEmptyPlayerGrid(),
      )
      setMsg(`Saved ${players.length} registered name(s) for ${teamName}.`)
    } catch (err) {
      setLocalError(err.message || String(err))
    }
  }



  function renderPlayerSlot(row, idx) {
    return (
      <li key={`row-${idx}`} className="admin-roster-player-row">
        <div className="admin-roster-name-row">
          <input
            className="admin-input admin-roster-name-line admin-roster-name-line--initial"
            value={row.first}
            onChange={(e) => updatePlayerField(idx, 'first', e.target.value)}
            spellCheck={false}
            autoComplete="off"
            maxLength={6}
            inputMode="text"
            aria-label={`Player slot ${idx + 1}, initial`}
            disabled={!teamName}
          />
          <input
            className="admin-input admin-roster-name-line admin-roster-name-line--last"
            value={row.last}
            onChange={(e) => updatePlayerField(idx, 'last', e.target.value)}
            spellCheck={false}
            autoComplete="family-name"
            aria-label={`Player slot ${idx + 1}, last name`}
            disabled={!teamName}
          />
        </div>
        <button
          type="button"
          className="admin-roster-remove-slot-btn"
          onClick={() => removePlayerRow(idx)}
          aria-label={`Remove player slot ${idx + 1}`}
          disabled={!teamName}
        >
          <span aria-hidden="true">−</span>
        </button>
      </li>
    )
  }

  function renderRosterColumnHead() {
    return (
      <div className="admin-roster-col-head">
        <span className="admin-roster-col-head-label admin-roster-col-head-label--initial admin-roster-name-field-label">
          Initial
        </span>
        <span className="admin-roster-col-head-label admin-roster-col-head-label--last admin-roster-name-field-label">
          Last
        </span>
        <span className="admin-roster-col-head-spacer" aria-hidden="true" />
      </div>
    )
  }

  /** Balanced columns: first half of the array is the left stack, second half the right stack. */
  const rosterColumnSplit = playerRows.length / 2
  const leftSlots = playerRows.slice(0, rosterColumnSplit)
  const rightSlots = playerRows.slice(rosterColumnSplit)

  return (
    <section className="tile">
      <h2 className="tile-title">Registered teams — player lists</h2>

      <form className="admin-form admin-roster-form" onSubmit={handleSave}>
        <div className="admin-roster-filters">
          <div className="admin-roster-filter-group">
            <span className="admin-roster-filter-label">League</span>
            <div className="admin-roster-filter-pills" role="group" aria-label="League">
              {leagues.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={`admin-roster-filter-pill${leagueId === l.id ? ' admin-roster-filter-pill--active' : ''}`}
                  onClick={() => {
                    setLeagueId(l.id)
                  }}
                >
                  {l.name ?? l.id}
                </button>
              ))}
            </div>
          </div>

          {sectionList.length > 0 ? (
            <div className="admin-roster-filter-group">
              <span className="admin-roster-filter-label">Section / day</span>
              <div className="admin-roster-filter-pills" role="group" aria-label="Section">
                {sectionList.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`admin-roster-filter-pill${sectionId === s.id ? ' admin-roster-filter-pill--active' : ''}`}
                    onClick={() => setSectionId(s.id)}
                  >
                    {s.label ?? s.id}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {divisionOptions.length > 0 ? (
            <div className="admin-roster-filter-group">
              <span className="admin-roster-filter-label">Division</span>
              <div className="admin-roster-filter-pills" role="group" aria-label="Division">
                {divisionOptions.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`admin-roster-filter-pill${divisionId === d.id ? ' admin-roster-filter-pill--active' : ''}`}
                    onClick={() => setDivisionId(d.id)}
                  >
                    {d.label ?? d.id}
                  </button>
                ))}
              </div>
            </div>
          ) : leagueMeta ? (
            <p className="admin-note admin-roster-empty-filters">This league has no divisions configured.</p>
          ) : null}

          {divisionOptions.length > 0 && !divisionId ? (
            <p className="admin-note admin-roster-empty-filters">
              Choose a <strong>division</strong> above — then pick a club from the list.
            </p>
          ) : null}

          {divisionId && teamOptions.length > 0 ? (
            <div className="admin-roster-filter-group">
              <label className="admin-roster-filter-label" htmlFor="admin-roster-club-select">
                Club
              </label>
              <select
                id="admin-roster-club-select"
                className="admin-input admin-roster-club-select"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                aria-label="Club"
              >
                {teamOptions.map((name) => (
                  <option key={`${divisionId}-${name}`} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {divisionId && divisionOptions.length > 0 && teamOptions.length === 0 ? (
            <p className="admin-note admin-roster-empty-filters">
              No club names yet on this division’s team sheet. Open <strong>League setup</strong>, choose the
              same league/section/division, enter clubs <strong>one per line</strong>, save, then refresh this
              tab.
            </p>
          ) : null}
        </div>

        {teamName ? (
          <>
            <div className="admin-roster-players-shell" ref={playersShellRef}>
              <div className="admin-roster-players-head">
                <span className="admin-label">Registered players</span>
                <div className="admin-roster-players-head-btns">
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-roster-sort-btn"
                    onClick={sortRosterGridAZ}
                    disabled={admin.busy}
                    title="Sort filled rows by surname, then initial"
                  >
                    Sort A–Z
                  </button>
                  <button
                    type="button"
                    className="admin-btn admin-btn--ghost admin-roster-add-btn"
                    onClick={addPlayerRow}
                  >
                    Add player
                  </button>
                </div>
              </div>

              <div className="admin-roster-players-cols">
                <div className="admin-roster-player-col">
                  {renderRosterColumnHead()}
                  <ul className="admin-roster-player-list">
                    {leftSlots.map((row, i) => renderPlayerSlot(row, i))}
                  </ul>
                </div>
                <div className="admin-roster-player-col">
                  {renderRosterColumnHead()}
                  <ul className="admin-roster-player-list">
                    {rightSlots.map((row, i) =>
                      renderPlayerSlot(row, i + rosterColumnSplit),
                    )}
                  </ul>
                </div>
              </div>
            </div>

            <div className="admin-roster-upload-section">
              <h3 className="admin-roster-upload-title">Upload team list</h3>
              <p className="admin-note admin-roster-upload-hint">
                For <strong>{teamName}</strong>: paste or upload a list. Parsed lines are deduped and sorted{' '}
                <strong>A–Z</strong> (by surname, then initial). Supported: comma-separated or tabbed columns
                (e.g. Last, First), one name per line, numbered lists, UTF-8 <strong>.csv</strong> /{' '}
                <strong>.txt</strong>, or Excel <strong>.xlsx</strong> / <strong>.xls</strong> (first sheet).
                Use <strong>Save registered list</strong> to persist.
              </p>
              <textarea
                className="admin-input admin-roster-upload-textarea"
                rows={5}
                placeholder={'Example:\nSmith J\nJones, Mary\n12 Williams R'}
                value={teamUploadPaste}
                onChange={(e) => setTeamUploadPaste(e.target.value)}
                spellCheck={false}
                disabled={admin.busy}
                aria-label="Paste team names"
              />
              <div className="admin-roster-upload-actions">
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost admin-roster-upload-paste-btn"
                  disabled={admin.busy || !teamUploadPaste.trim()}
                  onClick={() => handleApplyPastedTeamList()}
                >
                  Apply pasted text
                </button>
                <label className="admin-upload admin-roster-upload-file">
                  <input
                    type="file"
                    accept=".csv,.txt,.xlsx,.xls,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    onChange={handleTeamListFileChange}
                    disabled={admin.busy}
                  />
                  <span className="admin-upload__label">
                    {admin.busy ? 'Parsing…' : 'Choose file (.csv, .txt, Excel)'}
                  </span>
                </label>
              </div>
              {teamUploadError ? <p className="admin-error">{teamUploadError}</p> : null}
            </div>

            {localError ? <p className="admin-error">{localError}</p> : null}
            {msg ? <p className="admin-success">{msg}</p> : null}

            <div className="admin-actions">
              <button type="submit" className="admin-btn" disabled={admin.busy}>
                {admin.busy ? 'Saving…' : 'Save registered list'}
              </button>
            </div>
          </>
        ) : null}
      </form>
    </section>
  )
}
