[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/) [![MIT license](https://img.shields.io/badge/license-MIT-brightgreen.svg)](https://opensource.org/licenses/MIT)

# @dada78641/nde_opus_fix

Script that updates .opus files to add a `RATING` tag according to its given rating in the Winamp Media Library.

This script fixes a very specific issue: Winamp's [in_opus](https://github.com/RamonUnch/in_opus) plugin is unable to edit file metadata tags. Which means files can't be rated through the Winamp interface, even though the given ratings do get saved in the Winamp Media Library database.

When run, this script loads the Winamp Media Library database and updates all .opus files referenced to have a persistent rating in the metadata. Rating values work weirdly and inconsistently between programs—this script uses integers 1-5, which work for the Winamp Media Library.

Uses the [node-nde](https://github.com/Wiiseguy/node-nde) library to scan the Media Library plugin database, and [FFmpeg](https://www.ffmpeg.org/) to update tags.

Designed to run from a system other than Windows, for Winamp running in Wine or in a VM.

## Usage

Run as follows:

```sh
nde_opus_fix.js "/path/to/main.dat" "/path/to/main.idx" --map "M:\\":"/path/to/music/"
```

The `main.dat` and `main.idx` files are normally located in `Winamp/[user]/Plugins/ml/`.

The `--map` argument is used to rewrite paths from Windows to Unix.

## License

MIT licensed.
