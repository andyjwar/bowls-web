import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminLogin,
  adminLogout,
  checkAdminSession,
  fetchAdminLeagues,
  importScoreSheet,
  saveResults,
} from '../lib/adminApi'

export function useAdmin() {
  const [authenticated, setAuthenticated] = useState(false)
  const [checking, setChecking] = useState(true)
  const [leagues, setLeagues] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    checkAdminSession()
      .then((d) => setAuthenticated(Boolean(d.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false))
  }, [])

  const login = useCallback(async (password) => {
    setError(null)
    setBusy(true)
    try {
      await adminLogin(password)
      setAuthenticated(true)
      const data = await fetchAdminLeagues()
      setLeagues(data.leagues ?? [])
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setBusy(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await adminLogout().catch(() => {})
    setAuthenticated(false)
    setLeagues([])
  }, [])

  const loadLeagues = useCallback(async () => {
    const data = await fetchAdminLeagues()
    setLeagues(data.leagues ?? [])
  }, [])

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

  return useMemo(
    () => ({
      authenticated,
      checking,
      leagues,
      error,
      busy,
      login,
      logout,
      importFile,
      applyResults,
      setError,
    }),
    [
      authenticated,
      checking,
      leagues,
      error,
      busy,
      login,
      logout,
      importFile,
      applyResults,
    ],
  )
}
