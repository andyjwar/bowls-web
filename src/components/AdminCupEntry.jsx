import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { colorForLeague } from '../lib/leagueColors'
import { formatFixtureDate } from '../lib/fixtures'
import { cupMatchDecided } from '../lib/adminEntryData'

/** Cups take the palette slots after the three leagues — same as the public pages. */
const COMPETITION_COLOR_OFFSET = 3

/** Real club name only — placeholder `label`s ("Winner of Tie 1") don't count. */
function sideName(side) {
  const n = side?.name
  return typeof n === 'string' && n.trim() ? n.trim() : null
}

/** Display text for a side: real name, else its placeholder label. */
function sideDisplay(side, fallback) {
  return sideName(side) ?? (typeof side?.label === 'string' && side.label.trim() ? side.label.trim() : fallback)
}

function editKey(roundIdx, matchIdx) {
  return `${roundIdx}|${matchIdx}`
}

function savedEditValues(m) {
  return {
    homeScore: Number.isFinite(Number(m.homeScore)) && m.homeScore !== undefined ? String(m.homeScore) : '',
    awayScore: Number.isFinite(Number(m.awayScore)) && m.awayScore !== undefined ? String(m.awayScore) : '',
    walkover: m.walkover === 'home' || m.walkover === 'away' ? m.walkover : '',
  }
}

function editsMatchSaved(e, m) {
  const s = savedEditValues(m)
  return (
    e.homeScore.trim() === s.homeScore &&
    e.awayScore.trim() === s.awayScore &&
    e.walkover === s.walkover
  )
}

/**
 * Round-by-round cup score entry. Saving a round writes the whole competition
 * back; the server fills winners into `from`-linked slots in later rounds.
 */
