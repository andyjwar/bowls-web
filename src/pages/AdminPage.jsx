import { useMemo, useState } from 'react'
import { useAdmin } from '../hooks/useAdmin'

function emptyMatchRow(home = '', away = '') {
  return {
    home,
    away,
    homePoints: '',
    awayPoints: '',
    homeShots: '',
    awayShots: '',
    players: null,
  }
}

function PlayerCheckList({ title, checks }) {
  if (!checks?.length) return null
  return (
    <div className="admin-players">
      <p className="admin-players__title">{title}</p>
      <ul className="admin-players__list">
        {checks.map((c, i) => (
          <li
            key={`${c.ocrName}-${i}`}
            className={`admin-players__item admin-players__item--${c.status}`}
          >
            <span>{c.ocrName}</span>
            {c.matchedName ? (
              <span className="admin-players__match">→ {c.matchedName}</span>
            ) : null}
            {c.warning ? (
              <span className="admin-players__warn">{c.warning}</span>
            ) : c.status === 'registered' ? (
              <span className="admin-players__ok">Registered</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AdminPage() {
  const admin = useAdmin()
  const [password, setPassword] = useState('')
  const [leagueId, setLeagueId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [divisionId, setDivisionId] = useState('')
  const [week, setWeek] = useState('1')
  const [rawText, setRawText] = useState('')
  const [importWarning, setImportWarning] = useState('')
  const [matches, setMatches] = useState([])
  const [saveMessage, setSaveMessage] = useState('')
  const [detection, setDetection] = useState(null)
  const [playerValidation, setPlayerValidation] = useState(null)
  const [samfordForm, setSamfordForm] = useState(null)
  const [ocrMeta, setOcrMeta] = useState(null)

  const selectedLeague = useMemo(
    () => admin.leagues.find((l) => l.id === leagueId) ?? null,
    [admin.leagues, leagueId],
  )

  const sections = selectedLeague?.sections ?? null
  const divisions = useMemo(() => {
    if (!selectedLeague) return []
    if (sections) {
      const section = sections.find((s) => s.id === sectionId) ?? sections[0]
      return section?.divisions ?? []
    }
    return selectedLeague.divisions ?? []
  }, [selectedLeague, sections, sectionId])

  async function handleLogin(e) {
    e.preventDefault()
    await admin.login(password)
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)
    if (leagueId) fd.append('leagueId', leagueId)
    if (sectionId) fd.append('sectionId', sectionId)
    if (divisionId) fd.append('divisionId', divisionId)
    if (week) fd.append('week', week)

    try {
      const result = await admin.importFile(fd)
      setRawText(result.rawText ?? '')
      setImportWarning(
        result.partial
          ? (result.error ?? 'Could not auto-detect league/division. Select them below and check OCR text.')
          : (result.warning ?? ''),
      )
      setDetection(result.detection ?? null)
      setSamfordForm(result.samfordForm ?? null)
      setPlayerValidation(result.playerValidation ?? null)
      setOcrMeta(result.ocrMeta ?? null)

      if (result.target) {
        setLeagueId(result.target.leagueId)
        setSectionId(result.target.sectionId ?? '')
        setDivisionId(result.target.divisionId)
        setWeek(String(result.target.week))
      } else if (result.samfordForm) {
        setLeagueId((id) => id || 'samford-2026')
        setSectionId((id) => id || result.samfordForm.sectionId || 'monday-evening')
        if (result.samfordForm.divisionId) {
          setDivisionId(result.samfordForm.divisionId)
        }
      }

      setMatches(
        (result.suggestions ?? []).map((m) => ({
          home: m.home ?? '',
          away: m.away ?? '',
          homePoints: m.homePoints ?? '',
          awayPoints: m.awayPoints ?? '',
          homeShots: m.homeShots ?? '',
          awayShots: m.awayShots ?? '',
          players: m.players ?? null,
        })),
      )
      setSaveMessage('')
    } catch (err) {
      admin.setError(err.message || 'Upload failed')
    } finally {
      e.target.value = ''
    }
  }

  function updateMatch(index, field, value) {
    setMatches((rows) =>
      rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    )
  }

  function addMatchRow() {
    setMatches((rows) => [...rows, emptyMatchRow()])
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!leagueId || !divisionId) return

    const payload = {
      leagueId,
      sectionId: sectionId || undefined,
      divisionId,
      week: Number(week),
      matches: matches
        .filter((m) => m.home && m.away)
        .map((m) => {
          const row = {
            home: m.home,
            away: m.away,
            homeShots: Number(m.homeShots),
            awayShots: Number(m.awayShots),
          }
          const hp = Number(m.homePoints)
          const ap = Number(m.awayPoints)
          if (Number.isFinite(hp) && Number.isFinite(ap)) {
            row.homePoints = hp
            row.awayPoints = ap
          }
          if (m.players) row.players = m.players
          return row
        }),
    }

    const result = await admin.applyResults(payload)
    setSaveMessage(
      `Saved week ${result.savedWeek} (${result.matchCount} matches). Standings updated — refresh league pages to see changes.`,
    )
  }

  if (admin.checking) {
    return (
      <div className="page">
        <section className="tile">
          <p className="page-lead">Checking admin session…</p>
        </section>
      </div>
    )
  }

  if (!admin.authenticated) {
    return (
      <div className="page page--admin">
        <section className="tile tile--narrow">
          <h1 className="page-title">Admin login</h1>
          <p className="page-lead">
            Sign in to upload score sheets and update league results.
          </p>
          <form className="admin-form" onSubmit={handleLogin}>
            <label className="admin-label" htmlFor="admin-password">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              className="admin-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {admin.error ? <p className="admin-error">{admin.error}</p> : null}
            <button type="submit" className="admin-btn" disabled={admin.busy}>
              {admin.busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </section>
      </div>
    )
  }

  return (
    <div className="page page--admin">
      <section className="tile">
        <div className="admin-header">
          <div>
            <h1 className="page-title">Results import</h1>
            <p className="page-lead">
              Upload a photo, screenshot, or PDF of a score sheet. The system will
              try to detect the league, division, and week automatically. Review
              parsed scores, then save to update fixtures and league tables.
            </p>
          </div>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={admin.logout}>
            Sign out
          </button>
        </div>
      </section>

      <section className="tile">
        <h2 className="tile-title">1. Upload score sheet</h2>
        <ul className="admin-photo-tips">
          <li>Photograph the form flat, in bright even light (avoid shadows).</li>
          <li>Fill the frame with the whole sheet — all four corners visible.</li>
          <li>Keep the camera parallel to the page; avoid skewed angles.</li>
          <li>For best handwriting accuracy, set <code>OPENAI_API_KEY</code> in <code>.env</code> (vision OCR).</li>
        </ul>
        <label className="admin-upload">
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={handleFileChange}
            disabled={admin.busy}
          />
          <span className="admin-upload__label">
            {admin.busy
              ? 'Processing…'
              : 'Drop an image or PDF here, or click to browse'}
          </span>
        </label>
        {importWarning ? <p className="admin-warning">{importWarning}</p> : null}
        {ocrMeta ? (
          <p className="admin-ocr-meta">
            Read method: {ocrMeta.variant === 'vision' ? 'AI vision' : 'Tesseract OCR'}
            {ocrMeta.confidence != null && ocrMeta.variant !== 'vision'
              ? ` · confidence ${ocrMeta.confidence}%`
              : ocrMeta.confidence
                ? ` · confidence ${ocrMeta.confidence}`
                : ''}
          </p>
        ) : null}
        {samfordForm ? (
          <div className="admin-detect">
            <p className="admin-detect__title">Samford results form detected</p>
            <p className="admin-detect__detail">
              {samfordForm.homeRaw || samfordForm.home || 'Home?'}
              {' v '}
              {samfordForm.awayRaw || samfordForm.away || 'Away?'}
              {samfordForm.matchDate ? ` · ${samfordForm.matchDate}` : ''}
              {samfordForm.divisionId
                ? ` · Division ${String(samfordForm.divisionId).toUpperCase()}`
                : ''}
            </p>
          </div>
        ) : null}
        {playerValidation ? (
          <div className="admin-players-panel">
            <p className="admin-detect__title">Player registration check</p>
            <p className="admin-detect__detail">{playerValidation.summary}</p>
            <PlayerCheckList title="Home team" checks={playerValidation.home} />
            <PlayerCheckList title="Away team" checks={playerValidation.away} />
          </div>
        ) : null}
        {detection ? (
          <div className="admin-detect">
            <p className="admin-detect__title">Detected target</p>
            <p className="admin-detect__detail">
              {detection.leagueName}
              {detection.sectionLabel ? ` · ${detection.sectionLabel}` : ''}
              {` · ${detection.divisionLabel} · Week ${detection.week}`}
              {detection.confidence != null ? ` (${detection.confidence}% match)` : ''}
            </p>
            {detection.matchedTeams?.length ? (
              <p className="admin-detect__teams">
                Teams found: {detection.matchedTeams.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}
        {rawText ? (
          <details className="admin-ocr">
            <summary>Extracted text (OCR)</summary>
            <pre className="admin-ocr__text">{rawText}</pre>
          </details>
        ) : null}
      </section>

      <section className="tile">
        <h2 className="tile-title">2. Target league</h2>
        <p className="page-lead admin-note">
          Auto-filled from the upload when possible. Override here if the detection
          is wrong.
        </p>
        <div className="admin-grid">
          <label className="admin-field">
            <span className="admin-label">League</span>
            <select
              className="admin-input"
              value={leagueId}
              onChange={(e) => {
                setLeagueId(e.target.value)
                setSectionId('')
                setDivisionId('')
              }}
            >
              <option value="">Select league…</option>
              {admin.leagues.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>

          {sections ? (
            <label className="admin-field">
              <span className="admin-label">Section</span>
              <select
                className="admin-input"
                value={sectionId}
                onChange={(e) => {
                  setSectionId(e.target.value)
                  setDivisionId('')
                }}
              >
                <option value="">Select section…</option>
                {sections.map((s) => (
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
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              disabled={!divisions.length}
            >
              <option value="">Select division…</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-field">
            <span className="admin-label">Week</span>
            <select
              className="admin-input"
              value={week}
              onChange={(e) => setWeek(e.target.value)}
            >
              {Array.from({ length: 14 }, (_, i) => i + 1).map((w) => (
                <option key={w} value={String(w)}>
                  Week {w}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="tile">
        <h2 className="tile-title">3. Review and save</h2>
        <p className="page-lead admin-note">
          Handwriting OCR is imperfect — always check teams and shot counts before
          saving.
        </p>
        <div className="admin-match-table-wrap">
          <table className="admin-match-table">
            <thead>
              <tr>
                <th>Home</th>
                <th>Away</th>
                <th>Home pts</th>
                <th>Away pts</th>
                <th>Home shots</th>
                <th>Away shots</th>
              </tr>
            </thead>
            <tbody>
              {matches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="admin-match-table__empty">
                    Upload a score sheet or add rows manually.
                  </td>
                </tr>
              ) : (
                matches.map((m, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className="admin-input admin-input--cell"
                        value={m.home}
                        onChange={(e) => updateMatch(i, 'home', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--cell"
                        value={m.away}
                        onChange={(e) => updateMatch(i, 'away', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--cell"
                        type="number"
                        min="0"
                        value={m.homePoints}
                        onChange={(e) => updateMatch(i, 'homePoints', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--cell"
                        type="number"
                        min="0"
                        value={m.awayPoints}
                        onChange={(e) => updateMatch(i, 'awayPoints', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--cell"
                        type="number"
                        min="0"
                        value={m.homeShots}
                        onChange={(e) => updateMatch(i, 'homeShots', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="admin-input admin-input--cell"
                        type="number"
                        min="0"
                        value={m.awayShots}
                        onChange={(e) => updateMatch(i, 'awayShots', e.target.value)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="admin-actions">
          <button type="button" className="admin-btn admin-btn--ghost" onClick={addMatchRow}>
            Add row
          </button>
          <button
            type="button"
            className="admin-btn"
            onClick={handleSave}
            disabled={admin.busy || !matches.length}
          >
            {admin.busy ? 'Saving…' : 'Save results'}
          </button>
        </div>
        {admin.error ? <p className="admin-error">{admin.error}</p> : null}
        {saveMessage ? <p className="admin-success">{saveMessage}</p> : null}
      </section>
    </div>
  )
}
