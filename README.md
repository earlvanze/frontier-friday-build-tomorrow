# Build Tomorrow — Frontier Friday kinetic typography

Source for **Build Tomorrow**, a three-minute kinetic-typography music video published on the Earl Co YouTube channel as part of Frontier Friday.

▶ **Watch:** https://youtu.be/MsJjs7IH2HY

## How it was created

This video was built as a code-rendered kinetic-typography production:

1. A final audio master and reviewed lyric transcript established the source of truth.
2. Native word timings and audio analysis generated beat, onset, and lyric timing data.
3. A storyboard translated the song into a sequence of branded typographic scenes.
4. Type, motion, camera moves, and visual effects were authored in TypeScript/WebGL.
5. The renderer exported motion-blurred H.264 segments, which were joined with the audio master.
6. The final 1080p master was fully decoded and checked for duration, frame count, codec, and audio integrity before publication.

The public repository intentionally excludes the audio master, source-media assets, generated render files, and local dependency folders. Add your own authorized audio and timing inputs to render a derivative project.

## Repository layout

- `app/` — TypeScript/WebGL rendering application and scene system.
- `analysis/` — alignment, audio-analysis, and timing preparation tools.
- `native-lines.json` — timed lyric/line data used by this project.
- `STORYBOARD.md` — visual treatment and shot plan.
- `TIMING.md` — timing decisions and provenance notes.
- `WORKFLOW.md` — repeatable end-to-end production workflow.
- `render-full.sh` — segmented final-render and mux script.
- `qa.sh` — deterministic probe, decode, duration, loudness, and checksum QA script.

## Requirements

- Bun
- FFmpeg / FFprobe
- Python 3.12 and [uv](https://docs.astral.sh/uv/)
- A supported graphics environment for the renderer

Install the application dependencies:

```bash
cd app
bun install
```

Set up the analysis environment:

```bash
cd analysis
uv sync
```

## Rendering

The project-specific production sequence is documented in [`WORKFLOW.md`](WORKFLOW.md). The final render command is:

```bash
./render-full.sh
```

It expects authorized local input media and analysis outputs at the paths described in the workflow. It renders bounded segments, concatenates them, muxes the audio, and runs [`qa.sh`](qa.sh) automatically.

## License

The included `pdoom-video` rendering engine is available under the MIT license in [`LICENSE-pdoom-engine`](LICENSE-pdoom-engine). Other project materials remain subject to their respective rights and permissions. Do not reuse music, lyrics, visual identity, or other assets without authorization.