export function AdminCupEntry({ admin }) {
  const { compId } = useParams()
  const [competitions, setCompetitions] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [revision, setRevision] = useState(0)
  const [edits, setEdits] = useState({})
  const [roundMsg, setRoundMsg] = useState(null) // { round, kind, text }
  const [savingRound, setSavingRound] = useState(null)
  const [savingTie, setSavingTie] = useState(null) // editKey currently saving
  const [woPicker, setWoPicker] = useState(null) // editKey whose Home/Away walkover choice is open

  useEffect(() => {
    let cancelled = false
    setFetchError(null)
    admin
      .loadCompetitions()
      .then((d) => {
        if (!cancelled) setCompetitions(d.competitions ?? [])
      })
      .catch((e) => {
        if (!cancelled) setFetchError(e.message || 'Could not load competitions')
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compId, revision])

  const index = (competitions ?? []).findIndex((c) => c.id === compId)
  const comp = index >= 0 ? competitions[index] : null
  const palette = colorForLeague(compId, index >= 0 ? COMPETITION_COLOR_OFFSET + index : undefined)

  function updateEdit(roundIdx, matchIdx, match, field, value) {
    const key = editKey(roundIdx, matchIdx)
    setEdits((prev) => {
      const cur = prev[key] ?? savedEditValues(match)
      const next = { ...cur, [field]: value }
      if (field === 'walkover' && value) {
        next.homeScore = ''
        next.awayScore = ''
      }
      return { ...prev, [key]: next }
    })
  }

  /** Open the entry strip for a tie, prefilled with its saved values. */
  function seedTie(roundIdx, matchIdx, match) {
    setEdits((prev) => ({
      ...prev,
      [editKey(roundIdx, matchIdx)]: savedEditValues(match),
    }))
  }

  function discardRound(roundIdx) {
    setEdits((prev) => {
      const next = {}
      for (const [k, v] of Object.entries(prev)) {
        if (!k.startsWith(`${roundIdx}|`)) next[k] = v
      }
      return next
    })
    setRoundMsg(null)
  }

  function roundDirtyCount(roundIdx, round) {
    let n = 0
    for (let i = 0; i < (round.matches ?? []).length; i += 1) {
      const e = edits[editKey(roundIdx, i)]
      if (e && !editsMatchSaved(e, round.matches[i])) n += 1
    }
    return n
  }

  /**
   * Apply one edit onto a (deep-copied) rounds match in place.
   * @returns {string|null} validation error text, or null on success
   */
  function applyEditToCupMatch(m, e) {
    const hs = e.homeScore.trim()
    const as = e.awayScore.trim()

    if (e.walkover) {
      m.walkover = e.walkover
      delete m.homeScore
      delete m.awayScore
      delete m.note
      return null
    }
    delete m.walkover

    if (hs === '' && as === '') {
      delete m.homeScore
      delete m.awayScore
      return null
    }
    const hsNum = Number(hs)
    const asNum = Number(as)
    if (hs === '' || as === '' || !Number.isFinite(hsNum) || !Number.isFinite(asNum)) {
      return `${sideName(m.home) ?? 'Tie ' + m.tie} v ${sideName(m.away) ?? ''}: enter both scores, or clear both to remove the result.`
    }
    m.homeScore = hsNum
    m.awayScore = asNum
    delete m.note
    return null
  }

  /** Drop a single tie's edit — a decided tie falls back to its printed chip. */
  function cancelTie(roundIdx, matchIdx) {
    const key = editKey(roundIdx, matchIdx)
    setWoPicker((p) => (p === key ? null : p))
    setEdits((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  /**
   * Save just this tie — whole rounds array is PUT with only this edit applied.
   * Pass `override` values (all-blank clears the result) instead of the tie's edit.
   */
  async function saveTie(roundIdx, matchIdx, override = null) {
    const key = editKey(roundIdx, matchIdx)
    const e = override ?? edits[key]
    if (!e) return

    const rounds = JSON.parse(JSON.stringify(comp.rounds ?? []))
    const m = rounds[roundIdx].matches[matchIdx]
    const err = applyEditToCupMatch(m, e)
    if (err) {
      setRoundMsg({ round: roundIdx, kind: 'error', text: err })
      return
    }

    setSavingTie(key)
    setRoundMsg(null)
    try {
      await admin.saveCompetitionRounds(compId, rounds)
      cancelTie(roundIdx, matchIdx)
      setRevision((x) => x + 1)
      setRoundMsg({
        round: roundIdx,
        kind: 'success',
        text: override
          ? 'Result cleared — the tie is undecided again and later-round slots revert.'
          : 'Saved — winners carried into the next round where ties are decided.',
      })
    } catch (e2) {
      setRoundMsg({ round: roundIdx, kind: 'error', text: e2.message || 'Save failed' })
    } finally {
      setSavingTie(null)
    }
  }

  async function saveRound(roundIdx) {
    const rounds = JSON.parse(JSON.stringify(comp.rounds ?? []))
    const round = rounds[roundIdx]

    for (let i = 0; i < (round.matches ?? []).length; i += 1) {
      const e = edits[editKey(roundIdx, i)]
      if (!e) continue
      const err = applyEditToCupMatch(round.matches[i], e)
      if (err) {
        setRoundMsg({ round: roundIdx, kind: 'error', text: err })
        return
      }
    }

    setSavingRound(roundIdx)
    setRoundMsg(null)
    try {
      await admin.saveCompetitionRounds(compId, rounds)
      discardRound(roundIdx)
      setRevision((x) => x + 1)
      setRoundMsg({
        round: roundIdx,
        kind: 'success',
        text: 'Saved — winners carried into the next round where ties are decided.',
      })
    } catch (e) {
      setRoundMsg({ round: roundIdx, kind: 'error', text: e.message || 'Save failed' })
    } finally {
      setSavingRound(null)
    }
  }

  const finalRound = comp?.rounds?.[comp.rounds.length - 1]
  const bannerMeta = comp
    ? [
        comp.days,
        finalRound?.date ? `Final ${formatFixtureDate(finalRound.date)}` : null,
        finalRound?.venue ? `at ${finalRound.venue}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

  return (
    <div
      className="page page--competitions page--admin-entry"
      style={{
        '--league-color': palette.color,
        '--league-color-soft': palette.soft,
      }}
    >
      <header className="league-banner">
        <Link to="/admin" className="league-banner__back">
          ← Admin
        </Link>
        <h1 className="league-banner__title">{comp?.name ?? 'Competition'}</h1>
        {bannerMeta ? <p className="league-banner__meta">{bannerMeta}</p> : null}
      </header>

      {competitions === null && !fetchError ? <p className="page-state">Loading…</p> : null}
      {fetchError ? <p className="page-state page-state--error">{fetchError}</p> : null}
      {competitions !== null && !comp ? (
        <p className="page-state page-state--error">Unknown competition.</p>
      ) : null}

      {comp ? (
        <div className="match-weeks">
          {comp.rounds.map((round, roundIdx) => {
            const dirtyCount = roundDirtyCount(roundIdx, round)
            const msg = roundMsg && roundMsg.round === roundIdx ? roundMsg : null
            return (
              <section key={round.name ?? roundIdx} className="match-week">
                <div className="match-week__head">
                  <h3 className="match-week__title">{round.name}</h3>
                  <span className="match-week__date">
                    {[formatFixtureDate(round.date) || null, round.venue || null]
                      .filter(Boolean)
                      .join(' · ') || 'Date TBC'}
                  </span>
                </div>

                {(round.matches ?? []).map((m, matchIdx) => {
                  const home = sideName(m.home)
                  const away = sideName(m.away)
                  const named = Boolean(home && away)
                  const key = editKey(roundIdx, matchIdx)
                  const e = edits[key] ?? null
                  const decided = cupMatchDecided(m)
                  const open = named && Boolean(e)
                  const tappable = named && !decided && !open
                  const dirty = e ? !editsMatchSaved(e, m) : false
                  const tieSaving = savingTie === key

                  const played =
                    Number.isFinite(Number(m.homeScore)) && Number.isFinite(Number(m.awayScore))
                  const homeWon = played
                    ? Number(m.homeScore) > Number(m.awayScore)
                    : m.walkover === 'home'
                  const awayWon = played
                    ? Number(m.awayScore) > Number(m.homeScore)
                    : m.walkover === 'away'

                  const fromLabel = (slot) =>
                    Array.isArray(m.from) && m.from.length === 2
                      ? `Winner ${m.from[slot]}`
                      : 'TBC'

                  const walkoverState = e ? e.walkover : (m.walkover ?? '')

                  return (
                    <Fragment key={matchIdx}>
                      <div
                        className={`match-row match-row--entry match-row--tie${
                          !named ? ' match-row--tbc' : ''
                        }${tappable ? ' match-row--tap' : ''}${open ? ' match-row--editing' : ''}`}
                        onClick={
                          tappable
                            ? (ev) => {
                                if (ev.target.closest('button, input, a')) return
                                seedTie(roundIdx, matchIdx, m)
                              }
                            : undefined
                        }
                      >
                        <span className="match-row__tie">{m.tie ?? ''}</span>
                        <span
                          className={`match-row__home${
                            homeWon ? ' match-row__team--win' : awayWon ? ' match-row__team--lose' : ''
                          }`}
                        >
                          {sideDisplay(m.home, fromLabel(0))}
                        </span>

                        {open ? (
                          <span className="match-row__mid match-row__mid--vs">v</span>
                        ) : named && decided ? (
                          <button
                            type="button"
                            className="match-row__mid match-row__mid--score entry-score-btn"
                            title="Click to edit"
                            onClick={() => seedTie(roundIdx, matchIdx, m)}
                          >
                            {played ? `${m.homeScore}–${m.awayScore}` : 'w/o'}
                          </button>
                        ) : named ? (
                          <button
                            type="button"
                            className="match-row__mid entry-open-btn"
                            onClick={() => seedTie(roundIdx, matchIdx, m)}
                          >
                            enter score
                          </button>
                        ) : (
                          <span className="match-row__mid match-row__mid--vs">v</span>
                        )}

                        <span
                          className={`match-row__away${
                            awayWon ? ' match-row__team--win' : homeWon ? ' match-row__team--lose' : ''
                          }`}
                        >
                          {sideDisplay(m.away, fromLabel(1))}
                        </span>

                        <span
                          className={`match-row__state${
                            dirty
                              ? ' match-row__state--dirty'
                              : decided
                                ? ' match-row__state--saved'
                                : ''
                          }`}
                        >
                          {open ? (
                            dirty ? (
                              'Not saved'
                            ) : decided ? (
                              'Editing…'
                            ) : (
                              'Entering…'
                            )
                          ) : decided ? (
                            <button
                              type="button"
                              className="entry-rowact entry-rowact--edit"
                              aria-label={`Edit ${sideDisplay(m.home, 'tie')} v ${sideDisplay(m.away, '')}`}
                              onClick={() => seedTie(roundIdx, matchIdx, m)}
                            >
                              Edit
                            </button>
                          ) : named ? (
                            (m.note ?? null)
                          ) : (
                            'Waiting'
                          )}
                        </span>
                      </div>

                      {open ? (
                        <div
                          className="entry-strip entry-strip--tie"
                          role="group"
                          aria-label={`${home} v ${away} score entry`}
                        >
                          <span className="entry-strip__main">
                            <span className="entry-strip__group">
                              <span className="entry-strip__label">Shots</span>
                              <input
                                className="entry-strip__box entry-strip__box--pts"
                                inputMode="numeric"
                                autoFocus
                                aria-label={`${home} score`}
                                disabled={Boolean(walkoverState)}
                                value={e.homeScore}
                                onChange={(ev) =>
                                  updateEdit(roundIdx, matchIdx, m, 'homeScore', ev.target.value)
                                }
                              />
                              <span className="entry-strip__dash">–</span>
                              <input
                                className="entry-strip__box entry-strip__box--pts"
                                inputMode="numeric"
                                aria-label={`${away} score`}
                                disabled={Boolean(walkoverState)}
                                value={e.awayScore}
                                onChange={(ev) =>
                                  updateEdit(roundIdx, matchIdx, m, 'awayScore', ev.target.value)
                                }
                              />
                            </span>
                            {walkoverState ? (
                              <span className="entry-strip__wo-note">
                                Walkover — {walkoverState === 'home' ? home : away} advance
                              </span>
                            ) : null}
                          </span>
                          <span className="entry-strip__acts">
                            {dirty ? (
                              <button
                                type="button"
                                className="entry-rowact entry-rowact--save"
                                disabled={tieSaving || savingRound === roundIdx}
                                onClick={() => saveTie(roundIdx, matchIdx)}
                              >
                                {tieSaving ? 'Saving…' : '✓ Save'}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="entry-rowact entry-rowact--wo"
                              aria-pressed={Boolean(walkoverState) || woPicker === key}
                              title={
                                walkoverState
                                  ? 'Remove the walkover'
                                  : 'Tie conceded? Award a walkover'
                              }
                              disabled={tieSaving || savingRound === roundIdx}
                              onClick={() => {
                                if (walkoverState) {
                                  updateEdit(roundIdx, matchIdx, m, 'walkover', '')
                                } else {
                                  setWoPicker((p) => (p === key ? null : key))
                                }
                              }}
                            >
                              {walkoverState === 'home'
                                ? 'W/O Home ×'
                                : walkoverState === 'away'
                                  ? 'W/O Away ×'
                                  : 'Walkover'}
                            </button>
                            {woPicker === key && !walkoverState ? (
                              <span
                                className="entry-wo-pick"
                                role="group"
                                aria-label="Who advances on the walkover?"
                              >
                                <button
                                  type="button"
                                  className="entry-rowact entry-rowact--wo-side"
                                  title={`${home} advance`}
                                  onClick={() => {
                                    updateEdit(roundIdx, matchIdx, m, 'walkover', 'home')
                                    setWoPicker(null)
                                  }}
                                >
                                  Home
                                </button>
                                <button
                                  type="button"
                                  className="entry-rowact entry-rowact--wo-side"
                                  title={`${away} advance`}
                                  onClick={() => {
                                    updateEdit(roundIdx, matchIdx, m, 'walkover', 'away')
                                    setWoPicker(null)
                                  }}
                                >
                                  Away
                                </button>
                              </span>
                            ) : null}
                            {decided ? (
                              <button
                                type="button"
                                className="entry-rowact entry-rowact--clear"
                                aria-label={`Clear the saved result for ${sideDisplay(m.home, 'tie')} v ${sideDisplay(m.away, '')}`}
                                title="Remove this saved result"
                                disabled={tieSaving || savingRound === roundIdx}
                                onClick={() =>
                                  saveTie(roundIdx, matchIdx, {
                                    homeScore: '',
                                    awayScore: '',
                                    walkover: '',
                                  })
                                }
                              >
                                Clear
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="entry-rowact entry-rowact--cancel"
                              aria-label={`Cancel editing ${sideDisplay(m.home, 'tie')} v ${sideDisplay(m.away, '')}`}
                              disabled={tieSaving}
                              onClick={() => cancelTie(roundIdx, matchIdx)}
                            >
                              Cancel
                            </button>
                          </span>
                        </div>
                      ) : null}
                    </Fragment>
                  )
                })}

                <div className="match-week__foot">
                  {dirtyCount >= 2 ? (
                    <>
                      <button
                        type="button"
                        className="entry-save-btn"
                        disabled={savingRound === roundIdx || savingTie != null}
                        onClick={() => saveRound(roundIdx)}
                      >
                        {savingRound === roundIdx
                          ? 'Saving…'
                          : `Save ${dirtyCount} results`}
                      </button>
                      <button
                        type="button"
                        className="admin-btn admin-btn--ghost"
                        onClick={() => discardRound(roundIdx)}
                      >
                        Discard changes
                      </button>
                    </>
                  ) : null}
                  {msg ? (
                    <span
                      className={
                        msg.kind === 'error'
                          ? 'match-week__foot-msg match-week__foot-msg--error'
                          : 'match-week__foot-msg'
                      }
                    >
                      {msg.text}
                    </span>
                  ) : (
                    <span className="match-week__foot-hint">
                      Winners advance into the next round automatically · use Walkover for
                      conceded ties
                    </span>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
