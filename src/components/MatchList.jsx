import { useId, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatFixtureDate } from '../lib/fixtures'
import { buildCsv, buildIcs, downloadFile, exportFileName } from '../lib/exportMatches'
import { directionsHref, useClubLocationIndex } from '../lib/clubLocations'

function shortDate(isoDate) {
  if (!isoDate) return 'TBC'
  return formatFixtureDate(isoDate).replace(/,?\s*\d{4}$/, '')
}

function isSameDay(isoDate, ref) {
  if (!isoDate) return false
  const d = new Date(`${isoDate}T12:00:00`)
  return (
    d.getUTCFullYear() === ref.getUTCFullYear() &&
    d.getUTCMonth() === ref.getUTCMonth() &&
    d.getUTCDate() === ref.getUTCDate()
  )
}

/* Team name as a link to the Matches view filtered to that team, same
   behaviour as the standings table. Inherits the row's weight/colour. */
function TeamLink({ name }) {
  return (
    <Link
      className="match-row__team-link"
      to={{ search: `?tab=matches&team=${encodeURIComponent(name)}` }}
    >
      {name}
    </Link>
  )
}

/* Result styling goes on an inner name span so win-pill padding cannot
   inflate the grid column's min-content and shove the score column around. */
function teamNameClass({ played, draw, won }) {
  if (!played) return 'match-row__name'
  if (won) return 'match-row__name match-row__team--win'
  if (!draw) return 'match-row__name match-row__team--lose'
  return 'match-row__name'
}

/* Whether the fixture already has an outcome (score or walkover) — decided
   rows are results, so they don't get a directions pin. */
function isDecided(match) {
  const played =
    match.played &&
    ((Number.isFinite(match.homePoints) && Number.isFinite(match.awayPoints)) ||
      (Number.isFinite(match.homeShots) && Number.isFinite(match.awayShots)))
  return played || match.walkover === 'home' || match.walkover === 'away'
}

/**
 * Directions link for an unplayed fixture: the home team's green, from the
 * club-locations data. Results, byes and unknown venues return null.
 */
function pinFor(match, locationIndex) {
  if (match.isBye || isDecided(match)) return null
  const club = locationIndex.get(match.home)
  const href = directionsHref(club)
  if (!href) return null
  return {
    href,
    title: `Directions to ${club.name}${club.postcode ? ` · ${club.postcode}` : ''}`,
  }
}

/* Slim pin button at the row edge (Option C). `pin` may be null when the
   week has pins but this row is a result/bye — an empty cell keeps the
   grid columns aligned across the tile. */
function PinCell({ pin }) {
  if (!pin) return <span className="match-row__mapbtn match-row__mapbtn--none" aria-hidden="true" />
  return (
    <a
      className="match-row__mapbtn"
      href={pin.href}
      target="_blank"
      rel="noreferrer"
      title={pin.title}
      aria-label={pin.title}
    >
      <svg width="12" height="15" viewBox="0 0 24 30" fill="none" aria-hidden="true">
        <path
          d="M12 0C5.4 0 0 5.2 0 11.7 0 20.4 12 30 12 30s12-9.6 12-18.3C24 5.2 18.6 0 12 0z"
          fill="currentColor"
        />
        <circle cx="12" cy="11.5" r="4.5" fill="var(--fm-card, #fff)" />
      </svg>
    </a>
  )
}

