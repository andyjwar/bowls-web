import { useEffect, useState } from 'react'

const DEFAULT_CONFIG = { activeSeason: 2026 }

/** `/data/site-config.json` — active season and other tiny site-wide settings. */
export function useSiteConfig() {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${import.meta.env.BASE_URL}data/site-config.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json || typeof json !== 'object') return
        setConfig({ ...DEFAULT_CONFIG, ...json })
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { ...config, ready }
}

/**
 * Split nav league items into the active season's list and past seasons
 * (newest first). Items without a season tag count as active.
 */
export function splitLeaguesBySeason(items, activeSeason) {
  const active = []
  const pastBySeason = new Map()
  for (const item of items ?? []) {
    const season = Number(item.season)
    if (!Number.isInteger(season) || season === Number(activeSeason)) {
      active.push(item)
    } else {
      if (!pastBySeason.has(season)) pastBySeason.set(season, [])
      pastBySeason.get(season).push(item)
    }
  }
  const past = [...pastBySeason.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([season, list]) => ({ season, items: list }))
  return { active, past }
}
