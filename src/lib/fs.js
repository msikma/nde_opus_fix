// @dada78641/nde_opus_fix <https://github.com/msikma/nde_opus_fix>
// © MIT license

import fs, {constants} from 'fs/promises'

/**
 * Checks whether a certain access level applies to a given file path.
 * 
 * This checks whether a file is readable, writable or visible and returns a boolean.
 */
async function fileAccessCheck(filepath, access) {
  try {
    return await fs.access(filepath, access) == null
  }
  catch (err) {
    // If the file does not exist or we don't have permission for a given access level, return false.
    if (err.code === 'ENOENT' || err.code === 'EACCES') {
      return false
    }
    // Otherwise, something unexpected went wrong that the caller should know about.
    throw err
  }
}

/** Checks whether a file or path exists. */
export const fileExists = filepath => fileAccessCheck(filepath, constants.F_OK)

/** Checks whether a file or path is writable. */
export const fileIsWritable = filepath => fileAccessCheck(filepath, constants.W_OK)

/** Checks whether a file or path is readable. */
export const fileIsReadable = filepath => fileAccessCheck(filepath, constants.R_OK)
