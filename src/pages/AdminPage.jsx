import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { AdminCupEntry } from '../components/AdminCupEntry'
import { AdminFixtureEditorPanel } from '../components/AdminFixtureEditorPanel'
import { AdminHome } from '../components/AdminHome'
import { AdminLeagueHistory } from '../components/AdminLeagueHistory'
import { AdminSeasonPage } from '../components/AdminSeasonPage'
import { AdminFormSubmissionsPanel } from '../components/AdminFormSubmissionsPanel'
import { AdminScoreEntry } from '../components/AdminScoreEntry'
import { useAdmin } from '../hooks/useAdmin'
import { rebuildCsvFixtureEntriesFromSavedWeeks } from '../lib/adminCsvHydrate'
import {
  csvImportEntryDayLabel,
  csvImportEntryDivisionLabel,
  csvImportEntryLeagueName,
  csvImportEntryShotsLine,
  formatCsvImportEntryLabel,
} from '../lib/adminMatchPayload'
import { formatFixtureDate } from '../lib/fixtures'

const CSV_ENTRIES_SESSION_KEY = 'bowls-admin-csv-entries-v1'

/** Stable identity for CSV import rows in the session table. */
function csvEntryRowKey(entry) {
  return JSON.stringify([
    entry.leagueId ?? '',
    entry.sectionId ?? '',
    entry.divisionId ?? '',
    entry.week ?? null,
    entry.csvRow ?? null,
    entry.scheduleHome ?? '',
    entry.scheduleAway ?? '',
    Boolean(entry.pendingSave),
  ])
}

function persistCsvImportEntries(entries) {
  try {
    sessionStorage.setItem(
      CSV_ENTRIES_SESSION_KEY,
      JSON.stringify({ importedAt: new Date().toISOString(), entries }),
    )
  } catch {
    /* ignore */
  }
}

function groupImportedCsvFixtures(entries, leagues) {
  const withDate = new Map()
  const noDate = []
  for (const e of entries) {
    const iso = e.matchDateIso != null ? String(e.matchDateIso).trim() : ''
    if (iso) {
      if (!withDate.has(iso)) withDate.set(iso, [])
      withDate.get(iso).push(e)
    } else {
      noDate.push(e)
    }
  }

  /** @type {Array<{ iso: string, heading: string, rows: typeof entries }>} */
  const groups = []
  const sortedIso = [...withDate.keys()].sort((a, b) => a.localeCompare(b))
  for (const iso of sortedIso) {
    const rows = [...(withDate.get(iso) ?? [])].sort((a, b) =>
      formatCsvImportEntryLabel(leagues, a).localeCompare(
        formatCsvImportEntryLabel(leagues, b),
      ),
    )
    groups.push({
      iso,
      heading: `${formatFixtureDate(iso) || iso} (${iso})`,
      rows,
    })
  }

  if (noDate.length) {
    groups.push({
      iso: '_nodate',
      heading: 'Rows without diary date — open to check league mapping',
      rows: [...noDate].sort((a, b) => {
        if (a.leagueId !== b.leagueId) return String(a.leagueId).localeCompare(String(b.leagueId))
        if (a.week !== b.week) return Number(a.week) - Number(b.week)
        return a.csvRow - b.csvRow
      }),
    })
  }

  return groups
}

function AdminBackLink() {
  return (
    <Link to="/admin" className="admin-backlink">
      ← Admin home
    </Link>
  )
}

