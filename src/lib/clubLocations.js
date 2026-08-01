import { useEffect, useState } from 'react'

/**
 * Shared access to public/data/club-locations.json (also used by the
 * Locations page): one cached fetch per session, plus a team-name → club
 * index so fixture rows can link "directions to the home green".
 */

let cache = null
let pending = null

export function fetchClubLocations() {
  if (cache) return Promise.resolve(cache)
  if (pending) return pending
  pending = fetch(`${import.meta.env.BASE_URL}data/club-locations.json`, {
    cache: 'no-store',
  })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json()
    })
    .then((json) => {
      cache = json.clubs ?? []
      return cache
    })
    .finally(() => {
      pending = null
    })
  return pending
}

/** Google Maps link — exact coordinates when the club itself was pinned. */
export function directionsHref(club) {
  if (!club) return null
  if (club.pinned === 'club' && club.lat != null) {
    return `https://www.google.com/maps/search/?api=1&query=${club.lat},${club.lon}`
  }
  if (club.postcode) {
    return `https://www.google.co.uk/maps/place/${encodeURIComponent(club.postcode)}`
  }
  return null
}

function buildTeamIndex(clubs) {
  const byTeam = new Map()
  for (const club of clubs) {
    for (const teams of Object.values(club.leagues ?? {})) {
      for (const team of teams) byTeam.set(team, club)
    }
  }
  return byTeam
}

/**
 * Team-name → club map for fixture lists. Returns an empty Map until the
 * data arrives (rows simply render without pins), and stays empty if the
 * fetch fails — locations are an enhancement, never a blocker.
 */
export function useClubLocationIndex() {
  const [byTeam, setByTeam] = useState(() => new Map())

  useEffect(() => {
    let cancelled = false
    fetchClubLocations()
      .then((clubs) => {
        if (!cancelled) setByTeam(buildTeamIndex(clubs))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return byTeam
}
