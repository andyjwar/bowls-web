import { Link } from 'react-router-dom'
import { RULE_3_POSTPONEMENT } from '../data/rulesContent'

export const FOUR_POINT_DEDUCTION_NOTE =
  '4 points deducted due to unscheduled postponement (Rule 3)'

export function StandingsDeductionNote({ className = '' }) {
  return (
    <p className={`standings-table__note ${className}`.trim()}>
      * 4 points deducted due to unscheduled postponement (
      <Link className="standings-table__note-link" to={RULE_3_POSTPONEMENT.path}>
        Rule 3
      </Link>
      )
    </p>
  )
}
