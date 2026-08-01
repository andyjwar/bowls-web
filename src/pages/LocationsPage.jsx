import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { colorForLeague } from '../lib/leagueColors'
import { directionsHref, fetchClubLocations } from '../lib/clubLocations'

const LEAGUES = [
  { key: 'samford', label: 'Samford' },
  { key: 'triples', label: 'Triples' },
  { key: 'two-wood', label: 'Two Wood' },
]

const TILE_ZOOM = 16
const TILE_SIZE = 256

/** Web-mercator fractional tile coordinates. */
function tileCoords(lat, lon, zoom) {
  const n = 2 ** zoom
  const rad = (lat * Math.PI) / 180
  return {
    x: ((lon + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  }
}

/**
 * Map thumbnail centred on the green — a 3×3 block of CARTO Voyager raster
 * tiles (OpenStreetMap data, Google-Maps-like light style, keyless) behind a
 * pin. Tiles are lazy-loaded so off-screen cards cost nothing.
 */
function MapThumb({ lat, lon, name }) {
  const { x, y } = tileCoords(lat, lon, TILE_ZOOM)
  const tx = Math.floor(x)
  const ty = Math.floor(y)
  const tiles = []
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      tiles.push({
        key: `${i}:${j}`,
        src: `https://basemaps.cartocdn.com/rastertiles/voyager/${TILE_ZOOM}/${tx + i}/${ty + j}@2x.png`,
        left: (tx + i - x) * TILE_SIZE,
        top: (ty + j - y) * TILE_SIZE,
      })
    }
  }
  return (
    <div className="location-card__map" aria-hidden="true">
      <div className="location-card__map-anchor">
        {tiles.map((t) => (
          <img
            key={t.key}
            src={t.src}
            alt=""
            loading="lazy"
            draggable="false"
            width={TILE_SIZE}
            height={TILE_SIZE}
            style={{ left: t.left, top: t.top }}
          />
        ))}
      </div>
      <span className="location-card__pin" title={name}>
        <svg viewBox="0 0 24 30" fill="none" aria-hidden="true">
          <path
            d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 30 12 30s12-9.6 12-18.3C24 5.2 18.6 0 12 0z"
            fill="var(--fm-pitch)"
          />
          <circle cx="12" cy="11.5" r="4.5" fill="#fff" />
        </svg>
      </span>
    </div>
  )
}

function LeaguePill({ leagueKey, label }) {
  const c = colorForLeague(leagueKey)
  return (
    <span
      className="location-card__league-pill"
      style={{ background: c.color, color: c.foreground }}
    >
      {label}
    </span>
  )
}

/**
 * One location card. In the default All view the per-league team lists
 * collapse to a compact pill+count summary that expands on tap; an active
 * league filter or search shows the relevant full team names directly.
 */
