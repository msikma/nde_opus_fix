#!/usr/bin/env node
// @dada78641/nde_opus_fix <https://github.com/msikma/nde_opus_fix>
// © MIT license

import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import NDE from 'node-nde'
import {ArgumentParser} from 'argparse'
import {parseFile} from 'music-metadata'
import {temporaryFile} from 'tempy'
import {fileExists, fileIsWritable} from '../lib/fs.js'
import {canRunCommand, runCommand} from '../lib/exec.js'
import {readConfig} from '../lib/config.js'
import pkgData from '../../package.json' with {type: 'json'}

/** We require at least 500 MB free disk space; otherwise the script will exit. */
const MIN_DISK_SPACE = 500 * 1_000_000

/**
 * Parses command line arguments.
 */
function getCliArguments() {
  const parser = new ArgumentParser({
    add_help: true,
    description: `${pkgData.description}.`
  })

  parser.add_argument('-v', '--version', {action: 'version', version: `${pkgData.version}`})
  parser.add_argument('DAT', {help: 'path to the Winamp ML main.dat file'})
  parser.add_argument('IDX', {help: 'path to the Winamp ML main.idx file'})
  parser.add_argument('--map', {help: 'maps a Windows path to a Unix path', metavar: 'WIN:UNIX', nargs: '*'})
  
  const args = {...parser.parse_args()}
  const mappings = Object.fromEntries((args.map || []).map(mapping => {
    const items = mapping.split(':')
    const win = items.slice(0, -1)
    const unix = items.slice(-1)
    return [win.join(':'), unix.join(':')]
  }))

  return {
    dat: args.DAT,
    idx: args.IDX,
    pathMappings: mappings,
  }
}

/**
 * Checks whether we're able to run ffmpeg.
 */
async function checkPrerequisites() {
  const canRunMPEG = await canRunCommand('ffmpeg')
  if (!canRunMPEG) {
    console.error(`nde_opus_fix.js: cannot run ffmpeg`)
    process.exit(1)
  }
}

/**
 * Checks how much free space there is on the drive for a given file.
 */
async function checkDiskSpace(filepath) {
  const stats = await fs.statfs(filepath)
  return stats.bavail * stats.bsize
}

/**
 * Checks if there is sufficient disk space.
 */
async function checkSufficientDiskSpace(filepath) {
  const space = await checkDiskSpace(filepath)
  return space > MIN_DISK_SPACE
}

/**
 * Reads the file's current rating value.
 */
async function readFileRating(filepath) {
  const tags = await parseFile(filepath)
  try {
    const rating = tags.common.rating[0]
    const number = Math.min(Math.max(Math.round(rating.rating * 100), 0), 5)
    return number
  }
  catch {
    return null
  }
}

/**
 * Writes a new rating value to the file.
 * 
 * This writes it to a temporary file, then replaces the original file with the new one.
 */
async function writeFileRating(filepath, oldRating, newRating) {
  const parsed = path.parse(filepath)
  const outFn = temporaryFile({extension: `${parsed.ext}`})

  // Check whether we have enough space on the temp filesystem,
  // and on the target file's filesystem.
  const hasTempSpace = await checkSufficientDiskSpace(path.dirname(outFn))
  const hasOutSpace = await checkSufficientDiskSpace(path.dirname(filepath))
  if (!hasTempSpace || !hasOutSpace) {
    throw new Error(`out of disk space (${[!hasTempSpace ? 'temp' : '', !hasOutSpace ? 'output' : ''].filter(n => n).join(', ')})`)
  }
  
  const cmd = ['ffmpeg', '-y', '-i', `${filepath}`, '-metadata:s:a:0', `RATING=${newRating == null ? '' : newRating}`, '-c', 'copy', `${outFn}`]
  const res = await runCommand(cmd)
  if (res.exitCode !== 0) {
    throw new Error('ffmpeg: non-zero exit code')
  }
  if (!await fileExists(outFn)) {
    throw new Error('ffmpeg: no output file')
  }
  const outStat = await fs.stat(outFn)
  if (outStat.size === 0) {
    throw new Error('ffmpeg: output file size is zero')
  }
  const inStat = await fs.stat(filepath)
  const newFn = path.format({...parsed, name: `_${parsed.name}`, base: `_${parsed.base}`})

  // Actually replace the file. We first move it right next to the same location.
  // Then we actually replace the original file.
  await fs.utimes(outFn, inStat.atime, inStat.mtime)
  try {
    await fs.rename(outFn, newFn)
    await fs.rename(newFn, filepath)
  }
  catch (err) {
    // If something went wrong at this point, clean up the temp files.
    try {
      await fs.unlink(outFn)
    }
    catch {}
    try {
      await fs.unlink(newFn)
    }
    catch {}
    throw err
  }
}

