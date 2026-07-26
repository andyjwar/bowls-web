import { useLeagueHubSummaries } from '../hooks/useLeagueHubSummaries'
import { LeaguePosterGrid } from './LeaguePosterGrid'

export function LeaguesHub({ items, ready }) {
  const { summaries } = useLeagueHubSummaries(items)

  return (
    <div className="page page--leagues page--leagues-hub">
      <header className="page-head page-head--hub">
        <h1 className="page-head__title page-head__title--xl">Leagues</h1>
        <p className="page-head__lead">
          Pick a competition to see fixtures, results, and the points table.
        </p>
      </header>

      {!ready ? (
        <p className="page-state">Loading leagues…</p>
      ) : (
        <LeaguePosterGrid items={items} summaries={summaries} />
      )}
    </div>
  )
}