function MatchRow({
  match,
  weekDate,
  isToday,
  showDate = true,
  perspectiveTeam,
  linkTeams = true,
  pin = null,
  pinColumn = false,
}) {
  const single = Boolean(perspectiveTeam)
  const rowMods = `${isToday ? ' match-row--today' : ''}${
    showDate ? '' : ' match-row--nodate'
  }${single ? ' match-row--single' : ''}${pinColumn ? ' match-row--pins' : ''}`

  const dateCell = showDate ? (
    <span className="match-row__date">{shortDate(weekDate)}</span>
  ) : null

  /* Single-team view: Home/Away venue tag after the date, from the
     selected team's perspective. Byes keep an empty cell for alignment. */
  const venueCell = single ? (
    match.isBye ? (
      <span className="match-row__venue" aria-hidden="true" />
    ) : match.home === perspectiveTeam ? (
      <span className="match-row__venue match-row__venue--home">Home</span>
    ) : (
      <span className="match-row__venue match-row__venue--away">Away</span>
    )
  ) : null

  if (match.isBye) {
    return (
      <div className={`match-row match-row--bye${rowMods}`}>
        {dateCell}
        {venueCell}
        <span className="match-row__home">
          <span className="match-row__name">{match.home}</span>
        </span>
        <span className="match-row__mid match-row__mid--bye">Bye</span>
        <span className="match-row__away" />
        {pinColumn ? <PinCell pin={null} /> : null}
      </div>
    )
  }

  const hasPoints =
    Number.isFinite(match.homePoints) && Number.isFinite(match.awayPoints)
  const hasShots =
    Number.isFinite(match.homeShots) && Number.isFinite(match.awayShots)
  const homeBig = hasPoints ? match.homePoints : hasShots ? match.homeShots : null
  const awayBig = hasPoints ? match.awayPoints : hasShots ? match.awayShots : null
  const postponed = Boolean(match.postponed)
  const played = match.played && homeBig != null && awayBig != null
  /* Cup ties can be decided without a score (walkover) */
  const walkover = match.walkover === 'home' || match.walkover === 'away'
  const decided = played || walkover
  const draw = played && !match.homeWon && !match.awayWon
  const shotsTitle =
    hasPoints && hasShots ? `${match.homeShots}–${match.awayShots} shots` : undefined

  return (
    <div className={`match-row${postponed ? ' match-row--postponed' : ''}${rowMods}`}>
      {dateCell}
      {venueCell}
      <span className="match-row__home">
        <span
          className={teamNameClass({
            played: decided,
            draw,
            won: match.homeWon,
          })}
        >
          {linkTeams ? <TeamLink name={match.home} /> : match.home}
        </span>
      </span>
      {postponed ? (
        <span className="match-row__mid match-row__mid--postponed" title="Postponed">
          P-P
        </span>
      ) : played ? (
        <span
          className={`match-row__mid match-row__mid--score${draw ? ' match-row__mid--draw' : ''}`}
          title={shotsTitle}
        >
          {homeBig} – {awayBig}
        </span>
      ) : walkover ? (
        <span className="match-row__mid match-row__mid--score">w/o</span>
      ) : (
        <span className="match-row__mid match-row__mid--vs">v</span>
      )}
      <span className="match-row__away">
        <span
          className={teamNameClass({
            played: decided,
            draw,
            won: match.awayWon,
          })}
        >
          {linkTeams ? <TeamLink name={match.away} /> : match.away}
        </span>
      </span>
      {pinColumn ? <PinCell pin={pin} /> : null}
    </div>
  )
}

/**
 * The next upcoming game week as a single week tile, for the Table view.
 * "Next" = the first week (chronological order) whose date is today or in
 * the future; weeks without a date are skipped. Renders nothing once the
 * season's dates are all in the past.
 */
export function NextMatches({ fixtureWeeks }) {
  const today = useMemo(() => new Date(), [])
  const locationIndex = useClubLocationIndex()
  const nextWeek = useMemo(() => {
    const startOfToday = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    )
    return (
      (fixtureWeeks ?? []).find(
        (week) => week.date && new Date(`${week.date}T12:00:00`) >= startOfToday,
      ) ?? null
    )
  }, [fixtureWeeks, today])

  if (!nextWeek) return null

  const today_ = isSameDay(nextWeek.date, today)
  const pins = nextWeek.matches.map((match) => pinFor(match, locationIndex))
  const pinColumn = pins.some(Boolean)
  return (
    <section className={`match-week${today_ ? ' match-week--today' : ''}`}>
      <header className="match-week__head">
        <h3 className="match-week__title">Next matches</h3>
        <span className="match-week__date">
          {today_ ? 'Today' : shortDate(nextWeek.date)}
        </span>
      </header>
      {nextWeek.matches.map((match, i) => (
        <MatchRow
          key={`${nextWeek.week}-${i}`}
          match={match}
          weekDate={nextWeek.date}
          isToday={today_}
          showDate={false}
          pin={pins[i]}
          pinColumn={pinColumn}
        />
      ))}
    </section>
  )
}

