import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const bump = process.argv[2]
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const [major, minor, patch] = version.split('-')[0].split('.').map(Number)

const nextVersions = {
   major: `${major + 1}.0.0`,
   minor: `${major}.${minor + 1}.0`,
   patch: `${major}.${minor}.${patch + 1}`,
}

const next = nextVersions[bump] ?? (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(bump ?? '') ? bump : undefined)

if (!next) {
   console.error('Usage: pnpm release <major | minor | patch | x.y.z>')
   process.exit(1)
}

const run = (command, args) => execFileSync(command, args, { stdio: 'inherit' })

run('changelogen', ['--release', '--no-github', '-r', next])
run('git', ['push', 'origin', 'main', '--follow-tags'])
