import { useEffect, useState, useMemo } from 'react'
import { buildDivisionFixtures } from '../lib/fixtures'
import { applyResultsToFixtures, computeStandingsFromResults } from '../lib/results'
import { dateForPlayDay } from '../lib/leagueSchedule'

/** Fallback before `/data/leagues-nav.json` loads (and if fetch fails). */
export const LEAGUES = [
  { id: 'samford-2026', label: 'Samford League 2026', season: 2026 },
  { id: 'two-wood-2026', label: 'Two Wood League 2026', season: 2026 },
  { id: 'triples-2026', label: 'Triples League 2026', season: 2026 },
]

function leagueDocumentPath(leagueId) {
  return `${import.meta.env.BASE_URL}data/${encodeURIComponent(leagueId)}.json`
}

/** Navigation pills / home cards — synced from admin saves via `public/data/leagues-nav.json`. */
export function useLeaguesNav() {
  const [items, setItems] = useState(LEAGUES)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/leagues-nav.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (
          cancelled ||
          !Array.isArray(json) ||
          json.length === 0 ||
          !json.every((x) => x && typeof x.id === 'string' && typeof x.label === 'string')
        ) {
          return
        }
        setItems(json)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { items, ready }
}

export function useBowlsLeague(leagueId) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    if (!leagueId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const path = leagueDocumentPath(leagueId)

    fetch(path)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load league data (${path})`)
        return r.json()
      })
      .then((json) => {
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [leagueId])

  return { data, error, loading }
}

/**
 * Resolve fixtures + standings for a Samford section/division or Two Wood division.
 */
export function useDivisionView(leagueData, sectionId, divisionId) {
  return useMemo(() => {
    if (!leagueData || !divisionId) {
      return { division: null, fixtures: [], standings: [], playableTeams: [] }
    }

    if (leagueData.sections) {
      const section = leagueData.sections.find((s) => s.id === sectionId)
      if (!section) return { division: null, fixtures: [], standings: [], playableTeams: [] }

      const division = section.divisions?.find((d) => d.id === divisionId)
      if (!division) return { division: null, fixtures: [], standings: [], playableTeams: [] }

      const bareFixtureWeeks = buildDivisionFixtures(section.scheduleTemplate, division.teams)
      const fixtures = applyResultsToFixtures(bareFixtureWeeks, division.results)
      const scheduledWeekKeys = new Set(bareFixtureWeeks.map((w) => String(w.week)))
      const standings = computeStandingsFromResults(
        division.teams,
        division.results?.weeks ?? {},
        scheduledWeekKeys,
        division.standingsSeed ?? null,
      )
      const playableTeams = division.teams.filter((t) => t !== 'Bye')

      return { division, section, fixtures, standings, playableTeams }
    }

    const division = leagueData.divisions?.find((d) => d.id === divisionId)
    if (!division) return { division: null, fixtures: [], standings: [], playableTeams: [] }

    const getDate = (row) => dateForPlayDay(row, division.playDay)

    const bareFixtureWeeks = buildDivisionFixtures(
      leagueData.scheduleTemplate,
      division.teams,
      getDate,
    )
    const fixtures = applyResultsToFixtures(bareFixtureWeeks, division.results)
    const scheduledWeekKeys = new Set(bareFixtureWeeks.map((w) => String(w.week)))
    const standings = computeStandingsFromResults(
      division.teams,
      division.results?.weeks ?? {},
      scheduledWeekKeys,
      division.standingsSeed ?? null,
    )
    const playableTeams = division.teams.filter((t) => t !== 'Bye')

    return { division, fixtures, standings, playableTeams }
  }, [leagueData, sectionId, divisionId])
}
