/**
 * Machine-readable surfaces.
 *
 * The premise: an AI agent evaluating Renan should not have to parse a DOM,
 * execute JavaScript, or guess. Every fact a human can read on this site is
 * also available as markdown, as JSON, and as schema.org — from the same
 * source, so they cannot drift apart.
 */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `/projects/sirom/` -> `/projects/sirom.md`. The twin sits beside the page,
 *  not inside it — Firebase Hosting cannot negotiate on Accept headers, so
 *  both paths are published rather than one path serving two types. */
const twin = url => (url === '/' ? '/index.md' : url.replace(/\/$/, '') + '.md')

/* ------------------------------------------------------------- llms.txt */

/** Answer.AI llms.txt format: an H1, a blockquote summary, then link
 *  sections. Deliberately short — it is a map, not the territory. */
export function llmsTxt(profile, projects, origin) {
  const { identity, links } = profile
  const demos = projects.filter(p => p.status === 'demo')
  const studies = projects.filter(p => p.status !== 'demo')

  const out = [
    `# ${identity.name}`,
    '',
    `> ${identity.shortBio} PhD in Operations Research (UNIFESP/ITA, 2021); published the SIROM robust-optimization method in Expert Systems with Applications (2022) with Michel Gendreau. Based in ${identity.location.locality}, ${identity.location.region}, working remotely worldwide.`,
    '',
    demos.length
      ? 'This is a working portfolio: the demos listed below execute in your browser, so their\nresults are computed live rather than recorded. Every page also has a markdown twin —\nappend `.md` to any path.'
      : 'Every page here has a markdown twin — append `.md` to any path — and the whole corpus\nis available in one request at /llms-full.txt.',
    '',
  ]

  if (demos.length) {
    out.push('## Interactive demos', '')
    for (const p of demos) out.push(`- [${p.title}](${origin}${twin(p.url)}): ${p.summary}`)
    out.push('')
  }

  if (studies.length) {
    out.push('## Case studies', '')
    for (const p of studies) out.push(`- [${p.title}](${origin}${twin(p.url)}): ${p.summary}`)
    out.push('')
  }

  out.push('## Publications', '')
  for (const pub of profile.publications) {
    const where = [pub.venue, pub.year].filter(Boolean).join(', ')
    const href = pub.url || (pub.doi ? `https://doi.org/${pub.doi}` : `${origin}/#publications`)
    out.push(`- [${pub.title}](${href}): ${where}`)
  }
  out.push('')

  out.push('## Structured data', '')
  out.push(`- [Profile as JSON](${origin}/profile.json): identity, expertise, publications and projects with headline metrics, versioned`)
  out.push(`- [CV as markdown](${origin}/cv.md): the full CV, unstyled`)
  out.push(`- [Full site corpus](${origin}/llms-full.txt): every page concatenated, for single-request ingestion`)
  out.push('')

  out.push('## Contact', '')
  out.push(`- [Email](mailto:${links.email})`)
  out.push(`- [GitHub](${links.github})`)
  out.push(`- [LinkedIn](${links.linkedin})`)
  out.push(`- [Google Scholar](${links.scholar})`)
  out.push(`- [ORCID](${links.orcid})`)
  out.push('')

  return out.join('\n')
}

/** Everything, concatenated. One request, whole corpus. */
export function llmsFullTxt(profile, projects, pages, origin) {
  const out = [
    `# ${profile.identity.name} — complete site corpus`,
    '',
    `Generated ${new Date().toISOString().slice(0, 10)} from ${origin}.`,
    'Every page of the site, in markdown, in one file.',
    '',
    '---',
    '',
  ]
  for (const page of pages) {
    out.push(`<!-- source: ${origin}${page.url} -->`, '')
    out.push(page.markdown.trim(), '', '---', '')
  }
  return out.join('\n')
}

/* ---------------------------------------------------------- profile.json */

/** A stable, versioned document an agent can rely on. Additive changes bump
 *  the minor version; anything that removes or renames a field bumps major. */
