import { useLeaguesNav } from '../hooks/useBowlsLeague'
import { useLeagueHubSummaries } from '../hooks/useLeagueHubSummaries'
import { useCompetitions } from '../hooks/useCompetitions'
import { LeaguePosterGrid, PosterTile } from '../components/LeaguePosterGrid'
import { DayCarousel } from '../components/DayCarousel'
import { JumpToTeam } from '../components/JumpToTeam'
import { colorForLeague } from '../lib/leagueColors'

/** Cups take the palette slots after the leagues so colours never clash. */
const COMPETITION_COLOR_OFFSET = 3

export function HomePage() {
  const { items: leaguesNav } = useLeaguesNav()
  const { summaries } = useLeagueHubSummaries(leaguesNav)
  const { competitions } = useCompetitions()

  return (
    <div className="page page--home">
      <header className="page-head page-head--home">
        <div className="home-lockup">
          <img
            className="home-lockup__logo"
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
          />
          <div className="home-lockup__text">
            <p className="page-head__eyebrow">2026 season</p>
            <h1 className="page-head__title page-head__title--xl">
              Ipswich &amp; District Federation Bowls
            </h1>
          </div>
        </div>
      </header>

      <section className="home-section">
        <div className="home-section__head">
          <h2 className="home-section__title">Leagues</h2>
        </div>
        <LeaguePosterGrid items={leaguesNav} summaries={summaries} />
      </section>

      {/* Competitions and the jump-to-team square share one row, each
          under its own eyebrow label. */}
      <section className="home-section">
        <div className="poster-grid poster-grid--labeled">
          {competitions.length > 0 ? (
            <h2 className="home-section__title poster-grid__label poster-grid__label--competitions">
              Competitions
            </h2>
          ) : null}
          <h2 className="home-section__title poster-grid__label poster-grid__label--teams">
            Teams
          </h2>
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
          <JumpToTeam leagues={leaguesNav} />
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__head">
          <h2 className="home-section__title">This week</h2>
        </div>
        <DayCarousel items={leaguesNav} summaries={summaries} />
      </section>
    </div>
  )
}
