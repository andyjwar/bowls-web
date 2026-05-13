import { Jimp } from 'jimp'

const MIN_WIDTH = 2000

async function loadImage(buffer) {
  return Jimp.read(buffer)
}

async function toBuffer(image, mime = 'image/png') {
  return image.getBuffer(mime)
}

/**
 * Build OCR-friendly image variants from an uploaded photo.
 */
export async function buildOcrVariants(buffer) {
  const original = await loadImage(buffer)
  if (original.bitmap.width < MIN_WIDTH) {
    original.scaleToFit({ w: MIN_WIDTH, h: Math.round(MIN_WIDTH * 1.4) })
  }

  const standard = original.clone()
  standard.greyscale().normalize().convolute([
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0],
  ])

  const highContrast = original.clone()
  highContrast.greyscale().normalize().contrast(0.35).brightness(0.04)

  const threshold = original.clone()
  threshold.greyscale().normalize()
  threshold.scan((x, y, idx) => {
    const v = threshold.bitmap.data[idx]
    const bin = v > 155 ? 255 : 0
    threshold.bitmap.data[idx] = bin
    threshold.bitmap.data[idx + 1] = bin
    threshold.bitmap.data[idx + 2] = bin
  })

  return [
    { id: 'standard', label: 'standard', buffer: await toBuffer(standard) },
    { id: 'contrast', label: 'high contrast', buffer: await toBuffer(highContrast) },
    { id: 'threshold', label: 'threshold', buffer: await toBuffer(threshold) },
    { id: 'original', label: 'original', buffer: await toBuffer(original) },
  ]
}
