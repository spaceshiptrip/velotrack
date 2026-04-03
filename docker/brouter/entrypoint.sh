#!/bin/sh
# BRouter entrypoint - auto-downloads segments for specified bounding boxes
# Set BROUTER_SEGMENTS env var to comma-separated lat/lon boxes like "E5_N50,E6_N50"

SEGMENTS_BASE="https://brouter.de/brouter/segments4"

if [ -n "$BROUTER_DOWNLOAD_SEGMENTS" ]; then
  echo "Downloading BRouter segments: $BROUTER_DOWNLOAD_SEGMENTS"
  IFS=',' read -ra SEGS <<< "$BROUTER_DOWNLOAD_SEGMENTS"
  for seg in "${SEGS[@]}"; do
    seg=$(echo "$seg" | xargs)
    if [ ! -f "/brouter/segments/$seg.rd5" ]; then
      echo "Downloading $seg.rd5..."
      wget -q "$SEGMENTS_BASE/$seg.rd5" -O "/brouter/segments/$seg.rd5" || \
        echo "Warning: Could not download $seg.rd5"
    else
      echo "Segment $seg.rd5 already present"
    fi
  done
fi

exec java ${JAVA_OPTS:--Xmx512m -Xms128m} \
  -jar BRouter.jar \
  17777 \
  4 \
  /brouter/segments \
  /brouter/profiles
