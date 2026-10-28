// Builds the one published npm package, payload-ai-suite, from the workspace packages.
// Run after `pnpm build`. Output: .release/payload-ai-suite (publish that folder).
//
// Each packages/ai-<name>/dist goes to dist/<name>, and packages/ai-suite/dist to dist/.
// Imports and admin component paths such as 'payload-ai-content/client#AIFieldButton'
// become 'payload-ai-suite/content/client#AIFieldButton', which resolves to the package itself.
import { cpSync, existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const out = join(root, '.release/payload-ai-suite')
const SUITE = 'ai-suite'

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'))
const dirs = readdirSync(join(root, 'packages')).filter((d) => existsSync(join(root, 'packages', d, 'package.json')))
const short = (dir) => dir.replace(/^ai-/, '')
const modules = dirs.filter((d) => d !== SUITE).map(short)
const suite = readJson(join(root, 'packages', SUITE, 'package.json'))

rmSync(out, { recursive: true, force: true })

const exportsMap = {}
const dependencies = {}
const peerDependencies = {}
const merge = (into, from = {}, pkg) => {
  for (const [name, range] of Object.entries(from)) {
    if (range.startsWith('workspace:')) continue
    if (into[name] && into[name] !== range) throw new Error(`${pkg}: ${name} ${range} conflicts with ${into[name]}`)
    into[name] = range
  }
}

for (const dir of dirs) {
  const pkg = readJson(join(root, 'packages', dir, 'package.json'))
  const src = join(root, 'packages', dir, 'dist')
  if (!existsSync(src)) throw new Error(`${pkg.name}: no dist folder, run pnpm build first`)
  const sub = dir === SUITE ? '' : short(dir)
  cpSync(src, join(out, 'dist', sub), { recursive: true, filter: (p) => !p.endsWith('.map') })
  for (const [key, target] of Object.entries(pkg.publishConfig.exports)) {
    const name = sub ? (key === '.' ? `./${sub}` : `./${sub}/${key.slice(2)}`) : key
    exportsMap[name] = Object.fromEntries(
      Object.entries(target).map(([cond, path]) => [cond, sub ? path.replace('./dist/', `./dist/${sub}/`) : path]),
    )
  }
  merge(dependencies, pkg.dependencies, pkg.name)
  merge(peerDependencies, pkg.peerDependencies, pkg.name)
}

const specifier = new RegExp(`(['"\`])payload-ai-(${modules.join('|')})(?=['"\`/#])`, 'g')
// tsc (moduleResolution Bundler) leaves relative imports without extensions, which Node's ESM loader
// rejects; Payload's CLI runs the config in plain Node. Point each one at the emitted file.
const relative = /((?:from|import)\s*\(?\s*)(['"])(\.{1,2}\/[^'"]+)\2/g
const withExtension = (file, spec) => {
  if (/\.(js|json|css)$/.test(spec)) return spec
  const abs = join(dirname(file), spec)
  if (existsSync(`${abs}.js`)) return `${spec}.js`
  if (existsSync(join(abs, 'index.js'))) return `${spec}/index.js`
  throw new Error(`${file}: cannot resolve ${spec}`)
}
const rewrite = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) rewrite(p)
    else if (/\.(js|d\.ts)$/.test(name)) {
      const text = readFileSync(p, 'utf8')
      const next = text
        .replace(specifier, '$1payload-ai-suite/$2')
        .replace(relative, (_, lead, q, spec) => `${lead}${q}${withExtension(p, spec)}${q}`)
      if (next !== text) writeFileSync(p, next)
    }
  }
}
rewrite(join(out, 'dist'))

for (const [name, target] of Object.entries(exportsMap)) {
  for (const path of Object.values(target)) {
    if (!existsSync(join(out, path))) throw new Error(`export ${name} points to missing ${path}`)
  }
}

writeFileSync(
  join(out, 'package.json'),
  JSON.stringify(
    {
      name: suite.name,
      version: suite.version,
      description: 'AI for Payload CMS v3: content, search, storefront assistant, marketing, support, insights, media and an admin copilot',
      keywords: ['payload', 'payloadcms', 'payload-plugin', 'ai', 'llm', 'ecommerce', 'chatbot', 'semantic-search', 'pgvector'],
      license: suite.license,
      type: 'module',
      repository: { type: 'git', url: 'git+https://github.com/mahabub123/payload-ai-suite.git' },
      homepage: 'https://github.com/mahabub123/payload-ai-suite#readme',
      bugs: 'https://github.com/mahabub123/payload-ai-suite/issues',
      exports: exportsMap,
      main: './dist/index.js',
      types: './dist/index.d.ts',
      files: ['dist'],
      dependencies,
      peerDependencies,
      engines: { node: '>=22' },
    },
    null,
    2,
  ) + '\n',
)
cpSync(join(root, 'README.md'), join(out, 'README.md'))
cpSync(join(root, 'LICENSE'), join(out, 'LICENSE'))

console.log(`Assembled ${suite.name}@${suite.version} in ${out}`)
console.log(`Entry points: ${Object.keys(exportsMap).join(' ')}`)
