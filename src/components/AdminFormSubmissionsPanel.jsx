import { useEffect, useState } from 'react'
import { fetchAdminFormSubmissions } from '../lib/adminApi'

const FORM_LABELS = {
  'player-transfer': 'Player transfer',
}

const FIELD_LABELS = {
  playerName: 'Player',
  fromClub: 'From club',
  toClub: 'To club',
  contact: 'Contact',
  notes: 'Notes',
}

function formatWhen(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminFormSubmissionsPanel() {
  const [submissions, setSubmissions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchAdminFormSubmissions()
      .then((data) => {
        if (!cancelled) setSubmissions(data.submissions ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load submissions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section className="tile">
      <h2 className="tile-title">Form submissions</h2>
      <p className="page-lead">
        Requests sent in from the public Forms page, newest first.
      </p>

      {loading ? <p className="admin-success">Loading…</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      {!loading && !error && submissions.length === 0 ? (
        <p className="admin-success">No submissions yet.</p>
      ) : null}

      {submissions.map((s) => (
        <div key={s.id} className="admin-form-submission">
          <div className="admin-form-submission__head">
            <span className="admin-form-submission__type">
              {FORM_LABELS[s.formType] ?? s.formType}
            </span>
            <span className="admin-form-submission__when">
              {formatWhen(s.submittedAt)}
            </span>
          </div>
          <dl className="admin-form-submission__fields">
            {Object.entries(s.fields ?? {}).map(([k, v]) => (
              <div key={k} className="admin-form-submission__row">
                <dt>{FIELD_LABELS[k] ?? k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </section>
  )
}
