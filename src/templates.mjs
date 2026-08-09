/**
 * HTML rendering.
 *
 * Hard rule enforced here: the substance of every page lives in static HTML.
 * A crawler that never runs JavaScript must still come away with the numbers.
 * Demos mount into a <figure> that already contains a static summary of what
 * the demo shows — the canvas enhances it, it never replaces it.
 */

import { personLd, publicationsLd, projectLd, breadcrumbLd, runtimeOf } from './machine.mjs'

const esc = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** Inline bold/italic/code/links from our own content. Not a markdown parser —
 *  just enough for the short strings in profile.json. */
const inline = s => esc(s)
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')

const ld = obj => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`

/* ------------------------------------------------------------------ shell */

function shell({ title, description, url, origin, mdUrl, jsonLd = [], body, profile, extraHead = '' }) {
  const canonical = origin + url
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
${mdUrl ? `<link rel="alternate" type="text/markdown" href="${esc(origin + mdUrl)}" title="This page as markdown">` : ''}
<link rel="alternate" type="text/plain" href="${esc(origin)}/llms.txt" title="Site map for language models">

<meta property="og:type" content="${url === '/' ? 'profile' : 'article'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:site_name" content="${esc(profile.identity.name)}">
<meta property="og:image" content="${esc(origin)}/assets/og-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(profile.identity.name)} — ${esc(profile.identity.role)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${esc(origin)}/assets/og-card.png">
<meta name="author" content="${esc(profile.identity.name)}">

<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='20' fill='%230f4c5c'/><text x='50' y='69' font-size='54' text-anchor='middle' fill='white' font-family='Georgia'>R</text></svg>">
<link rel="stylesheet" href="/assets/site.css">
${jsonLd.map(ld).join('\n')}
${extraHead}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<nav aria-label="Primary">
  <div class="wrap nav-inner">
    <a class="brand" href="/">${esc(profile.identity.name)}</a>
    <ul>
      <li><a href="/projects/">Projects</a></li>
      <li><a href="/#experience">Experience</a></li>
      <li><a href="/#publications">Publications</a></li>
      <li><a href="/#contact">Contact</a></li>
    </ul>
  </div>
</nav>

<main id="main">
${body}
</main>

<footer id="contact">
  <div class="wrap">
    <h2>Let's talk</h2>
    <p class="lede">${inline(profile.closing)}</p>
    <div class="links">
      <a href="mailto:${esc(profile.links.email)}">${esc(profile.links.email)}</a>
      <a href="${esc(profile.links.linkedin)}" rel="me noopener">LinkedIn</a>
      <a href="${esc(profile.links.github)}" rel="me noopener">GitHub</a>
      <a href="${esc(profile.links.scholar)}" rel="me noopener">Google Scholar</a>
      <a href="${esc(profile.links.orcid)}" rel="me noopener">ORCID</a>
    </div>
    <p class="machine">
      Built for machines too:
      <a href="/llms.txt">llms.txt</a>,
      <a href="/profile.json">profile.json</a>,
      <a href="/cv.md">cv.md</a>,
      <a href="/llms-full.txt">full corpus</a>.
      Every page has a markdown twin — append <code>.md</code> to any path.
    </p>
    <p class="fine">© ${new Date().getFullYear()} ${esc(profile.identity.legalName)} · Static files, no runtime framework, no tracking — the way an optimizer likes it.</p>
  </div>
</footer>
</body>
</html>
`
}

/* ------------------------------------------------------------------- home */

