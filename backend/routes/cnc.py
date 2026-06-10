"""CNC Machine Monitoring API Routes"""
from fastapi import APIRouter, HTTPException, Request, Depends
from datetime import datetime, timedelta
from typing import Optional
import logging
import csv
from io import StringIO

from utils.database import get_db, get_ist_now, IST
from utils.dependencies import User, get_current_user, get_optional_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cnc", tags=["cnc"])


# Helper functions
def safe_int(val, default=0):
    """Safely convert value to int"""
    try:
        if val is None or val == "":
            return default
        return int(float(str(val).strip()))
    except:
        return default


def safe_float(val, default=0.0):
    """Safely convert value to float"""
    try:
        if val is None or val == "":
            return default
        return float(str(val).strip())
    except:
        return default


@router.post("/push-status")
async def cnc_push_status(request: Request):
    """
    Receive live status update from CNC monitoring script.
    Called frequently (every few seconds) with current machine state.
    """
    db = get_db()
    try:
        data = await request.json()
        machine_id = data.get("machine_id", "FANUC-01")
        
        machine_data = {
            "machine_id": machine_id,
            "name": data.get("name", machine_id),
            "ip": data.get("ip", ""),
            "status": data.get("status", "UNKNOWN"),
            "program": data.get("program", ""),
            "tool": data.get("tool", ""),
            "spindle": data.get("spindle", 0),
            "feed": data.get("feed", 0),
            "cycle": data.get("cycle", 0),
            "last_update": get_ist_now(),
            "last_idle_time": data.get("last_idle_time"),
        }
        
        await db.cnc_machines.update_one(
            {"machine_id": machine_id},
            {"$set": machine_data},
            upsert=True
        )
        
        return {"success": True, "message": "Status updated"}
    except Exception as e:
        logger.error(f"CNC push-status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/push-event")
async def cnc_push_event(request: Request):
    """
    Receive event from CNC monitoring script.
    Events: START, STOP, TOOL_CHANGE, PROGRAM_CHANGE, ALARM, IDLE_START
    """
    db = get_db()
    try:
        data = await request.json()
        machine_id = data.get("machine_id", "FANUC-01")
        
        event = {
            "machine_id": machine_id,
            "event_type": data.get("event_type", "UNKNOWN"),
            "timestamp": get_ist_now(),
            "local_time": data.get("time", ""),
            "cycle": data.get("cycle"),
            "program": data.get("program", ""),
            "tool": data.get("tool", ""),
            "prev_tool": data.get("prev_tool"),
            "spindle": data.get("spindle", 0),
            "feed": data.get("feed", 0),
            "duration": data.get("duration"),
            "info": data.get("info", ""),
            "tool_summary": data.get("tool_summary", []),
        }
        
        await db.cnc_events.insert_one(event)
        
        status_map = {
            "START": "RUNNING",
            "STOP": "IDLE",
            "IDLE_START": "IDLE",
            "ALARM": "ALARM",
        }
        if event["event_type"] in status_map:
            await db.cnc_machines.update_one(
                {"machine_id": machine_id},
                {"$set": {
                    "status": status_map[event["event_type"]],
                    "last_update": get_ist_now(),
                    "program": event["program"],
                    "tool": event["tool"],
                    "spindle": event["spindle"],
                    "feed": event["feed"],
                    "cycle": event["cycle"],
                }}
            )
        
        return {"success": True, "event_id": str(event.get("_id", ""))}
    except Exception as e:
        logger.error(f"CNC push-event error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/push-program")
async def cnc_push_program(request: Request):
    """
    Receive NC program code from CNC monitoring script.
    Stores the full program text for viewing in app.
    """
    db = get_db()
    try:
        data = await request.json()
        machine_id = data.get("machine_id", "FANUC-01")
        program_no = data.get("program_no", "")
        program_code = data.get("program_code", "")
        
        program_data = {
            "machine_id": machine_id,
            "program_no": program_no,
            "program_name": data.get("program_name", program_no),
            "program_code": program_code,
            "uploaded_at": get_ist_now(),
            "file_size": len(program_code),
            "line_count": len(program_code.split('\n')),
        }
        
        await db.cnc_programs.update_one(
            {"machine_id": machine_id, "program_no": program_no},
            {"$set": program_data},
            upsert=True
        )
        
        await db.cnc_program_runs.insert_one({
            "machine_id": machine_id,
            "program_no": program_no,
            "loaded_at": get_ist_now(),
        })
        
        return {"success": True, "message": f"Program {program_no} saved"}
    except Exception as e:
        logger.error(f"CNC push-program error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/push-cycle-summary")
