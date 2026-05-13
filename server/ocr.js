import { createWorker, PSM } from 'tesseract.js'
import pdfParse from 'pdf-parse'
import { buildOcrVariants } from './imagePreprocess.js'
import { extractWithVision } from './visionExtract.js'

const FORM_KEYWORDS = [
  'HOME',
  'VISITORS',
  'DIVISION',
  'SHOTS',
  'RESULT',
  'SAMFORD',
  'POINTS',
  'TOTAL',
  'FEDERATION',
  'BOWLS',
]

function scoreOcrText(text) {
  const upper = String(text ?? '').toUpperCase()
  let score = 0
  for (const word of FORM_KEYWORDS) {
    if (upper.includes(word)) score += 12
  }
  score += (text.match(/\d/g) ?? []).length * 2
  score += Math.min(text.length / 25, 40)
  if (/\b\d{1,2}\s*[-–]\s*\d{1,2}\b/.test(text)) score += 8
  return score
}

async function runTesseractPass(worker, buffer, psm) {
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1',
  })
  const {
    data: { text, confidence },
  } = await worker.recognize(buffer)
  return {
    text: text?.trim() ?? '',
    confidence: confidence ?? 0,
    psm,
  }
}

async function extractTextFromImage(buffer) {
  if (process.env.OPENAI_API_KEY?.trim()) {
    try {
      const vision = await extractWithVision(buffer, 'image/png')
      if (vision?.rawText) return vision
    } catch (e) {
      console.warn('Vision OCR unavailable, falling back to Tesseract:', e.message)
    }
  }

  const variants = await buildOcrVariants(buffer)
  const ocrVariants = variants.filter((v) => v.id === 'contrast' || v.id === 'standard')
  const worker = await createWorker('eng', 1, {
    logger: () => {},
  })

  try {
    const psmModes = [PSM.AUTO, PSM.SINGLE_BLOCK]
    let best = { text: '', score: 0, confidence: 0, variant: 'original', psm: PSM.AUTO }

    for (const variant of ocrVariants) {
      for (const psm of psmModes) {
        const result = await runTesseractPass(worker, variant.buffer, psm)
        const score = scoreOcrText(result.text)
        if (score > best.score || (score === best.score && result.confidence > best.confidence)) {
          best = {
            text: result.text,
            score,
            confidence: result.confidence,
            variant: variant.id,
            psm,
          }
        }
      }
    }

    const warning =
      best.score < 35 || best.confidence < 45
        ? 'Handwriting was hard to read. Try a flatter, brighter photo with the full form in frame, or add OPENAI_API_KEY for better vision OCR. Review all fields before saving.'
        : best.confidence < 65
          ? 'OCR confidence is moderate — please verify teams, points and shots before saving.'
          : null

    return {
      rawText: best.text,
      method: `ocr-${best.variant}`,
      ocrMeta: {
        confidence: Math.round(best.confidence),
        variant: best.variant,
        score: Math.round(best.score),
      },
      warning,
    }
  } finally {
    await worker.terminate()
  }
}

export async function extractTextFromUpload(buffer, mimetype) {
  if (mimetype === 'application/pdf') {
    const parsed = await pdfParse(buffer)
    const text = parsed.text?.trim() ?? ''
    if (text.length > 40) {
      return { rawText: text, method: 'pdf-text' }
    }
    return {
      rawText: text,
      method: 'pdf-scan',
      warning:
        'This PDF has little extractable text. Photograph the page flat in good light and upload as JPG or PNG.',
    }
  }

  return extractTextFromImage(buffer)
}

export { extractWithVision }
