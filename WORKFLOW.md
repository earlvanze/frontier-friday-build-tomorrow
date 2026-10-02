# Kinetic-typography music video — workflow

A repeatable process for code-rendered kinetic-typography videos at the quality bar of `pdoom-video`. Words are the
material: every word lands on its sung onset, the phrase is built into a typographic object that does what the words say, the camera holds and then snaps on the beat, and the export averages sub-frames for real motion blur.

Template: `~/Videos/kinetic-template/`. The engine is the MIT-licensed `pdoom-video` renderer (`LICENSE-pdoom-engine`);
none of that song's content is included.

## 0. Scaffold
```sh
~/Videos/kinetic-template/new-project.sh ~/Videos/<show>-<date>/workflow/<show>-kinetic
```
Use a folder name **without a version number**. Renders are versioned inside `out/`. (A versioned folder name once got a
whole project swept up in a cleanup of old versions.)

## 1. Lock the inputs (no visuals before this)
- **One final audio master** (WAV), with its path and checksum written down. Every audio change means re-running step 2.
  Most churn on Wealth Wednesday came from re-timing against masters v14 → v16 → v22 → a seam fix.
- **One reviewed line transcript**: only what is actually sung, in order.
  - `transcript.json`: `[{"text", "start", "end", "section"}]` with approximate cues (±3 s is fine), **or**
  - native word timing (e.g. Suno aligned words grouped into lines): `[{"text", "words": [{"word", "start", "end"}]}]`.

## 2. Timing
```sh
cd analysis
./prep.sh <master.wav> align  ../transcript.json        # forced alignment (MMS_FA on the Demucs vocal stem)
./prep.sh <master.wav> native ../native-lines.json      # or: trust native word timing
SECTIONS='verse1:First line text,chorus1:Chorus first line' ./prep.sh ...   # optional section names
```
Outputs: `data/lyrics.json`, `data/audio.json` (dynamic beat grid, downbeats, 100 fps envelopes, kick/snare/hat/vocal
onsets) and `audio/master.m4a`. **Review:** `check.py` prints suspect lines (no vocal energy at the aligned line). Spot-check
seams and joins against the audio provenance. Pin a word by hand only from documented evidence, and record it in `TIMING.md`.

## 3. Treatment (one page, `STORYBOARD.md`)
- The central metaphor: what the words become.
- Palette, set in `app/src/project/palette.ts`: background, type, **one signal colour** (the sung word, and the only thing
  that blooms), one rare accent owned by a single motif.
- Type roles: Archivo across its width axis (62–125) for the voice, Plex Mono for annotations, tallies and typed text,
  Cormorant italic for the storyteller register.
- Branding in `app/src/project/brand.ts`: end card, host, tagline, background vocabulary.

## 4. Storyboard → `app/src/project/script.ts`
A list of `[shot, lineCount, options]` that covers every lyric line in order (the director warns otherwise). Cuts land on
the beat before each shot's first word (never more than 0.3 s early). Aim for a new composition every 1–4 lines, recurring
compositions for recurring lyrics (choruses), and a bespoke shot for each of the song's 4–8 biggest images.