export function renderHome({ profile, projects, origin }) {
  const { identity } = profile
  const demos = projects.filter(p => p.status === 'demo')

  const body = `
<header class="hero">
  <div class="wrap hero-grid">
    <div class="hero-text">
    <p class="kicker">${esc(identity.role)}</p>
    <h1>${esc(identity.headline)}</h1>
    <p class="lede">${inline(identity.shortBio)}</p>
    ${identity.proof?.length ? `<ul class="proof-strip">
      ${identity.proof.map(p => `<li>${esc(p)}</li>`).join('\n      ')}
    </ul>` : ''}
    <ul class="meta-row">
      ${identity.currentPositions.map(p => `<li>${esc(p.title)} @ ${esc(p.org)}</li>`).join('\n      ')}
      <li>${esc(identity.location.locality)}, ${esc(identity.location.region)} — ${esc(identity.location.workModel.toLowerCase())}</li>
    </ul>
    <div class="cta-row">
      ${demos.length ? `<a class="btn primary" href="/projects/">Try the demos</a>` : ''}
      <a class="btn${demos.length ? ' ghost' : ' primary'}" href="mailto:${esc(profile.links.email)}">Get in touch</a>
      <a class="btn ghost" href="/cv.md">CV as markdown</a>
    </div>
    </div>
    <img class="headshot" src="/assets/headshot-640.jpg"
         srcset="/assets/headshot-320.jpg 320w, /assets/headshot-640.jpg 640w"
         sizes="(max-width: 760px) 128px, 232px"
         width="640" height="640" fetchpriority="high"
         alt="${esc(identity.name)}">
  </div>
</header>

${demos.length ? `
<section id="demos">
  <div class="wrap">
    <h2>Things you can actually run</h2>
    <p class="section-sub">Real solvers, computing while you watch — most in your browser, the heaviest on a container that scales to zero. Where a page plots published results, it says so.</p>
    <div class="cards">
      ${demos.map(demoCard).join('\n      ')}
    </div>
  </div>
</section>` : ''}

<section id="work">
  <div class="wrap">
    <h2>Selected work</h2>
    <p class="section-sub">Outcomes, not job descriptions. Every number below is one I owned or led.</p>
    <div class="cards">
      ${profile.selectedWork.map(workCard).join('\n      ')}
    </div>
  </div>
</section>

<section id="experience">
  <div class="wrap">
    <h2>Experience</h2>
    <p class="section-sub">From maintaining flight simulators to leading engineering teams — the same question the whole way.</p>
    <ol class="timeline">
      ${profile.experience.map(timelineItem).join('\n      ')}
    </ol>
  </div>
</section>

<section id="publications">
  <div class="wrap">
    <h2>Publications</h2>
    <p class="section-sub">Peer-reviewed work at the intersection of optimization and uncertainty.</p>
    <ol class="pubs">
      ${profile.publications.map(pubItem).join('\n      ')}
    </ol>
  </div>
</section>

<section id="about">
  <div class="wrap">
    <h2>About</h2>
    <p class="section-sub">The short version of a long path.</p>
    <div class="about-grid">
      <div class="prose">
        ${profile.about.map(p => `<p>${inline(p)}</p>`).join('\n        ')}
      </div>
      <aside class="facts">
        <h3>Quick facts</h3>
        <dl>
          ${profile.quickFacts.map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('\n          ')}
          <div><dt>ORCID</dt><dd><a href="${esc(profile.links.orcid)}">${esc(identity.identifiers.orcid)}</a></dd></div>
        </dl>
      </aside>
    </div>
  </div>
</section>
`

  return shell({
    title: `${identity.name} — ${identity.role}`,
    description: identity.shortBio,
    url: '/',
    mdUrl: '/index.md',
    origin, profile, body,
    jsonLd: [personLd(profile, origin), ...publicationsLd(profile, origin)],
  })
}

const demoCard = p => `<article class="card demo-card">
        <p class="org">${esc((p.techniques || [])[0] || 'Interactive')}</p>
        <h3><a href="${esc(p.url)}">${esc(p.title)}</a></h3>
        <p>${esc(p.summary)}</p>
        ${p.metrics?.length ? `<p class="stat">${esc(p.metrics[0].label)}: <strong>${esc(p.metrics[0].value)}</strong></p>` : ''}
        <ul class="tags">${(p.stack || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      </article>`

const workCard = w => `<article class="card">
        <p class="org">${esc(w.org)}</p>
        <h3>${esc(w.title)}</h3>
        <p>${esc(w.summary)}</p>
        <p class="stat">${esc(w.outcome)}</p>
        <ul class="tags">${w.tags.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      </article>`

const timelineItem = e => {
  const when = e.to === null
    ? `${e.from} — now`
    : (e.from === e.to ? e.from : `${e.from} — ${e.to}`)
  return `<li>
        <p class="when"><time datetime="${esc(e.from)}">${esc(when)}</time></p>
        <div>
          <h3 class="role">${esc(e.role)} · <span class="org2">${esc(e.org)}</span></h3>
          <p class="desc">${esc(e.desc)}</p>
        </div>
      </li>`
}

const pubItem = p => {
  const venue = [p.venue, p.volume && `vol. ${p.volume}`, p.year].filter(Boolean).join(', ')
  const href = p.url || (p.doi ? `https://doi.org/${p.doi}` : null)
  const title = href
    ? `<a href="${esc(href)}" rel="noopener">${esc(p.title)}</a>`
    : esc(p.title)
  return `<li>
        <p class="pub-title">${title}</p>
        <p class="pub-venue">${esc(p.authors.join(', '))} — ${esc(venue)}${p.doi ? ` · <span class="doi">doi:${esc(p.doi)}</span>` : ''}</p>
      </li>`
}

/* --------------------------------------------------------- project index */