/* Download (.ics / .csv) and print actions for the current fixture list,
   as quiet icon links on the toolbar row. Exports honour the active team
   filter because they read the same (already filtered) fixtureWeeks the
   list renders. */
function ToolbarActions({ fixtureWeeks, teamFilter, context }) {
  const exportContext = { ...context, teamFilter: teamFilter || undefined }

  const handleCalendar = () => {
    downloadFile(
      `${exportFileName(exportContext)}.ics`,
      buildIcs(fixtureWeeks, exportContext),
      'text/calendar;charset=utf-8',
    )
  }

  const handleCsv = () => {
    downloadFile(
      `${exportFileName(exportContext)}.csv`,
      buildCsv(fixtureWeeks, { teamFilter }),
      'text/csv;charset=utf-8',
    )
  }

  return (
    <div
      className="match-toolbar__actions"
      role="group"
      aria-label="Fixture list downloads"
    >
      <button
        type="button"
        className="match-toolbar__action"
        onClick={handleCalendar}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <rect x="1" y="2.5" width="12" height="10.5" />
          <path d="M1 6h12M4 1v3M10 1v3" />
        </svg>
        Calendar
      </button>
      <button
        type="button"
        className="match-toolbar__action"
        onClick={() => window.print()}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M3.5 5V1.5h7V5M3.5 10.5H1.5V5h11v5.5h-2" />
          <rect x="3.5" y="8.5" width="7" height="4.5" />
        </svg>
        Print
      </button>
      <button type="button" className="match-toolbar__action" onClick={handleCsv}>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <path d="M7 1v8M3.5 5.5L7 9l3.5-3.5M1.5 11.5v1.5h11v-1.5" />
        </svg>
        Download
      </button>
    </div>
  )
}

/**
 * Cup rounds in the league "Matches" format: one tile per round with the
 * round name and date in the head, line-item rows inside, and the same
 * calendar/print/download actions above. `weeks` uses the fixtureWeeks
 * shape with `label` (round name) and optional `venue`.
 */
