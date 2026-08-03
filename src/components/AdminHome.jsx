import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
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
        <h2 className="home-section__title">League results</h2>
        <div className="poster-grid">
          {leagues.map((league, index) => {
            const doc = docs[league.id]
            const stats = doc ? countOutstandingForLeague(doc) : null
            const dates = doc ? collectLeagueDates(doc) : []
            const days = formatPlayDaysFull(playDayLabels(dates))
            const palette = colorForLeague(league.id, index)
            return (
              <Link
                key={league.id}
                to={`/admin/league/${encodeURIComponent(league.id)}`}
                className="poster poster--admin"
                style={{
                  '--poster-color': palette.color,
                  '--poster-foreground': palette.foreground,
                }}
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
        <h2 className="home-section__title">Cup results</h2>
        <div className="poster-grid">
          {competitions.map((comp, index) => {
            const awaited = countAwaitedCupTies(comp)
            const palette = colorForLeague(comp.id, COMPETITION_COLOR_OFFSET + index)
            return (
              <Link
                key={comp.id}
                to={`/admin/cup/${encodeURIComponent(comp.id)}`}
                className="poster poster--admin"
                style={{
                  '--poster-color': palette.color,
                  '--poster-foreground': palette.foreground,
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

        </div>
      </section>

      <section className="home-section">
        <h2 className="home-section__title">Manage season</h2>
        <div className="poster-grid">
          <Link
            to="/admin/season?mode=edit"
            className="jump-tile jump-tile--link poster--admin admin-manage-tile"
          >
            <span className="poster__name">Edit current season</span>
            <span className="poster__sub">{admin.activeSeason}</span>
            <span className="poster__days">Leagues · teams · fixture dates · cups</span>
            <TileArrow />
          </Link>
          <Link
            to="/admin/season?mode=create"
            className="jump-tile jump-tile--link poster--admin admin-manage-tile admin-manage-tile--create"
          >
            <span className="poster__name">Create new season</span>
            <span className="poster__sub">Guided setup</span>
            <span className="poster__days">Copy · review · publish</span>
            <TileArrow />
          </Link>
          <Link
            to="/admin/gallery"
            className="jump-tile jump-tile--link poster--admin admin-manage-tile"
          >
            <span className="poster__name">Photo gallery</span>
            <span className="poster__sub">Public website</span>
            <span className="poster__days">Upload · captions · reorder</span>
            <TileArrow />
          </Link>
        </div>
      </section>
    </div>
  )
}
