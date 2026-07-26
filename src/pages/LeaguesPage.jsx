import { useMemo } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { MatchList, NextMatches } from '../components/MatchList'
import { LeaguesHub } from '../components/LeaguesHub'
import { StandingsTable } from '../components/StandingsTable'
import { filterFixturesByTeam } from '../lib/fixtures'
import { useBowlsLeague, useDivisionView, useLeaguesNav } from '../hooks/useBowlsLeague'
import { colorForLeague } from '../lib/leagueColors'
import { shortLeagueName } from '../lib/leagueSchedule'

const VALID_TABS = new Set(['table', 'matches'])

function normalizeTab(raw) {
  const t = (raw ?? 'table').toLowerCase()
  return VALID_TABS.has(t) ? t : 'table'
}

function resolveSelection(data, leagueId, sectionOrDivisionId, sectionId, divisionId) {
  if (!data || !leagueId) {
    return { sectionId: null, divisionId: null, isComplete: false, invalid: false }
  }
  if (data.sections) {
    if (sectionId && divisionId) {
      const section = data.sections.find((s) => s.id === sectionId)
      const division = section?.divisions?.find((d) => d.id === divisionId)
      return {
        sectionId,
        divisionId,
        isComplete: Boolean(division),
        invalid: !section || !division,
      }
    }
    if (sectionOrDivisionId && !sectionId) {
      const section = data.sections.find((s) => s.id === sectionOrDivisionId)
      return {
        sectionId: section ? sectionOrDivisionId : null,
        divisionId: null,
        isComplete: false,
        invalid: Boolean(sectionOrDivisionId && !section),
      }
    }
    return { sectionId: null, divisionId: null, isComplete: false, invalid: false }
  }
  const divId = divisionId || sectionOrDivisionId
  if (divId) {
    const division = data.divisions?.find((d) => d.id === divId)
    return {
      sectionId: null,
      divisionId: divId,
      isComplete: Boolean(division),
      invalid: !division,
    }
  }
  return { sectionId: null, divisionId: null, isComplete: false, invalid: false }
}

/** "Division A" → "A"; anything else is shown as-is. */
function divisionShortLabel(label) {
  const m = /^division\s+(.+)$/i.exec(label ?? '')
  return m ? m[1].trim() : label
}

const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

/**
 * Flat leagues whose divisions carry a playDay (e.g. Two Wood: A–D Tuesday,
 * E–G Thursday) get grouped into banner tabs per day, mirroring how
 * sectioned leagues (Samford) split Monday/Wednesday.
 */
function buildDayGroups(divisions) {
  if (!divisions || divisions.length === 0) return null
  if (divisions.some((d) => !d.playDay)) return null
  const byDay = new Map()
  for (const d of divisions) {
    if (!byDay.has(d.playDay)) byDay.set(d.playDay, [])
    byDay.get(d.playDay).push({ id: d.id, label: d.label })
  }
  if (byDay.size < 2) return null
  return [...byDay.entries()]
    .sort((a, b) => DAY_ORDER.indexOf(a[0]) - DAY_ORDER.indexOf(b[0]))
    .map(([day, divs]) => ({
      id: day,
      label: day.charAt(0).toUpperCase() + day.slice(1),
      divisions: divs,
    }))
}

