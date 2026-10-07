// Servidor: recibe suscripciones de Kick, las guarda y sirve la página.
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const PORT=process.env.PORT||3000;
const DATA_DIR=process.env.DATA_DIR||path.join(__dirname,'data');
const DB=path.join(DATA_DIR,'suscriptores.json');
const ADMIN_TOKEN=process.env.ADMIN_TOKEN||'';
const COUNT_GIFTER=process.env.COUNT_GIFTER==='1'; // 1 = el que regala subs también entra
const SKIP_VERIFY=process.env.DEV_SKIP_VERIFY==='1'; // solo para pruebas locales
fs.mkdirSync(DATA_DIR,{recursive:true});
let subs=[];try{subs=JSON.parse(fs.readFileSync(DB,'utf8'))}catch{}
const save=()=>fs.writeFileSync(DB,JSON.stringify(subs,null,2));

// Registrados desde el formulario web + historial de ganadores
const REG=path.join(DATA_DIR,'registrados.json'),WIN=path.join(DATA_DIR,'ganadores.json');
let regs=[];try{regs=JSON.parse(fs.readFileSync(REG,'utf8'))}catch{}
let winners=[];try{winners=JSON.parse(fs.readFileSync(WIN,'utf8'))}catch{}
const saveRegs=()=>fs.writeFileSync(REG,JSON.stringify(regs,null,2));
const saveWin=()=>fs.writeFileSync(WIN,JSON.stringify(winners,null,2));
const normSteam=x=>String(x).trim().toLowerCase().replace(/^https?:\/\/(www\.)?steamcommunity\.com\/(profiles|id)\//,'').replace(/\/+$/,'');
const isAdmin=req=>!!ADMIN_TOKEN&&req.headers.authorization==='Bearer '+ADMIN_TOKEN;
// Pozo del sorteo: suscriptores de Kick + registrados (sin duplicar por nombre)
function pool(){
  const m=new Map();
  subs.forEach(s=>m.set(s.username.toLowerCase(),{nombre:s.username,origen:'Kick ('+s.tipo+')'}));
  regs.forEach(r=>{const k=r.nick.toLowerCase();
    if(m.has(k))m.get(k).steam=r.steam;
    else m.set(k,{nombre:r.nick,origen:'Registro web',steam:r.steam})});
  return [...m.values()];
}
// Limite simple: 10 registros por minuto por IP
const hits=new Map();
function limited(req){
  const ip=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',')[0].trim();
  const now=Date.now(),a=(hits.get(ip)||[]).filter(t=>now-t<60000);
  a.push(now);hits.set(ip,a);return a.length>10;
}

let pubKey=process.env.KICK_PUBLIC_KEY||null;
async function getKey(){
  if(pubKey)return pubKey;
  const r=await fetch('https://api.kick.com/public/v1/public-key');
  const j=await r.json();
  pubKey=(j.data&&j.data.public_key)||j.public_key;
  return pubKey;
}
async function verify(h,body){
  if(SKIP_VERIFY)return true;
  try{
    const msg=`${h['kick-event-message-id']}.${h['kick-event-message-timestamp']}.${body}`;
    return crypto.verify('RSA-SHA256',Buffer.from(msg),await getKey(),Buffer.from(h['kick-event-signature']||'','base64'));
  }catch(e){console.error('verify error',e.message);return false}
}
function addSub(u,tipo){
  if(!u||!u.username)return;
  const id=String(u.user_id||u.username).toLowerCase();
  if(subs.some(s=>s.id===id))return;
  subs.push({id,username:u.username,tipo,fecha:new Date().toISOString()});
  save();console.log('Nuevo participante:',u.username,tipo);
}
function handleEvent(type,p){
  if(type==='channel.subscription.new')addSub(p.subscriber,'sub');
  else if(type==='channel.subscription.renewal')addSub(p.subscriber,'renovacion');
  else if(type==='channel.subscription.gifts'){
    (p.giftees||[]).forEach(g=>addSub(g,'regalada'));
    if(COUNT_GIFTER)addSub(p.gifter,'regalador');
  }
}
const readBody=req=>new Promise(r=>{let b='';req.on('data',c=>{b+=c;if(b.length>1e6)req.destroy()});req.on('end',()=>r(b))});
const send=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(obj))};

http.createServer(async(req,res)=>{
  const url=req.url.split('?')[0];
  if(req.method==='POST'&&url==='/webhook/kick'){
    const body=await readBody(req);
    if(!(await verify(req.headers,body)))return send(res,401,{error:'firma invalida'});
    try{handleEvent(req.headers['kick-event-type'],JSON.parse(body))}catch(e){console.error(e)}
    return send(res,200,{ok:true});
  }
  if(req.method==='GET'&&url==='/api/participantes')
    return send(res,200,{total:pool().length,participantes:subs.map(({username,tipo})=>({username,tipo}))});
  if(req.method==='POST'&&url==='/api/registro'){
    if(limited(req))return send(res,429,{error:'Demasiados intentos, espera un minuto.'});
    let d;try{d=JSON.parse(await readBody(req))}catch{return send(res,400,{error:'Datos inválidos.'})}
    const nick=String(d.nick||'').trim().slice(0,30),steamRaw=String(d.steam||'').trim().slice(0,100),steam=normSteam(steamRaw);
    if(!nick||!steam)return send(res,400,{error:'Completa todos los campos.'});
    if(regs.some(r=>normSteam(r.steam)===steam))return send(res,409,{error:'Ese Steam ID ya está registrado.'});
    regs.push({nick,steam:steamRaw,fecha:new Date().toISOString()});saveRegs();
    return send(res,200,{ok:true});
  }
  if(url.startsWith('/api/admin/')){
    if(!isAdmin(req))return send(res,401,{error:'Token incorrecto.'});
    if(req.method==='GET'&&url==='/api/admin/participantes')
      return send(res,200,{participantes:pool(),ganadores:winners});
    if(req.method==='POST'&&url==='/api/admin/sortear'){
      let d={};try{d=JSON.parse(await readBody(req)||'{}')}catch{}
      const n=Math.max(1,Math.min(10,parseInt(d.cantidad)||1));
      const ya=new Set(winners.map(w=>w.nombre.toLowerCase()));
      const cand=pool().filter(p=>!ya.has(p.nombre.toLowerCase()));
      if(!cand.length)return send(res,400,{error:'No quedan participantes disponibles.'});
      const elegidos=[];
      while(elegidos.length<n&&cand.length)elegidos.push(cand.splice(crypto.randomInt(cand.length),1)[0]);
      const fecha=new Date().toISOString();
      elegidos.forEach(e=>winners.push({...e,fecha}));saveWin();
      return send(res,200,{elegidos,ganadores:winners});
    }
    if(req.method==='POST'&&url==='/api/admin/reset'){
      subs=[];regs=[];winners=[];save();saveRegs();saveWin();return send(res,200,{ok:true});
    }
  }
  if(req.method==='GET'&&(url==='/'||url==='/index.html')){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    return res.end(fs.readFileSync(path.join(__dirname,'public','index.html')));
  }
  if(req.method==='GET'&&(url==='/ruleta'||url==='/ruleta.html')){
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    return res.end(fs.readFileSync(path.join(__dirname,'public','ruleta.html')));
  }
  send(res,404,{error:'no encontrado'});
}).listen(PORT,()=>console.log('Servidor listo en puerto',PORT));
