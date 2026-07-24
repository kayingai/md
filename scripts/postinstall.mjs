import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const patchesDir = join(__dirname, '..', 'patches')

function applyPatch(patchFile) {
  const content = readFileSync(patchFile, 'utf-8')
  const lines = content.split('\n')

  let filePath = ''
  const hunks = []
  let currentHunk = null

  for (const line of lines) {
    if (line.startsWith('--- a/')) {
      filePath = line.slice(6).trim()
    } else if (line.startsWith('+++ b/')) {
      // use the target path from b/ (it's the same as a/ usually)
    } else if (line.startsWith('@@ ')) {
      if (currentHunk) hunks.push(currentHunk)
      currentHunk = { oldLines: [], newLines: [], offset: 0 }
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

  if (!filePath) {
    console.warn(`[postinstall] Could not determine target file in patch: ${patchFile}`)
    return
  }

  // Try to find the target file in node_modules
  const modulePath = join(process.cwd(), 'node_modules', filePath)
  if (!existsSync(modulePath)) {
    console.warn(`[postinstall] Target file not found: ${modulePath}`)
    return
  }

  let source = readFileSync(modulePath, 'utf-8')

  for (const hunk of hunks) {
    const oldText = hunk.oldLines.join('\n')
    const newText = hunk.newLines.join('\n')
    if (source.includes(oldText)) {
      source = source.replace(oldText, newText)
      console.log(`[postinstall] Applied patch hunk in ${filePath}`)
    } else if (source.includes(newText)) {
      console.log(`[postinstall] Patch already applied in ${filePath}`)
    } else {
      console.warn(`[postinstall] Could not find hunk in ${filePath}, skipping`)
    }
  }

  writeFileSync(modulePath, source, 'utf-8')
  console.log(`[postinstall] Patched: ${filePath}`)
}

// Apply patches
const patchFiles = [
  join(patchesDir, '@codemirror__view@6.43.6.patch'),
  join(patchesDir, 'front-matter@4.0.2.patch'),
  join(patchesDir, 'juice@12.1.1.patch'),
]

for (const pf of patchFiles) {
  if (existsSync(pf)) {
    applyPatch(pf)
  }
}

// simple-git-hooks
try {
  const { default: simpleGitHooks } = await import('simple-git-hooks')
  simpleGitHooks()
  console.log('[postinstall] simple-git-hooks configured')
}
catch {
  console.warn('[postinstall] simple-git-hooks not available')
}
