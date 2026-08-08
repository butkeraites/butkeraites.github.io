#!/usr/bin/env node
/**
 * butkeraites.com — static build.
 *
 * One content source (content/) becomes six representations:
 *
 *   HTML pages      for people
 *   .md twins       for agents that prefer markdown over parsing DOM
 *   llms.txt        map of the site, Answer.AI format
 *   llms-full.txt   the whole corpus in one request
 *   profile.json    structured identity, stable and versioned
 *   sitemap.xml     with real lastmod from git
 *
 * Plus JSON-LD embedded per page. The output is a directory of files: the site
 * itself never needs a server. One demo calls a solver that does, and that page
 * ships a build-time fixture so it still shows a real result when the service
 * is asleep or gone.
 */

import { readFile, writeFile, mkdir, rm, readdir, cp, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, extname, basename } from 'node:path'
import { execSync } from 'node:child_process'
import { marked } from 'marked'

import { renderHome, renderProject, renderProjectIndex, renderNotFound } from './src/templates.mjs'
import { llmsTxt, llmsFullTxt, sitemapXml, robotsTxt, publicProfile, cvMarkdown } from './src/machine.mjs'

const ROOT = dirname(new URL(import.meta.url).pathname)
const OUT = join(ROOT, 'dist')

marked.setOptions({ mangle: false, headerIds: false })

/* ------------------------------------------------------------------ utils */

/** Minimal frontmatter: `---\nkey: value\n---\nbody`. Values are JSON when
 *  they look like JSON, plain strings otherwise. Enough for our own content,
 *  and it keeps the dependency list at one. */
