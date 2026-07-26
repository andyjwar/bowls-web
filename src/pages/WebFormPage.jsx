import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { getWebForm } from '../lib/webForms'

function FieldInput({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return (
      <textarea
        className="webform__input webform__input--area"
        rows={field.rows ?? 4}
        value={value}
        onChange={onChange}
        placeholder={field.placeholder}
        required={field.required}
      />
    )
  }
  if (field.type === 'select') {
    return (
      <select
        className="webform__input"
        value={value}
        onChange={onChange}
        required={field.required}
      >
        <option value="">Choose…</option>
        {field.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      className="webform__input"
      type={field.type === 'date' ? 'date' : 'text'}
      value={value}
      onChange={onChange}
      placeholder={field.placeholder}
      autoComplete={field.autoComplete}
      required={field.required}
    />
  )
}

export function WebFormPage() {
  const { formId } = useParams()
  const form = getWebForm(formId)

  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  if (!form) {
    return <Navigate to="/forms" replace />
  }

  const set = (key) => (e) =>
    setValues((v) => ({ ...v, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(form.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: values }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Could not send the form')
      setDone(true)
    } catch (err) {
      setError(err.message || 'Could not send the form. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="page page--forms">
        <header className="page-head page-head--hub">
          <h1 className="page-head__title page-head__title--xl">Thank you</h1>
        </header>
        <div className="webform-done">
          <p className="webform-done__title">{form.doneTitle}</p>
          <p className="webform-done__note">{form.doneNote}</p>
          <Link to="/forms" className="webform-done__back">
            ← Back to forms
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page page--forms">
      <header className="page-head page-head--hub">
        <Link to="/forms" className="webform-back">
          ← All forms
        </Link>
        <h1 className="page-head__title page-head__title--xl">{form.title}</h1>
        <p className="page-head__lead">{form.lead}</p>
      </header>

      <form className="webform" onSubmit={handleSubmit}>
        {form.fields.map((field) => (
          <label key={field.key} className="webform__field">
            <span className="webform__label">
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            <FieldInput
              field={field}
              value={values[field.key] ?? ''}
              onChange={set(field.key)}
            />
          </label>
        ))}

        {error ? <p className="webform__error">{error}</p> : null}

        <button type="submit" className="webform__submit" disabled={busy}>
          {busy ? 'Sending…' : form.submitLabel}
        </button>
      </form>
    </div>
  )
}