### Library shots (`app/src/scenes/shots.ts`)
| kind | lines | what it does | options |
|---|---|---|---|
| `slam` | 1–4 | justified block; rows alternate width/weight, words slam in, camera frames rows sung so far | `maxChars`, `width`, `styles: [[width,weight],…]`, `rule`, `tilt` |
| `anchor` | 2–8 | a repeated head word or words hold; tails slam in and older tails shrink and roll away | `head` (word count), `headSize`, `tailWidth`, `tailWidths`, `counter`, `rise`, `zoomStep`, `tilt` |
| `stair` | 1 | each word on its own step slab with a lit edge; the camera climbs | `stepX`, `stepY`, `label`, `zoom` |
| `path` | 1–3 | stepping stones on a road that lights up as it is sung | — |
| `generations` | 2 | a course that bends upward after line 1; the camera rotates with it | — |
| `title` | 1 | the last two words drop letter by letter, the lead words are typed, with rays | `variant: 0/1` |
| `blueprint` | 1–2 | paper sheet; outlines drafted with dimension lines, filled on the onset | `key: [words]`, `label`, `maxChars` |
| `serif` | 1–3 | storyteller lines in Cormorant italic; glyphs rise with their words | `size`, `gold`, `stars`, `weight` |
| `legacy` | 3–4 | stacked slams, then the final word written in large serif italic | — |
| `ledger` | 2–3 | typed mono rows with a cursor and tallies; the last word is signed in serif | — |
| `door` | 1–2 | the words on a door panel that swings open onto light; line 2 flies out of it | — |
| `house` | 2–3 | outlined roof and lit windows, pull-back onto a skyline, width-stretch, foundation blocks | — |
| `ceiling` | 1–2 | rows stack upward and push a lit bar, which the last word cracks | `label`, `maxChars` |
| `pillars` | 3 | three columns of vertical type, then a pediment | — |
| `tree` | 2 | a seed, then a branching tree; line 2 climbs the canopy | — |
| `search` | 2 | a spotlight finds each sung word in a dim field of vocabulary (`BRAND.field`) | — |
| `network` | 2–3 | nodes, edges and multiplying satellites | — |
| `grid` | 1–2 | scattered letters spring into a strict grid | — |
| `clock` | 1 | words on a dial, the hand sweeps, the last word slams at the centre | — |
| `key` | 3 | a key drawn in strokes travels; options fan out from its tip | — |
| `higher` | 1 | the last word's letters stack upward as the camera climbs | — |
| `outro` | 1 | the final word in serif, then the brand end card, fade | `card` (time) |

Project shots go in `app/src/project/shots.ts` (`EXTRA`) and override library names. Build them from the exported helpers
(`word`, `fitRow`, `rows`, `cam`, `slam`, `txt`, `wordsOf`, `isSmall`) and from `kit.ts` (`snapCam`, `heat`, `appear`,
`drawLetters`, `sizeFor`, `note`, `rule`). Rules for every shot:
- **Deterministic:** a pure function of `s.t`. No `Math.random()` and no state. Use `hash`, `mulberry32` and `noise1`.
- **Sync:** words appear and highlight at `w.start` (`appear`, `heat`, `slam`). Never run ahead of the voice.
- **Motion:** hold, then snap (`ease.outExpo`, springs). No floating drift. Move the camera with `snapCam` on onsets.
- **Glow discipline:** only signal and ember go on the glow layer `s.g`. Type stays crisp.
- **Framing:** keep type ≥ 96 px from the frame edges once the camera settles.

## 5. Iterate on contact sheets
```sh
cd app
bun scripts/render.ts sheet --times 4,12.5,20 --cols 4 --out ../out/wip/s1.png   # then look at it
```
Check every shot at mid-phrase and at its last word: collisions, cropped words, empty frames, unreadable sizes,
over-bright glow or flashes. Sheets of 12–24 frames render in about 30 s.

## 6. Motion test
`bun scripts/render.ts video --from A --to B --fps 30 --samples auto --max-samples 36 --shutter 0.5 --preset veryfast --out ../out/wip/clip.mp4`
Tile consecutive frames (`ffmpeg … -vf "select='between(n,40,47)',tile=4x2"`) to judge the blur and the snaps.

## 7. Final render + QA
```sh
./render-full.sh <show>-kinetic-v1.mp4            # segments → concat → mux with the locked master → qa.sh
```
`qa/report.md` must show PASS: H.264 1920×1080, AAC stereo, frame count within one frame of the master, and a clean full decode.
Also look at `qa/contact-sheet.jpg` and listen to the start, the joins and the ending. Write `README.md`, `STORYBOARD.md`
and `TIMING.md` next to the deliverable.

## Machine notes (AMD Navi 14, Arch, headless Chromium)
- GL: `--use-angle=gl-egl --ozone-platform=headless` (the default in `render.ts`). The Vulkan backend loses its context here.
- Headless screenshots don't capture the WebGL canvas, so stills and sheets use the engine's pixel readback plus ffmpeg.
- `readRenderTargetPixelsAsync` fails intermittently under ANGLE-GLES. `engine.ts` falls back to a synchronous read.
- About 40 parallel font fetches exhaust Chromium's resource pool, so fonts load in batches of 4.
- Only one export at a time: a second instance times out while booting. `render-full.sh` runs the segments in sequence.
- Speed: about 4–8 fps at 1080p30 with `--samples auto --max-samples 12` (still frames need 4 sub-frames, fast moves 12).
