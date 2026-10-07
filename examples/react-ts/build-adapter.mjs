// Builds the workspace adapter (../..) before Vite. Its package exports point at dist/, which
// is gitignored, so a Vercel install of this example cannot resolve `biatec-wallet-use-wallet-client`
// until tsdown has run. Invoked via node so the build does not re-exec pnpm.
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const exampleDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(exampleDir, '../..')
const tsdown = path.join(root, 'node_modules', 'tsdown', 'dist', 'run.mjs')

const child = spawn(process.execPath, [tsdown], { cwd: root, stdio: 'inherit' })
child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
