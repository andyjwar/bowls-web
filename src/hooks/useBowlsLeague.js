import { useEffect, useState, useMemo } from 'react'
import { buildDivisionFixtures } from '../lib/fixtures'
import { applyResultsToFixtures, computeStandingsFromResults } from '../lib/results'

const LEAGUE_FILES = {
  'samford-2026': '/data/samford-2026.json',
  'two-wood-2026': '/data/two-wood-2026.json',
  'triples-2026': '/data/triples-2026.json',
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

    const path = LEAGUE_FILES[leagueId]
    if (!path) {
      setData(null)
      setError('Unknown league')
      setLoading(false)
      return
    }

    fetch(path)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${path}`)
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

      const division = section.divisions.find((d) => d.id === divisionId)
      if (!division) return { division: null, fixtures: [], standings: [], playableTeams: [] }

      const fixtures = applyResultsToFixtures(
        buildDivisionFixtures(section.scheduleTemplate, division.teams),
        division.results,
      )
      const standings = division.results?.weeks
        ? computeStandingsFromResults(division.teams, division.results.weeks)
        : computeStandingsFromResults(division.teams, {})
      const playableTeams = division.teams.filter((t) => t !== 'Bye')

      return { division, section, fixtures, standings, playableTeams }
    }

    const division = leagueData.divisions?.find((d) => d.id === divisionId)
    if (!division) return { division: null, fixtures: [], standings: [], playableTeams: [] }

    const getDate = (row) => {
      if (division.playDay === 'thursday') return row.thursdayDate
      if (division.playDay === 'tuesday') return row.tuesdayDate
      return row.date
    }

    const fixtures = applyResultsToFixtures(
      buildDivisionFixtures(
        leagueData.scheduleTemplate,
        division.teams,
        getDate,
      ),
      division.results,
    )
    const standings = division.results?.weeks
      ? computeStandingsFromResults(division.teams, division.results.weeks)
      : computeStandingsFromResults(division.teams, {})
    const playableTeams = division.teams.filter((t) => t !== 'Bye')

    return { division, fixtures, standings, playableTeams }
  }, [leagueData, sectionId, divisionId])
}

export const LEAGUES = [
  { id: 'samford-2026', label: 'Samford League 2026' },
  { id: 'two-wood-2026', label: 'Two Wood League 2026' },
  { id: 'triples-2026', label: 'Triples League 2026' },
]
