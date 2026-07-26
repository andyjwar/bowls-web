import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddInline } from './AddInline'
import { colorForLeague } from '../lib/leagueColors'
import {
  collectLeagueDates,
  formatPlayDaysFull,
  playDayLabels,
  shortLeagueName,
} from '../lib/leagueSchedule'
import { countOutstandingForLeague, countAwaitedCupTies } from '../lib/adminEntryData'

/** Cups take the palette slots after the leagues — same rule as the public pages. */
const COMPETITION_COLOR_OFFSET = 3

function TileArrow() {
  return (
    <svg
      className="poster__arrow"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 10h11M10.5 4.5L16 10l-5.5 5.5" />
    </svg>
  )
}

export function AdminHome({ admin }) {
  const leagues = (admin.leagues ?? []).filter(
    (l) => l.season == null || admin.activeSeason == null || l.season === admin.activeSeason,
  )
  const [docs, setDocs] = useState({})
  const [competitions, setCompetitions] = useState([])
  const navigate = useNavigate()

  const leagueKey = leagues.map((l) => l.id).join('|')

  useEffect(() => {
    if (!leagues.length) return
    let cancelled = false
    Promise.all(
      leagues.map((l) =>
        fetch(`${import.meta.env.BASE_URL}data/${encodeURIComponent(l.id)}.json`, {
          cache: 'no-store',
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((jsons) => {
      if (cancelled) return
      const next = {}
      leagues.forEach((l, i) => {
        if (jsons[i]) next[l.id] = jsons[i]
      })
      setDocs(next)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueKey])

  useEffect(() => {
    let cancelled = false
    admin
      .loadCompetitions()
      .then((d) => {
        if (!cancelled) setCompetitions(d.competitions ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="page page--admin-home">
      <header className="admin-home__head">
        <div>
          <p className="page-head__eyebrow">
            {admin.activeSeason ?? ''} season · Admin
          </p>
          <h1 className="admin-home__title">Enter scores</h1>
        </div>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={admin.logout}>
          Sign out
        </button>
      </header>

      <section className="home-section">
        <div className="poster-grid">
          {leagues.map((league, index) => {
            const doc = docs[league.id]
            const stats = doc ? countOutstandingForLeague(doc) : null
            const dates = doc ? collectLeagueDates(doc) : []
            const days = formatPlayDaysFull(playDayLabels(dates))
            return (
              <Link
                key={league.id}
                to={`/admin/league/${encodeURIComponent(league.id)}`}
                className="poster poster--admin"
                style={{ '--poster-color': colorForLeague(league.id, index).color }}
              >
                {stats ? (
                  stats.toEnter > 0 ? (
                    <span className="poster__todo">{stats.toEnter} to enter</span>
                  ) : (
                    <span className="poster__todo poster__todo--zero">All in ✓</span>
                  )
                ) : null}
                <span className="poster__name">{shortLeagueName(league.name)}</span>
                <span className="poster__sub">
                  {stats?.closestWeek != null ? `Week ${stats.closestWeek}` : '\u00a0'}
                </span>
                <span className="poster__days">{days || '\u00a0'}</span>
                <TileArrow />
              </Link>
            )
          })}
        </div>
      </section>

      <section className="home-section">
        <h2 className="home-section__title">Competitions &amp; more</h2>
        <div className="poster-grid">
          {competitions.map((comp, index) => {
            const awaited = countAwaitedCupTies(comp)
            return (
              <Link
                key={comp.id}
                to={`/admin/cup/${encodeURIComponent(comp.id)}`}
                className="poster poster--admin"
                style={{
                  '--poster-color': colorForLeague(comp.id, COMPETITION_COLOR_OFFSET + index)
                    .color,
                }}
              >
                {awaited > 0 ? (
                  <span className="poster__todo">
                    {awaited} tie{awaited !== 1 ? 's' : ''} awaited
                  </span>
                ) : (
                  <span className="poster__todo poster__todo--zero">All in ✓</span>
                )}
                <span className="poster__name">{comp.name}</span>
                <span className="poster__sub">{comp.sub || '\u00a0'}</span>
                <span className="poster__days">{comp.days || '\u00a0'}</span>
                <TileArrow />
              </Link>
            )
          })}

          <Link to="/admin/season" className="jump-tile jump-tile--link poster--admin">
            <span className="poster__name">Season &amp; leagues</span>
            <span className="poster__days">Teams · fixture dates · new seasons</span>
            <TileArrow />
          </Link>

        </div>

        <div className="add-day-row">
          <AddInline
            label="New competition"
            submitLabel="Create competition"
            hint="Adds a knockout cup to this season. You'll set up its draw next — entrants, rounds and dates."
            fields={[
              { name: 'name', label: 'Competition name', placeholder: 'e.g. Presidents Cup' },
              { name: 'days', label: 'Played on', placeholder: 'e.g. Fridays' },
            ]}
            onSubmit={async ({ name, days }) => {
              const out = await admin.createCompetition({ name, days })
              if (out?.competition?.id) {
                navigate(`/admin/cup/${encodeURIComponent(out.competition.id)}`)
              }
            }}
          />
        </div>
      </section>
    </div>
  )
}