function parseFrontmatter(raw, source) {
  if (!raw.startsWith('---')) return { data: {}, body: raw }
  const end = raw.indexOf('\n---', 3)
  if (end === -1) throw new Error(`${source}: frontmatter opened but never closed`)
  const head = raw.slice(4, end)
  const body = raw.slice(end + 4).replace(/^\n/, '')
  const data = {}
  for (const line of head.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const i = line.indexOf(':')
    if (i === -1) throw new Error(`${source}: frontmatter line without a colon: ${line}`)
    const key = line.slice(0, i).trim()
    const rest = line.slice(i + 1).trim()
    try {
      data[key] = rest === '' ? '' : JSON.parse(rest)
    } catch {
      data[key] = rest.replace(/^["']|["']$/g, '')
    }
  }
  return { data, body }
}

/** Last commit date for a path, falling back to mtime for uncommitted files.
 *  Real lastmod matters: a sitemap where everything changed today is a
 *  sitemap crawlers learn to ignore. */
function lastModified(path) {
  try {
    const out = execSync(`git log -1 --format=%cI -- "${path}"`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
    if (out) return out
  } catch { /* not a repo, or file never committed */ }
  try {
    return new Date(execSync(`stat -f %m "${path}"`).toString().trim() * 1000).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

async function emit(relPath, contents) {
  const full = join(OUT, relPath)
  await mkdir(dirname(full), { recursive: true })
  await writeFile(full, contents)
  return { path: relPath, bytes: Buffer.byteLength(contents) }
}

/** Fetch a demo's default response at build time and cache it.
 *
 * Two jobs: first paint needs no round trip, and the page still shows a real
 * result if the service is down when a visitor arrives. The cache is committed,
 * so a build with no network reuses the last good response rather than
 * shipping a demo with nothing in it. */
async function loadFixture(spec) {
  if (!spec) return null
  const cachePath = join(ROOT, 'content/fixtures', `${spec.name}.json`)
  try {
    const res = await fetch(spec.url, {
      method: spec.body ? 'POST' : 'GET',
      headers: spec.body ? { 'Content-Type': 'application/json' } : undefined,
      body: spec.body ? JSON.stringify(spec.body) : undefined,
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    await mkdir(dirname(cachePath), { recursive: true })
    await writeFile(cachePath, JSON.stringify(data, null, 2))
    console.log(`  fixture ${spec.name}: fetched live`)
    return data
  } catch (err) {
    if (existsSync(cachePath)) {
      console.log(`  fixture ${spec.name}: ${err.message}, using cached copy`)
      return JSON.parse(await readFile(cachePath, 'utf8'))
    }
    console.warn(`  fixture ${spec.name}: ${err.message}, and no cache — demo will solve on load`)
    return null
  }
}

/* ------------------------------------------------------------------- load */

async function loadProjects() {
  const dir = join(ROOT, 'content/projects')
  if (!existsSync(dir)) return []
  const files = (await readdir(dir)).filter(f => f.endsWith('.md')).sort()
  const projects = []
  for (const file of files) {
    const path = join(dir, file)
    const raw = await readFile(path, 'utf8')
    const { data, body } = parseFrontmatter(raw, `content/projects/${file}`)
    const slug = data.slug || basename(file, '.md')

    for (const required of ['title', 'summary', 'status']) {
      if (!data[required]) throw new Error(`content/projects/${file}: missing required frontmatter "${required}"`)
    }

    projects.push({
      ...data,
      fixture: await loadFixture(data.fixture),
      slug,
      markdown: body,
      html: marked.parse(body),
      url: `/projects/${slug}/`,
      sourcePath: `content/projects/${file}`,
      lastmod: lastModified(path),
    })
  }
  // Demos first, then by explicit order, then alphabetical.
  return projects.sort((a, b) =>
    (a.status === 'demo' ? 0 : 1) - (b.status === 'demo' ? 0 : 1) ||
    (a.order ?? 99) - (b.order ?? 99) ||
    a.title.localeCompare(b.title))
}

/* ------------------------------------------------------------------ build */

async function build() {
  const started = Date.now()
  await rm(OUT, { recursive: true, force: true })
  await mkdir(OUT, { recursive: true })

  const profile = JSON.parse(await readFile(join(ROOT, 'content/profile.json'), 'utf8'))
  const projects = await loadProjects()
  const origin = profile.canonicalOrigin.replace(/\/$/, '')

  const written = []
  const push = r => written.push(r)

  /* --- pages, each with its markdown twin ------------------------------- */

  const pages = [
    {
      url: '/',
      file: 'index.html',
      html: renderHome({ profile, projects, origin }),
      markdown: cvMarkdown(profile, projects),
      mdPath: 'index.md',
      lastmod: lastModified(join(ROOT, 'content/profile.json')),
      title: `${profile.identity.name} — ${profile.identity.role}`,
    },
    {
      url: '/projects/',
      file: 'projects/index.html',
      html: renderProjectIndex({ profile, projects, origin }),
      markdown: projectIndexMarkdown(profile, projects),
      mdPath: 'projects/index.md',
      lastmod: projects.reduce((a, p) => (p.lastmod > a ? p.lastmod : a), '1970-01-01T00:00:00Z'),
      title: 'Projects',
    },
  ]

  for (const p of projects) {
    pages.push({
      url: p.url,
      file: `projects/${p.slug}/index.html`,
      html: renderProject({ profile, project: p, projects, origin }),
      markdown: projectMarkdown(profile, p),
      mdPath: `projects/${p.slug}.md`,
      lastmod: p.lastmod,
      title: p.title,
    })
  }

  for (const page of pages) {
    push(await emit(page.file, page.html))
    push(await emit(page.mdPath, page.markdown))
  }

  push(await emit('404.html', renderNotFound({ profile, origin })))

  /* --- machine-readable surfaces ---------------------------------------- */

  push(await emit('llms.txt', llmsTxt(profile, projects, origin)))
  push(await emit('llms-full.txt', llmsFullTxt(profile, projects, pages, origin)))
  push(await emit('profile.json', JSON.stringify(publicProfile(profile, projects, origin), null, 2)))
  push(await emit('cv.md', cvMarkdown(profile, projects)))
  push(await emit('sitemap.xml', sitemapXml(pages, origin)))
  push(await emit('robots.txt', robotsTxt(origin)))

  /* --- static assets ---------------------------------------------------- */

  await cp(join(ROOT, 'src/styles'), join(OUT, 'assets'), { recursive: true })
  if (existsSync(join(ROOT, 'src/demos'))) {
    const entries = await readdir(join(ROOT, 'src/demos'))
    if (entries.length) await cp(join(ROOT, 'src/demos'), join(OUT, 'demos'), { recursive: true })
  }
  if (existsSync(join(ROOT, 'content/assets'))) {
    await cp(join(ROOT, 'content/assets'), join(OUT, 'assets'), { recursive: true })
  }

  /* --- report ----------------------------------------------------------- */

  const total = written.reduce((a, w) => a + w.bytes, 0)
  const ms = Date.now() - started
  console.log(`built ${pages.length} pages + ${written.length - pages.length * 2} machine surfaces`)
  console.log(`${written.length} files, ${(total / 1024).toFixed(1)} KB, ${ms} ms`)

  const biggest = written.sort((a, b) => b.bytes - a.bytes).slice(0, 3)
  for (const b of biggest) console.log(`  ${(b.bytes / 1024).toFixed(1).padStart(7)} KB  ${b.path}`)
}

/* ------------------------------------------------- markdown twin builders */

function projectMarkdown(profile, p) {
  const lines = [`# ${p.title}`, '']
  if (p.tagline) lines.push(`> ${p.tagline}`, '')
  lines.push(p.summary, '')

  const facts = []
  if (p.repo) facts.push(`- **Source:** ${p.repo}`)
  if (p.license) facts.push(`- **Licence:** ${p.license}`)
  if (p.techniques?.length) facts.push(`- **Techniques:** ${p.techniques.join(', ')}`)
  if (p.stack?.length) facts.push(`- **Stack:** ${p.stack.join(', ')}`)
  if (p.status === 'demo') facts.push(`- **Interactive demo:** runs entirely in the browser, no server`)
  if (facts.length) lines.push(...facts, '')

  if (p.metrics?.length) {
    lines.push('## Headline results', '')
    lines.push('| Measure | Value |', '| --- | --- |')
    for (const m of p.metrics) lines.push(`| ${m.label} | ${m.value} |`)
    lines.push('')
  }

  lines.push(p.markdown.trim(), '')
  lines.push('---', '', `${profile.identity.name} · ${profile.canonicalOrigin}${p.url}`)
  return lines.join('\n')
}

function projectIndexMarkdown(profile, projects) {
  const lines = ['# Projects', '',
    `Work by ${profile.identity.name}. Projects marked *demo* have an interactive version that runs in your browser.`, '']
  for (const group of ['demo', 'case-study', 'tool']) {
    const inGroup = projects.filter(p => p.status === group)
    if (!inGroup.length) continue
    lines.push(`## ${{ demo: 'Interactive demos', 'case-study': 'Case studies', tool: 'Tools' }[group]}`, '')
    for (const p of inGroup) {
      lines.push(`- [${p.title}](${profile.canonicalOrigin}${p.url}) — ${p.summary}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

build().catch(err => {
  console.error(`\nbuild failed: ${err.message}\n`)
  process.exit(1)
})