async def cnc_push_cycle_summary(request: Request):
    """Receive cycle completion summary from CNC monitoring script."""
    db = get_db()
    try:
        data = await request.json()
        machine_id = data.get("machine_id", "FANUC-01")
        
        summary = {
            "machine_id": machine_id,
            "date": get_ist_now().strftime("%Y-%m-%d"),
            "cycle": data.get("cycle"),
            "program": data.get("program", ""),
            "start_time": data.get("start_time", ""),
            "end_time": data.get("end_time", ""),
            "duration_seconds": data.get("duration_seconds", 0),
            "tools_used": data.get("tools_used", []),
            "created_at": get_ist_now(),
        }
        
        await db.cnc_cycle_summaries.insert_one(summary)
        
        return {"success": True, "message": "Cycle summary saved"}
    except Exception as e:
        logger.error(f"CNC push-cycle-summary error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines")
async def cnc_get_machines():
    """Get all CNC machines with current status."""
    db = get_db()
    try:
        machines = await db.cnc_machines.find().to_list(100)
        for m in machines:
            m["_id"] = str(m["_id"])
            if m.get("last_update"):
                m["last_update"] = m["last_update"].isoformat()
        return machines
    except Exception as e:
        logger.error(f"CNC get-machines error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}")
async def cnc_get_machine(machine_id: str):
    """Get single CNC machine status."""
    db = get_db()
    try:
        machine = await db.cnc_machines.find_one({"machine_id": machine_id})
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")
        machine["_id"] = str(machine["_id"])
        if machine.get("last_update"):
            machine["last_update"] = machine["last_update"].isoformat()
        return machine
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CNC get-machine error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/events")
async def cnc_get_machine_events(machine_id: str, date: str = None, limit: int = 100):
    """Get recent events for a machine."""
    db = get_db()
    try:
        query = {"machine_id": machine_id}
        if date:
            start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=IST)
            end = start + timedelta(days=1)
            query["timestamp"] = {"$gte": start, "$lt": end}
        
        events = await db.cnc_events.find(query).sort("timestamp", -1).limit(limit).to_list(limit)
        for e in events:
            e["_id"] = str(e["_id"])
            if e.get("timestamp"):
                e["timestamp"] = e["timestamp"].isoformat()
        return events
    except Exception as e:
        logger.error(f"CNC get-events error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/programs")
async def cnc_get_machine_programs(machine_id: str):
    """Get all programs for a machine."""
    db = get_db()
    try:
        programs = await db.cnc_programs.find(
            {"machine_id": machine_id},
            {"program_code": 0}
        ).sort("uploaded_at", -1).to_list(100)
        
        for p in programs:
            p["_id"] = str(p["_id"])
            if p.get("uploaded_at"):
                p["uploaded_at"] = p["uploaded_at"].isoformat()
        return programs
    except Exception as e:
        logger.error(f"CNC get-programs error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/programs/{program_no}")
async def cnc_get_program_code(machine_id: str, program_no: str):
    """Get full program code."""
    db = get_db()
    try:
        program = await db.cnc_programs.find_one({
            "machine_id": machine_id,
            "program_no": program_no
        })
        if not program:
            raise HTTPException(status_code=404, detail="Program not found")
        program["_id"] = str(program["_id"])
        if program.get("uploaded_at"):
            program["uploaded_at"] = program["uploaded_at"].isoformat()
        return program
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"CNC get-program-code error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/machines/{machine_id}/daily-summary")
async def cnc_get_daily_summary(machine_id: str, date: str = None):
    """Get daily summary for a machine."""
    db = get_db()
    try:
        if not date:
            date = get_ist_now().strftime("%Y-%m-%d")
        
        start = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=IST)
        end = start + timedelta(days=1)
        
        cycles = await db.cnc_cycle_summaries.find({
            "machine_id": machine_id,
            "date": date
        }).to_list(1000)
        
        events = await db.cnc_events.find({
            "machine_id": machine_id,
            "timestamp": {"$gte": start, "$lt": end}
        }).sort("timestamp", -1).to_list(1000)
        
        total_cycles = len(cycles)
        total_runtime = sum(c.get("duration_seconds", 0) for c in cycles)
        
        all_tools = set()
        for c in cycles:
            for t in c.get("tools_used", []):
                if isinstance(t, dict):
                    all_tools.add(t.get("tool", ""))
                else:
                    all_tools.add(str(t))
        
        programs_run = list(set(c.get("program", "") for c in cycles))
        
        for e in events:
            e["_id"] = str(e["_id"])
            if e.get("timestamp"):
                e["timestamp"] = e["timestamp"].isoformat()
        
        return {
            "date": date,
            "machine_id": machine_id,
            "total_cycles": total_cycles,
            "total_runtime_seconds": total_runtime,
            "total_runtime_formatted": f"{total_runtime // 60}m {total_runtime % 60}s",
            "tools_used": list(all_tools),
            "programs_run": programs_run,
            "events": events[:50],
        }
    except Exception as e:
        logger.error(f"CNC daily-summary error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/gsheet-status")
