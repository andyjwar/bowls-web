import { Link } from 'react-router-dom'
import { LEAGUES } from '../hooks/useBowlsLeague'

export function HomePage() {
  return (
    <div className="page page--home">
      <section className="tile tile--hero">
        <h1 className="page-title">Welcome</h1>
        <p className="page-lead">
          Fixtures, league tables, and club information for the Ipswich &amp; District
          Federation Bowls League 2026 season.
        </p>
      </section>

      <section className="tile">
        <h2 className="tile-title">Leagues</h2>
        <div className="home-league-cards">
          {LEAGUES.map((league) => (
            <Link
              key={league.id}
              to={`/leagues/${league.id}`}
              className="home-league-card"
            >
              <span className="home-league-card__label">{league.label}</span>
              <span className="home-league-card__cta">View fixtures &amp; table →</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
