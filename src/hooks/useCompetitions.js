import { useEffect, useState } from 'react'
import { useSiteConfig } from './useSiteConfig'

/** Fetch the active season's knockout competitions (`/data/competitions-<season>.json`). */
export function useCompetitions() {
  const { activeSeason, ready } = useSiteConfig()
  const [competitions, setCompetitions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!ready) return
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/competitions-${activeSeason}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return
        setCompetitions(Array.isArray(json?.competitions) ? json.competitions : [])
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setCompetitions([])
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [ready, activeSeason])

  return { competitions, loading }
}
