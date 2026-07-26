import { useEffect, useState } from 'react'

/** Fetch knockout competitions (cups) from /data/competitions-2026.json. */
export function useCompetitions() {
  const [competitions, setCompetitions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/competitions-2026.json`)
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
  }, [])

  return { competitions, loading }
}