/**
 * Takes a filename from the Winamp Media Library and attempts to create a resolvable name.
 * 
 * This turns e.g. M:\Music\MyFile.mp3 into /path/to/Music/MyFile.mp3.
 */
function getNativeResolvablePath(filename, config) {
  const mappings = Object.entries(config.pathMappings)
  if (mappings.length === 0) {
    // If there are no mappings, we'll just return the result as-is and check if it exists later.
    // Obviously this only works on Windows.
    return {
      filepath: filename,
      isResolvable: true,
    }
  }
  for (const [key, value] of mappings) {
    if (filename.startsWith(key)) {
      return {
        filepath: `${value}${filename.slice(key.length)}`.replaceAll('\\', '/'),
        isResolvable: true,
      }
    }
  }
  return {
    filepath: null,
    isResolvable: false,
  }
}

/**
 * Returns the new rating value to write back to the file.
 * 
 * Takes the rating value from the Winamp Media Library.
 * 
 * Rating values will be written as values 1-5.
 */
function getNewRatingValue(winampRatingValue) {
  // Amazingly, if you set the rating to 0, it becomes the max 32-bit unsigned integer.
  if (winampRatingValue === 4294967295) {
    return null
  }
    // 32-bit unsigned integer
  if (winampRatingValue <= 5) {
    return Math.min(Math.max(Math.round(winampRatingValue), 0), 5)
  }
  return Math.round(Math.round(Math.min(Math.max(winampRatingValue, 0), 100)) / 20)
}

/**
 * nde_opus_fix.js
 * 
 * This ties everything together as a single script. This does the following:
 * 
 *   * loads the config file (to see where the Winamp Music Library can be found)
 *   * loads the Music Library database
 *   * finds files that can potentially be updated
 *   * for each file; checks if the rating is already set, and if not, updates the file
 * 
 * Eligible files must have a .opu or .opus extension, and the rating must be set in the Music Library.
 * 
 * ffmpeg is used to save the file metadata.
 */
async function main() {
  const config = getCliArguments()
  await checkPrerequisites()

  const ndeReader = NDE.load(config.dat, config.idx)
  const library = ndeReader.readAll()

  // Get the rateable items; must be an Opus file, and must have a non-zero rating.
  const rateable = library.filter(item => (item.filename.endsWith('.opus') || item.filename.endsWith('.opu')) && item.rating > 0)
  
  // Keep track of how many files we've processed.
  const state = {
    items: rateable.length,
    processedItems: 0,
    skippedItems: 0,
    erroredItems: 0,
    start: Date.now(),
  }

  for (const item of rateable) {
    try {
      const resolvedPath = getNativeResolvablePath(item.filename, config)
      if (!resolvedPath.isResolvable) {
        // If we can't figure out where this file is supposed to be located, skip it.
        state.skippedItems += 1
        continue
      }
      const filepath = resolvedPath.filepath
      const filedir = path.parse(filepath).dir
      if (!await fileExists(filepath)) {
        throw new Error('file does not exist')
      }
      if (!await fileIsWritable(filepath)) {
        throw new Error('file is not writable')
      }
      if (!await fileIsWritable(filedir)) {
        throw new Error('containing dir is not writable')
      }
      const newValue = getNewRatingValue(item.rating)
      const oldRating = await readFileRating(filepath)

      if (oldRating === newValue) {
        state.skippedItems += 1
        continue
      }

      await writeFileRating(filepath, oldRating, newValue)
      state.processedItems += 1
    }
    catch (err) {
      console.error(`nde_opus_fix.js: ${String(err)}: ${item.filename}`)
      state.erroredItems += 1
    }
  }

  const elapsed = (Date.now() - state.start) / 1000 / 60
  console.log(`nde_opus_fix.js: total files ${state.items}, processed=${state.processedItems} skipped=${state.skippedItems} errored=${state.erroredItems}; elapsed time is ${elapsed < 1 ? '>1' : elapsed.toFixed(1)} min`)
}

main()
