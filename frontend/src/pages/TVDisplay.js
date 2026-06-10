import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;
const REFRESH = 10000;

const parseStart = (str) => {
  if (!str) return null;
  try {
    const [d, t, ap] = str.split(' ');
    const [day, mon, yr] = d.split('/');
    let [h, m] = t.split(':').map(Number);
    if (ap === 'PM' && h !== 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return new Date(yr, mon - 1, day, h, m);
  } catch { return null; }
};

const fmtElapsed = (startStr, now) => {
  const s = parseStart(startStr);
  if (!s) return '--:--:--';
  const d = Math.max(0, Math.floor((now - s) / 1000));
  const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60), sec = d % 60;
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
};

const CSS = `
@keyframes tv-glow{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.25)}50%{box-shadow:0 0 8px 1px rgba(16,185,129,0.15)}}
@keyframes tv-blink{0%,100%{border-color:#ef4444}50%{border-color:#7f1d1d}}
@keyframes tv-refresh{0%{width:100%}100%{width:0%}}
.tv-r{animation:tv-glow 2.5s ease-in-out infinite}
.tv-b{animation:tv-blink 1s step-end infinite}
.tv-ref{animation:tv-refresh 10s linear infinite}
`;

const CAT_ORDER = ['vmc','cnc_lathe','moulding'];
const CAT_LABEL = {vmc:'VMC',cnc_lathe:'CNC LATHE',moulding:'MOULDING'};
const CAT_CLR = {vmc:'#10b981',cnc_lathe:'#3b82f6',moulding:'#a855f7'};

