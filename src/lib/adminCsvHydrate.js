import { formatFixtureDate } from './fixtures'

/**
 * Rebuild admin fixture-entry rows after a CSV save when `entries` was missing from the HTTP body.
 *
 * @param {(args: object) => Promise<object>} loadWeekResults
 * @param {Array<{ leagueId: string, sectionId?: string|null, divisionId: string, week: number }>} batches
 */
export async function rebuildCsvFixtureEntriesFromSavedWeeks(loadWeekResults, batches) {
  /** @type {object[]} */
  const out = []
  let synth = 0
  for (const b of batches ?? []) {
    if (!b?.leagueId || !b?.divisionId || b.week == null) continue
    const data = await loadWeekResults({
      leagueId: b.leagueId,
      sectionId: b.sectionId ?? undefined,
      divisionId: b.divisionId,
      week: Number(b.week),
    })
    for (const r of data.matches ?? []) {
      synth += 1
      const isoRaw = String(r.matchDate ?? '').trim()
      const hp = Number(r.homePoints)
      const ap = Number(r.awayPoints)
      const hs = Number(r.homeShots)
      const asVal = Number(r.awayShots)
      out.push({
        leagueId: b.leagueId,
        sectionId: b.sectionId ?? null,
        divisionId: b.divisionId,
        week: Number(b.week),
        csvRow: 100000 + synth,
        scheduleHome: r.home,
        scheduleAway: r.away,
        homeShots: Number.isFinite(hs) ? hs : 0,
        awayShots: Number.isFinite(asVal) ? asVal : 0,
        homePoints: Number.isFinite(hp) ? hp : undefined,
        awayPoints: Number.isFinite(ap) ? ap : undefined,
        matchDateIso: isoRaw || null,
        displayMatchDate: isoRaw ? formatFixtureDate(isoRaw) || isoRaw : '',
        homePlayersPreview: String(r.homePlayersText ?? ''),
        awayPlayersPreview: String(r.awayPlayersText ?? ''),
      })
    }
  }
  return out
}
