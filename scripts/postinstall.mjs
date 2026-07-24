import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const patchesDir = join(__dirname, '..', 'patches')

function patchFilenameToPackage(filename) {
  const base = filename.replace(/\.patch$/, '')
  const lastAt = base.lastIndexOf('@')
  if (lastAt === -1) return null
  return base.slice(0, lastAt).replace(/__/g, '/')
}

function applyPatches(patchFile) {
  const content = readFileSync(patchFile, 'utf-8')
  const pkgName = patchFilenameToPackage(patchFile.split('/').pop())
  if (!pkgName) {
    console.warn(`[postinstall] Could not parse package name from: ${patchFile}`)
    return
  }

  // Split into per-file sections
  const sections = content.split(/(?=^diff --git )/m)

  for (const section of sections) {
    const lines = section.split('\n')

    // Extract target file from --- a/ line
    let relPath = ''
    for (const line of lines) {
      if (line.startsWith('--- a/')) {
        relPath = line.slice(6).trim()
        break
      }
    }
    if (!relPath) continue

    const modulePath = join(process.cwd(), 'node_modules', pkgName, relPath)
    if (!existsSync(modulePath)) {
      console.warn(`[postinstall] Target file not found: ${modulePath}`)
      continue
    }

    // Parse hunks within this section
    const hunks = []
    let currentHunk = null
    for (const line of lines) {
      if (line.startsWith('@@ ')) {
        if (currentHunk) hunks.push(currentHunk)
        currentHunk = { oldLines: [], newLines: [] }
      } else if (currentHunk) {
        if (line.startsWith('-')) {
          currentHunk.oldLines.push(line.slice(1))
        } else if (line.startsWith('+')) {
          currentHunk.newLines.push(line.slice(1))
        } else if (line.startsWith(' ')) {
          currentHunk.oldLines.push(line.slice(1))
          currentHunk.newLines.push(line.slice(1))
        }
      }
    }
    if (currentHunk) hunks.push(currentHunk)

    if (hunks.length === 0) continue

    let source = readFileSync(modulePath, 'utf-8')
    let applied = false

    for (const hunk of hunks) {
      const oldText = hunk.oldLines.join('\n')
      const newText = hunk.newLines.join('\n')

      if (source.includes(oldText)) {
        source = source.replace(oldText, newText)
        applied = true
      } else if (!source.includes(newText)) {
        console.warn(`[postinstall] Could not find hunk in ${modulePath}`)
      }
    }

    if (applied) {
      writeFileSync(modulePath, source, 'utf-8')
      console.log(`[postinstall] Patched: ${pkgName}/${relPath}`)
    }
  }
}

const patchFiles = [
  join(patchesDir, '@codemirror__view@6.43.6.patch'),
  join(patchesDir, 'front-matter@4.0.2.patch'),
  join(patchesDir, 'juice@12.1.1.patch'),
]

for (const pf of patchFiles) {
  if (existsSync(pf)) {
    applyPatches(pf)
  }
}