export function CupMatches({ weeks, context }) {
  const today = useMemo(() => new Date(), [])

  if (!weeks || weeks.length === 0) return null

  return (
    <div className="fixtures">
      <div className="match-toolbar match-toolbar--end">
        <ToolbarActions fixtureWeeks={weeks} teamFilter="" context={context} />
      </div>

      <div className="match-weeks">
        {weeks.map((week) => {
          const today_ = isSameDay(week.date, today)
          const dateBits = [
            today_ ? 'Today' : week.date ? shortDate(week.date) : 'Date TBC',
            week.venue ?? null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <section
              key={week.week}
              className={`match-week${today_ ? ' match-week--today' : ''}`}
            >
              <header className="match-week__head">
                <h3 className="match-week__title">{week.label ?? `Week ${week.week}`}</h3>
                <span className="match-week__date">{dateBits}</span>
              </header>
              {week.matches.map((match, i) => (
                <MatchRow
                  key={`${week.week}-${i}`}
                  match={match}
                  weekDate={week.date}
                  isToday={today_}
                  showDate={false}
                  linkTeams={false}
                />
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/**
 * All of a division's matches as one chronological list of line items:
 * week 1 first, results at the top, upcoming fixtures below.
 */
export function MatchList({
  fixtureWeeks,
  teamFilter,
  onTeamFilterChange,
  teams,
  context,
  emptyMessage = 'No matches match this filter.',
}) {
  const teamSelectId = useId()
  const today = useMemo(() => new Date(), [])
  const locationIndex = useClubLocationIndex()

  /* Season record for the selected team, from its played (non-bye) matches:
     Played, shots For/Against, and league Points, matching the standings. */
  const record = useMemo(() => {
    if (!teamFilter) return null
    let played = 0
    let shotsFor = 0
    let shotsAgainst = 0
    let points = 0
    for (const week of fixtureWeeks) {
      for (const match of week.matches) {
        if (match.isBye || !match.played) continue
        played += 1
        const isHome = match.home === teamFilter
        const ownShots = isHome ? match.homeShots : match.awayShots
        const oppShots = isHome ? match.awayShots : match.homeShots
        const ownPoints = isHome ? match.homePoints : match.awayPoints
        if (Number.isFinite(ownShots)) shotsFor += ownShots
        if (Number.isFinite(oppShots)) shotsAgainst += oppShots
        if (Number.isFinite(ownPoints)) points += ownPoints
      }
    }
    return { played, shotsFor, shotsAgainst, points }
  }, [fixtureWeeks, teamFilter])

  return (
    <div className="fixtures">
      {/* One toolbar row: team filter left, quiet icon-link actions right.
          The label is visually hidden — the select's first option already
          reads "All teams". */}
      <div className="match-toolbar">
        <div>
          <label className="match-toolbar__label" htmlFor={teamSelectId}>
            Filter by team
          </label>
          <select
            id={teamSelectId}
            className="control__select"
            value={teamFilter}
            onChange={(e) => onTeamFilterChange(e.target.value)}
          >
            <option value="">All teams</option>
            {teams.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {fixtureWeeks.length > 0 ? (
          <ToolbarActions
            fixtureWeeks={fixtureWeeks}
            teamFilter={teamFilter}
            context={context}
          />
        ) : null}
      </div>

      {fixtureWeeks.length === 0 ? (
        <p className="page-state page-state--muted">{emptyMessage}</p>
      ) : teamFilter ? (
        /* One team: season record strip fused to a flat chronological list. */
        <div className="team-matches">
          <div
            className="team-record"
            role="group"
            aria-label={`${teamFilter} season record`}
          >
            <div className="team-record__stat">
              <span className="team-record__num">{record.played}</span>
              <span className="team-record__label">Played</span>
            </div>
            <div className="team-record__stat">
              <span className="team-record__num">{record.shotsFor}</span>
              <span className="team-record__label">For</span>
            </div>
            <div className="team-record__stat">
              <span className="team-record__num">{record.shotsAgainst}</span>
              <span className="team-record__label">Against</span>
            </div>
            <div className="team-record__stat">
              <span className="team-record__num team-record__num--points">
                {record.points}
              </span>
              <span className="team-record__label">Points</span>
            </div>
          </div>
          {(() => {
            const pinColumn = fixtureWeeks.some((week) =>
              week.matches.some((match) => pinFor(match, locationIndex)),
            )
            return (
              <div className={`match-list${pinColumn ? ' match-list--pins' : ''}`}>
                <div className="match-list__head">
                  <span className="match-list__head-spacer" aria-hidden="true" />
                  <span className="match-list__head-label">Venue</span>
                </div>
                {fixtureWeeks.map((week) =>
                  week.matches.map((match, i) => (
                    <MatchRow
                      key={`${week.week}-${i}`}
                      match={match}
                      weekDate={week.date}
                      isToday={isSameDay(week.date, today)}
                      perspectiveTeam={teamFilter}
                      pin={pinFor(match, locationIndex)}
                      pinColumn={pinColumn}
                    />
                  )),
                )}
              </div>
            )
          })()}
        </div>
      ) : (
        /* All teams: one tile per week. */
        <div className="match-weeks">
          {fixtureWeeks.map((week) => {
            const today_ = isSameDay(week.date, today)
            const pins = week.matches.map((match) => pinFor(match, locationIndex))
            const pinColumn = pins.some(Boolean)
            return (
              <section
                key={week.week}
                className={`match-week${today_ ? ' match-week--today' : ''}`}
              >
                <header className="match-week__head">
                  <h3 className="match-week__title">Week {week.week}</h3>
                  <span className="match-week__date">
                    {today_ ? 'Today' : shortDate(week.date)}
                  </span>
                </header>
                {week.matches.map((match, i) => (
                  <MatchRow
                    key={`${week.week}-${i}`}
                    match={match}
                    weekDate={week.date}
                    isToday={today_}
                    showDate={false}
                    pin={pins[i]}
                    pinColumn={pinColumn}
                  />
                ))}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
