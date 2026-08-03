import { useEffect, useRef, useState } from 'react'
import {
  deleteAdminGalleryPhoto,
  fetchAdminGallery,
  moveAdminGalleryPhoto,
  saveAdminGalleryPhoto,
  uploadAdminGalleryPhotos,
} from '../lib/adminApi'

function photoThumbUrl(photo) {
  return `${import.meta.env.BASE_URL}data/gallery/${encodeURIComponent(photo.thumb || photo.file)}`
}

/** One editable row: focal-point picker + crop preview, caption + date fields, reorder, delete. */
function PhotoRow({ photo, first, last, busy, onSave, onMove, onDelete }) {
  const [caption, setCaption] = useState(photo.caption ?? '')
  const [date, setDate] = useState(photo.date ?? '')
  const [focusX, setFocusX] = useState(photo.focusX ?? 50)
  const [focusY, setFocusY] = useState(photo.focusY ?? 50)
  const [confirming, setConfirming] = useState(false)
  const dirty =
    caption !== (photo.caption ?? '') ||
    date !== (photo.date ?? '') ||
    focusX !== (photo.focusX ?? 50) ||
    focusY !== (photo.focusY ?? 50)

  function handlePickFocus(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    setFocusX(Math.round(((e.clientX - rect.left) / rect.width) * 100))
    setFocusY(Math.round(((e.clientY - rect.top) / rect.height) * 100))
  }

  return (
    <li className="admin-gallery-row">
      <div className="admin-gallery-row__images">
        <button
          type="button"
          className="admin-gallery-focus"
          onClick={handlePickFocus}
          title="Click the most important part of the photo — the thumbnail crop keeps it in view"
        >
          <img className="admin-gallery-focus__img" src={photoThumbUrl(photo)} alt="" />
          <span
            className="admin-gallery-focus__dot"
            style={{ left: `${focusX}%`, top: `${focusY}%` }}
          />
        </button>
        <span className="admin-gallery-preview">
          <img
            className="admin-gallery-preview__img"
            src={photoThumbUrl(photo)}
            alt=""
            style={{ objectPosition: `${focusX}% ${focusY}%` }}
          />
          <span className="admin-gallery-preview__label">Thumbnail</span>
        </span>
      </div>
      <div className="admin-gallery-row__fields">
        <input
          type="text"
          className="admin-input"
          placeholder="Caption shown under the photo"
          value={caption}
          maxLength={300}
          onChange={(e) => setCaption(e.target.value)}
        />
        <input
          type="date"
          className="admin-input admin-gallery-row__date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="admin-gallery-row__actions">
        <button
          type="button"
          className="admin-btn"
          disabled={busy || !dirty}
          onClick={() => onSave(photo.id, { caption, date, focusX, focusY })}
        >
          Save
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          aria-label="Move up"
          disabled={busy || first}
          onClick={() => onMove(photo.id, 'up')}
        >
          ↑
        </button>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          aria-label="Move down"
          disabled={busy || last}
          onClick={() => onMove(photo.id, 'down')}
        >
          ↓
        </button>
        {confirming ? (
          <>
            <button
              type="button"
              className="admin-btn admin-gallery-btn--danger"
              disabled={busy}
              onClick={() => onDelete(photo.id)}
            >
              Confirm delete
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--ghost"
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep
            </button>
          </>
        ) : (
          <button
            type="button"
            className="admin-btn admin-btn--ghost admin-gallery-btn--danger"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  )
}

export function AdminGalleryPanel() {
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    fetchAdminGallery()
      .then((d) => {
        if (!cancelled) setPhotos(d.photos ?? [])
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function run(action, successMessage) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const data = await action()
      if (Array.isArray(data?.photos)) setPhotos(data.photos)
      if (successMessage) setMessage(successMessage)
      return data
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleUpload(e) {
    const files = [...(e.target.files ?? [])]
    if (!files.length) return
    const fd = new FormData()
    for (const f of files) fd.append('photos', f)
    const data = await run(
      () => uploadAdminGalleryPhotos(fd),
      `${files.length} photo${files.length !== 1 ? 's' : ''} added — add captions below. The public Gallery page updates after the next site rebuild (a few minutes).`,
    )
    e.target.value = ''
    if (data && fileInputRef.current) fileInputRef.current.blur()
  }

  async function handleSave(photoId, payload) {
    const data = await run(() => saveAdminGalleryPhoto(photoId, payload), 'Saved.')
    if (data?.photo) {
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? data.photo : p)))
    }
  }

  function handleMove(photoId, direction) {
    run(() => moveAdminGalleryPhoto(photoId, direction))
  }

  function handleDelete(photoId) {
    run(() => deleteAdminGalleryPhoto(photoId), 'Photo deleted.')
  }

  return (
    <section className="tile">
      <h1 className="page-title">Photo gallery</h1>
      <p className="page-lead">
        Photos appear on the public Gallery page, newest first (use the arrows to
        reorder). Uploads are resized automatically, so full-size phone photos are fine.
        Click the important part of a photo (a face, the action) to choose what the
        square-ish thumbnail keeps in view — the Thumbnail box shows the result, and
        opening a photo on the site always shows the full picture.
      </p>

      <label className="admin-upload">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          disabled={busy}
        />
        <span className="admin-upload__label">
          {busy ? 'Working…' : 'Upload photos here'}
        </span>
      </label>

      {message ? <p className="admin-success">{message}</p> : null}
      {error ? <p className="admin-error">{error}</p> : null}

      {loaded && photos.length === 0 ? (
        <p className="admin-gallery-empty">No photos yet — upload the first one above.</p>
      ) : (
        <ul className="admin-gallery-list">
          {photos.map((photo, i) => (
            <PhotoRow
              key={photo.id}
              photo={photo}
              first={i === 0}
              last={i === photos.length - 1}
              busy={busy}
              onSave={handleSave}
              onMove={handleMove}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
