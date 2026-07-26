/** Split a stored roster string into first + rest (for display in two boxes). */
export function splitStoredPlayerName(full) {
  const t = String(full ?? '').trim()
  if (!t) return { first: '', last: '' }
  const i = t.indexOf(' ')
  if (i === -1) return { first: t, last: '' }
  return { first: t.slice(0, i).trim(), last: t.slice(i + 1).trim() }
}

/** Merge first/last boxes into the single string stored in JSON (CSV checks unchanged). */
export function joinPlayerNameParts(first, last) {
  const a = String(first ?? '').trim()
  const b = String(last ?? '').trim()
  if (a && b) return `${a} ${b}`
  return a || b
}

/**
 * Sort roster rows for display: primarily by last-name column, then initial/first.
 * Single-field names (no last column) sort by that token as the surname key.
 */
export function sortPlayerRowsForDisplay(rows) {
  const key = (row) => {
    const f = String(row.first ?? '').trim()
    const l = String(row.last ?? '').trim()
    return l || f
  }
  const secondary = (row) => String(row.first ?? '').trim()

  return [...rows].sort((a, b) => {
    const cmp = key(a).localeCompare(key(b), 'en-GB', { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return secondary(a).localeCompare(secondary(b), 'en-GB', { sensitivity: 'base' })
  })
}
