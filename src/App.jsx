import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { HomePage } from './pages/HomePage'
import { LeaguesPage } from './pages/LeaguesPage'
import { CompetitionsPage } from './pages/CompetitionsPage'
import { OfficersPage } from './pages/OfficersPage'
import { RulesPage } from './pages/RulesPage'
import { FormsPage } from './pages/FormsPage'
import { AdminPage } from './pages/AdminPage'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="leagues" element={<LeaguesPage />} />
        <Route path="leagues/:leagueId" element={<LeaguesPage />} />
        <Route
          path="leagues/:leagueId/:sectionOrDivisionId"
          element={<LeaguesPage />}
        />
        <Route
          path="leagues/:leagueId/:sectionId/:divisionId"
          element={<LeaguesPage />}
        />
        <Route path="competitions" element={<CompetitionsPage />} />
        <Route path="officers" element={<OfficersPage />} />
        <Route path="rules" element={<RulesPage />} />
        <Route path="forms" element={<FormsPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
    </Routes>
  )
}
