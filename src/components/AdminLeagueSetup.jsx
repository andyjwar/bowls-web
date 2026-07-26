import { useEffect, useMemo, useState } from 'react'

function findDivision(league, sectionId, divisionId) {
  if (!league) return { division: null }
  if (league.sections?.length) {
    const section = league.sections.find((s) => s.id === sectionId)
    const division = section?.divisions?.find((d) => d.id === divisionId)
    return { division }
  }
  const division = league.divisions?.find((d) => d.id === divisionId)
  return { division }
}

/** Hidden for now — set `true` to show Add league / section / division drawers again. */
const SHOW_LEAGUE_STRUCTURE_ADD_PANELS = false

/**
 * Edit club names for one division (same number of lines as the fixture sheet — slots are fixed).
 * League / section / division display labels are editable. Optional “Add …” drawers are gated by
 * `SHOW_LEAGUE_STRUCTURE_ADD_PANELS`.
 *
 * @param {{ admin: object }} props
 */
export function AdminLeagueSetup({ admin }) {
  const leagues = admin.leagues ?? []
  const [leagueId, setLeagueId] = useState(() => leagues[0]?.id ?? '')
  const [leagueDoc, setLeagueDoc] = useState(null)
  const [sectionId, setSectionId] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [teamsText, setTeamsText] = useState('')
  const [msg, setMsg] = useState('')
  const [localError, setLocalError] = useState('')

  const [leagueNameDraft, setLeagueNameDraft] = useState('')
  const [sectionLabelDraft, setSectionLabelDraft] = useState('')
  const [divisionLabelDraft, setDivisionLabelDraft] = useState('')
  const [structureMsg, setStructureMsg] = useState('')
  const [structureErr, setStructureErr] = useState('')

  const [newLeagueIdRaw, setNewLeagueIdRaw] = useState('')
  const [newLeagueName, setNewLeagueName] = useState('')
  const [newLeagueCloneFrom, setNewLeagueCloneFrom] = useState('')

  const [newSectionIdRaw, setNewSectionIdRaw] = useState('')
  const [newSectionLabel, setNewSectionLabel] = useState('')
  const [newSectionCloneSchedule, setNewSectionCloneSchedule] = useState('')

  const [newDivisionIdRaw, setNewDivisionIdRaw] = useState('')
  const [newDivisionLabel, setNewDivisionLabel] = useState('')

  useEffect(() => {
    if (leagues.length && !leagueId) {
      setLeagueId(leagues[0].id)
    }
  }, [leagues, leagueId])

  useEffect(() => {
    if (leagues.length && !newLeagueCloneFrom) {
      setNewLeagueCloneFrom(leagues[0].id)
    }
  }, [leagues, newLeagueCloneFrom])

  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    setLocalError('')
    admin
      .loadLeagueDocument(leagueId)
      .then((d) => {
        if (cancelled) return
        setLeagueDoc(d.league ?? null)
      })
      .catch((e) => {
        if (!cancelled) setLocalError(e.message || String(e))
      })
    return () => {
      cancelled = true
    }
  }, [leagueId, admin])

  const sectionList = leagueDoc?.sections ?? []
  const flatDivisions = leagueDoc?.divisions ?? []

  const divisionOptions = useMemo(() => {
    if (sectionList.length) {
      const sec = sectionList.find((s) => s.id === sectionId)
      return sec?.divisions ?? []
    }
    return flatDivisions
  }, [sectionList, sectionId, flatDivisions])

  useEffect(() => {
    setLeagueNameDraft(leagueDoc?.name ?? '')
  }, [leagueDoc?.name, leagueId])

  useEffect(() => {
    if (!leagueDoc) return
    if (sectionList.length && !sectionId) {
      setSectionId(sectionList[0].id)
    }
  }, [leagueDoc, sectionList, sectionId])

  useEffect(() => {
    const sec = sectionList.find((s) => s.id === sectionId)
    setSectionLabelDraft(sec?.label ?? '')
  }, [sectionList, sectionId])

  useEffect(() => {
    if (sectionList.length && !newSectionCloneSchedule) {
      setNewSectionCloneSchedule(sectionList[0].id)
    }
  }, [sectionList, newSectionCloneSchedule])

  useEffect(() => {
    if (!divisionOptions.length) {
      setDivisionId('')
      return
    }
    if (!divisionOptions.some((d) => d.id === divisionId)) {
      setDivisionId(divisionOptions[0].id)
    }
  }, [divisionOptions, divisionId])

  useEffect(() => {
    const div = divisionOptions.find((d) => d.id === divisionId)
    setDivisionLabelDraft(div?.label ?? '')
  }, [divisionOptions, divisionId])

  useEffect(() => {
    if (!leagueDoc || !divisionId) return
    const sid = sectionList.length ? sectionId : null
    const { division } = findDivision(leagueDoc, sid || '', divisionId)
    if (division?.teams?.length) {
      setTeamsText(division.teams.join('\n'))
    } else {
      setTeamsText('')
    }
  }, [leagueDoc, sectionId, divisionId, sectionList.length])

  async function reloadLeagueDoc(id = leagueId) {
    const fresh = await admin.loadLeagueDocument(id)
    setLeagueDoc(fresh.league ?? null)
  }

  async function handleSaveStructureLabels() {
    setStructureErr('')
    setStructureMsg('')
    try {
      await admin.saveLeagueStructureLabels(leagueId, {
        leagueName: leagueNameDraft,
        ...(sectionList.length ? { sectionId, sectionLabel: sectionLabelDraft } : {}),
        divisionId,
        divisionLabel: divisionLabelDraft,
      })
      await admin.loadLeagues()
      await reloadLeagueDoc()
      setStructureMsg('Display names saved.')
    } catch (err) {
      setStructureErr(err.message || String(err))
    }
  }

  async function handleCreateLeague(e) {
    e.preventDefault()
    setStructureErr('')
    setStructureMsg('')
    try {
      const out = await admin.createLeague({
        leagueId: newLeagueIdRaw,
        name: newLeagueName,
        cloneFromLeagueId: newLeagueCloneFrom,
      })
      const nid = out.leagueId
      setNewLeagueIdRaw('')
      setNewLeagueName('')
      setLeagueId(nid)
      setStructureMsg(`League created (${nid}). Fill team names and save as usual.`)
    } catch (err) {
      setStructureErr(err.message || String(err))
    }
  }

  async function handleAddSection(e) {
    e.preventDefault()
    setStructureErr('')
    setStructureMsg('')
    try {
      const out = await admin.addLeagueSection(leagueId, {
        sectionId: newSectionIdRaw,
        label: newSectionLabel,
        cloneScheduleFromSectionId: newSectionCloneSchedule || sectionList[0]?.id,
      })
      setNewSectionIdRaw('')
      setNewSectionLabel('')
      await admin.loadLeagues()
      await reloadLeagueDoc()
      setSectionId(out.sectionId)
      setStructureMsg(`Section added (${out.sectionId}).`)
    } catch (err) {
      setStructureErr(err.message || String(err))
    }
  }

  async function handleAddDivision(e) {
    e.preventDefault()
    setStructureErr('')
    setStructureMsg('')
    try {
      const out = await admin.addLeagueDivision(leagueId, {
        sectionId: sectionList.length ? sectionId : '',
        divisionId: newDivisionIdRaw,
        label: newDivisionLabel,
      })
      setNewDivisionIdRaw('')
      setNewDivisionLabel('')
      await admin.loadLeagues()
      await reloadLeagueDoc()
      setDivisionId(out.divisionId)
      setStructureMsg(`Division added (${out.divisionId}) — placeholders are Team 1… rename them below.`)
    } catch (err) {
      setStructureErr(err.message || String(err))
    }
  }

  async function handleSaveTeams(e) {
    e.preventDefault()
    setMsg('')
    setLocalError('')
    const lines = teamsText
      .split(/\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    try {
      await admin.saveDivisionTeams(leagueId, {
        sectionId: sectionList.length ? sectionId : null,
        divisionId,
        teams: lines,
      })
      await reloadLeagueDoc()
      setMsg('Division team list saved. Public league pages will use the new names.')
    } catch (err) {
      setLocalError(err.message || String(err))
    }
  }

  const hasSections = sectionList.length > 0

  return (
    <section className="tile">
      <h2 className="tile-title">League setup — team names by division</h2>

      <form className="admin-form admin-league-setup" onSubmit={handleSaveTeams}>
        <div className="admin-grid admin-grid--league-setup">
          <div className="admin-field admin-field--combo">
            <span className="admin-label">League</span>
            <div className="admin-league-setup__combo-row">
              <select
                className="admin-input"
                value={leagueId}
                onChange={(e) => {
                  setLeagueId(e.target.value)
                  setLeagueDoc(null)
                  setStructureMsg('')
                  setStructureErr('')
                }}
              >
                {leagues.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name ?? l.id}
                  </option>
                ))}
              </select>
            </div>
            <label className="admin-field admin-field--tight">
              <span className="admin-label admin-label--secondary">Display title</span>
              <input
                type="text"
                className="admin-input"
                value={leagueNameDraft}
                onChange={(e) => setLeagueNameDraft(e.target.value)}
                spellCheck={true}
                aria-label="League display title"
              />
            </label>
          </div>

          {hasSections ? (
            <div className="admin-field admin-field--combo">
              <span className="admin-label">Section / day</span>
              <div className="admin-league-setup__combo-row">
                <select
                  className="admin-input"
                  value={sectionId}
                  onChange={(e) => {
                    setSectionId(e.target.value)
                    setStructureMsg('')
                    setStructureErr('')
                  }}
                >
                  {sectionList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label ?? s.id}
                    </option>
                  ))}
                </select>
              </div>
              <label className="admin-field admin-field--tight">
                <span className="admin-label admin-label--secondary">Section title</span>
                <input
                  type="text"
                  className="admin-input"
                  value={sectionLabelDraft}
                  onChange={(e) => setSectionLabelDraft(e.target.value)}
                  spellCheck={true}
                  aria-label="Section display title"
                />
              </label>
            </div>
          ) : null}

          <div className="admin-field admin-field--combo">
            <span className="admin-label">Division</span>
            <div className="admin-league-setup__combo-row">
              <select
                className="admin-input"
                value={divisionId}
                onChange={(e) => {
                  setDivisionId(e.target.value)
                  setStructureMsg('')
                  setStructureErr('')
                }}
              >
                {divisionOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label ?? d.id}
                  </option>
                ))}
              </select>
            </div>
            <label className="admin-field admin-field--tight">
              <span className="admin-label admin-label--secondary">Division title</span>
              <input
                type="text"
                className="admin-input"
                value={divisionLabelDraft}
                onChange={(e) => setDivisionLabelDraft(e.target.value)}
                spellCheck={true}
                aria-label="Division display title"
              />
            </label>
          </div>
        </div>

        <div className="admin-actions admin-actions--compact">
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            disabled={admin.busy || !leagueId || !divisionId}
            onClick={() => handleSaveStructureLabels()}
          >
            Save display names
          </button>
        </div>

        {structureErr ? <p className="admin-error">{structureErr}</p> : null}
        {structureMsg ? <p className="admin-success">{structureMsg}</p> : null}

        {SHOW_LEAGUE_STRUCTURE_ADD_PANELS ? (
          <>
            <details className="admin-expand admin-league-setup__expand">
              <summary>Add league (copy structure)</summary>
              <p className="admin-note admin-expand__hint">
                Creates <code className="admin-code-inline">public/data/&lt;id&gt;.json</code> and registers it.
                Teams reset to placeholders; adjust club lines below after switching to the new league.
              </p>
              <div className="admin-grid admin-grid--league-setup-add">
                <label className="admin-field">
                  <span className="admin-label">New league id</span>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="e.g. samford-2027"
                    value={newLeagueIdRaw}
                    onChange={(e) => setNewLeagueIdRaw(e.target.value)}
                    spellCheck={false}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-label">Display title</span>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Shown in navigation"
                    value={newLeagueName}
                    onChange={(e) => setNewLeagueName(e.target.value)}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-label">Copy fixtures from</span>
                  <select
                    className="admin-input"
                    value={newLeagueCloneFrom}
                    onChange={(e) => setNewLeagueCloneFrom(e.target.value)}
                  >
                    {leagues.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name ?? l.id}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button type="button" className="admin-btn admin-btn--ghost" disabled={admin.busy} onClick={handleCreateLeague}>
                Create league
              </button>
            </details>

            {hasSections ? (
              <details className="admin-expand admin-league-setup__expand">
                <summary>Add section / day</summary>
                <p className="admin-note admin-expand__hint">
                  Copies the fixture grid round-by-round from another section in this league. Starts with one new
                  division full of placeholder teams.
                </p>
                <div className="admin-grid admin-grid--league-setup-add">
                  <label className="admin-field">
                    <span className="admin-label">Section id</span>
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="e.g. wednesday-evening"
                      value={newSectionIdRaw}
                      onChange={(e) => setNewSectionIdRaw(e.target.value)}
                      spellCheck={false}
                    />
                  </label>
                  <label className="admin-field">
                    <span className="admin-label">Section title</span>
                    <input
                      type="text"
                      className="admin-input"
                      placeholder="Shown in UI"
                      value={newSectionLabel}
                      onChange={(e) => setNewSectionLabel(e.target.value)}
                    />
                  </label>
                  <label className="admin-field">
                    <span className="admin-label">Copy schedule template from</span>
                    <select
                      className="admin-input"
                      value={newSectionCloneSchedule}
                      onChange={(e) => setNewSectionCloneSchedule(e.target.value)}
                    >
                      {sectionList.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label ?? s.id}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="admin-btn admin-btn--ghost" disabled={admin.busy} onClick={handleAddSection}>
                  Add section
                </button>
              </details>
            ) : null}

            <details className="admin-expand admin-league-setup__expand">
              <summary>Add division</summary>
              <p className="admin-note admin-expand__hint">
                Inserts another division with the same number of sheet slots as existing divisions (placeholder{' '}
                <strong>Team 1…</strong> names). Rename them in the list below.
              </p>
              <div className="admin-grid admin-grid--league-setup-add">
                <label className="admin-field">
                  <span className="admin-label">Division id</span>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="e.g. e or division-e"
                    value={newDivisionIdRaw}
                    onChange={(e) => setNewDivisionIdRaw(e.target.value)}
                    spellCheck={false}
                  />
                </label>
                <label className="admin-field">
                  <span className="admin-label">Division title</span>
                  <input
                    type="text"
                    className="admin-input"
                    placeholder="Shown in UI"
                    value={newDivisionLabel}
                    onChange={(e) => setNewDivisionLabel(e.target.value)}
                  />
                </label>
              </div>
              <button type="button" className="admin-btn admin-btn--ghost" disabled={admin.busy} onClick={handleAddDivision}>
                Add division
              </button>
            </details>
          </>
        ) : null}

        <label className="admin-field admin-field--block">
          <span className="admin-label">Team names (one per line, in sheet order)</span>
          <textarea
            className="admin-input admin-textarea--cell"
            rows={12}
            value={teamsText}
            onChange={(e) => setTeamsText(e.target.value)}
            spellCheck={false}
          />
        </label>

        {localError ? <p className="admin-error">{localError}</p> : null}
        {msg ? <p className="admin-success">{msg}</p> : null}

        <div className="admin-actions">
          <button type="submit" className="admin-btn" disabled={admin.busy || !divisionId}>
            {admin.busy ? 'Saving…' : 'Save division teams'}
          </button>
        </div>
      </form>
    </section>
  )
}
