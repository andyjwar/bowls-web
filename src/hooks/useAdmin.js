import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminLogin,
  adminLogout,
  checkAdminSession,
  fetchAdminLeagues,
  fetchAdminLeagueDocument,
  saveAdminDivisionTeams,
  saveAdminScheduleDates,
  saveAdminLeagueLabels,
  addAdminLeagueDivision,
  addAdminLeagueSection,
  createAdminLeague,
  fetchAdminRegisteredPlayers,
  saveAdminRegisteredTeam,
  seedAdminRegisteredPlayersFromLeague,
  parseRegisteredPlayersText,
  parseRegisteredPlayersFile,
  fetchWeekResults,
  importCsv,
  importScoreSheet,
  saveResults,
  fetchAdminCompetitions,
  saveAdminCompetitionRounds,
  startAdminSeason,
  setAdminActiveSeason,
} from '../lib/adminApi'

export function useAdmin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [leagues, setLeagues] = useState([])
  const [activeSeason, setActiveSeasonState] = useState(null)
  const [seasons, setSeasons] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    checkAdminSession()
      .then((d) => setAuthenticated(Boolean(d.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false))
  }, [])

  const applyLeaguesResponse = useCallback((data) => {
    setLeagues(data.leagues ?? [])
    if (data.activeSeason != null) setActiveSeasonState(data.activeSeason)
    if (Array.isArray(data.seasons)) setSeasons(data.seasons)
  }, [])

  const login = useCallback(
    async (password) => {
      setError(null)
      setBusy(true)
      try {
        await adminLogin(password)
        setAuthenticated(true)
        applyLeaguesResponse(await fetchAdminLeagues())
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setBusy(false)
      }
    },
    [applyLeaguesResponse],
  )

  const logout = useCallback(async () => {
    await adminLogout().catch(() => {})
    setAuthenticated(false)
    setLeagues([])
  }, [])

  const loadLeagues = useCallback(async () => {
    applyLeaguesResponse(await fetchAdminLeagues())
  }, [applyLeaguesResponse])

  const startSeason = useCallback(
    async (year) => {
      setBusy(true)
      setError(null)
      try {
        const out = await startAdminSeason(year)
        await loadLeagues()
        return out
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setBusy(false)
      }
    },
    [loadLeagues],
  )

  const switchActiveSeason = useCallback(
    async (year) => {
      setBusy(true)
      setError(null)
      try {
        const out = await setAdminActiveSeason(year)
        await loadLeagues()
        return out
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setBusy(false)
      }
    },
    [loadLeagues],
  )

  useEffect(() => {
    if (authenticated) loadLeagues().catch((e) => setError(e.message))
  }, [authenticated, loadLeagues])

  const importFile = useCallback(async (formData) => {
    setBusy(true)
    setError(null)
    try {
      return await importScoreSheet(formData)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const importCsvFile = useCallback(async (formData) => {
    setBusy(true)
    setError(null)
    try {
      const data = await importCsv(formData)
      if (!data.ok) {
        const msg = data.errors?.length
          ? data.errors.join(' ')
          : data.error || 'CSV import failed'
        setError(msg)
      }
      return data
    } catch (e) {
      setError(e.message)
      return { ok: false }
    } finally {
      setBusy(false)
    }
  }, [])

  const applyResults = useCallback(async (payload) => {
    setBusy(true)
    setError(null)
    try {
      return await saveResults(payload)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const loadWeekResults = useCallback(async (params) => {
    setError(null)
    try {
      return await fetchWeekResults(params)
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const loadLeagueDocument = useCallback(async (leagueId) => {
    setError(null)
    try {
      return await fetchAdminLeagueDocument(leagueId)
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const saveDivisionTeams = useCallback(async (leagueId, payload) => {
    setBusy(true)
    setError(null)
    try {
      return await saveAdminDivisionTeams(leagueId, payload)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const saveScheduleDates = useCallback(async (leagueId, payload) => {
    setBusy(true)
    setError(null)
    try {
      return await saveAdminScheduleDates(leagueId, payload)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const saveLeagueStructureLabels = useCallback(async (leagueId, payload) => {
    setBusy(true)
    setError(null)
    try {
      return await saveAdminLeagueLabels(leagueId, payload)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const addLeagueDivisionRequest = useCallback(async (leagueId, payload) => {
    setBusy(true)
    setError(null)
    try {
      return await addAdminLeagueDivision(leagueId, payload)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const addLeagueSectionRequest = useCallback(async (leagueId, payload) => {
    setBusy(true)
    setError(null)
    try {
      return await addAdminLeagueSection(leagueId, payload)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const createLeagueRequest = useCallback(async (payload) => {
    setBusy(true)
    setError(null)
    try {
      const out = await createAdminLeague(payload)
      await loadLeagues()
      return out
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [loadLeagues])

  const loadRegisteredPlayersMap = useCallback(async () => {
    setError(null)
    try {
      return await fetchAdminRegisteredPlayers()
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const saveRegisteredTeamSheet = useCallback(async (payload) => {
    setBusy(true)
    setError(null)
    try {
      return await saveAdminRegisteredTeam(payload)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const seedRegisteredPlayersFromLeague = useCallback(async (lid) => {
    setError(null)
    try {
      return await seedAdminRegisteredPlayersFromLeague(lid)
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const parseRegisteredTeamListText = useCallback(async (text) => {
    setBusy(true)
    setError(null)
    try {
      return await parseRegisteredPlayersText(text)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const loadCompetitions = useCallback(async () => {
    setError(null)
    try {
      return await fetchAdminCompetitions()
    } catch (e) {
      setError(e.message)
      throw e
    }
  }, [])

  const saveCompetitionRounds = useCallback(async (compId, rounds) => {
    setBusy(true)
    setError(null)
    try {
      return await saveAdminCompetitionRounds(compId, rounds)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const parseRegisteredTeamListFile = useCallback(async (formData) => {
    setBusy(true)
    setError(null)
    try {
      return await parseRegisteredPlayersFile(formData)
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  return useMemo(
    () => ({
      authenticated,
      checking,
      leagues,
      activeSeason,
      seasons,
      error,
      busy,
      login,
      logout,
      startSeason,
      switchActiveSeason,
      importFile,
      importCsvFile,
      applyResults,
      loadWeekResults,
      loadLeagues,
      loadLeagueDocument,
      saveDivisionTeams,
      saveScheduleDates,
      saveLeagueStructureLabels,
      addLeagueDivision: addLeagueDivisionRequest,
      addLeagueSection: addLeagueSectionRequest,
      createLeague: createLeagueRequest,
      loadRegisteredPlayersMap,
      saveRegisteredTeamSheet,
      seedRegisteredPlayersFromLeague,
      parseRegisteredTeamListText,
      parseRegisteredTeamListFile,
      loadCompetitions,
      saveCompetitionRounds,
      setError,
    }),
    [
      authenticated,
      checking,
      leagues,
      activeSeason,
      seasons,
      error,
      busy,
      login,
      logout,
      startSeason,
      switchActiveSeason,
      importFile,
      importCsvFile,
      applyResults,
      loadWeekResults,
      loadLeagues,
      loadLeagueDocument,
      saveDivisionTeams,
      saveScheduleDates,
      saveLeagueStructureLabels,
      addLeagueDivisionRequest,
      addLeagueSectionRequest,
      createLeagueRequest,
      loadRegisteredPlayersMap,
      saveRegisteredTeamSheet,
      seedRegisteredPlayersFromLeague,
      parseRegisteredTeamListText,
      parseRegisteredTeamListFile,
      loadCompetitions,
      saveCompetitionRounds,
    ],
  )
}
