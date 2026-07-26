/**
 * Knockout cup draw generation. Turns an ordered list of entrants (the draw
 * order) into the rounds JSON the competitions files use — the same shape as
 * the hand-authored 2026 cups: tie letters in the opening round, numbered
 * middle rounds, `from`-linked later slots with "Winner of …" labels, and a
 * preliminary round when the entry isn't a power of two.
 */

const TIE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function nthRoundName(n) {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
  return `${n}${suffix} Round`
}

/** Largest power of two ≤ n. */
function mainBracketSize(n) {
  let m = 2
  while (m * 2 <= n) m *= 2
  return m
}

/**
 * Structure implied by an entrant count.
 * With 13 entrants: main bracket of 8, so 5 preliminary ties (10 teams) and
 * 3 teams entering directly at the 1st round — the Millennium Cup shape.
 *
 * @returns {null | {
 *   entrantCount: number,
 *   mainSize: number,          // slots in the first main round (power of 2)
 *   prelimTies: number,        // 0 when the entry is a power of two
 *   prelimTeams: number,       // teams playing in the preliminary round
 *   directEntrants: number,    // teams entering at the first main round
 *   roundNames: string[],      // every round, prelim included
 * }}
 */
export function cupDrawShape(entrantCount) {
  const n = Number(entrantCount)
  if (!Number.isInteger(n) || n < 2) return null
  const mainSize = mainBracketSize(n)
  const prelimTies = n - mainSize

  const mainRounds = Math.log2(mainSize)
  const names = []
  for (let i = 1; i <= mainRounds - 2; i += 1) names.push(nthRoundName(i))
  if (mainRounds >= 2) names.push('Semi-finals')
  names.push('Final')

  return {
    entrantCount: n,
    mainSize,
    prelimTies,
    prelimTeams: prelimTies * 2,
    directEntrants: mainSize - prelimTies,
    roundNames: prelimTies > 0 ? ['Preliminary Round', ...names] : names,
  }
}

/** Preliminary-round tie letter for slot-editor options ("A", "B", …). */
export function prelimTieLetter(index) {
  return TIE_LETTERS[index] ?? String(index + 1)
}

/**
 * Default first-main-round slot order when there's a preliminary round:
 * prelim winners first, then the direct entrants — the admin reorders these
 * in the slot editor to match the real draw.
 *
 * Slots are `{ kind: 'winner', tie: 'A' }` or `{ kind: 'name', name }`.
 */
export function defaultMainRoundSlots(entrants) {
  const shape = cupDrawShape(entrants.length)
  if (!shape || shape.prelimTies === 0) return []
  const slots = []
  for (let i = 0; i < shape.prelimTies; i += 1) {
    slots.push({ kind: 'winner', tie: prelimTieLetter(i) })
  }
  for (const name of entrants.slice(shape.prelimTeams)) {
    slots.push({ kind: 'name', name })
  }
  return slots
}

/** Tie ids for one round. Opening round → letters; semis → A/B; final → none. */
function tieIds(tieCount, { isOpeningRound, isFinal }) {
  if (isFinal) return [null]
  if (isOpeningRound || tieCount === 2) {
    return Array.from({ length: tieCount }, (_, i) => TIE_LETTERS[i] ?? String(i + 1))
  }
  return Array.from({ length: tieCount }, (_, i) => String(i + 1))
}

/** "Winner of Tie A" / "Winner of Semi-final A" placeholder label. */
function winnerLabel(prevRoundName, tieId) {
  const noun = /semi/i.test(prevRoundName ?? '') ? 'Semi-final' : 'Tie'
  return `Winner of ${noun} ${tieId}`
}

