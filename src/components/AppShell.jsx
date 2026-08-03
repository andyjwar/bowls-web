import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../hooks/useTheme'
import { useSiteConfig } from '../hooks/useSiteConfig'

/* Desktop grouped sidebar — Home first, then the pages under section headings. */
const SIDE_GROUPS = [
  {
    heading: null,
    items: [{ to: '/', label: 'Home', match: (p) => p === '/' }],
  },
  {
    heading: 'Play',
    items: [
      { to: '/leagues', label: 'Leagues', match: (p) => p.startsWith('/leagues') },
      {
        to: '/competitions',
        label: 'Competitions',
        match: (p) => p.startsWith('/competitions'),
      },
    ],
  },
  {
    heading: 'Club',
    items: [
      { to: '/officers', label: 'League Officers', match: (p) => p.startsWith('/officers') },
      { to: '/locations', label: 'Club Locations', match: (p) => p.startsWith('/locations') },
      { to: '/gallery', label: 'Gallery', match: (p) => p.startsWith('/gallery') },
    ],
  },
  {
    heading: 'Info',
    items: [
      { to: '/rules', label: 'Rules', match: (p) => p.startsWith('/rules') },
      { to: '/forms', label: 'Forms', match: (p) => p.startsWith('/forms') },
    ],
  },
]

const TABS = [
  { to: '/', label: 'Home', match: (p) => p === '/', icon: HomeIcon },
  { to: '/leagues', label: 'Leagues', match: (p) => p.startsWith('/leagues'), icon: LeaguesIcon },
  {
    to: '/competitions',
    label: 'Cups',
    match: (p) => p.startsWith('/competitions'),
    icon: CupsIcon,
  },
  {
    to: '/gallery',
    label: 'Gallery',
    match: (p) => p.startsWith('/gallery'),
    icon: GalleryIcon,
  },
  { to: '/rules', label: 'Rules', match: (p) => p.startsWith('/rules'), icon: RulesIcon },
]

function HomeIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function LeaguesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M5 12h14M5 17h10"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CupsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5 14.6 9l5.9.5-4.5 3.8 1.4 5.7L12 16.2 6.6 19l1.4-5.7L3.5 9.5 9.4 9 12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function GalleryIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="4"
        y="5"
        width="16"
        height="14"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="9" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="m5 17 4.5-4 3.5 3 2.5-2.5L19 17"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RulesIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 4.5h8.5L19 8v11.5a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M15 4.5V9h4.5M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  )
}

export function AppShell() {
  const { pathname } = useLocation()
  const [theme, setTheme] = useTheme()
  const { activeSeason } = useSiteConfig()
  const isHome = pathname === '/'
  const isAdmin = pathname.startsWith('/admin')

  return (
    <div className="bowls-app" data-theme={theme}>
      {/* Desktop: fixed grouped sidebar on the left (hidden ≤900px, where the
          compact header bar + bottom tabs take over). On the home page the
          hero already carries the full club name, so the sidebar shows just
          the crest + season there. */}
      <nav className="site-side" aria-label="Primary">
        <NavLink to="/" className="site-side__brand" aria-label="Home">
          <img
            className="site-side__crest"
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
          />
          <span className="site-side__brandtext">
            {!isHome ? (
              <span className="site-side__name">
                Ipswich &amp; District Federation Bowls
              </span>
            ) : null}
            <span className={`site-side__season${isHome ? ' site-side__season--solo' : ''}`}>
              {activeSeason} season
            </span>
          </span>
        </NavLink>
        {SIDE_GROUPS.map(({ heading, items }) => (
          <div key={heading ?? 'top'} className="site-side__section">
            {heading ? <span className="site-side__heading">{heading}</span> : null}
            {items.map(({ to, label, match }) => {
              const active = match(pathname)
              return (
                <NavLink
                  key={label}
                  to={to}
                  className={`site-side__link${active ? ' site-side__link--active' : ''}`}
                >
                  {label}
                </NavLink>
              )
            })}
          </div>
        ))}
        <span className="site-side__spacer" />
        <div className="site-side__foot">
          <ThemeToggle value={theme} onChange={setTheme} />
        </div>
      </nav>

      <header className="site-header">
        <div className="site-header__inner">
          <NavLink to="/" className="site-brand site-brand--bar" aria-label="Home">
            <img
              className="site-brand__logo"
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt=""
            />
            <span className="site-brand__season">{activeSeason} season</span>
          </NavLink>

          <div className="site-header__actions">
            <ThemeToggle value={theme} onChange={setTheme} />
          </div>
        </div>
      </header>

      <main className={`site-main${isAdmin ? '' : ' site-main--with-tabs'}`}>
        <Outlet />
      </main>

      {!isAdmin ? (
        <nav className="site-tabs" aria-label="Primary">
          {TABS.map(({ to, label, match, icon: Icon }) => {
            const active = match(pathname)
            return (
              <NavLink
                key={label}
                to={to}
                className={`site-tabs__tab${active ? ' site-tabs__tab--active' : ''}`}
              >
                <span className="site-tabs__icon">
                  <Icon />
                </span>
                <span className="site-tabs__label">{label}</span>
              </NavLink>
            )
          })}
        </nav>
      ) : null}
    </div>
  )
}
