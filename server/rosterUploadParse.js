/**
 * Extract plain player name strings from pasted text, CSV-like lines, or Excel buffers.
 */

import XLSX from 'xlsx'

function dedupePreserveCaseInsensitive(names) {
  const seen = new Set()
  const out = []
  for (const n of names) {
    const k = n.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(n)
  }
  return out
}

/** Split one CSV line respecting quoted commas */
export function splitCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      q = !q
      continue
    }
    if (!q && c === ',') {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur.trim())
  return out.map((c) => c.replace(/^"|"$/g, ''))
}

function splitDelimitedLine(line) {
  const t = line.trim()
  if (!t) return []
  if (t.includes('\t')) return t.split('\t').map((s) => s.trim()).filter(Boolean)
  if (t.includes(',')) return splitCsvLine(t).map((s) => s.trim()).filter(Boolean)
  return [t]
}

function stripLeadingEnumeration(line) {
  return String(line ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*\d+[.)]\s*/, '')
    .trim()
}

function isProbablyHeaderParts(parts) {
  if (!parts.length) return false
  const cell = /^(last(\s*name)?|first(\s*name)?|initial|name|player|surname|forename|membership|#|no\.?|rank|team|club)$/i
  return parts.every((p) => cell.test(p.trim()))
}

function partsToName(parts, rowIndex, skipHeaderFirstRow) {
  const cleaned = parts
    .map((p) => stripLeadingEnumeration(p))
    .filter(Boolean)
    .filter((p) => !/^\d+$/.test(p))
  if (!cleaned.length) return null
  if (skipHeaderFirstRow && rowIndex === 0 && isProbablyHeaderParts(parts)) return null
  return cleaned.join(' ')
}

function normalizeLinesToNames(lines, { skipHeaderFirstRow = true } = {}) {
  const names = []
  let rowIndex = 0
  for (const raw of lines) {
    const line = String(raw ?? '').trim()
    if (!line) continue
    const strippedLine = stripLeadingEnumeration(line)
    if (!strippedLine) continue
    const parts = splitDelimitedLine(strippedLine)
    const name = partsToName(parts, rowIndex, skipHeaderFirstRow)
    rowIndex++
    if (!name || name.length > 120) continue
    names.push(name)
  }
  return dedupePreserveCaseInsensitive(names)
}

export function parseRosterFromText(rawText) {
  const text = String(rawText ?? '').replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  return normalizeLinesToNames(lines)
}

function excelRowsToLines(rows) {
  const lines = []
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    const cells = row.map((c) => String(c ?? '').trim()).filter(Boolean)
    if (!cells.length) continue
    if (cells.length === 1) lines.push(cells[0])
    else lines.push(cells.join('\t'))
  }
  return lines
}

export function parseRosterExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  if (!wb.SheetNames?.length) return []
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })
  const lines = excelRowsToLines(rows)
  return normalizeLinesToNames(lines)
}

function bufferLooksLikeZip(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  )
}

export function parseRosterUploadBuffer(buffer, originalname = '', mimetype = '') {
  const name = String(originalname || '').toLowerCase()
  const mt = String(mimetype || '').toLowerCase()
  let isExcel =
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    mt.includes('spreadsheet') ||
    mt.includes('excel') ||
    mt.includes('officedocument')
  // Some browsers send .xlsx as octet-stream with a generic blob name — file is still a ZIP (OOXML).
  if (!isExcel && bufferLooksLikeZip(buffer)) {
    isExcel = true
  }
  if (isExcel) return parseRosterExcelBuffer(buffer)
  const text = buffer.toString('utf8')
  return parseRosterFromText(text)
}
