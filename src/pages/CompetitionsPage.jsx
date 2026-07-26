import { Link, Navigate, useParams } from 'react-router-dom'
import { useCompetitions } from '../hooks/useCompetitions'
import { PosterTile } from '../components/LeaguePosterGrid'
import { colorForLeague } from '../lib/leagueColors'
import { formatFixtureDate } from '../lib/fixtures'

/** Keep in sync with HomePage — cups use palette slots after the three leagues. */
export const COMPETITION_COLOR_OFFSET = 3

function sideLabel(side) {
  return side?.name ?? side?.label ?? 'TBC'
}

function isPending(side) {
  return !side?.name
}

function KnockoutCard({ match }) {
  const played =
    typeof match.homeScore === 'number' && typeof match.awayScore === 'number'
  const homeWon = played ? match.homeScore > match.awayScore : match.walkover === 'home'
  const awayWon = played ? match.awayScore > match.homeScore : match.walkover === 'away'

  let status = 'Upcoming'
  if (played) status = 'Final score'
  else if (match.walkover) status = 'Walkover'
  else if (match.note) status = match.note

  return (
    <article className="match-card match-card--knockout">
      <div className="match-card__teams">
        <div className={`match-card__row${homeWon ? ' match-card__row--win' : ''}`}>
          <span
            className={`match-card__team${isPending(match.home) ? ' match-card__team--pending' : ''}`}
          >
            {sideLabel(match.home)}
          </span>
          <span className={`match-card__score${played ? '' : ' match-card__score--placeholder'}`}>
            {played ? match.homeScore : match.walkover === 'home' ? 'w/o' : '–'}
          </span>
        </div>
        <div className={`match-card__row${awayWon ? ' match-card__row--win' : ''}`}>
          <span
            className={`match-card__team${isPending(match.away) ? ' match-card__team--pending' : ''}`}
          >
            {sideLabel(match.away)}
          </span>
          <span className={`match-card__score${played ? '' : ' match-card__score--placeholder'}`}>
            {played ? match.awayScore : match.walkover === 'away' ? 'w/o' : '–'}
          </span>
        </div>
      </div>
      <footer className="match-card__foot">
        <span className="match-card__tie">{match.tie ? `Tie ${match.tie}` : '\u00a0'}</span>
        <span className={`match-card__status${played ? ' match-card__status--final' : ''}`}>
          {status}
        </span>
      </footer>
    </article>
  )
}

function CompetitionsHub({ competitions, loading }) {
  return (
    <div className="page page--competitions">
      <header className="page-head page-head--hub">
        <h1 className="page-head__title page-head__title--xl">Competitions</h1>
        <p className="page-head__lead">
          Knockout cups for the 2026 season. Pick one to see the draw and results.
        </p>
      </header>

      {loading ? (
        <p className="page-state">Loading…</p>
      ) : (
        <div className="poster-grid">
          {competitions.map((comp, index) => (
            <PosterTile
              key={comp.id}
              to={`/competitions/${encodeURIComponent(comp.id)}`}
              color={colorForLeague(comp.id, COMPETITION_COLOR_OFFSET + index).color}
              name={comp.name}
              days={comp.days}
              sub={comp.sub}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CompetitionDetail({ comp, palette }) {
  const finalRound = comp.rounds[comp.rounds.length - 1]
  const bannerMeta = [
    comp.days,
    finalRound?.date ? `Final ${formatFixtureDate(finalRound.date)}` : null,
    finalRound?.venue ? `at ${finalRound.venue}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className="page page--competitions"
      style={{
        '--league-color': palette.color,
        '--league-color-soft': palette.soft,
      }}
    >
      <header className="league-banner">
        <Link to="/competitions" className="league-banner__back">
          ← All competitions
        </Link>
        <h1 className="league-banner__title">{comp.name}</h1>
        {bannerMeta ? <p className="league-banner__meta">{bannerMeta}</p> : null}
      </header>

      <div className="rounds">
        {comp.rounds.map((round) => (
          <section key={round.name} className="round">
            <header className="round__head">
              <h3 className="round__title">{round.name}</h3>
              <span className="round__date">
                {round.date ? formatFixtureDate(round.date) : 'Date TBC'}
                {round.venue ? ` · ${round.venue}` : ''}
              </span>
            </header>
            <div className="matches-grid">
              {round.matches.map((match, i) => (
                <KnockoutCard key={match.tie ?? i} match={match} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export function CompetitionsPage() {
  const { compId } = useParams()
  const { competitions, loading } = useCompetitions()

  if (!compId) {
    return <CompetitionsHub competitions={competitions} loading={loading} />
  }

  if (loading) {
    return (
      <div className="page page--competitions">
        <p className="page-state">Loading…</p>
      </div>
    )
  }

  const index = competitions.findIndex((c) => c.id === compId)
  if (index < 0) {
    return <Navigate to="/competitions" replace />
  }

  return (
    <CompetitionDetail
      comp={competitions[index]}
      palette={colorForLeague(compId, COMPETITION_COLOR_OFFSET + index)}
    />
  )
}
