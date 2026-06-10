"""
AI Audit Module for Shop Floor Track
Generates daily audit reports using Gemini Flash via Emergent Integration
"""

import os
import asyncio
import logging
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Dict, List, Any, Optional
from dotenv import load_dotenv
from emergentintegrations.llm.chat import LlmChat, UserMessage

load_dotenv()

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")

class AIAuditEngine:
    def __init__(self, db):
        self.db = db
        self.api_key = os.getenv("EMERGENT_LLM_KEY")
        
    async def generate_daily_report(self, date: Optional[str] = None) -> Dict[str, Any]:
        """Generate comprehensive daily audit report"""
        
        if not date:
            date = datetime.now(IST).strftime('%Y-%m-%d')
        
        # Collect all data for the day
        data = await self._collect_daily_data(date)
        
        # Generate AI analysis
        ai_analysis = await self._generate_ai_analysis(data, date)
        
        # Combine data and AI insights
        report = {
            "date": date,
            "generated_at": datetime.now(IST).strftime('%Y-%m-%d %H:%M:%S'),
            "summary": data["summary"],
            "entry_issues": data["entry_issues"],
            "tool_alerts": data["tool_alerts"],
            "storage_status": data["storage_status"],
            "operator_scores": data["operator_scores"],
            "ai_analysis": ai_analysis,
            "recommendations": ai_analysis.get("recommendations", [])
        }
        
        # Store report in database
        await self.db.audit_reports.update_one(
            {"date": date},
            {"$set": report},
            upsert=True
        )
        
        return report
    
    async def _collect_daily_data(self, date: str) -> Dict[str, Any]:
        """Collect all relevant data for the specified date"""
        
        # Parse date
        target_date = datetime.strptime(date, '%Y-%m-%d')
        start_of_day = target_date.replace(hour=0, minute=0, second=0)
        end_of_day = target_date.replace(hour=23, minute=59, second=59)
        
        # === Production Summary ===
        production_entries = await self.db.production_entries.find({
            "date": date
        }).to_list(length=1000)
        
        active_work = await self.db.active_work.find({}).to_list(length=100)
        
        total_jobs = len(production_entries)
        total_produced = sum(e.get("produced_qty", 0) for e in production_entries)
        system_ended = sum(1 for e in production_entries if e.get("system_ended"))
        
        # === Entry Issues Detection ===
        entry_issues = []
        
        # Check for missing remarks
        for entry in production_entries:
            if not entry.get("end_remarks") or entry.get("end_remarks", "").strip() == "":
                entry_issues.append({
                    "type": "missing_remarks",
                    "severity": "warning",
                    "operator": entry.get("operator_name"),
                    "job_id": entry.get("job_id"),
                    "message": f"{entry.get('operator_name')} - Job {entry.get('job_id', 'N/A')} missing end remarks"
                })
            
            # Check unusual quantities
            qty = entry.get("produced_qty", 0)
            if qty > 1000:
                entry_issues.append({
                    "type": "unusual_quantity",
                    "severity": "error",
                    "operator": entry.get("operator_name"),
                    "job_id": entry.get("job_id"),
                    "quantity": qty,
                    "message": f"{entry.get('operator_name')} - Qty {qty} seems unusual, please verify"
                })
            
            # System ended jobs
            if entry.get("system_ended"):
                entry_issues.append({
                    "type": "system_ended",
                    "severity": "warning",
                    "operator": entry.get("operator_name"),
                    "job_id": entry.get("job_id"),
                    "message": f"{entry.get('operator_name')} - Job ended by system (forgot to end?)"
                })
        
        # Check storage deductions without signature
        storage_deductions = await self.db.storage_deductions.find({
            "taken_date": {"$regex": f"^{date}"}
        }).to_list(length=500)
        
        for deduction in storage_deductions:
            if not deduction.get("signature"):
                entry_issues.append({
                    "type": "missing_signature",
                    "severity": "warning",
                    "operator": deduction.get("taken_by_name"),
                    "message": f"Parts taken without signature by {deduction.get('taken_by_name')}"
                })
        
        # === Tool Inventory Alerts ===
        tool_alerts = []
        tools = await self.db.tools_inserts.find({}).to_list(length=500)
        
        for tool in tools:
            qty = tool.get("quantity", 0)
            min_qty = tool.get("min_quantity", 10)
            
            if qty <= min_qty:
                tool_name = tool.get("material") or tool.get("insert_type") or "Unknown"
                diameter = tool.get("diameter")
                tool_alerts.append({
                    "type": "low_stock",
                    "severity": "error" if qty <= 5 else "warning",
                    "item": f"{tool_name} {f'Ø{diameter}mm' if diameter else ''}",
                    "quantity": qty,
                    "min_quantity": min_qty,
                    "message": f"{tool_name} - Only {qty} left, reorder needed!"
                })
        
        # Tool issues today
        tool_issues = await self.db.tools_inserts_issues.find({}).to_list(length=500)
        today_issues = [i for i in tool_issues if i.get("issued_date", "").startswith(date)]
        
        # Tool scrap today
        tool_scrap = await self.db.tools_inserts_scrap.find({}).to_list(length=500)
        today_scrap = [s for s in tool_scrap if str(s.get("returned_at", "")).startswith(date)]
        
        # === Storage Status ===
        storage_entries = await self.db.storage_entries.find({}).to_list(length=1000)
        
        low_stock_parts = []
        for entry in storage_entries:
            qty = entry.get("quantity", 0)
            if qty <= 5 and qty > 0:
                low_stock_parts.append({
                    "part_no": entry.get("part_no"),
                    "assembly": entry.get("assembly_name"),
                    "quantity": qty,
                    "crate": entry.get("crate_no")
                })
        
        # Parts taken today
        parts_taken_today = len([d for d in storage_deductions])
        
        storage_status = {
            "total_parts": len(storage_entries),
            "low_stock_count": len(low_stock_parts),
            "low_stock_parts": low_stock_parts[:10],  # Top 10
            "parts_taken_today": parts_taken_today
        }
        
        # === Operator Scores ===
        operators = await self.db.users.find({"role": "Operator"}).to_list(length=100)
        operator_scores = []
        
        for operator in operators:
            op_id = operator.get("user_id")
            op_name = operator.get("name")
            
            # Jobs by this operator today
            op_jobs = [e for e in production_entries if e.get("operator_id") == op_id]
            jobs_count = len(op_jobs)
            
            # Calculate score
            score = 70  # Base score
            
            if jobs_count > 0:
                # Jobs completed bonus
                score += min(jobs_count * 3, 15)
                
                # Proper documentation bonus
                documented = sum(1 for j in op_jobs if j.get("end_remarks"))
                doc_rate = (documented / jobs_count) * 100 if jobs_count > 0 else 0
                score += (doc_rate / 100) * 10
                
                # System ended penalty
                sys_ended = sum(1 for j in op_jobs if j.get("system_ended"))
                score -= sys_ended * 5
            
            score = max(0, min(100, score))
            
            operator_scores.append({
                "operator_id": op_id,
                "name": op_name,
                "jobs_completed": jobs_count,
                "score": round(score),
                "issues": sum(1 for i in entry_issues if i.get("operator") == op_name)
            })
        
        # Sort by score
        operator_scores.sort(key=lambda x: x["score"], reverse=True)
        
        summary = {
            "total_jobs": total_jobs,
            "total_produced": total_produced,
            "system_ended_jobs": system_ended,
            "entry_issues_count": len(entry_issues),
            "tool_alerts_count": len(tool_alerts),
            "tools_issued_today": len(today_issues),
            "tools_scrapped_today": len(today_scrap),
            "parts_taken_today": parts_taken_today,
            "low_stock_parts": len(low_stock_parts)
        }
        
        return {
            "summary": summary,
            "entry_issues": entry_issues,
            "tool_alerts": tool_alerts,
            "storage_status": storage_status,
            "operator_scores": operator_scores
        }
    
    async def _generate_ai_analysis(self, data: Dict, date: str) -> Dict[str, Any]:
        """Use Gemini to analyze data and generate insights"""
        
        if not self.api_key:
            logger.warning("No EMERGENT_LLM_KEY found, skipping AI analysis")
            return {"recommendations": [], "insights": "AI analysis unavailable - no API key"}
        
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"audit-{date}",
                system_message="""You are an AI auditor for a VMC/CNC job shop. Analyze the daily data and provide:
1. Key insights about production and operator performance
2. Specific recommendations to improve operations
3. Any concerns or anomalies detected

Be concise and actionable. Format as JSON with "insights" (string) and "recommendations" (array of strings)."""
            ).with_model("gemini", "gemini-2.5-flash")
            
            prompt = f"""Analyze this daily report for {date}:

SUMMARY:
- Total Jobs: {data['summary']['total_jobs']}
- Total Produced: {data['summary']['total_produced']}
- System Ended Jobs: {data['summary']['system_ended_jobs']}
- Entry Issues: {data['summary']['entry_issues_count']}
- Tool Alerts: {data['summary']['tool_alerts_count']}
- Tools Issued: {data['summary']['tools_issued_today']}
- Tools Scrapped: {data['summary']['tools_scrapped_today']}

ENTRY ISSUES:
{[i['message'] for i in data['entry_issues'][:5]]}

TOOL ALERTS:
{[t['message'] for t in data['tool_alerts'][:5]]}

TOP OPERATORS:
{[(o['name'], o['score'], o['jobs_completed']) for o in data['operator_scores'][:5]]}

Provide insights and 3-5 specific recommendations."""

            user_message = UserMessage(text=prompt)
            response = await chat.send_message(user_message)
            
            # Parse response
            try:
                import json
                # Try to extract JSON from response
                if "{" in response and "}" in response:
                    json_start = response.find("{")
                    json_end = response.rfind("}") + 1
                    json_str = response[json_start:json_end]
                    result = json.loads(json_str)
                    return result
                else:
                    return {
                        "insights": response,
                        "recommendations": []
                    }
            except:
                return {
                    "insights": response,
                    "recommendations": []
                }
                
        except Exception as e:
            logger.error(f"AI analysis error: {e}")
            return {
                "insights": f"AI analysis failed: {str(e)}",
                "recommendations": []
            }
    
    async def process_voice_command(self, command: str, user_id: str) -> Dict[str, Any]:
        """Process voice command and return action"""
        
        if not self.api_key:
            return {"action": "error", "message": "AI not configured"}
        
        try:
            chat = LlmChat(
                api_key=self.api_key,
                session_id=f"voice-{user_id}",
                system_message="""You are a voice assistant for a VMC/CNC job shop app. Parse voice commands and return JSON with:
- "action": one of [start_work, end_work, show_dashboard, show_production, show_tools, show_storage, show_low_stock, show_report, unknown]
- "machine": machine name if mentioned (e.g., "VMC 3", "CNC 1")
- "message": friendly response to speak back

Common commands:
- "Start job/work on [machine]" → start_work
- "End job/work" → end_work  
- "Show production/today's report" → show_production
- "Low stock/items" → show_low_stock
- "Tool report" → show_tools
- "Storage/parts" → show_storage
- Hindi commands like "काम शुरू करो" → start_work"""
            ).with_model("gemini", "gemini-2.5-flash")
            
            user_message = UserMessage(text=f"Parse this voice command: '{command}'")
            response = await chat.send_message(user_message)
            
            # Parse response
            try:
                import json
                if "{" in response and "}" in response:
                    json_start = response.find("{")
                    json_end = response.rfind("}") + 1
                    json_str = response[json_start:json_end]
                    return json.loads(json_str)
                else:
                    return {"action": "unknown", "message": response}
            except:
                return {"action": "unknown", "message": response}
                
        except Exception as e:
            logger.error(f"Voice command error: {e}")
            return {"action": "error", "message": str(e)}
