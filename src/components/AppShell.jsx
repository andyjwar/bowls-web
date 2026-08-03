import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../hooks/useTheme'
import { useSiteConfig } from '../hooks/useSiteConfig'

/* Desktop icon rail — every page, short labels. Order mirrors the old top nav. */
const RAIL = [
  { to: '/', label: 'Home', title: 'Home', match: (p) => p === '/', icon: HomeIcon },
  {
    to: '/leagues',
    label: 'Leagues',
    title: 'Leagues',
    match: (p) => p.startsWith('/leagues'),
    icon: LeaguesIcon,
  },
  {
    to: '/competitions',
    label: 'Cups',
    title: 'Competitions',
    match: (p) => p.startsWith('/competitions'),
    icon: CupsIcon,
  },
  {
    to: '/officers',
    label: 'Officers',
    title: 'League Officers',
    match: (p) => p.startsWith('/officers'),
    icon: OfficersIcon,
  },
  {
    to: '/locations',
    label: 'Locations',
    title: 'Locations',
    match: (p) => p.startsWith('/locations'),
    icon: LocationsIcon,
  },
  { to: '/rules', label: 'Rules', title: 'Rules', match: (p) => p.startsWith('/rules'), icon: RulesIcon },
  {
    to: '/gallery',
    label: 'Gallery',
    title: 'Gallery',
    match: (p) => p.startsWith('/gallery'),
    icon: GalleryIcon,
  },
  { to: '/forms', label: 'Forms', title: 'Forms', match: (p) => p.startsWith('/forms'), icon: FormsIcon },
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

function OfficersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M5.5 19.5c.8-3.2 3.3-5 6.5-5s5.7 1.8 6.5 5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LocationsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 21s-6.5-5.5-6.5-10a6.5 6.5 0 0 1 13 0c0 4.5-6.5 10-6.5 10Z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <circle cx="12" cy="10.6" r="2.1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function FormsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="4" width="14" height="16" rx="1" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M9 9h6M9 12.5h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
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
      {/* Desktop: fixed icon rail on the left (hidden ≤900px, where the
          compact header bar + bottom tabs take over). */}
      <nav className="site-rail" aria-label="Primary">
        <NavLink to="/" className="site-rail__crest" aria-label="Home">
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Ipswich & District Federation Bowls League"
          />
        </NavLink>
        {RAIL.map(({ to, label, title, match, icon: Icon }) => {
          const active = match(pathname)
          return (
            <NavLink
              key={label}
              to={to}
              title={title}
              className={`site-rail__item${active ? ' site-rail__item--active' : ''}`}
            >
              <span className="site-rail__icon">
                <Icon />
              </span>
              <span className="site-rail__label">{label}</span>
            </NavLink>
          )
        })}
        <span className="site-rail__spacer" />
        <ThemeToggle value={theme} onChange={setTheme} />
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
