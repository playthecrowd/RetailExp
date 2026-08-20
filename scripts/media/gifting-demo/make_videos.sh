#!/bin/bash
# One output frame per input frame: zoompan's d= is frames-per-input-frame, and
# leaving it at 240 multiplied 240 input frames into 57600 - a 1920 second clip.
# d=1 with the zoom driven by the output frame number is the correct form.
set -e
cd "C:/Users/cotye/Videos/GiftingDemoAssets"
mkdir -p out/video
build () {
  name="$1"; src="$2"
  ffmpeg -y -v error -loop 1 -framerate 30 -t 8 -i "out/stills/$src.png" \
    -vf "scale=1350:2400,zoompan=z='1.0+0.10*on/239':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=30,fade=t=in:st=0:d=0.7,fade=t=out:st=7.2:d=0.8,format=yuv420p" \
    -c:v libx264 -profile:v high -preset medium -crf 21 -g 30 -movflags +faststart -an \
    "out/video/$name.mp4"
  echo "built $name"
}
build brand-intro poster-brand-intro
build sender-gift-message poster-gift-reveal
build standard-gift poster-standard-gift
build ai-gift poster-ai-gift
echo ALLDONE
