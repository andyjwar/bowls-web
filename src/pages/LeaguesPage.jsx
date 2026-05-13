import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { FixturesList } from '../components/FixturesList'
import { StandingsTable } from '../components/StandingsTable'
import { UpcomingFixtures } from '../components/UpcomingFixtures'
import { filterFixturesByTeam } from '../lib/fixtures'
import { LEAGUES, useBowlsLeague, useDivisionView } from '../hooks/useBowlsLeague'

function PillNav({ items, activeId, buildHref, ariaLabel }) {
  return (
    <nav className="pill-nav" aria-label={ariaLabel}>
      <div className="pill-nav__scroll">
        {items.map((item) => {
          const active = activeId != null && item.id === activeId
          return (
            <Link
              key={item.id}
              to={buildHref(item.id)}
              className={`pill-nav__btn${active ? ' pill-nav__btn--active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function resolveSelection(data, leagueId, sectionOrDivisionId, sectionId, divisionId) {
  if (!data || !leagueId) {
    return {
      sectionId: null,
      divisionId: null,
      isComplete: false,
      invalid: false,
    }
  }

  if (data.sections) {
    if (sectionId && divisionId) {
      const section = data.sections.find((s) => s.id === sectionId)
      const division = section?.divisions.find((d) => d.id === divisionId)
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

export function LeaguesPage() {
  const { leagueId, sectionOrDivisionId, sectionId, divisionId } = useParams()
  const { data, error, loading } = useBowlsLeague(leagueId)
  const [teamFilter, setTeamFilter] = useState('')

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

  const filteredFixtures = useMemo(
    () => filterFixturesByTeam(fixtures, teamFilter),
    [fixtures, teamFilter],
  )

  useEffect(() => {
    setTeamFilter('')
  }, [leagueId, selection.sectionId, selection.divisionId])

  if (leagueId && !LEAGUES.some((l) => l.id === leagueId)) {
    return <Navigate to="/leagues" replace />
  }

  if (!loading && selection.invalid) {
    return <Navigate to={leagueId ? `/leagues/${leagueId}` : '/leagues'} replace />
  }

  const sectionItems =
    data?.sections?.map((s) => ({ id: s.id, label: s.label })) ?? []

  const divisionItems = data?.sections
    ? (data.sections.find((s) => s.id === selection.sectionId)?.divisions ?? []).map(
        (d) => ({ id: d.id, label: d.label }),
      )
    : (data?.divisions ?? []).map((d) => ({
        id: d.id,
        label: d.label,
      }))

  const showSections = Boolean(leagueId && data?.sections)
  const showDivisions = Boolean(
    leagueId &&
      data &&
      (data.sections ? selection.sectionId : true),
  )

  return (
    <div className="page page--leagues">
      <section className="tile tile--compact">
        <h1 className="page-title page-title--sm">Leagues</h1>
        <PillNav
          items={LEAGUES}
          activeId={leagueId ?? null}
          ariaLabel="League"
          buildHref={(id) => `/leagues/${id}`}
        />
        {showSections ? (
          <PillNav
            items={sectionItems}
            activeId={selection.sectionId}
            ariaLabel="Section"
            buildHref={(id) => `/leagues/${leagueId}/${id}`}
          />
        ) : null}
        {showDivisions && divisionItems.length > 0 ? (
          <PillNav
            items={divisionItems}
            activeId={selection.isComplete ? selection.divisionId : null}
            ariaLabel="Division"
            buildHref={(id) =>
              data?.sections
                ? `/leagues/${leagueId}/${selection.sectionId}/${id}`
                : `/leagues/${leagueId}/${id}`
            }
          />
        ) : null}
      </section>

      {loading ? (
        <section className="tile">
          <p className="page-lead">Loading league data…</p>
        </section>
      ) : null}

      {error ? (
        <section className="tile tile--error">
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error && selection.isComplete && division ? (
        <>
          <div className="league-split">
            <section className="tile league-split__upcoming">
              <UpcomingFixtures fixtureWeeks={fixtures} />
            </section>
            <section className="tile league-split__table">
              <StandingsTable rows={standings} divisionLabel={division.label} />
            </section>
          </div>
          <section className="tile league-fixtures-full">
            <h2 className="tile-title">Fixtures</h2>
            <FixturesList
              fixtureWeeks={filteredFixtures}
              teamFilter={teamFilter}
              onTeamFilterChange={setTeamFilter}
              teams={playableTeams}
            />
          </section>
        </>
      ) : null}

      {!loading && !error && leagueId && !selection.isComplete ? (
        <section className="tile">
          <p className="page-lead leagues-hint">
            {data?.sections && !selection.sectionId
              ? 'Choose a section above to see divisions.'
              : data?.sections && selection.sectionId
                ? 'Choose a division above to view fixtures and the league table.'
                : 'Choose a division above to view fixtures and the league table.'}
          </p>
        </section>
      ) : null}
    </div>
  )
}
