/**
 * League accent colours (poster tiles, day carousel tags, list dots).
 * The three standing leagues are keyed by identity so their colour remains
 * stable when leagues are added, removed, or reordered. Other competitions
 * use the fallback palette.
 */

const PALETTE = [
  { color: '#256e3d', soft: 'rgba(37, 110, 61, 0.12)', foreground: '#fff' },
  { color: '#1d3a6e', soft: 'rgba(29, 58, 110, 0.12)', foreground: '#fff' },
  { color: '#a74652', soft: 'rgba(167, 70, 82, 0.13)', foreground: '#fff' },
  { color: '#4c3585', soft: 'rgba(76, 53, 133, 0.13)', foreground: '#fff' },
  { color: '#0e6b84', soft: 'rgba(14, 107, 132, 0.13)', foreground: '#fff' },
  { color: '#8a5a12', soft: 'rgba(138, 90, 18, 0.14)', foreground: '#fff' },
]

const LEAGUE_PALETTE = [
  {
    test: (id) => String(id).startsWith('samford'),
    value: { color: '#8FC79E', soft: '#E9F4EC', foreground: '#102A56' },
  },
  {
    test: (id) => String(id).startsWith('two-wood'),
    value: { color: '#8FC6E8', soft: '#E8F4FB', foreground: '#102A56' },
  },
  {
    test: (id) => String(id).startsWith('triples'),
    value: { color: '#DDBA3D', soft: '#F8F0D8', foreground: '#102A56' },
  },
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
  const fixed = LEAGUE_PALETTE.find((entry) => entry.test(id))
  if (fixed) return fixed.value
  if (Number.isInteger(index) && index >= 0) {
    return PALETTE[index % PALETTE.length]
  }
  if (!id) return PALETTE[0]
  return PALETTE[hashString(String(id)) % PALETTE.length]
}
