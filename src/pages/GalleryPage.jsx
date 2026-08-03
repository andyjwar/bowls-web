import { useCallback, useEffect, useMemo, useState } from 'react'

const DATA_URL = `${import.meta.env.BASE_URL}data/gallery.json`

function photoUrl(name) {
  return `${import.meta.env.BASE_URL}data/gallery/${encodeURIComponent(name)}`
}

/** Which part of the photo the grid crop keeps — set per photo in the admin. */
function focusPosition(photo) {
  return `${photo.focusX ?? 50}% ${photo.focusY ?? 50}%`
}

function photoYear(photo) {
  const source = photo.date || photo.addedAt || ''
  const year = String(source).slice(0, 4)
  return /^\d{4}$/.test(year) ? year : 'Undated'
}

function formatPhotoDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Full-screen viewer: click-away, ✕, Escape, and ←/→ between photos. */
function Lightbox({ photos, index, onClose, onStep }) {
  const photo = photos[index]

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onStep(-1)
      if (e.key === 'ArrowRight') onStep(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onStep])

  if (!photo) return null
  const dateLabel = formatPhotoDate(photo.date)

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={photo.caption || 'Photo'}
      onClick={onClose}
    >
      <div className="lightbox__inner" onClick={(e) => e.stopPropagation()}>
        <img
          className="lightbox__img"
          src={photoUrl(photo.file)}
          alt={photo.caption || 'Gallery photo'}
        />
        {photo.caption || dateLabel ? (
          <p className="lightbox__caption">
            {photo.caption}
            {photo.caption && dateLabel ? ' · ' : ''}
            {dateLabel}
          </p>
        ) : null}
      </div>
      {photos.length > 1 ? (
        <>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--prev"
            aria-label="Previous photo"
            onClick={(e) => {
              e.stopPropagation()
              onStep(-1)
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="lightbox__nav lightbox__nav--next"
            aria-label="Next photo"
            onClick={(e) => {
              e.stopPropagation()
              onStep(1)
            }}
          >
            ›
          </button>
        </>
      ) : null}
      <button type="button" className="lightbox__close" aria-label="Close" onClick={onClose}>
        ✕
      </button>
    </div>
  )
}

export function GalleryPage() {
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [openIndex, setOpenIndex] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetch(DATA_URL, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((doc) => {
        if (!cancelled) setPhotos(Array.isArray(doc?.photos) ? doc.photos : [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Year sections, newest year first; manifest order kept within each year.
  const yearGroups = useMemo(() => {
    const byYear = new Map()
    for (const photo of photos) {
      const year = photoYear(photo)
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year).push(photo)
    }
    return [...byYear.entries()].sort(([a], [b]) => {
      if (a === 'Undated') return 1
      if (b === 'Undated') return -1
      return b.localeCompare(a)
    })
  }, [photos])

  const stepLightbox = useCallback(
    (delta) => {
      setOpenIndex((cur) => {
        if (cur == null || photos.length === 0) return cur
        return (cur + delta + photos.length) % photos.length
      })
    },
    [photos.length],
  )

  return (
    <div className="page page--gallery">
      <header className="page-head page-head--hub">
        <h1 className="page-head__title page-head__title--xl">Gallery</h1>
        <p className="page-head__lead">
          Photos from finals days, presentations, and league life.
        </p>
      </header>

      {yearGroups.map(([year, yearPhotos]) => (
        <section key={year} className="gallery-section">
          <h2 className="section-label">{year}</h2>
          <div className="gallery-grid">
            {yearPhotos.map((photo) => {
              const dateLabel = formatPhotoDate(photo.date)
              return (
                <figure key={photo.id} className="gallery-item">
                  <button
                    type="button"
                    className="gallery-item__button"
                    onClick={() => setOpenIndex(photos.indexOf(photo))}
                    aria-label={`Open photo${photo.caption ? `: ${photo.caption}` : ''}`}
                  >
                    <img
                      className="gallery-item__img"
                      src={photoUrl(photo.thumb || photo.file)}
                      alt={photo.caption || 'Gallery photo'}
                      style={{ objectPosition: focusPosition(photo) }}
                      loading="lazy"
                    />
                  </button>
                  {photo.caption || dateLabel ? (
                    <figcaption className="gallery-item__caption">
                      {photo.caption ? <span>{photo.caption}</span> : null}
                      {dateLabel ? (
                        <span className="gallery-item__date">{dateLabel}</span>
                      ) : null}
                    </figcaption>
                  ) : null}
                </figure>
              )
            })}
          </div>
        </section>
      ))}

      {loaded && photos.length === 0 ? (
        <p className="gallery-empty">No photos yet — check back soon.</p>
      ) : null}

      {openIndex != null ? (
        <Lightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onStep={stepLightbox}
        />
      ) : null}
    </div>
  )
}
