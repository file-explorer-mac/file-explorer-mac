/**
 * Dev-only: name the menu bar "File Explorer" instead of "Electron".
 *
 * macOS takes the application menu's title from the *running bundle's*
 * CFBundleName, not from `app.setName()`. Under `electron-vite dev` the running
 * bundle is node_modules/electron/dist/Electron.app, whose CFBundleName is
 * "Electron" — so the menu reads "Electron" no matter what main.ts does.
 *
 * Packaged builds never hit this: electron-builder writes CFBundleName from
 * build.productName in package.json.
 *
 * Patching the local dev bundle is the only way to fix it in dev. This runs
 * before `electron-vite dev`, is idempotent, and re-applies itself after an
 * `npm install` replaces node_modules. It never fails the dev command — a
 * wrong menu title is not worth blocking work over.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const APP_NAME = 'File Explorer'
const PLIST = join(
  process.cwd(),
  'node_modules/electron/dist/Electron.app/Contents/Info.plist'
)

if (process.platform !== 'darwin' || !existsSync(PLIST)) process.exit(0)

const plist = (args) =>
  execFileSync('/usr/libexec/PlistBuddy', [...args, PLIST], { encoding: 'utf8' }).trim()

try {
  if (plist(['-c', 'Print :CFBundleName']) === APP_NAME) process.exit(0)
  plist(['-c', `Set :CFBundleName ${APP_NAME}`])
  plist(['-c', `Set :CFBundleDisplayName ${APP_NAME}`])
  console.log(`[dev-app-name] dev bundle renamed to "${APP_NAME}"`)
} catch (err) {
  console.warn(`[dev-app-name] skipped: ${err.message.split('\n')[0]}`)
}
