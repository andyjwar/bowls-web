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

const EXPLORE_BLOCKS = [
  {
    to: '/locations',
    label: 'Locations',
    sub: 'Clubs & maps',
    tint: 'green',
  },
  {
    to: '/officers',
    label: 'League officers',
    sub: 'Contacts & roles',
    tint: 'navy',
  },
  {
    to: '/forms',
    label: 'Forms',
    sub: 'Downloads & entry',
    tint: 'sand',
  },
]

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

      {/* Desktop hub — leagues / cups / jump-to-team. Hidden on narrow screens
          where bottom tabs cover Leagues & Cups. */}
      <section className="home-section home-hub--desktop">
        <div className="home-section__head">
          <h2 className="home-section__title">Leagues</h2>
        </div>
        <LeaguePosterGrid items={activeLeagues} summaries={summaries} />
      </section>

      <section className="home-section home-hub--desktop">
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

      {/* Mobile explore — soft tint blocks for destinations not on the tab bar. */}
      <section className="home-section home-explore" aria-label="Explore">
        <div className="home-section__head">
          <h2 className="home-section__title">Explore</h2>
        </div>
        <div className="home-explore__grid">
          {EXPLORE_BLOCKS.map((block) => (
            <Link
              key={block.to}
              to={block.to}
              className={`home-explore__block home-explore__block--${block.tint}`}
            >
              <span className="home-explore__label">{block.label}</span>
              <span className="home-explore__sub">{block.sub}</span>
            </Link>
          ))}
        </div>
      </section>

      <PastSeasonsStrip past={past} />
    </div>
  )
}