async def get_cnc_gsheet_status(
    sheet_url: str,
    current_user: User = Depends(get_optional_user)
):
    """Read live CNC machine status from a public Google Sheet."""
    import httpx
    db = get_db()
    
    try:
        sheet_id = sheet_url
        if "docs.google.com" in sheet_url:
            parts = sheet_url.split("/")
            for i, part in enumerate(parts):
                if part == "d" and i + 1 < len(parts):
                    sheet_id = parts[i + 1]
                    break
        
        csv_url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid=0"
        
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(csv_url, follow_redirects=True)
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Could not access Google Sheet")
            
            csv_content = response.text
            reader = csv.DictReader(StringIO(csv_content))
            rows = list(reader)
            
            if not rows:
                return {"status": "no_data", "message": "Sheet is empty", "machines": []}
            
            machines = []
            for row in rows:
                machine_data = {
                    "timestamp": row.get("Timestamp", row.get("timestamp", "")),
                    "machine_id": row.get("Machine ID", row.get("machine_id", "")),
                    "machine_name": row.get("Machine Name", row.get("machine_name", "")),
                    "status": row.get("Status", row.get("status", "UNKNOWN")),
                    "mode": row.get("Mode", row.get("mode", "")),
                    "program_number": row.get("Program Number", row.get("program_number", "")),
                    "program_name": row.get("Program Name", row.get("program_name", "")),
                    "sequence_number": safe_int(row.get("Sequence Number", 0)),
                    "spindle_speed": safe_int(row.get("Spindle Speed (RPM)", 0)),
                    "spindle_load": safe_int(row.get("Spindle Load (%)", 0)),
                    "feed_rate": safe_int(row.get("Feed Rate (mm/min)", 0)),
                    "x_position": safe_float(row.get("X Position", 0)),
                    "y_position": safe_float(row.get("Y Position", 0)),
                    "z_position": safe_float(row.get("Z Position", 0)),
                    "parts_count": safe_int(row.get("Parts Count", 0)),
                    "cycle_time": safe_float(row.get("Cycle Time (sec)", 0)),
                    "run_time": safe_int(row.get("Run Time (min)", 0)),
                    "alarm_code": row.get("Alarm Code", ""),
                    "alarm_message": row.get("Alarm Message", ""),
                    "tool_number": safe_int(row.get("Tool Number", 0))
                }
                
                if machine_data["machine_id"]:
                    machines.append(machine_data)
            
            latest_machines = {}
            for m in machines:
                mid = m["machine_id"]
                if mid not in latest_machines or m["timestamp"] > latest_machines[mid]["timestamp"]:
                    latest_machines[mid] = m
            
            return {
                "status": "ok",
                "source": "google_sheets",
                "sheet_id": sheet_id,
                "last_fetch": get_ist_now().isoformat(),
                "machines": list(latest_machines.values())
            }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reading Google Sheet: {e}")
        raise HTTPException(status_code=500, detail=f"Error reading sheet: {str(e)}")


@router.post("/save-gsheet-config")
async def save_gsheet_config(
    request: Request,
    current_user: User = Depends(get_current_user)
):
    """Save Google Sheet URL configuration for CNC dashboard"""
    db = get_db()
    data = await request.json()
    sheet_url = data.get("sheet_url")
    
    if not sheet_url:
        raise HTTPException(status_code=400, detail="sheet_url is required")
    
    await db.settings.update_one(
        {"key": "cnc_gsheet_config"},
        {"$set": {
            "key": "cnc_gsheet_config",
            "sheet_url": sheet_url,
            "updated_at": get_ist_now(),
            "updated_by": current_user.user_id
        }},
        upsert=True
    )
    
    return {"status": "saved", "sheet_url": sheet_url}


@router.get("/gsheet-config")
async def get_gsheet_config(current_user: User = Depends(get_optional_user)):
    """Get saved Google Sheet URL configuration"""
    db = get_db()
    config = await db.settings.find_one({"key": "cnc_gsheet_config"}, {"_id": 0})
    if config:
        return {"sheet_url": config.get("sheet_url")}
    return {"sheet_url": None}
