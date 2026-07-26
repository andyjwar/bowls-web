import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

/* Submissions contain personal contact details, so they live under server/data
   (not public/) and are only readable through the authed admin API. */
const DATA_DIR = join(__dirname, 'data')
export const SUBMISSIONS_PATH = join(DATA_DIR, 'form-submissions.json')

let cache = null

export function loadFormSubmissions() {
  if (cache) return cache
  if (!existsSync(SUBMISSIONS_PATH)) return []
  cache = JSON.parse(readFileSync(SUBMISSIONS_PATH, 'utf8'))
  return cache
}

function saveFormSubmissions(list) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(SUBMISSIONS_PATH, `${JSON.stringify(list, null, 2)}\n`, 'utf8')
  cache = list
}

/**
 * Append one submission. `fields` is a flat map of label → value strings.
 * Returns the stored record.
 */
export function addFormSubmission(formType, fields) {
  const record = {
    id: randomUUID(),
    formType: String(formType),
    submittedAt: new Date().toISOString(),
    fields,
  }
  saveFormSubmissions([...loadFormSubmissions(), record])
  return record
}