/**
 * Build the full rounds array for a cup draw.
 *
 * @param {object} opts
 * @param {string[]} opts.entrants  All entrant names in draw order. When a
 *   preliminary round is needed, the first `prelimTeams` names pair up in
 *   order (1&2 = Tie A, 3&4 = Tie B, …).
 * @param {Array<{kind:'winner',tie:string}|{kind:'name',name:string}>} [opts.mainSlots]
 *   First-main-round slot order (only used when a prelim exists); defaults to
 *   winners-then-directs. Sequential pairs form the ties.
 * @param {Array<{date?: string, venue?: string}>} [opts.roundMeta]
 *   Per-round date/venue, aligned with `cupDrawShape().roundNames`.
 * @returns {object[]} rounds JSON (competitions-file shape)
 */
export function buildCupRounds({ entrants, mainSlots, roundMeta = [] }) {
  const names = entrants.map((e) => String(e ?? '').trim()).filter(Boolean)
  const shape = cupDrawShape(names.length)
  if (!shape) throw new Error('A draw needs at least 2 entrants')

  const rounds = []
  let metaIdx = 0
  const takeMeta = () => {
    const m = roundMeta[metaIdx] ?? {}
    metaIdx += 1
    return {
      ...(m.date ? { date: m.date } : {}),
      ...(m.venue ? { venue: m.venue } : {}),
    }
  }

  /* Preliminary round: sequential pairs of the first prelimTeams entrants. */
  if (shape.prelimTies > 0) {
    const ids = tieIds(shape.prelimTies, { isOpeningRound: true, isFinal: false })
    rounds.push({
      name: shape.roundNames[0],
      ...takeMeta(),
      matches: ids.map((tie, i) => ({
        ...(tie ? { tie } : {}),
        home: { name: names[i * 2] },
        away: { name: names[i * 2 + 1] },
      })),
    })
  }

  /* First main round: entrant pairs, or the slot order when a prelim exists. */
  const slots =
    shape.prelimTies > 0
      ? (mainSlots?.length === shape.mainSize ? mainSlots : defaultMainRoundSlots(names))
      : names.map((name) => ({ kind: 'name', name }))
  const mainNames = shape.prelimTies > 0 ? shape.roundNames.slice(1) : shape.roundNames

  {
    const tieCount = shape.mainSize / 2
    const ids = tieIds(tieCount, {
      isOpeningRound: shape.prelimTies === 0,
      isFinal: mainNames.length === 1,
    })
    rounds.push({
      name: mainNames[0],
      ...takeMeta(),
      matches: ids.map((tie, i) => {
        const a = slots[i * 2]
        const b = slots[i * 2 + 1]
        const side = (s) =>
          s.kind === 'winner' ? { label: winnerLabel('Preliminary Round', s.tie) } : { name: s.name }
        const fromPart = (s) => (s.kind === 'winner' ? s.tie : null)
        const from = [fromPart(a), fromPart(b)]
        return {
          ...(tie ? { tie } : {}),
          ...(from.some((f) => f != null) ? { from } : {}),
          home: side(a),
          away: side(b),
        }
      }),
    })
  }

  /* Later main rounds: every slot fed by the winners of the previous round. */
  let prevIds = rounds[rounds.length - 1].matches.map((m) => m.tie ?? null)
  let prevName = mainNames[0]
  for (let r = 1; r < mainNames.length; r += 1) {
    const tieCount = shape.mainSize / 2 ** (r + 1)
    const ids = tieIds(tieCount, { isOpeningRound: false, isFinal: r === mainNames.length - 1 })
    const matches = ids.map((tie, i) => {
      const fromA = prevIds[i * 2]
      const fromB = prevIds[i * 2 + 1]
      return {
        ...(tie ? { tie } : {}),
        from: [fromA, fromB],
        home: { label: winnerLabel(prevName, fromA) },
        away: { label: winnerLabel(prevName, fromB) },
      }
    })
    rounds.push({ name: mainNames[r], ...takeMeta(), matches })
    prevIds = matches.map((m) => m.tie ?? null)
    prevName = mainNames[r]
  }

  return rounds
}
