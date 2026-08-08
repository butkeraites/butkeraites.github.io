#!/usr/bin/env node
/**
 * Post-build checks.
 *
 * These exist because of a specific near-miss: the site claimed SIROM was
 * MIT-licensed while the public repository was still GPL-3.0, because the
 * relicense pull request had not been merged. A portfolio that states a
 * verifiable fact about a public repository must be checked against that
 * repository, not against intent.
 *
 * Run: npm run check   (network access needed for the licence check; it
 * degrades to a warning when `gh` is unavailable so CI without a token still
 * runs the offline checks.)
 */

import { readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(dirname(new URL(import.meta.url).pathname), '..')
const DIST = join(ROOT, 'dist')

let failures = 0
let warnings = 0

const fail = m => { console.error(`  FAIL  ${m}`); failures++ }
const warn = m => { console.warn(`  warn  ${m}`); warnings++ }
const pass = m => console.log(`  ok    ${m}`)

/* -------------------------------------------------- licence consistency */

async function checkLicences(profile) {
  console.log('\nlicences declared on the site vs GitHub')
  let gh = true
  try {
    execSync('gh auth status', { stdio: 'ignore' })
  } catch {
    gh = false
  }
  if (!gh) return warn('gh CLI unavailable or unauthenticated — licence check skipped')

  for (const p of profile.projects) {
    if (!p.repository) continue
    const slug = p.repository.replace('https://github.com/', '')
    let real
    try {
      real = execSync(`gh api repos/${slug}/license --jq '.license.spdx_id'`,
        { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      real = 'NONE'
    }
    const declared = p.license || 'NONE'
    if (declared === real) pass(`${slug}: ${real}`)
    else fail(`${slug}: site says ${declared}, GitHub says ${real}`)
  }
}

/* ------------------------------------------------------ repo visibility */

async function checkRepoVisibility(profile) {
  console.log('\nlinked repositories are reachable')
  try {
    execSync('gh auth status', { stdio: 'ignore' })
  } catch {
    return warn('gh CLI unavailable — visibility check skipped')
  }
  for (const p of profile.projects) {
    if (!p.repository) continue
    const slug = p.repository.replace('https://github.com/', '')
    let priv
    try {
      priv = execSync(`gh api repos/${slug} --jq '.private'`,
        { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    } catch {
      fail(`${slug}: repository not found`)
      continue
    }
    // A private repo behind a public "Source" link is a dead end for visitors.
    if (priv === 'true') fail(`${slug}: linked from the site but still PRIVATE`)
    else pass(`${slug}: public`)
  }
}

/* -------------------------------------------------------- machine layer */

async function checkMachineSurfaces() {
  console.log('\nmachine-readable surfaces')
  for (const f of ['llms.txt', 'llms-full.txt', 'profile.json', 'cv.md', 'sitemap.xml', 'robots.txt', 'index.md']) {
    if (existsSync(join(DIST, f))) pass(f)
    else fail(`${f} missing`)
  }

  const profile = JSON.parse(await readFile(join(DIST, 'profile.json'), 'utf8'))
  if (!profile.version) fail('profile.json has no version field')

  // Every HTML page must declare its markdown twin, and the twin must exist.
  const pages = []
  const walk = async dir => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (extname(e.name) === '.html') pages.push(full)
    }
  }
  await walk(DIST)

  console.log('\nmarkdown twins')
  for (const page of pages) {
    const html = await readFile(page, 'utf8')
    const rel = page.replace(DIST, '')
    if (rel === '/404.html') continue
    const m = html.match(/rel="alternate" type="text\/markdown" href="([^"]+)"/)
    if (!m) { fail(`${rel}: no markdown twin declared`); continue }
    // The href is absolute, so take the pathname rather than pattern-matching
    // it — a lazy regex here happily matches "//host/file.md" as a path.
    const twinPath = new URL(m[1]).pathname
    if (existsSync(join(DIST, twinPath))) pass(`${rel} → ${twinPath}`)
    else fail(`${rel}: declares ${twinPath} but that file was not built`)
  }

  // The hard rule from the plan: substance must survive with JS disabled.
  console.log('\nsubstance survives without JavaScript')
  for (const page of pages) {
    const html = await readFile(page, 'utf8')
    const rel = page.replace(DIST, '')
    const body = html.split('<main')[1] || ''
    const text = body.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ').trim()
    if (rel === '/404.html') continue
    if (text.length < 400) fail(`${rel}: only ${text.length} chars of static text — a JS-less crawler gets nothing`)
    else pass(`${rel}: ${text.length} chars`)
  }
}

/* ------------------------------------------------------------- budgets */

async function checkBudgets() {
  console.log('\ntransfer budget')
  // Set on day one, per the plan: WASM solvers land later and will creep.
  const LIMITS = { '.html': 120, '.css': 60, '.js': 250, '.wasm': 2500 }
  const walk = async dir => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) { await walk(full); continue }
      const limit = LIMITS[extname(e.name)]
      if (!limit) continue
      const kb = (await stat(full)).size / 1024
      const rel = full.replace(DIST, '')
      if (kb > limit) fail(`${rel}: ${kb.toFixed(0)} KB exceeds ${limit} KB budget`)
      else pass(`${rel}: ${kb.toFixed(0)} KB / ${limit} KB`)
    }
  }
  await walk(DIST)
}

/* ---------------------------------------------------------------- main */

const profile = JSON.parse(await readFile(join(DIST, 'profile.json'), 'utf8'))
await checkMachineSurfaces()
await checkBudgets()
await checkLicences(profile)
await checkRepoVisibility(profile)

console.log(`\n${failures} failure(s), ${warnings} warning(s)`)
process.exit(failures ? 1 : 0)