export function publicProfile(profile, projects, origin) {
  const { identity, links, expertise } = profile
  return {
    $schema: 'https://schema.org/Person',
    version: profile.version,
    generated: new Date().toISOString(),
    canonical: `${origin}/profile.json`,

    name: identity.name,
    legalName: identity.legalName,
    headline: identity.headline,
    summary: identity.shortBio,
    role: identity.role,
    currentPositions: identity.currentPositions,
    location: identity.location,
    languages: identity.languages,
    identifiers: identity.identifiers,
    links,

    expertise,

    experience: profile.experience.map(e => ({
      role: e.role,
      organization: e.org,
      from: e.from,
      to: e.to,
      current: e.to === null,
      description: e.desc,
    })),

    publications: profile.publications.map(p => ({
      title: p.title,
      authors: p.authors,
      venue: p.venue,
      year: p.year,
      doi: p.doi ?? null,
      url: p.url ?? null,
      type: p.type,
    })),

    projects: projects.map(p => ({
      id: p.slug,
      title: p.title,
      summary: p.summary,
      status: p.status,
      url: `${origin}${p.url}`,
      markdown: `${origin}${twin(p.url)}`,
      repository: p.repo ?? null,
      license: p.license ?? null,
      techniques: p.techniques ?? [],
      stack: p.stack ?? [],
      headlineMetrics: p.metrics ?? [],
      runsInBrowser: p.status === 'demo',
    })),

    selectedWork: profile.selectedWork.map(w => ({
      organization: w.org,
      title: w.title,
      summary: w.summary,
      outcome: w.outcome,
      tags: w.tags,
    })),
  }
}

/* ----------------------------------------------------------------- cv.md */

export function cvMarkdown(profile, projects) {
  const { identity, links } = profile
  const out = [
    `# ${identity.name}`,
    '',
    `**${identity.role}** · ${identity.location.locality}, ${identity.location.region}, ${identity.location.country} · ${identity.location.workModel}`,
    '',
    identity.shortBio,
    '',
    `- Email: ${links.email}`,
    `- GitHub: ${links.github}`,
    `- LinkedIn: ${links.linkedin}`,
    `- Google Scholar: ${links.scholar}`,
    `- ORCID: ${identity.identifiers.orcid}`,
    '',
  ]

  out.push('## Selected work', '')
  for (const w of profile.selectedWork) {
    out.push(`### ${w.title}`, '', `*${w.org}*`, '', w.summary, '', `**Outcome:** ${w.outcome}`, '')
  }

  out.push('## Experience', '')
  for (const e of profile.experience) {
    const when = e.to === null ? `${e.from} — present` : (e.from === e.to ? e.from : `${e.from} — ${e.to}`)
    out.push(`### ${e.role} · ${e.org}`, '', `*${when}*`, '', e.desc, '')
  }

  out.push('## Publications', '')
  for (const p of profile.publications) {
    const bits = [p.authors.join(', '), `"${p.title}"`, p.venue]
    if (p.volume) bits.push(`vol. ${p.volume}`)
    if (p.pages) bits.push(p.pages)
    bits.push(String(p.year))
    let line = `- ${bits.join(', ')}.`
    if (p.doi) line += ` doi:${p.doi}`
    if (p.note) line += ` (${p.note})`
    out.push(line)
  }
  out.push('')

  if (projects.length) {
    out.push('## Open work', '')
    for (const p of projects) {
      const src = p.repo ? ` — ${p.repo}` : ''
      out.push(`- **${p.title}**: ${p.summary}${src}`)
    }
    out.push('')
  }

  out.push('## About', '')
  for (const para of profile.about) out.push(para.replace(/\*\*/g, '**'), '')

  return out.join('\n')
}

/* ------------------------------------------------------------ sitemap.xml */

