import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { Jimp } from 'jimp'
import { registerDataFileDeletion } from './gitSync.js'

/**
 * Photo gallery — a manifest (`public/data/gallery.json`) plus resized JPEGs
 * in `public/data/gallery/`. Both live under `public/data/` so gitSync
 * commits them to the repo (permanent storage) and GitHub Pages serves the
 * images with the rest of the static site.
 *
 * Manifest shape: `{ photos: [{ id, file, thumb, caption, date, width,
 * height, addedAt }] }`. Array order is display order (newest uploads are
 * prepended); `file`/`thumb` are filenames inside `public/data/gallery/`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../public/data')
const MANIFEST_PATH = join(DATA_DIR, 'gallery.json')
const GALLERY_DIR = join(DATA_DIR, 'gallery')

// ~1600px full size at quality 80 keeps a photo around 200–400 KB, so even
// years of uploads stay negligible for the repo.
const MAX_FULL_EDGE = 1600
const MAX_THUMB_EDGE = 480
const JPEG_QUALITY = 80
const MAX_CAPTION_LENGTH = 300

export function loadGallery() {
  if (!existsSync(MANIFEST_PATH)) return { photos: [] }
  try {
    const disk = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
    const photos = Array.isArray(disk?.photos) ? disk.photos : []
    return { photos }
  } catch {
    return { photos: [] }
  }
}

function saveGallery(manifest) {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

function newPhotoId() {
  return `p${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
}

async function resizedJpeg(image, maxEdge) {
  const copy = image.clone()
  if (copy.bitmap.width > maxEdge || copy.bitmap.height > maxEdge) {
    copy.scaleToFit({ w: maxEdge, h: maxEdge })
  }
  return {
    buffer: await copy.getBuffer('image/jpeg', { quality: JPEG_QUALITY }),
    width: copy.bitmap.width,
    height: copy.bitmap.height,
  }
}

function cleanCaption(value) {
  return String(value ?? '').trim().slice(0, MAX_CAPTION_LENGTH)
}

function cleanDate(value) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Date must be YYYY-MM-DD')
  return s
}

/**
 * Resize + store uploaded images (multer memory files) and prepend them to
 * the manifest. Returns the manifest and the new photo entries.
 */
export async function addGalleryPhotos(files) {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No photos uploaded')
  }
  mkdirSync(GALLERY_DIR, { recursive: true })

  const added = []
  for (const file of files) {
    let image
    try {
      image = await Jimp.read(file.buffer)
    } catch {
      throw new Error(
        `Could not read "${file.originalname || 'image'}" — upload a JPEG, PNG, or similar photo file`,
      )
    }
    const id = newPhotoId()
    const full = await resizedJpeg(image, MAX_FULL_EDGE)
    const thumb = await resizedJpeg(image, MAX_THUMB_EDGE)
    const fileName = `${id}.jpg`
    const thumbName = `${id}-thumb.jpg`
    writeFileSync(join(GALLERY_DIR, fileName), full.buffer)
    writeFileSync(join(GALLERY_DIR, thumbName), thumb.buffer)
    added.push({
      id,
      file: fileName,
      thumb: thumbName,
      caption: '',
      date: '',
      width: full.width,
      height: full.height,
      addedAt: new Date().toISOString(),
    })
  }

  const manifest = loadGallery()
  manifest.photos = [...added, ...manifest.photos]
  saveGallery(manifest)
  return { manifest, added }
}

export function updateGalleryPhoto(photoId, { caption, date } = {}) {
  const manifest = loadGallery()
  const photo = manifest.photos.find((p) => p.id === photoId)
  if (!photo) throw new Error('Photo not found')
  if (caption !== undefined) photo.caption = cleanCaption(caption)
  if (date !== undefined) photo.date = cleanDate(date)
  saveGallery(manifest)
  return photo
}

/** Move a photo one slot up (towards the front) or down in display order. */
export function moveGalleryPhoto(photoId, direction) {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error('Direction must be "up" or "down"')
  }
  const manifest = loadGallery()
  const from = manifest.photos.findIndex((p) => p.id === photoId)
  if (from === -1) throw new Error('Photo not found')
  const to = direction === 'up' ? from - 1 : from + 1
  if (to < 0 || to >= manifest.photos.length) return manifest
  const [photo] = manifest.photos.splice(from, 1)
  manifest.photos.splice(to, 0, photo)
  saveGallery(manifest)
  return manifest
}

/** Remove a photo: manifest entry, local files, and (via gitSync) repo files. */
export function deleteGalleryPhoto(photoId) {
  const manifest = loadGallery()
  const photo = manifest.photos.find((p) => p.id === photoId)
  if (!photo) throw new Error('Photo not found')
  manifest.photos = manifest.photos.filter((p) => p.id !== photoId)
  saveGallery(manifest)

  for (const name of [photo.file, photo.thumb]) {
    if (!name) continue
    const localPath = join(GALLERY_DIR, name)
    try {
      if (existsSync(localPath)) unlinkSync(localPath)
    } catch {
      /* the repo-side deletion below still removes it from permanent storage */
    }
    registerDataFileDeletion(`gallery/${name}`)
  }
  return manifest
}
