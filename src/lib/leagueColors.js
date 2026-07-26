/**
 * League accent colours (poster tiles, day carousel tags, list dots).
 * Assigned by position in the leagues nav when an index is provided, so the
 * first three leagues always get green / blue / coral; falls back to a
 * deterministic hash when only an id is known.
 */

/*
 * "Deep crest" palette — crest hues darkened and softened (forest, navy, oxblood).
 *
 * Saved for later (owner liked it, v9-gold.html option 2): "true crest gold"
 * tile — background #d3ac52 with dark navy text #1d3a6e instead of white.
 * Needs a per-league foreground colour if adopted.
 */
const PALETTE = [
  { color: '#256e3d', soft: 'rgba(37, 110, 61, 0.12)' }, // forest green
  { color: '#1d3a6e', soft: 'rgba(29, 58, 110, 0.12)' }, // deep navy
  { color: '#7e3040', soft: 'rgba(126, 48, 64, 0.12)' }, // oxblood
  { color: '#4c3585', soft: 'rgba(76, 53, 133, 0.13)' }, // deep violet
  { color: '#0e6b84', soft: 'rgba(14, 107, 132, 0.13)' }, // deep teal
  { color: '#8a5a12', soft: 'rgba(138, 90, 18, 0.14)' }, // bronze
]

function hashString(input) {
  let h = 0
  for (let i = 0; i < input.length; i++) {
    h = (h << 5) - h + input.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

/**
 * @param {string} id league id (hash fallback)
 * @param {number} [index] position in the leagues nav (preferred — stable, collision-free)
 */
export function colorForLeague(id, index) {
  if (Number.isInteger(index) && index >= 0) {
    return PALETTE[index % PALETTE.length]
  }
  if (!id) return PALETTE[0]
  return PALETTE[hashString(String(id)) % PALETTE.length]
}
