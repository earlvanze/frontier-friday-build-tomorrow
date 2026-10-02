#!/usr/bin/env bash
# Final render: sequential segments (parallel instances time out booting on a single GPU), lossless concat, mux
# with the locked master, then QA. Re-runnable: finished segments are kept.
#   ./render-full.sh <out-name.mp4> [fps=30] [segment-seconds=60] [max-samples=12]
set -euo pipefail
# CPU-only render: force Chromium WebGL through SwiftShader and disable hardware GPU access.
# This protects the active Claude background renders using the physical GPU.
export PDOOM_GL_ARGS="${PDOOM_GL_ARGS:---use-gl=swiftshader --disable-gpu --ozone-platform=headless}"
P=$(cd "$(dirname "$0")" && pwd); NAME=$1; FPS=${2:-30}; SEG=${3:-60}; MAXS=${4:-12}
printf 'Render backend: CPU-only Chromium/SwiftShader (%s)\n' "$PDOOM_GL_ARGS"
M=$(cat "$P/analysis/work/MASTER")
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$M")
mkdir -p "$P/out/final/segs"; cd "$P/app"
: > "$P/out/final/segs/list.txt"
i=0; from=0
while python3 -c "import sys; sys.exit(0 if $from < $DUR - 1e-6 else 1)"; do
  to=$(python3 -c "print(min($DUR, $from + $SEG))")
  f=$(printf "%s/out/final/segs/seg-%03d.mp4" "$P" $i)
  if [ ! -s "$f.ok" ]; then
    for try in 1 2 3; do
      timeout 14400 bun scripts/render.ts video --from $from --to $to --fps $FPS --samples auto --max-samples $MAXS --shutter 0.5 --crf 16 --preset slow --noaudio --out "$f" > "$f.log" 2>&1 && grep -q "^wrote" <(tr "\r" "\n" < "$f.log") && { echo ok > "$f.ok"; break; }
      echo "segment $i attempt $try failed (see $f.log)"
    done
    [ -s "$f.ok" ] || exit 1
  fi
  echo "file '$f'" >> "$P/out/final/segs/list.txt"
  i=$((i+1)); from=$to
done
ffmpeg -v error -y -f concat -safe 0 -i "$P/out/final/segs/list.txt" -c copy "$P/out/final/silent.mp4"
ffmpeg -v error -y -i "$P/out/final/silent.mp4" -i "$M" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 320k -ar 48000 -movflags +faststart "$P/out/final/$NAME"
"$P/qa.sh" "$P/out/final/$NAME"
