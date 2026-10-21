const express = require('express');
const http = require('http');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const { createSessionViaPair } = require('./connection/pair');
const { createSessionViaQR, getCurrentQR, getCurrentSession, clearQR } = require('./connection/qr');
const { PREFIX } = require('./connection/sessions');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
const PORT = process.env.PORT || 10000;
const HOST_URL = process.env.RENDER_EXTERNAL_URL || 'https://dark-eye-official.onrender.com';

let lastSessions = {};
let globalLastSession = null;
let stats = { total: 0 };
let startTime = Date.now();
let activeQRData = null;

function keepAlive(){
  // Internal keep alive every 25 sec
  setInterval(()=>{ http.get(`http://localhost:${PORT}/health`, ()=>{}).on('error', ()=>{}); }, 25000);
  // External keep alive for Render every 4 min - board NEVER sleeps
  if(HOST_URL.includes('onrender.com')){
    setInterval(()=>{ https.get(`${HOST_URL}/health`, ()=>{}).on('error', ()=>{}); }, 240000);
  }
}
keepAlive();

function getUptime(){
  const sec = Math.floor((Date.now()-startTime)/1000);
  const h = Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return `${h}h ${m}m ${s}s`;
}

function mainHTML(){
return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>DARK-EYE-OFC - Pairing</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@700&family=Inter:wght@500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;font-family:'Inter',sans-serif}
body{background:#0a0a0f;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center}
.header{width:100%;max-width:500px;display:flex;justify-content:space-between;align-items:center;padding:18px 16px;background:#0e0e15;border-bottom:1px solid #1f1f2e}
.header-left{display:flex;align-items:center;gap:12px}
.logo{width:48px;height:48px;background:linear-gradient(135deg,#6a7bff,#3dd598);border-radius:14px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;color:#000}
.h-title{font-weight:800;font-size:17px}
.h-sub{font-size:11px;opacity:.6;margin-top:2px}
.status-pill{background:#14141f;border:1px solid #2a2a40;border-radius:30px;padding:8px 16px;display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:1px;font-family:'JetBrains Mono';text-align:center}
.dot{width:10px;height:10px;background:#00ff88;border-radius:50%;box-shadow:0 0 12px #00ff88;animation:pulse 1.5s infinite}
@keyframes pulse{0%{opacity:1}50%{opacity:.5}100%{opacity:1}}
.container{width:100%;max-width:500px;padding:16px;display:flex;flex-direction:column;gap:14px}
.label{font-size:13px;font-weight:700;margin-bottom:6px}
.input-wrap{position:relative;background:#15151f;border:1px solid #2a2a40;border-radius:14px;padding:4px;display:flex;align-items:center}
.input-wrap span{padding:0 12px;font-weight:700;color:#8b8ba7}
.input-wrap input{flex:1;background:#fff;color:#000;border:none;padding:12px 14px;border-radius:10px;font-size:16px;font-weight:600;outline:none;font-family:'JetBrains Mono'}
.tab-row{display:flex;gap:10px}
.tab{flex:1;padding:12px;border-radius:12px;border:1px solid #2a2a40;background:#15151f;color:#8b8ba7;font-weight:700;cursor:pointer;text-align:center}
.tab.active{background:linear-gradient(135deg,#7b6cff,#3ec6f0);color:#000;border-color:transparent}
.btn-main{width:100%;padding:18px;border:none;border-radius:16px;background:linear-gradient(135deg,#7b6cff,#3ec6f0);color:#000;font-weight:900;font-size:16px;display:flex;align-items:center;justify-content:center;gap:12px;cursor:pointer}
.card{background:#12121b;border:1px solid #222236;border-radius:18px;padding:16px}
.card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
.code-box{background:#0a0a0f;border:1px solid #222236;border-radius:14px;padding:22px;text-align:center;font-family:'JetBrains Mono';font-size:26px;letter-spacing:4px;font-weight:800;cursor:pointer}
.tap-hint{text-align:center;font-size:12px;opacity:.5;margin:10px 0;display:flex;align-items:center;justify-content:center;gap:8px}
.btn-copy{width:100%;padding:14px;border-radius:14px;border:1px solid #2aff9a;background:transparent;color:#2aff9a;font-weight:800;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer}
.btn-copy.filled{background:#00ff88;color:#000}
.session-box{font-size:8px;word-break:break-all;background:#0a0a0f;padding:12px;border-radius:12px;border:1px solid #222236;max-height:150px;overflow:auto;font-family:'JetBrains Mono'}
.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.stat{background:#12121b;border:1px solid #222236;border-radius:14px;padding:12px}
.stat small{opacity:.5;font-size:9px;text-transform:uppercase;letter-spacing:1px}
.stat b{display:block;margin-top:6px;font-size:16px;font-family:'JetBrains Mono'}
.stat.online b{color:#00ff88}
.support-btn{width:100%;padding:14px;background:#15151f;border:1px solid #2a2a40;border-radius:14px;color:#fff;font-weight:700;display:flex;align-items:center;justify-content:center;gap:10px;text-decoration:none;margin-top:8px}
.reset-btn{width:100%;padding:12px;background:transparent;border:1px solid #222236;border-radius:14px;color:#8b8ba7;font-weight:700;margin-top:6px;cursor:pointer}
.qr-img{width:100%;display:flex;justify-content:center}
.qr-img img{width:270px;border-radius:18px;border:3px solid #7b6cff;background:#fff;padding:8px}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#00ff88;color:#000;padding:12px 22px;border-radius:30px;font-weight:900;display:none;z-index:999}
</style></head><body>
<div class="header">
  <div class="header-left"><div class="logo">DE</div><div><div class="h-title">DARK-EYE-OFC</div><div class="h-sub">WhatsApp Pairing Portal</div></div></div>
  <div class="status-pill" id="serverStatus"><div class="dot"></div> SERVER<br>ONLINE</div>
</div>
<div class="container">
  <div><div class="label">WhatsApp Number</div><div class="input-wrap"><span>+</span><input id="num" placeholder="263717400463" value="263717400463"></div></div>
  <div class="tab-row"><div class="tab active" id="tabPair" onclick="setMode('pair')">🔗 Pair Code</div><div class="tab" id="tabQr" onclick="setMode('qr')">📷 QR Code</div></div>
  <button class="btn-main" id="genBtn" onclick="gen()">🔗 Generate Pair Code</button>
  <div class="card" id="codeCard" style="display:none">
    <div class="card-head"><span>🔑 Pairing Code Generated</span><button onclick="this.parentElement.nextElementSibling.style.filter=this.parentElement.nextElementSibling.style.filter==='blur(8px)'?'none':'blur(8px)'" style="background:#fff;color:#000;border:none;padding:6px 12px;border-radius:8px;font-weight:800;font-size:12px">👁️ View</button></div>
    <div class="code-box" id="codeBox" onclick="copyCode()">---- ----</div>
    <div class="tap-hint">👆 Tap the code to copy</div>
    <button class="btn-copy" onclick="copyCode()">📋 Copy Code</button>
    <div id="sessArea" style="margin-top:14px;display:none"><div class="session-box" id="sessText"></div><button class="btn-copy filled" style="margin-top:10px" onclick="copySess()">📋 Copy Session</button><small style="display:block;text-align:center;margin-top:6px;opacity:.4">Hold to copy if button fails</small></div>
  </div>
  <div class="card" id="qrCard" style="display:none;text-align:center">
    <b>📷 Scan QR Code</b><p style="opacity:.5;font-size:12px;margin:8px 0">Open WhatsApp > Linked Devices > Link a device</p>
    <div class="qr-img" id="qrImg"><small>Generating real QR...</small></div>
    <div class="tap-hint">⏳ QR expires in 60 seconds - refresh if needed</div>
    <button class="btn-copy" onclick="genQR()">🔄 Refresh QR</button>
    <div id="qrSessArea" style="margin-top:14px;display:none"><div class="session-box" id="qrSessText"></div><button class="btn-copy filled" style="margin-top:10px" onclick="copyQrSess()">📋 Copy Session</button></div>
  </div>
  <div class="card">
    <div style="display:flex;justify-content:space-between;margin-bottom:12px"><b>Server Stats</b><span id="uptime" style="font-size:11px;opacity:.5"></span></div>
    <div class="stats-grid">
      <div class="stat online"><small>Server Status</small><b id="sStatus">ONLINE</b></div>
      <div class="stat"><small>Uptime</small><b id="sUptime">0s</b></div>
      <div class="stat"><small>Connected Bots</small><b id="sConn">0</b></div>
      <div class="stat online"><small>Alive Bots</small><b id="sAlive">0</b></div>
      <div class="stat"><small>Offline Bots</small><b id="sOff">0</b></div>
      <div class="stat"><small>Owner</small><b style="font-size:11px">dark-eye-ofc</b></div>
    </div>
    <a class="support-btn" href="https://support-black-eight.vercel.app" target="_blank">🛟 Support Center</a>
    <button class="reset-btn" onclick="resetAll()">🔄 Reset</button>
  </div>
</div>
<div id="toast" class="toast">Copied ✅</div>
<script>
let mode='pair', currentCode='', pollInterval=null, qrPoll=null;
function showToast(t){ const el=document.getElementById('toast'); el.innerText=t; el.style.display='block'; setTimeout(()=>el.style.display='none',2000); }
function setMode(m){
  mode=m;
  document.getElementById('tabPair').classList.toggle('active', m==='pair');
  document.getElementById('tabQr').classList.toggle('active', m==='qr');
  document.getElementById('genBtn').innerHTML = m==='pair'? '🔗 Generate Pair Code' : '📷 Generate QR Code';
  document.getElementById('codeCard').style.display='none';
  document.getElementById('qrCard').style.display='none';
}
function copyCode(){ if(!currentCode) return; navigator.clipboard.writeText(currentCode.replace('-','')).then(()=>showToast('Copied: '+currentCode)); }
function copySess(){ navigator.clipboard.writeText(document.getElementById('sessText').innerText).then(()=>showToast('Session Copied ✅')); }
function copyQrSess(){ navigator.clipboard.writeText(document.getElementById('qrSessText').innerText).then(()=>showToast('QR Session Copied ✅')); }
async function gen(){
  const num=document.getElementById('num').value.replace(/[^0-9]/g,'');
  if(num.length<10){ showToast('Enter valid number'); return; }
  if(mode==='pair') genPair(num); else genQR();
}
async function genPair(num){
  document.getElementById('qrCard').style.display='none';
  document.getElementById('codeCard').style.display='block';
  document.getElementById('codeBox').innerText='Generating real code...';
  document.getElementById('sessArea').style.display='none';
  try{
    const r=await fetch('/pair?number='+num); const j=await r.json();
    if(j.code){
      currentCode=j.code;
      document.getElementById('codeBox').innerText=j.code.slice(0,4)+'-'+j.code.slice(4);
      showToast('Real pair code from WhatsApp');
      if(pollInterval) clearInterval(pollInterval);
      pollInterval=setInterval(async()=>{
        const sr=await fetch('/sessions?number='+num); const sj=await sr.json();
        if(sj.session){
          document.getElementById('sessArea').style.display='block';
          document.getElementById('sessText').innerText=sj.session;
          clearInterval(pollInterval);
          showToast('Bot Connected ✅ Session ready');
          loadStats();
        }
      },3000);
    } else { document.getElementById('codeBox').innerText='Failed'; showToast(j.error||'Error'); }
  }catch(e){ document.getElementById('codeBox').innerText='Error'; }
}
async function genQR(){
  document.getElementById('codeCard').style.display='none';
  const card=document.getElementById('qrCard');
  card.style.display='block';
  document.getElementById('qrImg').innerHTML='<small>Connecting to WhatsApp...</small>';
  document.getElementById('qrSessArea').style.display='none';
  try{
    await fetch('/qr-start');
    if(qrPoll) clearInterval(qrPoll);
    qrPoll=setInterval(async()=>{
      const r=await fetch('/qr-data'); const j=await r.json();
      if(j.qr){ document.getElementById('qrImg').innerHTML='<img src="'+j.qr+'">'; }
      if(j.session){
        document.getElementById('qrSessArea').style.display='block';
        document.getElementById('qrSessText').innerText=j.session;
        clearInterval(qrPoll);
        showToast('QR Connected ✅');
        loadStats();
      }
    },2000);
  }catch{}
}
async function loadStats(){
  try{
    const r=await fetch('/host'); const j=await r.json();
    document.getElementById('sStatus').innerText=j.server||'ONLINE';
    document.getElementById('sUptime').innerText=j.uptime||'0s';
    document.getElementById('uptime').innerText='Uptime: '+(j.uptime||'0s');
    document.getElementById('sConn').innerText=j.sessions||0;
    document.getElementById('sAlive').innerText=j.sessions||0;
    document.getElementById('sOff').innerText=j.offline||0;
  }catch{}
}
function resetAll(){
  document.getElementById('codeCard').style.display='none';
  document.getElementById('qrCard').style.display='none';
  if(pollInterval) clearInterval(pollInterval);
  if(qrPoll) clearInterval(qrPoll);
  fetch('/qr-clear');
  showToast('Reset');
}
loadStats(); setInterval(loadStats,5000);
</script>
</body></html>`;
}

// ===== MAIN ROUTES =====
app.get('/', (req,res)=>res.send(mainHTML()));

// 🔥 FIX FOR VERCEL PANEL - ADD /health
app.get('/health', (req,res)=>{
  res.json({ 
    status: 'ok', 
    bot: 'HONOR-XMD',
    server: 'ONLINE',
    host: HOST_URL,
    uptime: getUptime(),
    sessions: Object.keys(lastSessions).length,
    pairingReady: true,
    time: new Date().toISOString()
  });
});

// Keep-alive endpoint (same as health but lightweight)
app.get('/host', (req,res)=>res.json({ 
  status:'online active forever', 
  server:'ONLINE', 
  host:HOST_URL, 
  prefix:PREFIX, 
  uptime:getUptime(), 
  sessions:Object.keys(lastSessions).length, 
  offline:0 
}));

app.get('/ping', (req,res)=>res.send('pong'));

// 🔥 FIX FOR VERCEL PANEL - /code alias (Vercel calls /code?number=)
app.get('/code', async (req,res)=>{
  let number = (req.query.number||'').replace(/[^0-9]/g,'');
  if(!number || number.length<10) return res.status(400).json({ success:false, error:'Invalid number', code:'' });
  try{
    stats.total++;
    await createSessionViaPair(number,
      (code)=>{ 
        res.json({ 
          success: true,
          status:'online', 
          host:HOST_URL, 
          number, 
          code: code,
          paircode: code,
          pair_code: code,
          prefix:PREFIX, 
          real:true 
        }); 
      },
      (session)=>{ lastSessions[number]=session; globalLastSession=session; },
      ()=>{}
    );
  }catch(e){ 
    console.error('Pair error:', e.message);
    res.status(500).json({ success:false, error:e.message, code:'' }); 
  }
});

// Original /pair endpoint (keep for backward compatibility)
app.get('/pair', async (req,res)=>{
  let number = (req.query.number||'').replace(/[^0-9]/g,'');
  if(!number || number.length<10) return res.json({ status:'online', host:HOST_URL, prefix:PREFIX, uptime:getUptime() });
  try{
    stats.total++;
    await createSessionViaPair(number,
      (code)=>{ res.json({ status:'online', host:HOST_URL, number, code, prefix:PREFIX, real:true }); },
      (session)=>{ lastSessions[number]=session; globalLastSession=session; },
      ()=>{}
    );
  }catch(e){ res.json({ error:e.message }); }
});

app.get('/qr-start', async (req,res)=>{
  clearQR();
  activeQRData=null;
  createSessionViaQR((qr)=>{ activeQRData=qr; }, (sess)=>{ lastSessions['QR_'+Date.now()]=sess; globalLastSession=sess; activeQRData=sess; });
  res.json({ status:'starting real qr' });
});

app.get('/qr-data', (req,res)=>{
  const qr=getCurrentQR();
  const sess=getCurrentSession();
  res.json({ qr, session: sess });
});

app.get('/qr-clear', (req,res)=>{ clearQR(); res.json({ cleared:true }); });

app.get('/sessions', (req,res)=>{
  const number=(req.query.number||'').replace(/[^0-9]/g,'');
  if(number && lastSessions[number]) return res.json({ status:'found', session:lastSessions[number] });
  if(globalLastSession) return res.json({ status:'found', session:globalLastSession });
  res.json({ status:'waiting' });
});

// 🔥 DESKTOP PANEL ENDPOINTS
app.post('/api/save-config', (req,res)=>{
  try{
    const cfg = req.body;
    if(!fs.existsSync('./data')) fs.mkdirSync('./data', { recursive:true });
    fs.writeFileSync(`./data/config_${cfg.user||cfg.ownerNumber||'unknown'}.json`, JSON.stringify(cfg, null, 2));
    console.log(`⚙️ Config saved for ${cfg.user}`);
    res.json({ success:true });
  }catch(e){
    console.error(e);
    res.status(500).json({ success:false, error:e.message });
  }
});

app.get('/api/session', (req,res)=>{
  const number = (req.query.number||'').replace(/[^0-9]/g,'');
  const session = number && lastSessions[number] ? lastSessions[number] : globalLastSession;
  res.json({ success: !!session, session: session || null, connected: !!session });
});

app.get('/create-account', async (req,res)=>{
  const number = (req.query.number||'').replace(/[^0-9]/g,'');
  const password = req.query.password||'';
  res.json({ success:true, number, password, message:'Account created, check WhatsApp for password (if bot connected)' });
});

app.listen(PORT,'0.0.0.0',()=>console.log(`🔥 DARK-EYE-OFC ONLINE REAL PAIR + QR on ${PORT} - /health & /code ready`));
