import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = join(__dirname, '../public/data/site-config.json')

const DEFAULT_CONFIG = { activeSeason: 2026 }

/** `public/data/site-config.json` — tiny site-wide settings (active season). */
export function loadSiteConfig() {
  if (!existsSync(CONFIG_PATH)) return { ...DEFAULT_CONFIG }
  try {
    const disk = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    return { ...DEFAULT_CONFIG, ...(disk && typeof disk === 'object' ? disk : {}) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveSiteConfig(config) {
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

export function getActiveSeason() {
  const y = Number(loadSiteConfig().activeSeason)
  return Number.isFinite(y) ? y : DEFAULT_CONFIG.activeSeason
}

export function setActiveSeason(year) {
  const y = Number(year)
  if (!Number.isInteger(y) || y < 2000 || y > 2100) {
    throw new Error('Season must be a 4-digit year')
  }
  const config = loadSiteConfig()
  config.activeSeason = y
  saveSiteConfig(config)
  return y
}
