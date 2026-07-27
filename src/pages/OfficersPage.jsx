import { useState } from 'react'
import { colorForLeague } from '../lib/leagueColors'

/* One accent per section: navy for league officers, green for fixtures &
   results, oxblood for competitions (palette slots 1, 0, 2). */
const NAVY = colorForLeague('general', 1)
const GREEN = colorForLeague('fixtures', 0)
const OXBLOOD = colorForLeague('competitions', 2)

const GENERAL = [
  {
    role: 'Chairman',
    name: 'Barrie Cracknell',
    phones: ['07811 933087'],
    emails: ['cracknell9286@gmail.com'],
  },
  {
    role: 'Secretary',
    name: 'Helen Swift',
    address: '86 Benton Street, Hadleigh, Suffolk IP7 5AT',
    phones: ['01473 822109'],
    emails: ['terryswift@btinternet.com'],
  },
  {
    role: 'Treasurer',
    name: 'George Wiseman',
    address: '16 Winding Piece, Capel St Mary, IP9 2UZ',
    phones: ['01473 310498'],
    emails: ['casarina05@gmail.com'],
  },
]

const LEAGUE_SECRETARIES = [
  {
    role: 'Samford',
    name: 'Christopher Rozier',
    address: '46 Valley View Drive, Rushmere St Andrew, Ipswich, IP4 5UW',
    phones: ['07525 162315'],
    emails: ['chris.d.rozier@sky.com'],
  },
  {
    role: 'Two Wood',
    name: 'Ed Dale',
    address: '7 Glebe End, Capel St Mary, IP9 2XR',
    phones: ['01473 311650', '07716 494678'],
    emails: ['edward.dale@outlook.com'],
  },
  {
    role: 'Triples',
    name: 'Linda Bestow',
    address: '“Heatherstone”, Gaston Street, East Bergholt, Colchester, CO7 6SF',
    phones: ['01206 298302', '07530 467769'],
    emails: ['linda.bestow@gmail.com'],
  },
]

const COMPETITIONS = [
  {
    role: 'Competitions Secretary',
    name: 'David Sarjeant',
    address: '11 The Street, Rushmere St Andrew, Ipswich, IP5 1DE',
    phones: ['01473 879402', '07538 024001'],
    emails: ['david.sarjeant1251@gmail.com'],
  },
  {
    role: 'Team Comps',
    name: 'Barrie Cracknell',
    phones: ['07811 933087'],
    emails: ['barrie.cracknell@sky.com'],
  },
  {
    role: 'Committee',
    name: 'Joyce Fisher',
    phones: ['01473 626075', '07786 165352'],
    emails: ['joyce.fisher@talktalk.net'],
  },
]

function PhoneIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 2h3l1 3.5-2 1a9 9 0 004.5 4.5l1-2L14 10v3a1 1 0 01-1 1A11 11 0 012 3a1 1 0 011-1z" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.5" y="3" width="12" height="9" />
      <path d="M1.5 4l6 4.5L13.5 4" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7.5 13.5S12 9.5 12 6.25A4.4 4.4 0 007.5 1.9 4.4 4.4 0 003 6.25c0 3.25 4.5 7.25 4.5 7.25z" />
      <circle cx="7.5" cy="6.1" r="1.6" />
    </svg>
  )
}

function OfficerCard({ role, name, address, phones = [], emails = [], palette }) {
  const [open, setOpen] = useState(null)

  const toggle = (panel) => setOpen((current) => (current === panel ? null : panel))

  const chip = (panel, Icon, label) => (
    <button
      type="button"
      className={`officer-card__chip${open === panel ? ' officer-card__chip--open' : ''}`}
      aria-expanded={open === panel}
      onClick={() => toggle(panel)}
    >
      <Icon />
      {label}
    </button>
  )

  return (
    <div
      className="officer-card"
      style={{
        '--officer-accent': palette.color,
        '--officer-soft': palette.soft,
        '--officer-foreground': palette.foreground,
      }}
    >
      <span className="officer-card__role">{role}</span>
      <span className="officer-card__name">{name}</span>
      <span className="officer-card__chips">
        {phones.length > 0 ? chip('phone', PhoneIcon, 'Phone') : null}
        {emails.length > 0 ? chip('email', MailIcon, 'Email') : null}
        {address ? chip('address', PinIcon, 'Address') : null}
      </span>
      {open === 'phone' ? (
        <div className="officer-card__detail">
          {phones.map((phone) => (
            <a
              key={phone}
              className="officer-card__link"
              href={`tel:${phone.replace(/\s+/g, '')}`}
            >
              {phone}
            </a>
          ))}
        </div>
      ) : null}
      {open === 'email' ? (
        <div className="officer-card__detail">
          {emails.map((email) => (
            <a key={email} className="officer-card__link" href={`mailto:${email}`}>
              {email}
            </a>
          ))}
        </div>
      ) : null}
      {open === 'address' ? (
        <div className="officer-card__detail">
          <p className="officer-card__addr">{address}</p>
        </div>
      ) : null}
    </div>
  )
}

export function OfficersPage() {
  return (
    <div className="page page--officers">
      <header className="page-head page-head--hub">
        <h1 className="page-head__title page-head__title--xl">League Officers</h1>
        <p className="page-head__lead">
          Who to contact for the league, fixtures and results, and competitions.
        </p>
      </header>

      <section className="officers-section">
        <h2 className="section-label">League officers</h2>
        <div className="officer-cards">
          {GENERAL.map((o) => (
            <OfficerCard key={o.role} {...o} palette={NAVY} />
          ))}
        </div>
      </section>

      <section className="officers-section">
        <h2 className="section-label">Fixtures &amp; results secretaries</h2>
        <div className="officer-cards">
          {LEAGUE_SECRETARIES.map((o) => (
            <OfficerCard key={o.role} {...o} palette={GREEN} />
          ))}
        </div>
      </section>

      <section className="officers-section">
        <h2 className="section-label">Competitions</h2>
        <div className="officer-cards">
          {COMPETITIONS.map((o) => (
            <OfficerCard key={o.role} {...o} palette={OXBLOOD} />
          ))}
        </div>
      </section>
    </div>
  )
}
