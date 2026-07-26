import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs'
import { createHash } from 'crypto'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

/**
 * GitHub sync for the data files in `public/data/`.
 *
 * The GitHub repo is the permanent storage: on hosts with an ephemeral disk
 * (e.g. Render's free tier) the local filesystem resets on every restart, so:
 *
 *  - `pullDataFromGitHub()` runs at startup and overwrites `public/data/`
 *    with the latest committed versions.
 *  - `scheduleDataPush()` runs after every successful admin save and commits
 *    any changed/new data files back to the repo. The push is debounced so a
 *    burst of saves becomes one commit, and commits are tagged `[skip render]`
 *    so Render does not redeploy the server for data-only changes (the
 *    GitHub Pages workflow still rebuilds the public site).
 *
 * Only `public/data/` is synced. `server/data/` (form submissions) contains
 * personal contact details and is intentionally never pushed to the repo.
 */

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, '../public/data')
const REPO_PREFIX = 'public/data/'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim() || ''
const GITHUB_REPO = process.env.GITHUB_REPO?.trim() || 'andyjwar/bowls-web'
const GITHUB_BRANCH = process.env.GITHUB_BRANCH?.trim() || 'main'
const API_ROOT = `https://api.github.com/repos/${GITHUB_REPO}`

const PUSH_DEBOUNCE_MS = 3000
const MAX_PUSH_ATTEMPTS = 3

export function isGitSyncEnabled() {
  return Boolean(GITHUB_TOKEN)
}

async function githubRequest(path, options = {}) {
  const res = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { raw: text }
    }
  }
  if (!res.ok) {
    const message = data?.message || `HTTP ${res.status}`
    const err = new Error(`GitHub API ${options.method || 'GET'} ${path}: ${message}`)
    err.status = res.status
    throw err
  }
  return data
}

/** `{ headSha, headTreeSha, files: Map<repoPath, blobSha> }` for public/data on the branch head. */
async function fetchRemoteDataState() {
  const ref = await githubRequest(`/git/ref/heads/${encodeURIComponent(GITHUB_BRANCH)}`)
  const headSha = ref.object.sha
  const commit = await githubRequest(`/git/commits/${headSha}`)
  const tree = await githubRequest(`/git/trees/${commit.tree.sha}?recursive=1`)
  const files = new Map()
  for (const entry of tree.tree ?? []) {
    if (entry.type === 'blob' && entry.path.startsWith(REPO_PREFIX)) {
      files.set(entry.path, entry.sha)
    }
  }
  return { headSha, headTreeSha: commit.tree.sha, files, truncated: Boolean(tree.truncated) }
}

/** Git blob SHA of file content: sha1("blob <byteLength>\0" + content). */
function gitBlobSha(buffer) {
  return createHash('sha1')
    .update(`blob ${buffer.length}\0`)
    .update(buffer)
    .digest('hex')
}

function listLocalDataFiles() {
  if (!existsSync(DATA_DIR)) return []
  return readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => ({
      repoPath: `${REPO_PREFIX}${e.name}`,
      localPath: join(DATA_DIR, e.name),
    }))
}

/**
 * Overwrite local `public/data/` with the latest committed files from GitHub.
 * Throws on failure — when sync is enabled the caller should treat a failed
 * pull as fatal rather than risk editing (and later pushing) stale data.
 */
export async function pullDataFromGitHub() {
  const remote = await fetchRemoteDataState()
  if (remote.truncated) {
    throw new Error('GitHub tree listing was truncated — cannot safely pull data files')
  }
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })

  let updated = 0
  for (const [repoPath, blobSha] of remote.files) {
    const localPath = join(DATA_DIR, repoPath.slice(REPO_PREFIX.length))
    if (existsSync(localPath) && gitBlobSha(readFileSync(localPath)) === blobSha) continue
    const blob = await githubRequest(`/git/blobs/${blobSha}`)
    writeFileSync(localPath, Buffer.from(blob.content, 'base64'))
    updated += 1
  }
  console.log(
    `[git-sync] Pulled data from ${GITHUB_REPO}@${GITHUB_BRANCH}: ` +
      `${remote.files.size} files checked, ${updated} updated (head ${remote.headSha.slice(0, 7)})`,
  )
}

/**
 * Commit every changed/new file in `public/data/` to the branch as one commit.
 * Returns the new commit SHA, or null when nothing changed.
 * Note: files deleted locally are left as-is in the repo (deletions never
 * happen through the admin API).
 */
async function pushDataToGitHub() {
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt += 1) {
    const remote = await fetchRemoteDataState()

    const changed = []
    for (const { repoPath, localPath } of listLocalDataFiles()) {
      const content = readFileSync(localPath)
      if (remote.files.get(repoPath) !== gitBlobSha(content)) {
        changed.push({ repoPath, content })
      }
    }
    if (changed.length === 0) return null

    const newTree = await githubRequest('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: remote.headTreeSha,
        tree: changed.map(({ repoPath, content }) => ({
          path: repoPath,
          mode: '100644',
          type: 'blob',
          content: content.toString('utf8'),
        })),
      }),
    })

    const names = changed.map((c) => c.repoPath.slice(REPO_PREFIX.length)).join(', ')
    const commit = await githubRequest('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message: `Admin data update: ${names} [skip render]`,
        tree: newTree.sha,
        parents: [remote.headSha],
      }),
    })

    try {
      await githubRequest(`/git/refs/heads/${encodeURIComponent(GITHUB_BRANCH)}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      })
      console.log(
        `[git-sync] Pushed ${changed.length} file(s) to ${GITHUB_REPO}@${GITHUB_BRANCH}: ` +
          `${names} (commit ${commit.sha.slice(0, 7)})`,
      )
      return commit.sha
    } catch (e) {
      // Branch moved between reading the head and updating the ref (e.g. a
      // manual push from the laptop landed) — re-read and retry.
      if (attempt < MAX_PUSH_ATTEMPTS && (e.status === 409 || e.status === 422)) {
        console.warn(`[git-sync] Push attempt ${attempt} hit a moving branch, retrying…`)
        continue
      }
      throw e
    }
  }
  throw new Error('Push failed: branch kept moving')
}

let pushTimer = null
let pushChain = Promise.resolve()

/**
 * Debounced, serialized push. Safe to call after every admin save — a burst
 * of saves becomes one commit, and a push that finds no changes is a no-op.
 */
export function scheduleDataPush() {
  if (!isGitSyncEnabled()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    pushChain = pushChain
      .then(() => pushDataToGitHub())
      .catch((e) => {
        console.error(`[git-sync] Push failed: ${e.message}`)
      })
  }, PUSH_DEBOUNCE_MS)
}
