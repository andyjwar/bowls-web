import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { shortLeagueName } from '../lib/leagueSchedule'

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/**
 * Division picker groups for the first dropdown, one optgroup per
 * league + play day: "Samford Monday" → Division A–E, "Samford Wednesday",
 * "Two Wood Tuesday" / "Two Wood Thursday", "Triples".
 */
function buildGroups(docs, leagues) {
  const groups = []
  for (const league of leagues) {
    const data = docs[league.id]
    if (!data) continue
    const name = shortLeagueName(league.label)

    if (data.sections) {
      for (const section of data.sections) {
        const day = (section.label ?? '').split(/\s+/)[0]
        groups.push({
          label: day ? `${name} ${day}` : name,
          options: (section.divisions ?? []).map((d) => ({
            value: `${league.id}::${section.id}::${d.id}`,
            label: d.label,
            teams: d.teams ?? [],
          })),
        })
      }
      continue
    }

    // Flat league — group by playDay when divisions carry one (Two Wood),
    // otherwise a single group for the whole league (Triples).
    const byDay = new Map()
    for (const d of data.divisions ?? []) {
      const key = d.playDay ?? ''
      if (!byDay.has(key)) byDay.set(key, [])
      byDay.get(key).push(d)
    }
    for (const [day, divisions] of byDay) {
      groups.push({
        label: day ? `${name} ${capitalize(day)}` : name,
        options: divisions.map((d) => ({
          value: `${league.id}::::${d.id}`,
          label: d.label,
          teams: d.teams ?? [],
        })),
      })
    }
  }
  return groups
}

/**
 * The sixth home square (Option B, v20 mockup): charcoal poster-family tile.
 * Pick a division (grouped by league + day), then a team, and jump straight
 * to that team's filtered Matches list.
 */
export function JumpToTeam({ leagues }) {
  const navigate = useNavigate()
  const [docs, setDocs] = useState({})
  const [divisionKey, setDivisionKey] = useState('')
  const [team, setTeam] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all(
      leagues.map((l) =>
        fetch(`${import.meta.env.BASE_URL}data/${encodeURIComponent(l.id)}.json`, {
          cache: 'no-store',
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ),
    ).then((jsons) => {
      if (cancelled) return
      const next = {}
      leagues.forEach((l, i) => {
        if (jsons[i]) next[l.id] = jsons[i]
      })
      setDocs(next)
    })
    return () => {
      cancelled = true
    }
  }, [leagues])

  const groups = useMemo(() => buildGroups(docs, leagues), [docs, leagues])

  const division = useMemo(() => {
    for (const g of groups) {
      const hit = g.options.find((o) => o.value === divisionKey)
      if (hit) return hit
    }
    return null
  }, [groups, divisionKey])

  const teams = useMemo(
    () =>
      (division?.teams ?? [])
        .filter((t) => t !== 'Bye')
        .sort((a, b) => a.localeCompare(b)),
    [division],
  )

  const go = () => {
    if (!divisionKey || !team) return
    const [leagueId, sectionId, divisionId] = divisionKey.split('::')
    const path = sectionId
      ? `/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(sectionId)}/${encodeURIComponent(divisionId)}`
      : `/leagues/${encodeURIComponent(leagueId)}/${encodeURIComponent(divisionId)}`
    navigate(`${path}?tab=matches&team=${encodeURIComponent(team)}`)
  }

  return (
    <div className="jump-tile">
      <div>
        <h3 className="jump-tile__title">Jump to team</h3>
        <div className="jump-tile__fields">
          <select
            className="jump-tile__select"
            aria-label="League and division"
            value={divisionKey}
            onChange={(e) => {
              setDivisionKey(e.target.value)
              setTeam('')
            }}
          >
            <option value="">Choose league&hellip;</option>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            className="jump-tile__select"
            aria-label="Team"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            disabled={teams.length === 0}
          >
            <option value="">Choose team&hellip;</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="button" className="jump-tile__foot" onClick={go} disabled={!team}>
        <span>Straight to their matches</span>
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 10h11M10.5 4.5L16 10l-5.5 5.5" />
        </svg>
      </button>
    </div>
  )
}