function LocationCard({ club, leagueFilter, detailed }) {
  const [open, setOpen] = useState(false)
  const href = directionsHref(club)
  const clubLeagues = LEAGUES.filter((l) => club.leagues[l.key]?.length)
  const leaguesShown = clubLeagues.filter(
    (l) => leagueFilter === 'all' || leagueFilter === l.key,
  )
  const showTeams = detailed || open

  return (
    <article className="location-card">
      {club.lat != null ? (
        <MapThumb lat={club.lat} lon={club.lon} name={club.name} />
      ) : (
        <div className="location-card__map location-card__map--tbc">
          <span>Location to be confirmed</span>
        </div>
      )}
      <div className="location-card__body">
        <h2 className="location-card__club">
          {club.name}
          {club.aka ? <span className="location-card__aka"> ({club.aka})</span> : null}
        </h2>
        <div className="location-card__meta">
          <span className="location-card__pc">{club.postcode ?? 'Postcode TBC'}</span>
          {href ? (
            <a className="location-card__directions" href={href} target="_blank" rel="noreferrer">
              Directions →
            </a>
          ) : null}
        </div>
        {!detailed ? (
          <button
            type="button"
            className="location-card__summary"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {clubLeagues.map((l) => {
              const c = colorForLeague(l.key)
              return (
                <span
                  key={l.key}
                  className="location-card__league-pill"
                  style={{ background: c.color, color: c.foreground }}
                >
                  {l.label} <b>{club.leagues[l.key].length}</b>
                </span>
              )
            })}
            <svg
              className={`location-card__chevron${open ? ' location-card__chevron--open' : ''}`}
              width="11"
              height="11"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M2.5 4.25L6 7.75l3.5-3.5" />
            </svg>
          </button>
        ) : null}
        {showTeams ? (
          <ul className="location-card__teams">
            {leaguesShown.map((l) => (
              <li key={l.key} className="location-card__league-row">
                <LeaguePill leagueKey={l.key} label={l.label} />
                <span className="location-card__team-names">
                  {club.leagues[l.key].join(' · ')}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {club.sharesGreenWith?.length ? (
          <p className="location-card__shared">
            Shares this green with {club.sharesGreenWith.join(', ')}
          </p>
        ) : null}
      </div>
    </article>
  )
}

function matchesSearch(club, needle) {
  if (!needle) return true
  const q = needle.toLowerCase()
  if (club.name.toLowerCase().includes(q)) return true
  if (club.aka && club.aka.toLowerCase().includes(q)) return true
  if (club.postcode && club.postcode.toLowerCase().includes(q)) return true
  return Object.values(club.leagues).some((teams) =>
    teams.some((t) => t.toLowerCase().includes(q)),
  )
}

export function LocationsPage() {
  const [clubs, setClubs] = useState(null)
  const [error, setError] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')

  const leagueParam = searchParams.get('league') ?? 'all'
  const leagueFilter = LEAGUES.some((l) => l.key === leagueParam) ? leagueParam : 'all'
  const setLeagueFilter = (key) =>
    setSearchParams(key === 'all' ? {} : { league: key }, { replace: true })

  useEffect(() => {
    let cancelled = false
    fetchClubLocations()
      .then((list) => {
        if (!cancelled) setClubs(list)
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load club locations')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const out = { all: clubs?.length ?? 0 }
    for (const l of LEAGUES) {
      out[l.key] = (clubs ?? []).filter((c) => c.leagues[l.key]?.length).length
    }
    return out
  }, [clubs])

  const visible = useMemo(() => {
    if (!clubs) return []
    return clubs.filter((c) => {
      if (leagueFilter !== 'all' && !c.leagues[leagueFilter]?.length) return false
      return matchesSearch(c, search.trim())
    })
  }, [clubs, leagueFilter, search])

  return (
    <div className="page page--locations">
      <header className="page-head page-head--hub">
        <h1 className="page-head__title page-head__title--xl">Club locations</h1>
        <p className="page-head__lead">
          Every green in the league — find where a team plays and get directions.
        </p>
      </header>

      <div className="locations-filters">
        <label className="locations-search">
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <circle cx="5.5" cy="5.5" r="4" />
            <path d="M8.5 8.5L12 12" />
          </svg>
          <input
            type="search"
            value={search}
            placeholder="Search clubs, teams or postcodes…"
            aria-label="Search clubs, teams or postcodes"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={`locations-chip${leagueFilter === 'all' ? ' locations-chip--on' : ''}`}
          onClick={() => setLeagueFilter('all')}
        >
          All <span className="locations-chip__n">{counts.all}</span>
        </button>
        {LEAGUES.map((l) => {
          const active = leagueFilter === l.key
          const c = colorForLeague(l.key)
          return (
            <button
              key={l.key}
              type="button"
              className={`locations-chip${active ? ' locations-chip--on' : ''}`}
              style={active ? { background: c.color, borderColor: c.color, color: c.foreground } : undefined}
              onClick={() => setLeagueFilter(active ? 'all' : l.key)}
            >
              {l.label} <span className="locations-chip__n">{counts[l.key]}</span>
            </button>
          )
        })}
      </div>

      {error ? <p className="locations-status">Could not load club locations ({error}).</p> : null}
      {clubs && visible.length === 0 ? (
        <p className="locations-status">No clubs match — try a different search.</p>
      ) : null}

      <div className="locations-grid">
        {visible.map((club) => (
          <LocationCard
            key={club.id}
            club={club}
            leagueFilter={leagueFilter}
            detailed={leagueFilter !== 'all' || search.trim().length > 0}
          />
        ))}
      </div>

      <p className="locations-attribution">
        Map data ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap
        </a>{' '}
        contributors · Tiles ©{' '}
        <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">
          CARTO
        </a>
      </p>
    </div>
  )
}
