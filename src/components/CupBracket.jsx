/**
 * Classic one-direction knockout bracket (v21 mockup, Option A): rounds flow
 * left to right into the final, with connector lines drawing the routing.
 * Built from the `from` links on each match (which earlier ties feed it);
 * renders nothing when the rounds don't form a clean tree, so cups with
 * byes/preliminaries fall back to the round-by-round cards.
 */

function shortDate(iso) {
  if (!iso) return null
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

/**
 * Resolve the bracket tree from the final backwards. Returns an array of
 * column descriptors ({ title, matches, isFinal, venue }) or null when the
 * rounds can't form one. Each match gets a `parent` reference (the tie it
 * feeds) so progression can be shown even before a score is recorded.
 */
function buildBracket(rounds) {
  if (!rounds || rounds.length < 2) return null
  const finalRound = rounds[rounds.length - 1]
  if (finalRound.matches?.length !== 1) return null

  const roundMaps = rounds.map((r) => {
    const map = new Map()
    for (const m of r.matches ?? []) if (m.tie != null) map.set(String(m.tie), m)
    return map
  })

  /* Ghost slots keep the tree balanced where a team enters directly at a
     later round (e.g. Millennium Cup byes past the preliminary round);
     they render as empty space with no connectors. */
  const levels = [[finalRound.matches[0]]]
  for (let roundIndex = rounds.length - 1; roundIndex > 0; roundIndex--) {
    const next = []
    for (const m of levels[levels.length - 1]) {
      if (m?.ghost) {
        next.push({ ghost: true }, { ghost: true })
        continue
      }
      if (!Array.isArray(m.from) || m.from.length !== 2) return null
      for (const label of m.from) {
        if (label == null) {
          next.push({ ghost: true })
          continue
        }
        const feeder = roundMaps[roundIndex - 1].get(String(label))
        if (!feeder) return null
        feeder.parent = m
        next.push(feeder)
      }
    }
    levels.push(next)
  }

  // levels[0] = final … levels[last] = 1st round; flip to left-to-right.
  return levels
    .map((matches, i) => {
      const round = rounds[rounds.length - 1 - i]
      const date = shortDate(round.date)
      return {
        title: date ? `${round.name} · ${date}` : round.name,
        matches,
        isFinal: i === 0,
        venue: round.venue ?? null,
      }
    })
    .reverse()
}

/**
 * Who won: by score, by walkover, or — when neither is recorded yet — by
 * appearing in the next round (e.g. "score sheet awaited" ties).
 */
function winnerSide(match) {
  const played =
    typeof match.homeScore === 'number' && typeof match.awayScore === 'number'
  if (played) {
    if (match.homeScore > match.awayScore) return 'home'
    if (match.awayScore > match.homeScore) return 'away'
    return null
  }
  if (match.walkover) return match.walkover
  const parentNames = [match.parent?.home?.name, match.parent?.away?.name].filter(Boolean)
  if (parentNames.length > 0) {
    if (match.home?.name && parentNames.includes(match.home.name)) return 'home'
    if (match.away?.name && parentNames.includes(match.away.name)) return 'away'
  }
  return null
}

function Side({ side, won, lost, decided, match, which }) {
  const played =
    typeof match.homeScore === 'number' && typeof match.awayScore === 'number'
  let score = '–'
  if (played) score = which === 'home' ? match.homeScore : match.awayScore
  else if (match.walkover === which) score = 'w/o'
  else if (won) score = '*' // progressed without a recorded score

  const cls = ['cup-bkt__row']
  if (won) cls.push('cup-bkt__row--win')
  if (decided && lost) cls.push('cup-bkt__row--lose')

  return (
    <div className={cls.join(' ')}>
      <span className="cup-bkt__team">{side?.name ?? '·'}</span>
      <span className="cup-bkt__score">{score}</span>
    </div>
  )
}

function BracketMatch({ match, isFinal, note }) {
  const winner = winnerSide(match)
  return (
    <div className={`cup-bkt__match${isFinal ? ' cup-bkt__match--final' : ''}`}>
      <Side
        side={match.home}
        won={winner === 'home'}
        lost={winner === 'away'}
        decided={winner != null}
        match={match}
        which="home"
      />
      <Side
        side={match.away}
        won={winner === 'away'}
        lost={winner === 'home'}
        decided={winner != null}
        match={match}
        which="away"
      />
      {note ? <span className="cup-bkt__tie">{note}</span> : null}
    </div>
  )
}

/** Whether the rounds can be drawn as a bracket (used to show/hide the tab). */
export function hasBracket(rounds) {
  return buildBracket(rounds) != null
}

export function CupBracket({ rounds }) {
  const columns = buildBracket(rounds)
  if (!columns) return null

  return (
    <div className="cup-bkt-scroll">
      <div className="cup-bkt" aria-label="Knockout bracket">
        {columns.map((col, colIndex) => (
          <div className="cup-bkt__round" key={colIndex}>
            <span className="cup-bkt__title">{col.title}</span>
            {col.matches.map((m, i) => {
              if (m.ghost) {
                return (
                  <div
                    className="cup-bkt__cell cup-bkt__cell--ghost"
                    key={`ghost-${i}`}
                    aria-hidden="true"
                  />
                )
              }
              const pairClass = col.isFinal
                ? ''
                : i % 2 === 0
                  ? ' cup-bkt__cell--top'
                  : ' cup-bkt__cell--bot'
              /* When the pair sibling is a ghost, the join only needs to
                 reach the pair midpoint, not the sibling's centre. */
              const soloClass =
                !col.isFinal && col.matches[i % 2 === 0 ? i + 1 : i - 1]?.ghost
                  ? ' cup-bkt__cell--solo'
                  : ''
              const tieNote = m.tie != null ? `Tie ${m.tie}` : null
              const note = [tieNote, m.note].filter(Boolean).join(' · ')
              return (
                <div className={`cup-bkt__cell${pairClass}${soloClass}`} key={m.tie ?? i}>
                  {colIndex > 0 && Array.isArray(m.from) ? (
                    <span className="cup-bkt__in" aria-hidden="true" />
                  ) : null}
                  <div className="cup-bkt__box">
                    <BracketMatch match={m} isFinal={col.isFinal} note={note || null} />
                    {col.isFinal && col.venue ? (
                      <span className="cup-bkt__final-meta">{col.venue}</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
