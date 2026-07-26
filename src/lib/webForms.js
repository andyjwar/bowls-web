/**
 * Online (fillable) form definitions. One entry per form; the generic
 * WebFormPage renders whichever one the route asks for, and POSTs the
 * values to /api/forms/<id> on the admin server.
 *
 * `enabled: false` hides the form's card on the Forms page (the direct
 * URL still works, which makes testing easy). Flip to true to launch.
 */
export const WEB_FORMS = [
  {
    id: 'player-transfer',
    enabled: false,
    title: 'Player transfer',
    note: 'Move a registered player to another club. Effective 14 days after application.',
    lead: 'Ask to move a registered player to another club. Fields marked * are required.',
    submitLabel: 'Send transfer request',
    doneTitle: 'Your transfer request has been sent.',
    doneNote:
      'The management committee will review it. Transfers take effect 14 days after the date of application, and no transfers are allowed after 30th June.',
    fields: [
      { key: 'playerName', label: 'Player’s name', type: 'text', required: true, autoComplete: 'name' },
      { key: 'fromClub', label: 'Moving from (current club)', type: 'text', required: true },
      { key: 'toClub', label: 'Moving to (new club)', type: 'text', required: true },
      {
        key: 'contact',
        label: 'Your phone number or email',
        type: 'text',
        required: true,
        placeholder: 'So we can confirm the transfer with you',
      },
      { key: 'notes', label: 'Anything else we should know?', type: 'textarea' },
    ],
  },
  {
    id: 'weekly-results',
    enabled: false,
    title: 'Weekly results',
    note: 'Send in a league match result instead of posting the card.',
    lead: 'Send in the result of a league match. Fields marked * are required.',
    submitLabel: 'Send result',
    doneTitle: 'Your result has been sent.',
    doneNote:
      'The fixtures & results secretary will check it and add it to the tables. If anything looks wrong they will contact you.',
    fields: [
      {
        key: 'league',
        label: 'League',
        type: 'select',
        required: true,
        options: [
          'Samford — Monday Evening',
          'Samford — Wednesday Afternoon',
          'Two Wood',
          'Triples',
        ],
      },
      { key: 'division', label: 'Division', type: 'text', required: true, placeholder: 'e.g. Division B' },
      { key: 'matchDate', label: 'Date of the match', type: 'date', required: true },
      { key: 'homeTeam', label: 'Home team', type: 'text', required: true },
      { key: 'awayTeam', label: 'Away team', type: 'text', required: true },
      {
        key: 'rinkScores',
        label: 'Rink scores',
        type: 'textarea',
        required: true,
        placeholder: 'One rink per line, e.g. 21 – 14',
      },
      { key: 'homeTotal', label: 'Home total', type: 'text', required: true },
      { key: 'awayTotal', label: 'Away total', type: 'text', required: true },
      { key: 'submittedBy', label: 'Your name', type: 'text', required: true, autoComplete: 'name' },
      { key: 'contact', label: 'Your phone number or email', type: 'text', required: true },
    ],
  },
  {
    id: 'cup-results',
    enabled: false,
    title: 'Cup results',
    note: 'Send in a Knockout Cup or Millennium Cup result.',
    lead: 'Send in the result of a cup tie. Fields marked * are required.',
    submitLabel: 'Send result',
    doneTitle: 'Your cup result has been sent.',
    doneNote:
      'The competitions secretary will check it and update the draw. If anything looks wrong they will contact you.',
    fields: [
      {
        key: 'cup',
        label: 'Competition',
        type: 'select',
        required: true,
        options: ['Samford Knockout Cup', 'Millennium Cup'],
      },
      { key: 'round', label: 'Round and tie', type: 'text', required: true, placeholder: 'e.g. Round 2, Tie 3' },
      { key: 'matchDate', label: 'Date of the match', type: 'date', required: true },
      { key: 'homeTeam', label: 'Home team', type: 'text', required: true },
      { key: 'awayTeam', label: 'Away team', type: 'text', required: true },
      { key: 'homeScore', label: 'Home score', type: 'text', required: true },
      { key: 'awayScore', label: 'Away score', type: 'text', required: true },
      { key: 'submittedBy', label: 'Your name', type: 'text', required: true, autoComplete: 'name' },
      { key: 'contact', label: 'Your phone number or email', type: 'text', required: true },
    ],
  },
  {
    id: 'competitions-entry',
    enabled: false,
    title: 'Competitions entry',
    note: 'Enter the Samford competitions online.',
    lead: 'Enter the Samford competitions. Fields marked * are required.',
    submitLabel: 'Send entry',
    doneTitle: 'Your entry has been sent.',
    doneNote:
      'The competitions secretary will confirm your entry and be in touch about dates and fees.',
    fields: [
      { key: 'entrantName', label: 'Your name', type: 'text', required: true, autoComplete: 'name' },
      { key: 'club', label: 'Your club', type: 'text', required: true },
      { key: 'contact', label: 'Your phone number or email', type: 'text', required: true },
      {
        key: 'competitions',
        label: 'Which competitions are you entering?',
        type: 'textarea',
        required: true,
        placeholder: 'List each competition, and partner names for pairs events',
      },
      { key: 'notes', label: 'Anything else we should know?', type: 'textarea' },
    ],
  },
  {
    id: 'player-registration',
    enabled: false,
    title: 'Player registration',
    note: 'Register your club’s players for the season.',
    lead: 'Register your club’s players. Fields marked * are required.',
    submitLabel: 'Send registration',
    doneTitle: 'Your registration has been sent.',
    doneNote:
      'The fixtures & results secretary will countersign the list and return it to your club secretary. Remember lists are due by 31st March.',
    fields: [
      {
        key: 'league',
        label: 'League',
        type: 'select',
        required: true,
        options: ['Samford', 'Two Wood', 'Triples'],
      },
      { key: 'team', label: 'Club / team name', type: 'text', required: true },
      {
        key: 'players',
        label: 'Players',
        type: 'textarea',
        required: true,
        placeholder: 'One player per line',
        rows: 10,
      },
      { key: 'secretaryName', label: 'Club secretary’s name', type: 'text', required: true, autoComplete: 'name' },
      { key: 'contact', label: 'Secretary’s phone number or email', type: 'text', required: true },
    ],
  },
  {
    id: 'league-application',
    enabled: false,
    title: 'League application',
    note: 'Apply for a team to join the league.',
    lead: 'Apply for a team to join the league. Fields marked * are required.',
    submitLabel: 'Send application',
    doneTitle: 'Your application has been sent.',
    doneNote:
      'The management committee will consider your application. New clubs join in the bottom division.',
    fields: [
      { key: 'clubName', label: 'Club name', type: 'text', required: true },
      {
        key: 'section',
        label: 'Which league or section are you applying to?',
        type: 'text',
        required: true,
        placeholder: 'e.g. Two Wood, Samford Monday Evening',
      },
      { key: 'contactName', label: 'Contact name', type: 'text', required: true, autoComplete: 'name' },
      { key: 'contact', label: 'Phone number or email', type: 'text', required: true },
      { key: 'notes', label: 'Anything else we should know?', type: 'textarea' },
    ],
  },
]

export function getWebForm(id) {
  return WEB_FORMS.find((f) => f.id === id) ?? null
}