const TVDisplay = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [isFs, setIsFs] = useState(false);

  const toggleFs = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(()=>{});
    else document.exitFullscreen().catch(()=>{});
  };

  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', h);
    return () => document.removeEventListener('fullscreenchange', h);
  }, []);

  const fetchData = useCallback(async () => {
    try { const {data} = await axios.get(`${API_URL}/api/machine-status/summary-public`,{withCredentials:false}); setData(data); }
    catch(e){ console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, REFRESH); return () => clearInterval(id); }, [fetchData]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  useEffect(() => { const t = document.createElement('style'); t.textContent = CSS; document.head.appendChild(t); return () => t.remove(); }, []);

  // Wake recovery
  useEffect(() => {
    let last = Date.now();
    const chk = setInterval(() => { const n=Date.now(); if(n-last>15000){fetchData();setNow(n);} last=n; }, 2000);
    const vis = () => { if(document.visibilityState==='visible'){fetchData();setNow(Date.now());} };
    const foc = () => { fetchData(); setNow(Date.now()); };
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('focus', foc);
    return () => { clearInterval(chk); document.removeEventListener('visibilitychange',vis); window.removeEventListener('focus',foc); };
  }, [fetchData]);

  if (loading) return (
    <div style={{height:'100vh',background:'#060608',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{width:36,height:36,border:'3px solid rgba(255,255,255,0.1)',borderTop:'3px solid #10b981',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const s = data?.summary || {total:0,running:0,idle:0,breakdown:0};
  const machines = data?.machines || [];
  const util = s.total>0 ? Math.round((s.running/s.total)*100) : 0;
  const ord = {breakdown:0,running:1,idle:2};
  const grp = {};
  machines.forEach(m => { const c=m.category||'other'; if(!grp[c])grp[c]=[]; grp[c].push(m); });
  Object.values(grp).forEach(a => a.sort((a,b)=>(ord[a.status]??3)-(ord[b.status]??3)));
  const cats = CAT_ORDER.filter(c=>grp[c]?.length>0);
  Object.keys(grp).forEach(c=>{ if(!cats.includes(c))cats.push(c); });

  // Calculate grid: total machines → how many rows of 6
  const totalMachines = machines.length;
  const cols = totalMachines <= 12 ? 4 : totalMachines <= 18 ? 6 : 6;

  const nowD = new Date(now);
  const time = nowD.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  const date = nowD.toLocaleDateString([],{weekday:'short',day:'numeric',month:'short',year:'numeric'});

  return (
    <div style={{height:'100vh',background:'#060608',color:'#fff',fontFamily:"'Inter',system-ui,sans-serif",display:'flex',flexDirection:'column',overflow:'hidden',padding:'5px 8px'}} data-testid="tv-display">

      {/* HEADER - compact */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3,flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:26,height:26,borderRadius:4,background:'linear-gradient(135deg,#10b981,#059669)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:13,color:'#fff'}}>V</div>
          <div>
            <div style={{fontSize:13,fontWeight:800,letterSpacing:'-0.3px',lineHeight:1.1}}>VMC Job Shop</div>
            <div style={{fontSize:8,color:'#6b7280',textTransform:'uppercase',letterSpacing:'1px',fontWeight:600}}>Factory Floor Monitor</div>
          </div>
        </div>
        <div style={{display:'flex',gap:5}}>
          {[{l:'RUN',v:s.running,c:'#10b981'},{l:'IDLE',v:s.idle,c:'#f59e0b'},{l:'DOWN',v:s.breakdown,c:'#ef4444'},{l:'TOTAL',v:s.total,c:'#94a3b8'}].map(k=>
            <div key={k.l} style={{background:`${k.c}10`,border:`1px solid ${k.c}40`,borderRadius:5,padding:'1px 12px',textAlign:'center',minWidth:55}} data-testid={`kpi-${k.l.toLowerCase()}`}>
              <div style={{fontSize:7,fontWeight:700,color:k.c,textTransform:'uppercase',letterSpacing:'0.8px'}}>{k.l}</div>
              <div style={{fontSize:22,fontWeight:900,color:k.c,lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{k.v}</div>
            </div>
          )}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:16,fontWeight:800,fontVariantNumeric:'tabular-nums',lineHeight:1.1}} data-testid="live-clock">{time}</div>
            <div style={{fontSize:8,color:'#6b7280',fontWeight:600}} data-testid="live-date">{date}</div>
          </div>
          <button onClick={toggleFs} data-testid="fullscreen-btn" style={{width:26,height:26,borderRadius:4,background:isFs?'rgba(16,185,129,0.15)':'rgba(255,255,255,0.06)',border:`1px solid ${isFs?'rgba(16,185,129,0.4)':'rgba(255,255,255,0.1)'}`,color:isFs?'#10b981':'#9ca3af',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {isFs?<><path d="M8 3v3a2 2 0 01-2 2H3"/><path d="M21 8h-3a2 2 0 01-2-2V3"/><path d="M3 16h3a2 2 0 012 2v3"/><path d="M16 21v-3a2 2 0 012-2h3"/></>:<><path d="M8 3H5a2 2 0 00-2 2v3"/><path d="M21 8V5a2 2 0 00-2-2h-3"/><path d="M3 16v3a2 2 0 002 2h3"/><path d="M16 21h3a2 2 0 002-2v-3"/></>}
            </svg>
          </button>
        </div>
      </div>

      {/* UTILIZATION */}
      <div style={{height:10,background:'#111318',borderRadius:3,overflow:'hidden',marginBottom:3,flexShrink:0,position:'relative'}}>
        <div style={{height:'100%',borderRadius:3,background:'linear-gradient(90deg,#10b981,#059669)',width:`${util}%`,transition:'width 1s',display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:4,minWidth:util>0?30:0}}>
          {util>0&&<span style={{fontSize:8,fontWeight:800,color:'#fff'}}>{util}%</span>}
        </div>
      </div>

      {/* MACHINE GRID - Fill remaining space */}
      <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column',gap:2}}>
        {cats.map(cat => {
          const ms = grp[cat]||[];
          const cc = CAT_CLR[cat]||'#94a3b8';
          const cl = CAT_LABEL[cat]||cat.toUpperCase();
          const rc = ms.filter(m=>m.status==='running').length;
          const rows = Math.ceil(ms.length/cols);
          return (
            <div key={cat} style={{flex:rows,display:'flex',flexDirection:'column',minHeight:0}} data-testid={`section-${cat}`}>
              <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:1,flexShrink:0}}>
                <div style={{width:3,height:10,borderRadius:2,background:cc}}/>
                <span style={{fontSize:9,fontWeight:800,color:cc,textTransform:'uppercase',letterSpacing:'1.2px'}}>{cl}</span>
                <span style={{fontSize:8,color:'#6b7280',fontWeight:600}}>({rc}/{ms.length} running)</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:`repeat(${cols},1fr)`,gridAutoRows:'1fr',gap:3,flex:1}}>
                {ms.map(m=><MCard key={m.machine_id} m={m} now={now}/>)}
              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingTop:2,marginTop:2,borderTop:'1px solid #1a1d25',flexShrink:0}}>
        <div style={{display:'flex',alignItems:'center',gap:5}}>
          <div style={{width:4,height:4,borderRadius:'50%',background:'#10b981'}}/>
          <span style={{fontSize:8,color:'#4b5563',fontWeight:600,textTransform:'uppercase',letterSpacing:'1px'}}>Live - Auto-refresh 10s</span>
        </div>
        <div style={{width:60,height:2,background:'#1a1d25',borderRadius:1,overflow:'hidden'}}>
          <div className="tv-ref" style={{height:'100%',background:'#10b981',borderRadius:1}}/>
        </div>
        <span style={{fontSize:8,color:'#4b5563',fontWeight:600}}>{util}% Util - {s.total} Machines</span>
      </div>
    </div>
  );
};

/* Compact Machine Card - ALL SAME HEIGHT */
const MCard = ({m, now}) => {
  const {status, machine_name, operator_name, job_details, start_time, cycle_time, target_quantity} = m;
  const isR = status==='running', isB = status==='breakdown';

  const elapsed = isR ? fmtElapsed(start_time, now) : null;

  // Cycle time display
  const ct = cycle_time || null;

  // Remaining
  let rem = null;
  if (isR && ct) {
    try {
      const parts = ct.split(':').map(Number);
      let csec = 0;
      if (parts.length===3) csec=parts[0]*3600+parts[1]*60+parts[2];
      else if (parts.length===2) csec=parts[0]*60+parts[1];
      else csec=parts[0]*60;
      const st = parseStart(start_time);
      if (st && csec) {
        const elSec = Math.max(0,(now-st.getTime())/1000);
        const total = csec*(target_quantity||1);
        const r = Math.max(0,total-elSec);
        if (r<=0) rem='Done';
        else { const rh=Math.floor(r/3600),rm=Math.floor((r%3600)/60); rem=rh>0?`${rh}h ${rm}m`:`${rm}m`; }
      }
    } catch {}
  }

  // Progress
  let prog = null;
  if (isR && ct) {
    try {
      const parts = ct.split(':').map(Number);
      let csec = 0;
      if (parts.length===3) csec=parts[0]*3600+parts[1]*60+parts[2];
      else if (parts.length===2) csec=parts[0]*60+parts[1];
      else csec=parts[0]*60;
      const st = parseStart(start_time);
      if (st && csec) {
        const elSec = Math.max(0,(now-st.getTime())/1000);
        prog = Math.min(100,Math.round((elSec/(csec*(target_quantity||1)))*100));
      }
    } catch {}
  }

  const bg = isR?'#052e23':isB?'#2a0505':'#2a1000';
  const bc = isR?'#10b981':isB?'#ef4444':'#92400e';
  const sc = isR?'#34d399':isB?'#fca5a5':'#fbbf24';

  return (
    <div className={isR?'tv-r':isB?'tv-b':''} style={{
      borderRadius:5,padding:'4px 7px',display:'flex',flexDirection:'column',
      border:`1.5px solid ${bc}`,background:bg,overflow:'hidden',minHeight:0,
    }} data-testid={`tv-machine-${m.machine_id}`}>

      {/* Row 1: Machine Name + Status */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:3,marginBottom:isR?2:0}}>
        <span style={{fontSize:12,fontWeight:800,lineHeight:1.2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{machine_name}</span>
        <span style={{padding:'1px 4px',borderRadius:2,background:`${sc}30`,color:sc,fontSize:7,fontWeight:800,letterSpacing:'0.5px',flexShrink:0}}>{isR?'RUN':isB?'DOWN':'IDLE'}</span>
      </div>

      {isR ? (
        <div style={{flex:1,display:'flex',flexDirection:'column',justifyContent:'space-between',minHeight:0}}>
          {/* Row 2: Job (wrapping) */}
          <div style={{fontSize:10,color:'#a7f3d0',lineHeight:1.25,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',wordBreak:'break-word'}}>
            {job_details||'--'}
          </div>

          {/* Row 3: Operator */}
          <div style={{fontSize:10,fontWeight:700,color:'#d1fae5',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginTop:1}}>
            {operator_name}
          </div>

          {/* Row 4: Elapsed | Cycle Time | Remaining — single compact row */}
          <div style={{display:'flex',gap:4,marginTop:2,flexWrap:'wrap'}}>
            <span style={{fontSize:10,fontWeight:800,color:'#6ee7b7',fontVariantNumeric:'tabular-nums'}}>{elapsed}</span>
            {ct && <span style={{fontSize:9,color:'#86efac',opacity:0.7}}>CT:{ct}</span>}
            {rem && <span style={{fontSize:9,fontWeight:700,color:rem==='Done'?'#fbbf24':'#86efac'}}>{rem}</span>}
          </div>

          {/* Row 5: Progress bar - based on elapsed time */}
          <div style={{marginTop:'auto',paddingTop:2}}>
            <div style={{height:5,background:'rgba(255,255,255,0.12)',borderRadius:3,overflow:'hidden'}}>
              {(() => {
                // If we have cycle_time + progress, use actual progress
                // Otherwise, show elapsed time as % of 8hr shift (28800 sec)
                const st = parseStart(start_time);
                const elSec = st ? Math.max(0, (now - st.getTime()) / 1000) : 0;
                const pct = prog !== null ? prog : Math.min(95, Math.round((elSec / 28800) * 100));
                const barColor = pct >= 90 ? 'linear-gradient(90deg,#f59e0b,#d97706)'
                  : pct >= 60 ? 'linear-gradient(90deg,#10b981,#fbbf24)'
                  : 'linear-gradient(90deg,#10b981,#34d399)';
                return (
                  <div style={{
                    height:'100%', borderRadius:3, transition:'width 1s',
                    width: `${Math.max(2, pct)}%`,
                    background: barColor,
                  }}/>
                );
              })()}
            </div>
          </div>
        </div>
      ) : (
        <div style={{flex:1,display:'flex',alignItems:'flex-end'}}>
          <span style={{fontSize:10,color:isB?'#fca5a5':'#fbbf24',fontWeight:600,opacity:isB?1:0.7}}>
            {isB?'Needs Attention':'Waiting'}
          </span>
        </div>
      )}
    </div>
  );
};

export default TVDisplay;
