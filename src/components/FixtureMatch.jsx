import { formatMatchScore } from '../lib/results'

export function FixtureMatch({ match, variant = 'row' }) {
  const className = `fixture-match fixture-match--${variant}${match.isBye ? ' fixture-match--bye' : ''}${match.played ? ' fixture-match--played' : ''}`
  const score = formatMatchScore(match)

  if (match.isBye) {
    return (
      <div className={className}>
        <span className="fixture-match__team fixture-match__team--hi">{match.home}</span>
        <span className="fixture-match__vs">Bye</span>
      </div>
    )
  }

  return (
    <div className={className}>
      <span
        className={`fixture-match__team${match.played && match.homeWon ? ' fixture-match__team--win' : ''}${match.played && match.drawn ? ' fixture-match__team--draw' : ''}`}
      >
        {match.home}
      </span>
      <span className="fixture-match__vs">
        {score ? <span className="fixture-match__scoreline">{score}</span> : 'v'}
      </span>
      <span
        className={`fixture-match__team${match.played && match.awayWon ? ' fixture-match__team--win' : ''}${match.played && match.drawn ? ' fixture-match__team--draw' : ''}`}
      >
        {match.away}
      </span>
    </div>
  )
}
