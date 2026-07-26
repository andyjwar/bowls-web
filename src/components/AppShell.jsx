import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { useTheme } from '../hooks/useTheme'

const NAV = [
  { to: '/', label: 'Home', match: (p) => p === '/' },
  { to: '/leagues', label: 'Leagues', match: (p) => p.startsWith('/leagues') },
  { to: '/competitions', label: 'Competitions', match: (p) => p.startsWith('/competitions') },
  { to: '/officers', label: 'League Officers', match: (p) => p.startsWith('/officers') },
  { to: '/rules', label: 'Rules', match: (p) => p.startsWith('/rules') },
  { to: '/forms', label: 'Forms', match: (p) => p.startsWith('/forms') },
]

export function AppShell() {
  const { pathname } = useLocation()
  const [theme, setTheme] = useTheme()

  return (
    <div className="bowls-app" data-theme={theme}>
      <header className="site-header">
        <div className="site-header__inner">
          <NavLink to="/" className="site-brand" aria-label="Home">
            <img
              className="site-brand__logo"
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt="Ipswich & District Federation Bowls League"
            />
          </NavLink>
          <nav className="site-nav" aria-label="Main">
            {NAV.map(({ to, label, match }) => {
              const active = match(pathname)
              return (
                <NavLink
                  key={label}
                  to={to}
                  className={`site-nav__link${active ? ' site-nav__link--active' : ''}`}
                >
                  {label}
                </NavLink>
              )
            })}
          </nav>
          <div className="site-header__actions">
            <ThemeToggle value={theme} onChange={setTheme} />
          </div>
        </div>
      </header>
      <main className="site-main">
        <Outlet />
      </main>
    </div>
  )
}
