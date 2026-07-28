import { useEffect, useState } from 'react'
import { collectLeagueDates, playDayLabels, countDivisions } from '../lib/leagueSchedule'

/**
 * Fetch league JSON for hub tiles and the day carousel: division counts,
 * play-day labels, and every scheduled ISO date. Best-effort; ignores failures.
 * @param {{ id: string }[]} items leagues-nav entries (id required)
 */
export function useLeagueHubSummaries(items) {
  const [summaries, setSummaries] = useState({})
  const [loading, setLoading] = useState(true)

  const key = items.map((x) => x.id).join('|')

  useEffect(() => {
    const leagueIds = items.map((x) => x.id)
    if (!leagueIds.length) {
      setSummaries({})
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    Promise.all(
      leagueIds.map((id) =>
        fetch(`${import.meta.env.BASE_URL}data/${encodeURIComponent(id)}.json`, {
          cache: 'no-store',
        }).then((r) => (r.ok ? r.json() : null)),
      ),
    )
      .then((jsons) => {
        if (cancelled) return
        const next = {}
        leagueIds.forEach((id, i) => {
          const d = jsons[i]
          if (!d) return
          const divisions = countDivisions(d)
          const dates = collectLeagueDates(d)
          next[id] = {
            divisions,
            playDays: playDayLabels(dates),
            dates,
          }
        })
        setSummaries(next)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setSummaries({})
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [key])

  return { summaries, loading }
}
