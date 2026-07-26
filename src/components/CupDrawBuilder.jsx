import { useMemo, useState } from 'react'
import { buildCupRounds, cupDrawShape, prelimTieLetter } from '../lib/cupDraw'
import { formatFixtureDate } from '../lib/fixtures'

/**
 * Reconstruct the entrant draw order from an existing result-free draw, so a
 * redo starts from the current names: opening-round pairs in order, then any
 * direct entrants named in the following round (the preliminary-round case).
 */
export function entrantsFromRounds(rounds) {
  if (!rounds?.length) return []
  const names = []
  for (const m of rounds[0].matches ?? []) {
    if (m.home?.name) names.push(m.home.name)
    if (m.away?.name) names.push(m.away.name)
  }
  if (rounds.length > 1) {
    for (const m of rounds[1].matches ?? []) {
      if (m.home?.name) names.push(m.home.name)
      if (m.away?.name) names.push(m.away.name)
    }
  }
  return names
}

function shuffled(list) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function sideDisplay(side) {
  return side?.name ?? side?.label ?? 'TBC'
}

/**
 * Guided cup draw setup: entrants in draw order, automatic bracket structure
 * (preliminary round when the entry isn't a power of two), an editable slot
 * order for the round after the prelim, per-round dates/venues, and a live
 * preview. Saving replaces the competition's whole round structure — the
 * server refuses once any result has been entered.
 */
