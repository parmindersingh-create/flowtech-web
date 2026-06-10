"""
eSSL Full Attendance Sync - TINY BATCHES (100 records)
For slow servers with timeout issues.

Pushes employees + all attendance records from a local eSSL biometric
device to the VMC Job Shop cloud server.
"""

import sys
import time

try:
    from zk import ZK
except ImportError:
    print("Run: pip install pyzk")
    sys.exit(1)

try:
    import requests
except ImportError:
    print("Run: pip install requests")
    sys.exit(1)

# ============ CONFIGURATION ============
DEVICE_IP = "192.168.0.201"
DEVICE_PORT = 4370

# Server endpoint (URL only — no "POST" prefix in the string!)
CLOUD_API_URL = "https://entry-manager-28.preview.emergentagent.com/api/attendance/push-sync"

# API key required by the server (sent as X-API-Key header)
API_KEY = "shopfloor2024sync"

# Very small batch to avoid timeout
BATCH_SIZE = 100
# Per-request HTTP timeout (seconds)
HTTP_TIMEOUT = 30
# =======================================

HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
}


def sync_all_attendance():
    print("=" * 50)
    print("eSSL FULL Sync - TINY BATCHES (100 records)")
    print("=" * 50)
    print(f"Device: {DEVICE_IP}:{DEVICE_PORT}")
    print(f"Server: POST {CLOUD_API_URL}")

    zk = ZK(DEVICE_IP, port=DEVICE_PORT, timeout=30)
    conn = None

    try:
        print("\nConnecting to device...")
        conn = zk.connect()
        conn.disable_device()
        print("Connected!")

        print("\nFetching all users...")
        users = conn.get_users()
        print(f"Total users: {len(users)}")

        print("\nFetching ALL attendance records...")
        attendance = conn.get_attendance()
        print(f"Total records: {len(attendance)}")

        if len(attendance) == 0:
            print("\nNo records found!")
            conn.enable_device()
            return

        dates = [att.timestamp for att in attendance]
        min_date = min(dates).strftime("%Y-%m-%d")
        max_date = max(dates).strftime("%Y-%m-%d")
        print(f"Date range: {min_date} to {max_date}")

        # Build {biometric_id -> name} map for stamping the punch records
        name_by_id = {
            str(u.user_id): (u.name or f"Employee {u.user_id}").strip()
            for u in users
        }

        # Build the unified `records` payload the server expects.
        # Server contract (routes/attendance.py /api/attendance/push-sync):
        #   { "records": [ {biometric_id, name, date, time}, ... ] }
        records = []
        for att in attendance:
            bid = str(att.user_id)
            records.append({
                "biometric_id": bid,
                "name": name_by_id.get(bid, f"Employee {bid}"),
                "date": att.timestamp.strftime("%Y-%m-%d"),
                "time": att.timestamp.strftime("%H:%M:%S"),
            })

        conn.enable_device()

        # Optional: send one tiny "employees seed" batch so any user that
        # never punched still shows up in biometric_employees.
        print(f"\nSeeding {len(name_by_id)} employees...")
        seed_records = [
            {"biometric_id": bid, "name": nm,
             "date": "1970-01-01", "time": "00:00:00"}
            for bid, nm in name_by_id.items()
        ]
        try:
            resp = requests.post(
                CLOUD_API_URL,
                headers=HEADERS,
                json={"records": seed_records},
                timeout=HTTP_TIMEOUT,
            )
            if resp.status_code == 200:
                print(f"  Employees: OK ({resp.json().get('synced', 0)} new)")
            else:
                print(f"  Employees: FAILED ({resp.status_code}) {resp.text[:200]}")
        except Exception as e:
            print(f"  Employees: ERROR ({e})")

        time.sleep(1)

        # Send attendance records in tiny batches
        print(f"\nSyncing {len(records)} records in batches of {BATCH_SIZE}...")

        total_synced = 0
        failed = 0
        total_batches = (len(records) + BATCH_SIZE - 1) // BATCH_SIZE

        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i + BATCH_SIZE]
            batch_num = (i // BATCH_SIZE) + 1

            pct = int(batch_num / total_batches * 100)
            print(f"\r  [{pct:3d}%] Batch {batch_num}/{total_batches}...",
                  end=" ", flush=True)

            success = False
            for attempt in range(5):  # 5 retries
                try:
                    resp = requests.post(
                        CLOUD_API_URL,
                        headers=HEADERS,
                        json={"records": batch},
                        timeout=HTTP_TIMEOUT,
                    )
                    if resp.status_code == 200:
                        total_synced += resp.json().get("synced", len(batch))
                        success = True
                        break
                    elif resp.status_code == 401:
                        # API key issue — no point retrying
                        print(f"AUTH FAIL ({resp.text[:120]})", end="")
                        break
                    elif resp.status_code == 504:
                        time.sleep(3)  # Wait longer on gateway timeout
                    else:
                        time.sleep(1)
                except Exception:
                    time.sleep(2)

            if not success:
                failed += 1
                print("FAIL", end="")

            time.sleep(0.3)  # Small delay between batches

        print(f"\n\n{'=' * 50}")
        print("SYNC COMPLETE!")
        print(f"{'=' * 50}")
        print(f"  Employees: {len(name_by_id)}")
        print(f"  Records synced (new): {total_synced}")
        print(f"  Failed batches: {failed}")
        print(f"  Date range: {min_date} to {max_date}")

    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if conn:
            try:
                conn.enable_device()
                conn.disconnect()
            except Exception:
                pass

    input("\nPress Enter to exit...")


if __name__ == "__main__":
    sync_all_attendance()
