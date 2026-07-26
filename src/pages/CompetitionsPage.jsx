import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useCompetitions } from '../hooks/useCompetitions'
import { CupBracket, hasBracket } from '../components/CupBracket'
import { CupMatches } from '../components/MatchList'
import { PosterTile } from '../components/LeaguePosterGrid'
import { colorForLeague } from '../lib/leagueColors'
import { formatFixtureDate } from '../lib/fixtures'

/** Keep in sync with HomePage — cups use palette slots after the three leagues. */
export const COMPETITION_COLOR_OFFSET = 3

function sideLabel(side) {
  return side?.name ?? side?.label ?? 'TBC'
}

/**
 * Cup rounds in the fixtureWeeks shape the match list and exports use:
 * one "week" per round, with the round name as the tile label.
 */
function roundsToWeeks(rounds) {
  return (rounds ?? []).map((round, index) => ({
    week: index + 1,
    label: round.name,
    date: round.date ?? null,
    venue: round.venue ?? null,
    matches: (round.matches ?? []).map((m) => {
      const played =
        typeof m.homeScore === 'number' && typeof m.awayScore === 'number'
      return {
        home: sideLabel(m.home),
        away: sideLabel(m.away),
        homeShots: played ? m.homeScore : null,
        awayShots: played ? m.awayScore : null,
        played,
        walkover: m.walkover,
        homeWon: played ? m.homeScore > m.awayScore : m.walkover === 'home',
        awayWon: played ? m.awayScore > m.homeScore : m.walkover === 'away',
      }
    }),
  }))
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
  const [searchParams] = useSearchParams()
  const bracketAvailable = hasBracket(comp.rounds)
  const view =
    bracketAvailable && searchParams.get('view') === 'bracket'
      ? 'bracket'
      : 'matches'

  const finalRound = comp.rounds[comp.rounds.length - 1]
  const bannerMeta = [
    comp.days,
    finalRound?.date ? `Final ${formatFixtureDate(finalRound.date)}` : null,
    finalRound?.venue ? `at ${finalRound.venue}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const tabs = [
    { id: 'matches', label: 'Matches', href: '?view=matches' },
    ...(bracketAvailable
      ? [{ id: 'bracket', label: 'Bracket', href: '?view=bracket' }]
      : []),
  ]

  return (
    <div
      className="page page--competitions"
      style={{
        '--league-color': palette.color,
        '--league-color-soft': palette.soft,
      }}
    >
      <header className="league-banner league-banner--tabbed">
        <Link to="/competitions" className="league-banner__back">
          ← All competitions
        </Link>
        <h1 className="league-banner__title">{comp.name}</h1>
        {bannerMeta ? <p className="league-banner__meta">{bannerMeta}</p> : null}
        <nav className="league-banner__tabs" aria-label="View">
          {tabs.map((t) => {
            const active = t.id === view
            return (
              <Link
                key={t.id}
                to={{ search: t.href }}
                className={`league-banner__tab${active ? ' league-banner__tab--active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
      </header>

      {view === 'bracket' ? (
        <CupBracket rounds={comp.rounds} />
      ) : (
        <CupMatches
          weeks={roundsToWeeks(comp.rounds)}
          context={{ leagueName: comp.name }}
        />
      )}
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