export function CupDrawBuilder({ admin, comp, onSaved, onCancel }) {
  const [entrantsText, setEntrantsText] = useState(() =>
    entrantsFromRounds(comp.rounds).join('\n'),
  )
  /** First-main-round slot order (token values) — null until customised. */
  const [slotValues, setSlotValues] = useState(null)
  /** Per-round date/venue drafts, keyed by round name so edits survive reshapes. */
  const [metaByName, setMetaByName] = useState(() =>
    Object.fromEntries(
      (comp.rounds ?? []).map((r) => [r.name, { date: r.date ?? '', venue: r.venue ?? '' }]),
    ),
  )
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const entrants = useMemo(
    () =>
      entrantsText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
    [entrantsText],
  )
  const shape = cupDrawShape(entrants.length)

  const duplicates = useMemo(() => {
    const seen = new Set()
    const dups = new Set()
    for (const n of entrants) {
      const k = n.toLowerCase()
      if (seen.has(k)) dups.add(n)
      seen.add(k)
    }
    return [...dups]
  }, [entrants])

  /* Token pool for the round after the prelim: winner slots + direct entrants. */
  const pool = useMemo(() => {
    if (!shape || shape.prelimTies === 0) return []
    const items = []
    for (let i = 0; i < shape.prelimTies; i += 1) {
      const tie = prelimTieLetter(i)
      items.push({ value: `w:${tie}`, label: `Winner of Tie ${tie}`, token: { kind: 'winner', tie } })
    }
    entrants.slice(shape.prelimTeams).forEach((name, i) => {
      items.push({ value: `n:${i}`, label: name, token: { kind: 'name', name } })
    })
    return items
  }, [entrants, shape])

  /* Slot order falls back to winners-then-directs whenever the shape changes. */
  const defaultSlotValues = pool.map((p) => p.value)
  const effectiveSlots =
    slotValues &&
    slotValues.length === defaultSlotValues.length &&
    [...slotValues].sort().join('|') === [...defaultSlotValues].sort().join('|')
      ? slotValues
      : defaultSlotValues

  function setSlot(index, value) {
    const next = [...effectiveSlots]
    const other = next.indexOf(value)
    if (other !== -1) next[other] = next[index]
    next[index] = value
    setSlotValues(next)
    setMsg(null)
  }

  const roundMeta = shape ? shape.roundNames.map((n) => metaByName[n] ?? {}) : []

  function setRoundMeta(name, field, value) {
    setMetaByName((prev) => ({ ...prev, [name]: { ...prev[name], [field]: value } }))
    setMsg(null)
  }

  const poolByValue = Object.fromEntries(pool.map((p) => [p.value, p]))
  const previewRounds = useMemo(() => {
    if (!shape || duplicates.length) return null
    try {
      return buildCupRounds({
        entrants,
        mainSlots: effectiveSlots.map((v) => poolByValue[v]?.token).filter(Boolean),
        roundMeta,
      })
    } catch {
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrants, shape, duplicates.length, effectiveSlots.join('|'), JSON.stringify(roundMeta)])

  async function save() {
    if (!previewRounds) return
    setSaving(true)
    setMsg(null)
    try {
      await admin.saveCompetitionDraw(comp.id, previewRounds)
      setMsg({ kind: 'success', text: 'Draw saved — score entry is ready below.' })
      onSaved?.()
    } catch (e) {
      setMsg({ kind: 'error', text: e.message || 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  const mainTieCount = shape ? shape.mainSize / 2 : 0

  return (
    <section className="tile cup-draw">
      <div className="team-slots__head">
        <h3 className="team-slots__title">Set up the draw</h3>
        <span className="team-slots__count">
          {entrants.length} entrant{entrants.length !== 1 ? 's' : ''}
        </span>
        {onCancel ? (
          <button type="button" className="dates-tile__toggle" onClick={onCancel}>
            Close
          </button>
        ) : null}
      </div>

      <p className="team-slots__hint cup-draw__hint">
        Type the entrants one per line, in the order they were drawn — names 1 &amp; 2 make
        the first tie, 3 &amp; 4 the next, and so on. Use Shuffle to draw at random instead.
      </p>

      <textarea
        className="admin-input cup-draw__entrants"
        rows={Math.max(6, entrants.length + 2)}
        value={entrantsText}
        spellCheck={false}
        placeholder={'Kesgrave\nWesterfield\nHadleigh\nFelixstowe\n…'}
        onChange={(ev) => {
          setEntrantsText(ev.target.value)
          setMsg(null)
        }}
      />

      <div className="cup-draw__toolbar">
        <button
          type="button"
          className="dates-tile__cascade"
          disabled={entrants.length < 2}
          onClick={() => {
            setEntrantsText(shuffled(entrants).join('\n'))
            setSlotValues(null)
            setMsg(null)
          }}
        >
          Shuffle the draw
        </button>
        {shape ? (
          <span className="cup-draw__shape">
            {shape.prelimTies > 0
              ? `Preliminary round of ${shape.prelimTies} tie${shape.prelimTies !== 1 ? 's' : ''}, ` +
                `${shape.directEntrants} team${shape.directEntrants !== 1 ? 's' : ''} entering at the ${shape.roundNames[1]}`
              : `${shape.roundNames.join(' · ')}`}
          </span>
        ) : (
          <span className="cup-draw__shape">Needs at least 2 entrants</span>
        )}
      </div>

      {duplicates.length ? (
        <p className="team-slots__msg team-slots__msg--error">
          Duplicate entrant{duplicates.length !== 1 ? 's' : ''}: {duplicates.join(', ')}
        </p>
      ) : null}

      {shape && shape.prelimTies > 0 ? (
        <div className="cup-draw__slots">
          <h4 className="cup-draw__subtitle">{shape.roundNames[1]} draw</h4>
          <p className="team-slots__hint cup-draw__hint">
            The first {shape.prelimTeams} entrants play the preliminary round. Arrange who
            the {shape.prelimTies === 1 ? 'winner meets' : 'winners meet'} here — picking a
            name that's already placed swaps the two slots.
          </p>
          <ol className="cup-draw__slotlist">
            {Array.from({ length: mainTieCount }, (_, t) => (
              <li key={t} className="cup-draw__slottie">
                <span className="cup-draw__tienum">Tie {t + 1}</span>
                {[0, 1].map((s) => {
                  const idx = t * 2 + s
                  return (
                    <select
                      key={s}
                      className="admin-input cup-draw__slotselect"
                      value={effectiveSlots[idx] ?? ''}
                      aria-label={`Tie ${t + 1} ${s === 0 ? 'home' : 'away'} slot`}
                      onChange={(ev) => setSlot(idx, ev.target.value)}
                    >
                      {pool.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  )
                })}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {shape ? (
        <div className="cup-draw__rounds">
          <h4 className="cup-draw__subtitle">Round dates</h4>
          <ol className="cup-draw__roundlist">
            {shape.roundNames.map((name) => {
              const meta = metaByName[name] ?? {}
              return (
                <li key={name} className="cup-draw__round">
                  <span className="cup-draw__roundname">{name}</span>
                  <input
                    type="date"
                    className="dates-tile__input"
                    value={meta.date ?? ''}
                    aria-label={`${name} date`}
                    onChange={(ev) => setRoundMeta(name, 'date', ev.target.value)}
                  />
                  <input
                    type="text"
                    className="admin-input cup-draw__venue"
                    value={meta.venue ?? ''}
                    placeholder="Venue (optional)"
                    aria-label={`${name} venue`}
                    onChange={(ev) => setRoundMeta(name, 'venue', ev.target.value)}
                  />
                </li>
              )
            })}
          </ol>
        </div>
      ) : null}

      {previewRounds ? (
        <div className="cup-draw__previewwrap">
          <h4 className="cup-draw__subtitle">Preview</h4>
          <ol className="fixture-preview">
            {previewRounds.map((round) => (
              <li key={round.name} className="fixture-preview__week">
                <span className="fixture-preview__date">
                  {round.name}
                  {round.date ? ` · ${formatFixtureDate(round.date)}` : ''}
                  {round.venue ? ` · ${round.venue}` : ''}
                </span>
                <span className="fixture-preview__matches">
                  {round.matches.map((m, i) => (
                    <span key={i} className="fixture-preview__match">
                      {m.tie ? `(${m.tie}) ` : ''}
                      {sideDisplay(m.home)} v {sideDisplay(m.away)}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="team-slots__foot">
        <button
          type="button"
          className="entry-rowact entry-rowact--save"
          disabled={!previewRounds || saving}
          onClick={save}
        >
          {saving ? 'Saving…' : '✓ Save draw'}
        </button>
        {msg ? (
          <span
            className={
              msg.kind === 'error' ? 'team-slots__msg team-slots__msg--error' : 'team-slots__msg'
            }
          >
            {msg.text}
          </span>
        ) : (
          <span className="team-slots__hint">
            Saving replaces the whole draw — fine until results are entered.
          </span>
        )}
      </div>
    </section>
  )
}
