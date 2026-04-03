#!/usr/bin/env python3
"""
VeloTrack — Garmin Auth Helper
Run this ONCE to authenticate with Garmin Connect and save tokens.
The Docker container will reuse the saved tokens automatically.

Usage:
    python scripts/garmin_auth.py

Tokens are saved to: ./garmin_tokens/  (mounted into the container)
"""
import getpass
import os
import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))
os.chdir(Path(__file__).parent.parent / "backend")

from dotenv import load_dotenv
load_dotenv("../.env")

TOKEN_PATH = Path("../garmin_tokens")
TOKEN_PATH.mkdir(exist_ok=True)


def main():
    try:
        from garminconnect import Garmin
    except ImportError:
        print("Install garminconnect: pip install garminconnect")
        sys.exit(1)

    print("VeloTrack — Garmin Authentication")
    print(f"Tokens will be saved to: {TOKEN_PATH.resolve()}")
    print()

    # Try existing tokens first
    try:
        client = Garmin()
        client.login(str(TOKEN_PATH))
        print("✓ Already authenticated with saved tokens!")
        name = client.get_full_name()
        print(f"  Logged in as: {name}")
        return
    except Exception:
        pass

    # Prompt for credentials
    email = input("Garmin email: ").strip()
    password = getpass.getpass("Garmin password: ")

    client = Garmin(email=email, password=password, return_on_mfa=True)

    print("Logging in...")
    result = client.login()

    # Handle MFA
    if isinstance(result, tuple) and result[0] == "needs_mfa":
        mfa_code = input("MFA code (check your email/phone): ").strip()
        client.resume_login(result[1], mfa_code)

    # Save tokens
    client.garth.dump(str(TOKEN_PATH))
    print(f"✓ Logged in and tokens saved to {TOKEN_PATH.resolve()}")
    print()
    print("The Docker container will now use these tokens automatically.")
    print("Restart the backend: docker compose restart backend worker scheduler")


if __name__ == "__main__":
    main()
