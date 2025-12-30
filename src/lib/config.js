// @dada78641/nde_opus_fix <https://github.com/msikma/nde_opus_fix>
// © MIT license

import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import {createEnvPaths} from '@dada78641/env-paths'

/** Environment paths for this program. This is where we'll look for the config.json file. */
export const envPaths = createEnvPaths('nde_opus_fix')

/**
 * Returns the contents of the config.json file.
 */
export async function readConfig() {
  const filepath = path.join(envPaths.config, 'config.json')
  const content = await fs.readFile(filepath, 'utf8')
  const data = JSON.parse(content)
  return data
}
