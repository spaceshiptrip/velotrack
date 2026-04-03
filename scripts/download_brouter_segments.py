#!/usr/bin/env python3
"""
VeloTrack — BRouter Segment Downloader
Downloads routing data tiles for your region.

Usage:
    python scripts/download_brouter_segments.py --region north-america-west
    python scripts/download_brouter_segments.py --bbox -125 49 -121 50   (lon_min lat_min lon_max lat_max)

Segment grid reference: https://brouter.de/brouter/segments4/
Each .rd5 file covers a 5°×5° tile named E{lon}_{N|S}{lat}.rd5
(e.g., W125_N50.rd5 for Vancouver BC area)
"""
import os
import sys
import math
import argparse
import urllib.request
from pathlib import Path

BASE_URL = "https://brouter.de/brouter/segments4"

REGIONS = {
    "north-america-west": [(-130, 30, -100, 60)],
    "north-america-east": [(-100, 25, -60, 55)],
    "western-europe":     [(-10, 35, 30, 60)],
    "central-europe":     [(5, 45, 25, 55)],
    "uk-ireland":         [(-10, 50, 5, 60)],
    "australia":          [(110, -45, 155, -10)],
    "japan":              [(128, 30, 148, 46)],
    "pacific-northwest":  [(-125, 47, -119, 51)],   # Seattle / Vancouver
    "california":         [(-125, 32, -114, 43)],
}


def tile_name(lon: int, lat: int) -> str:
    lon_dir = "W" if lon < 0 else "E"
    lat_dir = "S" if lat < 0 else "N"
    lon_base = (abs(lon) // 5) * 5
    lat_base = (abs(lat) // 5) * 5
    return f"{lon_dir}{lon_base}_{lat_dir}{lat_base}.rd5"


def tiles_for_bbox(lon_min, lat_min, lon_max, lat_max):
    tiles = set()
    lon = int(math.floor(lon_min / 5) * 5)
    while lon < lon_max:
        lat = int(math.floor(lat_min / 5) * 5)
        while lat < lat_max:
            tiles.add(tile_name(lon, lat))
            lat += 5
        lon += 5
    return sorted(tiles)


def download_segment(tile: str, dest_dir: Path, force: bool = False):
    dest = dest_dir / tile
    if dest.exists() and not force:
        print(f"  ✓ {tile} already present ({dest.stat().st_size // 1024} KB)")
        return True

    url = f"{BASE_URL}/{tile}"
    print(f"  ↓ Downloading {tile}...", end=" ", flush=True)
    try:
        urllib.request.urlretrieve(url, dest)
        size_kb = dest.stat().st_size // 1024
        print(f"done ({size_kb} KB)")
        return True
    except Exception as e:
        print(f"FAILED: {e}")
        if dest.exists():
            dest.unlink()
        return False


def main():
    parser = argparse.ArgumentParser(description="Download BRouter routing segments")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--region", choices=REGIONS.keys(), help="Named region preset")
    group.add_argument("--bbox", nargs=4, type=float, metavar=("LON_MIN", "LAT_MIN", "LON_MAX", "LAT_MAX"))
    parser.add_argument("--dest", default="./docker/brouter/segments", help="Destination directory")
    parser.add_argument("--force", action="store_true", help="Re-download existing files")
    args = parser.parse_args()

    dest_dir = Path(args.dest)
    dest_dir.mkdir(parents=True, exist_ok=True)

    if args.region:
        bboxes = REGIONS[args.region]
        print(f"Region: {args.region} ({len(bboxes)} bounding box(es))")
    else:
        bboxes = [tuple(args.bbox)]
        print(f"Custom bbox: {bboxes[0]}")

    all_tiles = set()
    for bbox in bboxes:
        all_tiles.update(tiles_for_bbox(*bbox))

    print(f"Tiles to download: {len(all_tiles)}")
    print(f"Destination: {dest_dir.resolve()}")
    print()

    ok = sum(download_segment(t, dest_dir, args.force) for t in sorted(all_tiles))
    print(f"\n✓ {ok}/{len(all_tiles)} segments ready in {dest_dir}")
    print("\nTo use with Docker, mount the segments dir:")
    print(f"  volumes:\n    - {dest_dir.resolve()}:/brouter/segments")


if __name__ == "__main__":
    main()
