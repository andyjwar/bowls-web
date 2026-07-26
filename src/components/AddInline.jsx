import { useState } from 'react'

/**
 * Small expandable "+ Add …" control shared by the season page's
 * division / day / league adds and the admin home's new-competition add.
 * Each field shows a label above its input so the form explains itself.
 */
export function AddInline({ label, fields, submitLabel, onSubmit, hint }) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function close() {
    setOpen(false)
    setValues({})
    setError(null)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      await onSubmit(values)
      close()
    } catch (err) {
      setError(err.message || 'Could not add')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="add-inline__open" onClick={() => setOpen(true)}>
        + {label}
      </button>
    )
  }

  return (
    <div className="add-inline">
      <div className="add-inline__fields">
        {fields.map((f) => (
          <label key={f.name} className="add-inline__field">
            <span className="add-inline__label">{f.label}</span>
            {f.options ? (
              <select
                className="admin-input add-inline__input"
                value={values[f.name] ?? f.options[0]?.value ?? ''}
                onChange={(ev) => setValues((v) => ({ ...v, [f.name]: ev.target.value }))}
              >
                {f.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="admin-input add-inline__input"
                placeholder={f.placeholder}
                value={values[f.name] ?? ''}
                onChange={(ev) => setValues((v) => ({ ...v, [f.name]: ev.target.value }))}
              />
            )}
          </label>
        ))}
        <span className="add-inline__actions">
          <button
            type="button"
            className="entry-rowact entry-rowact--save"
            disabled={busy}
            onClick={submit}
          >
            {busy ? 'Adding…' : submitLabel}
          </button>
          <button type="button" className="entry-rowact entry-rowact--cancel" onClick={close}>
            Cancel
          </button>
        </span>
      </div>
      {error ? (
        <p className="add-inline__note team-slots__msg team-slots__msg--error">{error}</p>
      ) : hint ? (
        <p className="add-inline__note team-slots__hint">{hint}</p>
      ) : null}
    </div>
  )
}
