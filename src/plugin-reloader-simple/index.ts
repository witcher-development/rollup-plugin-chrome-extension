import { code as bgClientCode } from 'code ./client/background.ts'
import { code as ctClientCode } from 'code ./client/content.ts'
import { EmittedAsset, Plugin } from 'rollup'
import { updateManifest } from '../helpers'

export type SimpleReloaderPlugin = Pick<
  Required<Plugin>,
  'name' | 'generateBundle'
>

// TODO: factor out this cache
export interface SimpleReloaderCache {
  bgScriptPath?: string
  ctScriptPath?: string
}

export const loadMessage: string = `
DEVELOPMENT build with simple auto-reloader.
Loaded on ${new Date().toTimeString()}.
`.trim()

const timestampPath = 'assets/timestamp.js'

export const simpleReloader = (
  cache = {} as SimpleReloaderCache,
): SimpleReloaderPlugin | undefined => {
  if (!process.env.ROLLUP_WATCH) {
    return undefined
  }

  return {
    name: 'chrome-extension-simple-reloader',

    generateBundle(options, bundle) {
      /* ----------------- Create Client Files -------------------------- */
      const emit = (name: string, source: string) => {
        const id = this.emitFile({
          type: 'asset',
          name,
          source,
        })

        return this.getFileName(id)
      }

      const timestampFile: EmittedAsset = {
        fileName: timestampPath,
        type: 'asset',
        source: `export default ${Date.now()}`,
      }

      this.emitFile(timestampFile)

      cache.bgScriptPath = emit(
        'bg-reloader-client.js',
        bgClientCode
          .replace('%TIMESTAMP_PATH%', timestampPath)
          // eslint-disable-next-line quotes
          .replace(`%LOAD_MESSAGE%`, loadMessage),
      )

      cache.ctScriptPath = emit(
        'ct-reloader-client.js',
        // eslint-disable-next-line quotes
        ctClientCode.replace(`%LOAD_MESSAGE%`, loadMessage),
      )

      /* ----------------- Update Manifest -------------------------- */

      updateManifest(
        (manifest) => {
          manifest.description = loadMessage

          if (!manifest.background) {
            manifest.background = {}
          }

          manifest.background.persistent = true

          const { scripts: bgScripts = [] } = manifest.background

          if (cache.bgScriptPath) {
            manifest.background.scripts = [
              cache.bgScriptPath,
              ...bgScripts,
            ]
          } else {
            throw new Error(
              'Background page reloader script was not emitted',
            )
          }

          const { content_scripts: ctScripts = [] } = manifest

          if (cache.ctScriptPath) {
            manifest.content_scripts = ctScripts.map(
              ({ js = [], ...rest }) => ({
                js: [cache.ctScriptPath!, ...js],
                ...rest,
              }),
            )
          } else {
            throw new Error(
              'Content page reloader script was not emitted',
            )
          }

          return manifest
        },
        bundle,
        this.error,
      )
    },
  }
}
