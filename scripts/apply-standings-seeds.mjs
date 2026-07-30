// Retired. Standings seeds were a stand-in until week-by-week results existed.
// Samford, Two Wood, and Triples are all computed from match results now.
// Re-adding a seed would silently ignore admin-entered weeks up to throughWeek.
//
// To check for leftover seeds: `node scripts/audit-standings-seeds.mjs`

console.log('No standings seeds to apply. All active leagues use match results.')
