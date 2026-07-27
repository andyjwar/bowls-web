import { Link } from 'react-router-dom'
import { useLeaguesNav } from '../hooks/useBowlsLeague'
import { useSiteConfig, splitLeaguesBySeason } from '../hooks/useSiteConfig'
import { useLeagueHubSummaries } from '../hooks/useLeagueHubSummaries'
import { useCompetitions } from '../hooks/useCompetitions'
import { LeaguePosterGrid, PosterTile } from '../components/LeaguePosterGrid'
import { DayCarousel } from '../components/DayCarousel'
import { JumpToTeam } from '../components/JumpToTeam'
import { colorForLeague } from '../lib/leagueColors'
import { shortLeagueName } from '../lib/leagueSchedule'

/** Cups take the palette slots after the leagues so colours never clash. */
const COMPETITION_COLOR_OFFSET = 3

/** Compact links to earlier seasons' league pages, shown under the current season. */
export function PastSeasonsStrip({ past }) {
  if (!past?.length) return null
  return (
    <section className="home-section past-seasons">
      <h2 className="home-section__title">Past seasons</h2>
      {past.map((grp) => (
        <p key={grp.season} className="past-seasons__row">
          <span className="past-seasons__year">{grp.season}</span>
          {grp.items.map((l) => (
            <Link
              key={l.id}
              className="past-seasons__link"
              to={`/leagues/${encodeURIComponent(l.id)}`}
            >
              {shortLeagueName(l.label) || l.label}
            </Link>
          ))}
        </p>
      ))}
    </section>
  )
}

export function HomePage() {
  const { items: leaguesNav } = useLeaguesNav()
  const { activeSeason } = useSiteConfig()
  const { active: activeLeagues, past } = splitLeaguesBySeason(leaguesNav, activeSeason)
  const { summaries } = useLeagueHubSummaries(activeLeagues)
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
            <p className="page-head__eyebrow">{activeSeason} season</p>
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
        <LeaguePosterGrid items={activeLeagues} summaries={summaries} />
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
          {competitions.map((comp, index) => {
            const palette = colorForLeague(comp.id, COMPETITION_COLOR_OFFSET + index)
            return (
              <PosterTile
                key={comp.id}
                to={`/competitions/${encodeURIComponent(comp.id)}`}
                color={palette.color}
                foreground={palette.foreground}
                name={comp.name}
                days={comp.days}
                sub={comp.sub}
              />
            )
          })}
          <JumpToTeam leagues={activeLeagues} />
        </div>
      </section>

      <section className="home-section">
        <div className="home-section__head">
          <h2 className="home-section__title">This week</h2>
        </div>
        <DayCarousel items={activeLeagues} summaries={summaries} />
      </section>

      <PastSeasonsStrip past={past} />
    </div>
  )
}
