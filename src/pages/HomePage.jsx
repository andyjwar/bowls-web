import { useLeaguesNav } from '../hooks/useBowlsLeague'
import { useLeagueHubSummaries } from '../hooks/useLeagueHubSummaries'
import { useCompetitions } from '../hooks/useCompetitions'
import { LeaguePosterGrid, PosterTile } from '../components/LeaguePosterGrid'
import { DayCarousel } from '../components/DayCarousel'
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
        <p className="page-head__eyebrow">2026 season</p>
        <h1 className="page-head__title page-head__title--xxl">
          Ipswich &amp; District Federation Bowls
        </h1>
      </header>

      <section className="home-section">
        <div className="home-section__head">
          <h2 className="home-section__title">Leagues</h2>
        </div>
        <LeaguePosterGrid items={leaguesNav} summaries={summaries} />
      </section>

      {competitions.length > 0 ? (
        <section className="home-section">
          <div className="home-section__head">
            <h2 className="home-section__title">Competitions</h2>
          </div>
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
        </section>
      ) : null}

      <section className="home-section">
        <div className="home-section__head">
          <h2 className="home-section__title">This week</h2>
        </div>
        <DayCarousel items={leaguesNav} summaries={summaries} />
      </section>
    </div>
  )
}