/** Bulk CSV import + imported-results check + league history (the old Results tab). */
function AdminCsvTools({ admin }) {
  const [saveMessage, setSaveMessage] = useState('')
  const [csvImportMessage, setCsvImportMessage] = useState('')
  const [csvImportWarnings, setCsvImportWarnings] = useState([])
  const [csvImportEntries, setCsvImportEntries] = useState([])
  const [editingCsvEntry, setEditingCsvEntry] = useState(null)
  const [leagueDataRevision, setLeagueDataRevision] = useState(0)
  const csvFileInputRef = useRef(null)

  const csvFixtureGroups = useMemo(
    () => groupImportedCsvFixtures(csvImportEntries, admin.leagues),
    [csvImportEntries, admin.leagues],
  )

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(CSV_ENTRIES_SESSION_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.entries)) setCsvImportEntries(parsed.entries)
    } catch {
      /* ignore */
    }
  }, [])

  async function handleCsvChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    const fd = new FormData()
    fd.append('file', file)

    setCsvImportMessage('')
    setCsvImportWarnings([])
    const result = await admin.importCsvFile(fd).finally(() => {
      e.target.value = ''
    })
    if (!result.ok) {
      const errParts = [...(Array.isArray(result.errors) ? result.errors : [])]
      if (result.error) errParts.push(String(result.error))
      setCsvImportMessage('')
      setCsvImportWarnings(
        errParts.length
          ? errParts
          : [
              'CSV import failed — run `npm run dev` so Vite and the admin API both start (/api proxies to port 3001).',
            ],
      )
      return
    }

    const pendingFixtures = Array.isArray(result.pendingFixtures)
      ? result.pendingFixtures
      : []
    const batches = result.batches ?? []
    const roster = result.roster ?? {}
    const hydrationFails = []

    let entriesResolved = Array.isArray(result.entries) ? [...result.entries] : []

    if (entriesResolved.length === 0 && batches.length > 0) {
      try {
        entriesResolved = await rebuildCsvFixtureEntriesFromSavedWeeks(
          admin.loadWeekResults,
          batches.map((b) => ({
            leagueId: b.leagueId,
            sectionId: b.sectionId ?? null,
            divisionId: b.divisionId,
            week: b.week,
          })),
        )
      } catch (err) {
        hydrationFails.push(
          err?.message ||
            'Could not load saved week rows to rebuild the table — try a hard refresh.',
        )
      }
    }

    entriesResolved = [...entriesResolved, ...pendingFixtures]

    const parts = []
    if (batches.length) {
      parts.push(
        `Saved ${batches.length} diary date / division group(s) (${batches.reduce((n, b) => n + b.matchCount, 0)} match rows written).`,
      )
    }
    if (roster.attempted) {
      parts.push(
        `Optional player-lines from this spreadsheet (if any): ${roster.playersAdded ?? 0} new name(s) merged into registered-players.json (${roster.duplicatesSkipped ?? 0} duplicates skipped). The authoritative club lists are edited on the Players & clubs page.`,
      )
    }
    if (!batches.length && !roster.attempted && !pendingFixtures.length) {
      parts.push('No data rows parsed (check the header row matches the template).')
    }
    if (pendingFixtures.length) {
      parts.push(
        `${pendingFixtures.length} row(s) carry scores from the CSV but are not saved yet — set division and schedule round, then confirm in step 2.`,
      )
    }
    setCsvImportMessage(parts.join(' '))
    const missingRowsWarn =
      entriesResolved.length === 0 && batches.length > 0
        ? [
            'Scores saved, but fixture rows did not arrive in this response (or could not be rebuilt). Run `npm run dev` (Vite + admin API) and hard-refresh.',
          ]
        : []
    setCsvImportWarnings([
      ...(result.warnings ?? []),
      ...hydrationFails.map((msg) => `Hydrate: ${msg}`),
      ...(hydrationFails.length ? [] : missingRowsWarn),
    ])
    setCsvImportEntries(entriesResolved)
    persistCsvImportEntries(entriesResolved)
    setSaveMessage(
      entriesResolved.length
        ? `${entriesResolved.length} fixture row(s) listed below — use Edit to change or Remove to drop from this list. Refresh public league pages after edits.`
        : 'Refresh league pages to see standings updates.',
    )
    setLeagueDataRevision((x) => x + 1)
  }

  function clearCsvEntryList() {
    setCsvImportEntries([])
    try {
      sessionStorage.removeItem(CSV_ENTRIES_SESSION_KEY)
    } catch {
      /* ignore */
    }
  }

  function removeCsvEntry(entry) {
    const k = csvEntryRowKey(entry)
    setCsvImportEntries((prev) => {
      const next = prev.filter((e) => csvEntryRowKey(e) !== k)
      persistCsvImportEntries(next)
      return next
    })
    setEditingCsvEntry((cur) => (cur && csvEntryRowKey(cur) === k ? null : cur))
  }

  return (
    <div className="page page--admin">
      {editingCsvEntry ? (
        <AdminFixtureEditorPanel
          key={`${editingCsvEntry.pendingSave ? 'q' : 's'}-${editingCsvEntry.csvRow}-${editingCsvEntry.leagueId}-${editingCsvEntry.divisionId}-${editingCsvEntry.week}`}
          entry={editingCsvEntry}
          leagues={admin.leagues}
          admin={admin}
          onClose={() => setEditingCsvEntry(null)}
          onSaved={(msg, meta) => {
            setSaveMessage(msg)
            if (meta?.clearedPendingCsvRow != null) {
              setCsvImportEntries((prev) =>
                prev.filter(
                  (row) =>
                    !(row.pendingSave && row.csvRow === meta.clearedPendingCsvRow),
                ),
              )
            }
            setLeagueDataRevision((x) => x + 1)
          }}
        />
      ) : null}

      <section className="tile">
        <AdminBackLink />
        <h1 className="page-title">Bulk CSV import</h1>

        <label className="admin-upload" id="admin-csv-import-anchor">
          <input
            ref={csvFileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleCsvChange}
            disabled={admin.busy}
          />
          <span className="admin-upload__label">
            {admin.busy ? 'Processing CSV…' : 'Upload CSV here'}
          </span>
        </label>
        {csvImportMessage ? <p className="admin-success">{csvImportMessage}</p> : null}
        {csvImportWarnings.map((w, i) => (
          <p key={`csv-w-${i}`} className="admin-warning">
            {w}
          </p>
        ))}
      </section>

      <section className="tile admin-import-entries">
        <div className="admin-header admin-header--compact">
          <div>
            <h2 className="tile-title tile-title--tight">Imported results check</h2>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn--ghost"
            onClick={clearCsvEntryList}
            disabled={!csvImportEntries.length}
          >
            Clear list
          </button>
        </div>

        <div className="admin-csv-entry-table-wrap">
          <table className="admin-csv-entry-table">
            <thead>
              <tr>
                <th>League</th>
                <th>Day</th>
                <th>Division</th>
                <th>Home</th>
                <th>Away</th>
                <th>Shots</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {csvImportEntries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="admin-match-table__empty">
                    &nbsp;
                  </td>
                </tr>
              ) : (
                csvFixtureGroups.flatMap((grp) => [
                  <tr key={`g-${grp.iso}`} className="admin-csv-entry-group-row">
                    <td colSpan={8}>
                      <span className="admin-csv-entry-group-label">{grp.heading}</span>
                      <span className="admin-csv-entry-group-count">
                        {grp.rows.length} fixture{grp.rows.length !== 1 ? 's' : ''}
                      </span>
                    </td>
                  </tr>,
                  ...grp.rows.map((entry, idx) => (
                    <tr
                      key={`${grp.iso}-${entry.leagueId}-${entry.week}-${entry.csvRow}-${entry.scheduleHome}-${idx}`}
                    >
                      <td className="admin-csv-entry-table__muted">
                        {csvImportEntryLeagueName(admin.leagues, entry)}
                      </td>
                      <td className="admin-csv-entry-table__muted">{csvImportEntryDayLabel(admin.leagues, entry)}</td>
                      <td>{csvImportEntryDivisionLabel(admin.leagues, entry)}</td>
                      <td className="admin-csv-entry-table__fixture">
                        <span className="admin-csv-entry-clubs">{entry.scheduleHome}</span>
                      </td>
                      <td className="admin-csv-entry-table__fixture">
                        <span className="admin-csv-entry-clubs">{entry.scheduleAway}</span>
                      </td>
                      <td className="admin-csv-entry-table__scores">{csvImportEntryShotsLine(entry)}</td>
                      <td>
                        <div className="admin-csv-entry-status-badges">
                          {entry.pendingSave ? (
                            <span
                              className="admin-csv-entry-badge admin-csv-entry-badge--review"
                              title={(entry.pendingIssues || []).join('; ')}
                            >
                              Needs review
                            </span>
                          ) : (
                            <span className="admin-csv-entry-badge admin-csv-entry-badge--saved">Saved</span>
                          )}
                          {entry.registrationNeedsReview ? (
                            <span
                              className="admin-csv-entry-badge admin-csv-entry-badge--registration"
                              title="One or more names on this row did not match the master registered list (Players & clubs page)"
                            >
                              Name check
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="admin-csv-entry-table__actions">
                        <div className="admin-csv-entry-table__action-btns">
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-csv-entry-btn"
                            onClick={() => setEditingCsvEntry(entry)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="admin-btn admin-btn--ghost admin-csv-entry-btn admin-csv-entry-btn--danger"
                            onClick={() => removeCsvEntry(entry)}
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    </tr>
                  )),
                ])
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AdminLeagueHistory
        admin={admin}
        leagues={admin.leagues}
        dataRevision={leagueDataRevision}
        onEditFixture={(entry) => setEditingCsvEntry(entry)}
        onStoredDataChanged={() => setLeagueDataRevision((x) => x + 1)}
        onManualUploadClick={() => {
          document.getElementById('admin-csv-import-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          csvFileInputRef.current?.click()
        }}
      />

      {saveMessage ? <p className="admin-success">{saveMessage}</p> : null}
      {admin.error ? <p className="admin-error">{admin.error}</p> : null}
    </div>
  )
}

function AdminFormsPage() {
  return (
    <div className="page page--admin">
      <AdminBackLink />
      <AdminFormSubmissionsPanel />
    </div>
  )
}

export function AdminPage() {
  const admin = useAdmin()
  const [password, setPassword] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    await admin.login(password)
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
            Sign in to enter league and cup scores, manage club player lists, and read
            form submissions.
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
    <Routes>
      <Route index element={<AdminHome admin={admin} />} />
      <Route path="league/:leagueId" element={<AdminScoreEntry admin={admin} />} />
      <Route path="cup/:compId" element={<AdminCupEntry admin={admin} />} />
      <Route path="csv" element={<AdminCsvTools admin={admin} />} />
      <Route path="season" element={<AdminSeasonPage admin={admin} />} />
      <Route path="teams" element={<Navigate to="/admin/season" replace />} />
      <Route path="players" element={<Navigate to="/admin/season" replace />} />
      <Route path="forms" element={<AdminFormsPage />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  )
}