export function renderProjectIndex({ profile, projects, origin }) {
  const groups = [
    ['demo', 'Interactive demos', 'Every result here is computed when you ask for it. Each page says where it runs.'],
    ['case-study', 'Case studies', 'Work worth reading about, without a live version.'],
    ['tool', 'Tools', 'Things built to be used by other people.'],
  ]

  const body = `
<header class="page-head">
  <div class="wrap">
    <h1>Projects</h1>
    <p class="lede">Optimization work, most of it open source. The demos compute their results live — nothing on this site is a recording.</p>
  </div>
</header>

${groups.map(([key, heading, note]) => {
    const inGroup = projects.filter(p => p.status === key)
    if (!inGroup.length) return ''
    return `<section>
  <div class="wrap">
    <h2>${heading}</h2>
    <p class="section-sub">${note}</p>
    <div class="cards">
      ${inGroup.map(demoCard).join('\n      ')}
    </div>
  </div>
</section>`
  }).join('\n')}
`

  return shell({
    title: `Projects — ${profile.identity.name}`,
    description: `Optimization projects by ${profile.identity.name}, including interactive demos that run entirely in the browser.`,
    url: '/projects/',
    mdUrl: '/projects/index.md',
    origin, profile, body,
    jsonLd: [breadcrumbLd([{ name: 'Home', url: '/' }, { name: 'Projects', url: '/projects/' }], origin)],
  })
}

/* --------------------------------------------------------------- project */

export function renderProject({ profile, project: p, origin }) {
  const facts = [
    p.repo && ['Source', `<a href="${esc(p.repo)}" rel="noopener">${esc(p.repo.replace('https://github.com/', ''))}</a>`],
    p.license && ['Licence', esc(p.license)],
    p.techniques?.length && ['Techniques', p.techniques.map(esc).join(', ')],
    p.stack?.length && ['Stack', p.stack.map(esc).join(', ')],
    p.status === 'demo' && ['Runs', esc(runtimeOf(p).label)],
  ].filter(Boolean)

  const body = `
<header class="page-head">
  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="/">Home</a> <span aria-hidden="true">/</span> <a href="/projects/">Projects</a>
    </nav>
    <h1>${esc(p.title)}</h1>
    ${p.tagline ? `<p class="lede">${esc(p.tagline)}</p>` : ''}
    <p class="summary">${esc(p.summary)}</p>
  </div>
</header>

<section>
  <div class="wrap">
    ${facts.length ? `<dl class="factbar">
      ${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('\n      ')}
    </dl>` : ''}

    ${p.metrics?.length ? `<figure class="metrics">
      <table>
        <caption>Headline results — measured, not estimated</caption>
        <thead><tr><th scope="col">Measure</th><th scope="col">Value</th></tr></thead>
        <tbody>
          ${p.metrics.map(m => `<tr><th scope="row">${esc(m.label)}</th><td class="num">${esc(m.value)}</td></tr>`).join('\n          ')}
        </tbody>
      </table>
    </figure>` : ''}

    ${p.fixture ? `<script id="demo-fixture" type="application/json">${JSON.stringify(p.fixture).replace(/</g, '\\u003c')}</script>` : ''}
    ${p.demoModule ? `<figure class="demo-mount" id="demo">
      <figcaption>Interactive — loads on demand, then runs offline.</figcaption>
      <div id="demo-root" data-module="${esc(p.demoModule)}">
        <noscript><p class="note">This demo needs JavaScript. Everything it would tell you is written out below and in <a href="${esc(p.url.replace(/\/$/, ''))}.md">the markdown version</a>.</p></noscript>
      </div>
    </figure>` : ''}

    <div class="prose">
      ${p.html}
    </div>
  </div>
</section>
`

  return shell({
    title: `${p.title} — ${profile.identity.name}`,
    description: p.summary,
    url: p.url,
    mdUrl: p.url.replace(/\/$/, '') + '.md',
    origin, profile, body,
    jsonLd: [
      ...projectLd(p, profile, origin),
      breadcrumbLd([
        { name: 'Home', url: '/' },
        { name: 'Projects', url: '/projects/' },
        { name: p.title, url: p.url },
      ], origin),
    ],
    // The demo's stylesheet and module load only on pages that have one, so a
    // reader of a case study pays for neither.
    extraHead: p.demoModule
      ? `<link rel="stylesheet" href="/assets/demo.css">\n`
        + `<link rel="modulepreload" href="${esc(p.demoModule)}">\n`
        + `<script type="module" src="${esc(p.demoModule)}"></script>`
      : '',
  })
}

/* ------------------------------------------------------------------- 404 */

export function renderNotFound({ profile, origin }) {
  return shell({
    title: `Not found — ${profile.identity.name}`,
    description: 'That page does not exist.',
    url: '/404.html',
    origin, profile,
    body: `
<header class="page-head">
  <div class="wrap">
    <p class="kicker">404 · infeasible</p>
    <h1>No solution exists for that path.</h1>
    <p class="lede">The constraint set is empty. Try <a href="/">the homepage</a>, <a href="/projects/">the projects</a>, or <a href="/llms.txt">llms.txt</a> if you are a machine.</p>
  </div>
</header>`,
  })
}