function BannerTabs({ items, activeId }) {
  if (!items || items.length === 0) return null
  return (
    <nav className="league-banner__tabs" aria-label="Section">
      {items.map((it) => {
        const active = it.id === activeId
        return (
          <Link
            key={it.id}
            to={it.href}
            className={`league-banner__tab${active ? ' league-banner__tab--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}

function DivisionLetters({ items, activeId, buildHref }) {
  if (items.length === 0) return null
  return (
    <nav className="div-letters" aria-label="Division">
      {items.map((it) => {
        const active = it.id === activeId
        return (
          <Link
            key={it.id}
            to={buildHref(it.id)}
            className={`div-letters__item${active ? ' div-letters__item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
            title={it.label}
          >
            {divisionShortLabel(it.label)}
          </Link>
        )
      })}
    </nav>
  )
}

function ViewTabs({ tab, pathname }) {
  const items = [
    { id: 'table', label: 'Table' },
    { id: 'matches', label: 'Matches' },
  ]
  return (
    <nav className="view-tabs" aria-label="Competition views">
      {items.map((it) => {
        const active = it.id === tab
        return (
          <Link
            key={it.id}
            to={`${pathname}?tab=${it.id}`}
            className={`view-tabs__item${active ? ' view-tabs__item--active' : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}

export function LeaguesPage() {
  const { leagueId, sectionOrDivisionId, sectionId, divisionId } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = normalizeTab(searchParams.get('tab'))

  const { items: leaguesNav, ready: leaguesNavReady } = useLeaguesNav()
  const { data, error, loading } = useBowlsLeague(leagueId)
  const teamFilter = searchParams.get('team') ?? ''

  const handleTeamFilterChange = (value) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'matches')
    if (value) {
      next.set('team', value)
    } else {
      next.delete('team')
    }
    setSearchParams(next, { replace: true })
  }

  const selection = resolveSelection(
    data,
    leagueId,
    sectionOrDivisionId,
    sectionId,
    divisionId,
  )

  const { division, fixtures, standings, playableTeams } = useDivisionView(
    data,
    selection.sectionId,
    selection.isComplete ? selection.divisionId : null,
  )

  /** One chronological list: week 1 first, so results lead into fixtures. */
  const filteredMatches = useMemo(
    () => filterFixturesByTeam(fixtures, teamFilter),
    [fixtures, teamFilter],
  )

  if (leaguesNavReady && leagueId && !leaguesNav.some((l) => l.id === leagueId)) {
    return <Navigate to="/leagues" replace />
  }

  if (!loading && selection.invalid) {
    return (
      <Navigate
        to={leagueId ? `/leagues/${encodeURIComponent(leagueId)}` : '/leagues'}
        replace
      />
    )
  }

  if (!leagueId) {
    return <LeaguesHub items={leaguesNav} ready={leaguesNavReady} />
  }

  const structured = Boolean(data?.sections)
  const navIndex = leaguesNav.findIndex((l) => l.id === leagueId)
  const palette = colorForLeague(leagueId, navIndex >= 0 ? navIndex : undefined)
  const sectionItems =
    data?.sections?.map((s) => ({ id: s.id, label: s.label })) ?? []

  /* Flat leagues with play-day divisions get Tuesday/Thursday-style tabs. */
  const dayGroups = structured ? null : buildDayGroups(data?.divisions)
  const activeDayGroup = dayGroups
    ? (dayGroups.find((g) =>
        g.divisions.some((d) => d.id === selection.divisionId),
      ) ?? dayGroups[0])
    : null

  const divisionItems = structured
    ? selection.sectionId
      ? (data.sections.find((s) => s.id === selection.sectionId)?.divisions ?? []).map(
          (d) => ({ id: d.id, label: d.label }),
        )
      : []
    : activeDayGroup
      ? activeDayGroup.divisions
      : (data?.divisions ?? []).map((d) => ({ id: d.id, label: d.label }))

  const bannerTabs = structured
    ? sectionItems.map((s) => ({
        id: s.id,
        label: s.label,
        href: `/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(s.id)}`,
      }))
    : (dayGroups ?? []).map((g) => ({
        id: g.id,
        label: g.label,
        href: `/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(g.divisions[0].id)}`,
      }))
  const activeBannerTab = structured ? selection.sectionId : activeDayGroup?.id

  /* Land on content: default to the first section / division instead of a
     "choose one" prompt. */
  if (!loading && !error && data && !selection.isComplete && !selection.invalid) {
    if (structured && !selection.sectionId && sectionItems.length > 0) {
      return (
        <Navigate
          to={`/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(sectionItems[0].id)}`}
          replace
        />
      )
    }
    if (divisionItems.length > 0) {
      const base = structured
        ? `/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(selection.sectionId)}`
        : `/leagues/${encodeURIComponent(leagueId)}`
      return <Navigate to={`${base}/${encodeURIComponent(divisionItems[0].id)}`} replace />
    }
  }

  return (
    <div
      className="page page--leagues"
      style={{
        '--league-color': palette.color,
        '--league-color-soft': palette.soft,
      }}
    >
      <header
        className={`league-banner${bannerTabs.length > 0 ? ' league-banner--tabbed' : ''}`}
      >
        <Link to="/leagues" className="league-banner__back">
          ← All leagues
        </Link>
        <h1 className="league-banner__title">
          {shortLeagueName(data?.name) || leagueId.replace(/-/g, ' ')}
        </h1>
        <BannerTabs items={bannerTabs} activeId={activeBannerTab} />
      </header>

      {loading ? (
        <p className="page-state">Loading…</p>
      ) : error ? (
        <p className="page-state page-state--error">{error}</p>
      ) : null}

      {!loading && !error && data ? (
        <>
          {selection.isComplete && division ? (
            <>
              <div className="league-toolbar">
                <DivisionLetters
                  items={divisionItems}
                  activeId={selection.divisionId}
                  buildHref={(id) =>
                    structured
                      ? `/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(selection.sectionId)}/${encodeURIComponent(id)}`
                      : `/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(id)}`
                  }
                />
                {divisionItems.length > 0 ? (
                  <div className="league-toolbar__divider" aria-hidden="true" />
                ) : null}
                <ViewTabs tab={tab} pathname={location.pathname} />
              </div>

              <div className="tab-panel">
                {tab === 'table' ? (
                  <>
                    <StandingsTable rows={standings} />
                    <div className="table-next">
                      <NextMatches fixtureWeeks={fixtures} />
                    </div>
                  </>
                ) : null}
                {tab === 'matches' ? (
                  <MatchList
                    fixtureWeeks={filteredMatches}
                    teamFilter={teamFilter}
                    onTeamFilterChange={handleTeamFilterChange}
                    teams={playableTeams}
                    context={{
                      leagueName: shortLeagueName(data?.name),
                      sectionLabel: structured
                        ? data.sections.find((s) => s.id === selection.sectionId)
                            ?.label
                        : undefined,
                      divisionLabel: division.label,
                    }}
                    emptyMessage="No matches scheduled."
                  />
                ) : null}
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