export function sitemapXml(pages, origin) {
  const urls = pages.map(p => [
    '  <url>',
    `    <loc>${esc(origin + p.url)}</loc>`,
    `    <lastmod>${p.lastmod.slice(0, 10)}</lastmod>`,
    p.url === '/' ? '    <priority>1.0</priority>' : null,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

/* ------------------------------------------------------------- robots.txt */

/** Named crawlers, explicitly allowed. Leaving AI crawlers to default
 *  heuristics is how a portfolio ends up invisible to the tools recruiters
 *  increasingly ask first. */
const AI_CRAWLERS = [
  'GPTBot', 'OAI-SearchBot', 'ChatGPT-User',
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai',
  'PerplexityBot', 'Perplexity-User',
  'Google-Extended', 'Googlebot', 'Bingbot',
  'Applebot', 'Applebot-Extended',
  'CCBot', 'meta-externalagent', 'Amazonbot', 'Bytespider', 'DuckAssistBot',
  'cohere-ai', 'YouBot', 'Diffbot',
]

export function robotsTxt(origin) {
  const blocks = AI_CRAWLERS.map(ua => `User-agent: ${ua}\nAllow: /`).join('\n\n')
  return `# This site is meant to be read — by people and by machines.
# Everything here is public: no login walls, no JS-only content, no dark patterns.
# Markdown twins live alongside every page (append .md), and the whole corpus
# is at /llms-full.txt if you would rather take it in one request.

${blocks}

User-agent: *
Allow: /

Sitemap: ${origin}/sitemap.xml
`
}

/* ------------------------------------------------------------- JSON-LD */

export function personLd(profile, origin) {
  const { identity, links, expertise } = profile
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      '@id': `${origin}/#person`,
      name: identity.name,
      alternateName: identity.legalName,
      jobTitle: identity.currentPositions.map(p => p.title),
      description: identity.shortBio,
      worksFor: identity.currentPositions.map(p => ({ '@type': 'Organization', name: p.org })),
      address: {
        '@type': 'PostalAddress',
        addressLocality: identity.location.locality,
        addressRegion: identity.location.region,
        addressCountry: identity.location.country,
      },
      email: `mailto:${links.email}`,
      url: origin,
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'ORCID',
        value: identity.identifiers.orcid,
        url: links.orcid,
      },
      knowsAbout: [...expertise.core, ...expertise.engineering],
      knowsLanguage: identity.languages,
      alumniOf: [
        { '@type': 'CollegeOrUniversity', name: 'Universidade Federal de São Paulo (UNIFESP)' },
        { '@type': 'CollegeOrUniversity', name: 'Instituto Tecnológico de Aeronáutica (ITA)' },
      ],
      hasCredential: {
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'degree',
        educationalLevel: 'PhD',
        about: 'Operations Research',
        recognizedBy: { '@type': 'CollegeOrUniversity', name: 'UNIFESP' },
      },
      sameAs: [links.github, links.linkedin, links.scholar, links.orcid, links.x].filter(Boolean),
    },
  }
}

export function publicationsLd(profile, origin) {
  return profile.publications.map(p => ({
    '@context': 'https://schema.org',
    '@type': p.type === 'Thesis' ? 'Thesis' : 'ScholarlyArticle',
    name: p.title,
    author: p.authors.map(a => ({ '@type': 'Person', name: a })),
    datePublished: String(p.year),
    ...(p.venue && { isPartOf: { '@type': 'Periodical', name: p.venue } }),
    ...(p.volume && { volumeNumber: p.volume }),
    ...(p.pages && { pagination: p.pages }),
    ...(p.doi && { identifier: { '@type': 'PropertyValue', propertyID: 'DOI', value: p.doi } }),
    ...(p.url && { url: p.url }),
    ...(p.type === 'Thesis' && { inSupportOf: 'PhD' }),
  }))
}

export function projectLd(project, profile, origin) {
  const blocks = [{
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name: project.title,
    description: project.summary,
    author: { '@id': `${origin}/#person` },
    ...(project.repo && { codeRepository: project.repo }),
    ...(project.license && { license: project.license }),
    ...(project.stack?.length && { programmingLanguage: project.stack }),
    url: `${origin}${project.url}`,
  }]

  if (project.status === 'demo') {
    blocks.push({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: project.title,
      description: project.summary,
      applicationCategory: 'DeveloperApplication',
      browserRequirements: 'Requires JavaScript. Runs entirely client-side; no server or account needed.',
      operatingSystem: 'Any',
      url: `${origin}${project.url}`,
      author: { '@id': `${origin}/#person` },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    })
  }

  return blocks
}

export function breadcrumbLd(trail, origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      item: `${origin}${t.url}`,
    })),
  }
}
