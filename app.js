(function(){
"use strict";

var appEl = document.getElementById("app");
var logoPath = (window.appSettings && window.appSettings.logoPath) || "./assets/logo-electroingenieria.jpeg";
var storageKey = "ei_trazabilidad_produccion_v1";
var db = null;
var auth = null;
var firebaseReady = false;
var firebaseInitError = null;

var state = {
  user: null,
  route: "dashboard",
  cases: [],
  events: [],
  users: [],
  filters: { search:"", status:"", process:"" },
  selectedCase: null,
  pdfExtraction: null
};

var roles = {
  admin:"Administrador / Desarrollador",
  gerencia:"Gerencia",
  ventas:"Ventas",
  logistica:"Logística",
  alistamiento:"Alistamiento",
  facturacion:"Facturación",
  caja:"Caja",
  despacho:"Despacho",
  inventarios:"Inventarios",
  jefe_logistico:"Jefe logístico",
  auditoria:"Auditoría"
};

var processes = {
  recepcion_pedidos:{
    code:"S-PR-2", title:"Recepción de pedidos", ownerRole:"logistica", icon:"RP", type:"pedido_venta",
    checklist:["Contenido del pedido completo","Cliente identificado","Referencia completa","Cantidad completa","Unidad de medida completa","Tipo de entrega definido","Dirección de entrega definida","Bodega definida","Forma de pago definida","Observaciones revisadas","Pedido listo para alistamiento"],
    waits:["Falta referencia","Falta cantidad","Falta unidad de medida","Falta tipo de entrega","Falta dirección de entrega","Falta bodega","Falta forma de pago","Falta autorización comercial","Falta aclaración de observaciones","Documento ilegible"],
    next:["alistamiento"]
  },
  alistamiento:{
    code:"S-PR-4", title:"Alistamiento", ownerRole:"alistamiento", icon:"AL", type:"pedido_venta",
    checklist:["Pedido recibido","Referencia coincide","Descripción coincide","Cantidad coincide","Unidad de medida coincide","Ubicación correcta","Estado físico conforme","Validación de cable si aplica","Remanente mínimo validado si aplica","Mercancía lista para siguiente proceso"],
    waits:["No se encuentra mercancía","Cantidad insuficiente","Referencia diferente","Unidad de medida diferente","Ubicación errada","Mercancía averiada","Remanente menor a 50 m","Requiere autorización de jefe logístico"],
    next:["facturacion","despacho"]
  },
  facturacion:{
    code:"S-PR-5", title:"Facturación", ownerRole:"facturacion", icon:"FC", type:"pedido_venta",
    checklist:["Pedido recibido","Tipo de pago identificado","Si es crédito, facturación logística","Si es contado, relevar a caja","Documento validado","Relevo a despacho"],
    waits:["Pago pendiente","Soporte incompleto","Error en Siesa","Documento rechazado","Falta autorización de cartera"],
    next:["caja","despacho"]
  },
  caja:{
    code:"S-PR-5", title:"Caja", ownerRole:"caja", icon:"CJ", type:"pedido_venta",
    checklist:["Pedido recibido de facturación","Valor validado","Recaudo confirmado","Soporte completo","Liberación confirmada","Relevo a despacho"],
    waits:["Cliente no ha pagado","Pago pendiente de validación","Soporte incompleto","Diferencia en valor"],
    next:["despacho"]
  },
  despacho:{
    code:"S-PR-6", title:"Despacho", ownerRole:"despacho", icon:"DP", type:"pedido_venta",
    checklist:["Factura coincide con pedido","Producto coincide con factura","Referencias correctas","Cantidades correctas","Estado físico conforme","Empaque conforme","Rotulación conforme","Fotos de salida anexadas si aplica","Entrega confirmada"],
    waits:["Producto incompleto","Producto equivocado","Cantidad diferente","Falta empaque","Falta rotulación","Documento no coincide","Cliente no autoriza","Transportadora pendiente"],
    next:[]
  },
  inventarios:{
    code:"S-PR-24", title:"Inventarios", ownerRole:"inventarios", icon:"IV", type:"inventario",
    checklist:["Tipo de inventario definido","Referencia seleccionada","Ubicación física validada","Sticker validado","Primer conteo realizado","Segundo conteo realizado","Diferencia calculada","Causa analizada","Aprobación registrada","Inventario cerrado"],
    waits:["Mercancía sin sticker","Código ilegible","Ubicación no coincide","Diferencia no justificada","Pendiente aprobación"],
    next:[]
  }
};

var routeInfo = {
  dashboard:["Inicio","IN"], cases:["Casos","CS"], create:["Crear","CR"], requirements:["Requerimientos","RQ"], approvals:["Aprobaciones","AU"], indicators:["VSM","VS"], users:["Usuarios","US"], admin:["Admin","AD"]
};

function qs(sel,root){return (root||document).querySelector(sel);}
function qsa(sel,root){return Array.prototype.slice.call((root||document).querySelectorAll(sel));}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c];});}
function uid(p){return (p||"id")+"_"+Date.now()+"_"+Math.random().toString(16).slice(2);}
function now(){return new Date().toISOString();}
function msSince(iso){return iso?Date.now()-new Date(iso).getTime():0;}
function fmt(ms){ms=Math.max(0,Math.floor((ms||0)/1000));var h=("0"+Math.floor(ms/3600)).slice(-2);var m=("0"+Math.floor((ms%3600)/60)).slice(-2);var s=("0"+(ms%60)).slice(-2);return h+":"+m+":"+s;}
function fmtDate(iso){try{return iso?new Intl.DateTimeFormat("es-CO",{dateStyle:"medium",timeStyle:"short"}).format(new Date(iso)):"—";}catch(e){return iso||"—";}}
function roleTitle(r){return roles[r]||r||"Sin rol";}
function processTitle(p){return processes[p]?processes[p].title:p||"Sin proceso";}
function isLeader(){return state.user && (state.user.role==="admin" || state.user.role==="jefe_logistico");}
function isExecutive(){return state.user && state.user.role==="gerencia";}
function canManageUsers(){return state.user && (state.user.role==="admin" || state.user.role==="gerencia");}
function canApprovePriority(){return state.user && state.user.role==="gerencia";}
function canSeeAll(){return isLeader() || isExecutive();}
function canCreate(){return state.user && state.user.role!=="gerencia" && state.user.role!=="auditoria";}
function defaultRoute(role){if(role==="gerencia")return"indicators";if(role==="ventas")return"create";if(role==="admin")return"dashboard";return"dashboard";}
function totalMs(c){return (c.closedAt?new Date(c.closedAt).getTime():Date.now())-new Date(c.createdAt).getTime();}
function activeMs(c){var v=Number(c.totalActiveMs||0);if(c.status==="en_proceso"&&c.activeStartedAt)v+=msSince(c.activeStartedAt);return v;}
function waitMs(c){var v=Number(c.totalWaitMs||0);if((c.status==="en_espera"||c.status==="espera_ventas"||c.status==="autorizacion_gerencia_pendiente")&&c.waitStartedAt)v+=msSince(c.waitStartedAt);return v;}
function deadMs(c){var v=Number(c.totalDeadMs||0);if(c.status==="asignado"&&c.deadStartedAt)v+=msSince(c.deadStartedAt);return v;}
function progress(c){var list=processes[c.currentProcess]?processes[c.currentProcess].checklist:[];var total=list.length||1;var done=0;for(var k in c.checklist){if(c.checklist[k]==="ok"||c.checklist[k]==="na")done++;}return Math.round(done/total*100);}
function showError(msg){appEl.innerHTML='<main class="error-box"><section class="error-card"><h1>No fue posible iniciar la app</h1><p>El error quedó visible para poder corregirlo.</p><pre>'+esc(msg)+'</pre><button class="btn btn-primary" onclick="location.reload()">Recargar</button></section></main>';}

function initFirebase(){
  try{
    if(!window.firebase || !window.firebaseConfig){throw new Error("No cargó Firebase o firebase-config.js");}
    if(!firebase.apps.length){firebase.initializeApp(window.firebaseConfig);}
    auth=firebase.auth();
    db=firebase.firestore();
    firebaseReady=true;
  }catch(e){
    firebaseReady=false;
    firebaseInitError=e.message||String(e);
  }
}

function loadData(){
  if(!firebaseReady || !db || !state.user){return Promise.resolve();}
  return Promise.all([
    db.collection("cases").orderBy("updatedAt","desc").get(),
    db.collection("case_events").orderBy("timestamp","desc").limit(700).get(),
    db.collection("users").get().catch(function(){return null;})
  ]).then(function(snaps){
    state.cases=[];snaps[0].forEach(function(d){var x=d.data();x.id=d.id;state.cases.push(x);});
    state.events=[];snaps[1].forEach(function(d){var x=d.data();x.id=d.id;state.events.push(x);});
    state.users=[];
    if(snaps[2])snaps[2].forEach(function(d){var x=d.data();x.id=d.id;state.users.push(x);});
  });
}

function persistCase(c,event){
  c.updatedAt=now();
  return db.collection("cases").doc(c.id).set(c,{merge:true}).then(function(){
    var i=-1;for(var x=0;x<state.cases.length;x++){if(state.cases[x].id===c.id)i=x;}
    if(i>=0)state.cases[i]=c;else state.cases.unshift(c);
    if(event)return createEvent(Object.assign({caseId:c.id,process:c.currentProcess},event));
  });
}

function createEvent(e){
  e.id=e.id||uid("ev");e.timestamp=e.timestamp||now();e.userId=state.user?state.user.uid:"";e.userName=state.user?state.user.name:"Usuario";
  return db.collection("case_events").doc(e.id).set(e).then(function(){state.events.unshift(e);});
}

function caseById(id){for(var i=0;i<state.cases.length;i++){if(state.cases[i].id===id)return state.cases[i];}return null;}
function statusChip(st){
  var map={nuevo:["Nuevo","info"],asignado:["Asignado","primary"],en_proceso:["En proceso","success"],en_espera:["En espera","warning"],espera_ventas:["Ventas pendiente","warning"],autorizacion_gerencia_pendiente:["Gerencia pendiente","warning"],cerrado_conforme:["Cerrado conforme","success"],cerrado_con_novedad:["Cerrado con novedad","danger"],cancelado:["Cancelado","danger"]};
  var m=map[st]||[st||"Sin estado","info"];return '<span class="chip '+m[1]+'">'+esc(m[0])+'</span>';
}

function routes(){
  if(!state.user)return{main:[],processes:[]};
  if(state.user.role==="gerencia")return{main:["indicators","approvals","users"],processes:[]};
  if(state.user.role==="admin")return{main:["dashboard","cases","create","requirements","approvals","indicators","users","admin"],processes:Object.keys(processes)};
  if(state.user.role==="jefe_logistico")return{main:["dashboard","cases","requirements","approvals","indicators"],processes:Object.keys(processes)};
  var p=null;Object.keys(processes).forEach(function(k){if(processes[k].ownerRole===state.user.role)p=k;});
  return{main:["dashboard",canCreate()?"create":"requirements","requirements"],processes:p?[p]:[]};
}

function navBtn(r){
  var p=processes[r];var label=p?p.title:(routeInfo[r]?routeInfo[r][0]:r);var icon=p?p.icon:(routeInfo[r]?routeInfo[r][1]:"•");
  return '<button class="'+(state.route===r?'active':'')+'" data-route="'+r+'"><span class="nav-icon">'+esc(icon)+'</span><span>'+esc(label)+'</span></button>';
}

function mobileItems(){
  if(state.user && state.user.role==="gerencia")return [["indicators","VSM","◉"],["approvals","Aprob.","✓"],["users","Usuarios","US"],["dashboard","Inicio","⌂"],["requirements","Req.","↗"]];
  if(state.user && state.user.role==="admin")return [["dashboard","Inicio","⌂"],["cases","Casos","▤"],["create","Crear","+"],["users","Usuarios","US"],["indicators","VSM","◉"]];
  var rs=routes();return [["dashboard","Inicio","⌂"],[rs.processes[0]||"requirements","Panel","▤"],[canCreate()?"create":"requirements",canCreate()?"Crear":"Req.",canCreate()?"+":"↗"],["requirements","Req.","↗"],["indicators","VSM","◉"]];
}

function layout(content){
  var rs=routes();
  appEl.innerHTML='<div class="app-layout"><aside class="sidebar"><div class="sidebar-brand"><img class="sidebar-logo" src="'+logoPath+'"><div><strong>Electroingeniería</strong><span>'+esc(roleTitle(state.user.role))+'</span></div></div><nav class="nav">'+rs.main.map(navBtn).join("")+(rs.processes.length?'<div style="height:1px;background:rgba(255,255,255,.16);margin:8px 0"></div>':"")+rs.processes.map(navBtn).join("")+'</nav><div class="sidebar-footer"><div><strong>'+esc(state.user.name)+'</strong><div>'+esc(roleTitle(state.user.role))+'</div></div><button class="btn btn-small" data-action="logout">Salir</button></div></aside><header class="mobile-top"><img class="mobile-logo" src="'+logoPath+'"><strong>'+esc(roleTitle(state.user.role))+'</strong><button class="btn btn-small" data-action="logout">Salir</button></header><main class="main">'+content+'</main><nav class="bottom-nav">'+mobileItems().map(function(x){return'<button class="'+(state.route===x[0]?'active':'')+'" data-route="'+x[0]+'"><b>'+x[2]+'</b><span>'+x[1]+'</span></button>';}).join("")+'</nav></div><div class="drawer" id="drawer"></div>';
  qsa("[data-route]").forEach(function(b){b.onclick=function(){state.route=b.getAttribute("data-route");state.selectedCase=null;render();};});
  bindActions();
}

function header(t,sub,actions){return '<div class="topbar"><div class="page-title"><h2>'+esc(t)+'</h2><p>'+esc(sub||"")+'</p></div><div class="top-actions">'+(actions||"")+'</div></div>';}

function renderLogin(){
  appEl.innerHTML='<main class="login-wrap"><section class="login-card"><div class="brand-panel"><div><div class="logo-box"><img src="'+logoPath+'" alt="Electroingeniería"></div><h1>Trazabilidad logística funcional.</h1><p>Paneles por rol, requerimientos, autorizaciones, lectura de pedido, VSM y control operativo conectado a Firebase.</p></div><div class="brand-metrics"><div class="metric"><strong>VSM</strong><span>Tiempos y flujo</span></div><div class="metric"><strong>Roles</strong><span>Panel por usuario</span></div><div class="metric"><strong>Firebase</strong><span>Datos y login</span></div></div></div><form class="login-panel" id="loginForm"><h2>Ingreso operativo</h2><p>'+(firebaseReady?'Conexión Firebase activa.':'Firebase no conectó: '+esc(firebaseInitError||"revisa conexión"))+'</p><div class="form"><label class="field"><span>Correo</span><input class="input" name="email" type="email" required placeholder="usuario@empresa.com"></label><label class="field"><span>Contraseña</span><input class="input" name="password" type="password" required placeholder="Contraseña"></label><button class="btn btn-primary" type="submit">Ingresar</button></div></form></section></main>';
  qs("#loginForm").onsubmit=function(e){e.preventDefault();login(new FormData(e.target));};
}

function login(fd){
  var email=String(fd.get("email")||"").trim();var password=String(fd.get("password")||"");
  if(!firebaseReady){showError("Firebase no está conectado. "+(firebaseInitError||""));return;}
  auth.signInWithEmailAndPassword(email,password).then(function(cred){
    return db.collection("users").doc(cred.user.uid).get().then(function(doc){
      if(!doc.exists)throw new Error("El usuario existe en Authentication, pero no tiene perfil en Firestore users/"+cred.user.uid);
      var p=doc.data();
      if(p.isActive===false)throw new Error("Usuario inactivo.");
      state.user={uid:cred.user.uid,email:email,name:p.name||email,role:p.role||"logistica"};
      sessionStorage.setItem(storageKey+"_session",JSON.stringify(state.user));
      state.route=defaultRoute(state.user.role);
      return loadData().then(render);
    });
  }).catch(function(err){showError(err.message||err);});
}

function filteredCases(){
  var list=canSeeAll()?state.cases:state.cases.filter(function(c){return c.assignedRole===state.user.role||c.createdBy===state.user.uid||c.assignedTo===state.user.uid;});
  var f=state.filters;
  if(f.search){var q=f.search.toLowerCase();list=list.filter(function(c){return [c.reference,c.client,c.assignedName,c.createdByName].join(" ").toLowerCase().indexOf(q)>=0;});}
  if(f.status)list=list.filter(function(c){return c.status===f.status;});
  if(f.process)list=list.filter(function(c){return c.currentProcess===f.process;});
  return list.sort(function(a,b){return new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt);});
}

function renderDashboard(){
  if(isExecutive())return renderIndicators();
  var list=filteredCases();var open=list.filter(function(c){return !c.closedAt;});
  var waits=open.filter(function(c){return c.status==="en_espera"||c.status==="espera_ventas"||c.status==="autorizacion_gerencia_pendiente";});
  layout(header("Inicio","Bandeja operativa según tu rol.",canCreate()?'<button class="btn btn-primary" data-route="create">Crear</button>':'')+'<section class="grid grid-4"><article class="card kpi"><span>Abiertos</span><strong>'+open.length+'</strong><small>Casos visibles</small></article><article class="card kpi"><span>Esperas</span><strong>'+waits.length+'</strong><small>Bloqueos activos</small></article><article class="card kpi"><span>Requerimientos</span><strong>'+state.cases.filter(function(c){return c.status==="espera_ventas";}).length+'</strong><small>Ventas pendiente</small></article><article class="card kpi"><span>Autorizaciones</span><strong>'+state.cases.filter(function(c){return c.status==="autorizacion_gerencia_pendiente";}).length+'</strong><small>Gerencia pendiente</small></article></section><section class="card" style="margin-top:16px"><h3>Casos recientes</h3>'+caseList(list.slice(0,8))+'</section>');
}

function caseList(list){
  if(!list.length)return'<div class="empty">No hay casos.</div>';
  return'<div class="case-list">'+list.map(function(c){return'<article class="case-card"><div><h3>'+esc(c.reference||c.id)+' · '+esc(c.client||"Caso operativo")+'</h3><div class="case-meta"><span class="chip primary">'+esc(processes[c.currentProcess]?processes[c.currentProcess].code:"")+'</span><span class="chip">'+esc(processTitle(c.currentProcess))+'</span>'+statusChip(c.status)+'<span class="chip info">'+fmt(totalMs(c))+'</span></div></div><div class="case-actions"><button class="btn btn-small" data-action="open" data-id="'+c.id+'">Ver</button>'+(c.status==="asignado"?'<button class="btn btn-primary btn-small" data-action="accept" data-id="'+c.id+'">Aceptar</button>':"")+'</div></article>';}).join("")+'</div>';
}

function renderCases(){
  var content=header("Casos","Consulta y gestión de trazabilidad.",canCreate()?'<button class="btn btn-primary" data-route="create">Crear</button>':'')+'<section class="filters"><input class="input" id="fSearch" placeholder="Buscar"><select class="select" id="fStatus"><option value="">Todos los estados</option><option value="asignado">Asignado</option><option value="en_proceso">En proceso</option><option value="espera_ventas">Ventas pendiente</option><option value="autorizacion_gerencia_pendiente">Gerencia pendiente</option><option value="cerrado_conforme">Cerrado</option></select><select class="select" id="fProcess"><option value="">Todos los procesos</option>'+Object.keys(processes).map(function(k){return'<option value="'+k+'">'+esc(processes[k].title)+'</option>';}).join("")+'</select></section>'+caseList(filteredCases());
  layout(content);
  qs("#fSearch").value=state.filters.search;qs("#fStatus").value=state.filters.status;qs("#fProcess").value=state.filters.process;
  ["fSearch","fStatus","fProcess"].forEach(function(id){qs("#"+id).oninput=function(){state.filters.search=qs("#fSearch").value;state.filters.status=qs("#fStatus").value;state.filters.process=qs("#fProcess").value;renderCases();};});
}

function renderCreate(){
  if(!canCreate()){layout(header("Crear","Acceso restringido.")+'<div class="empty">Tu rol no crea casos.</div>');return;}
  var defaultProcess=state.user.role==="ventas"?"recepcion_pedidos":(state.user.role==="alistamiento"?"alistamiento":(state.user.role==="despacho"?"despacho":"recepcion_pedidos"));
  layout(header("Crear caso","Inicio de trazabilidad desde el primer punto operativo.")+'<section class="card"><form class="form" id="caseForm"><label class="field"><span>Macroproceso inicial</span><select class="select" name="process" id="processSelect">'+Object.keys(processes).map(function(k){return'<option value="'+k+'" '+(k===defaultProcess?'selected':'')+'>'+processes[k].code+' · '+esc(processes[k].title)+'</option>';}).join("")+'</select></label><label class="field"><span>PDF pedido S-FT-33 opcional</span><input class="input" type="file" name="pdf" id="pdfInput" accept="application/pdf"></label><div id="pdfBox" class="notice">Si cargas PDF, la app intentará leer número de pedido, cliente, vendedor, pago, entrega y referencias.</div><div class="grid grid-2"><label class="field"><span>Número / pedido / referencia</span><input class="input" name="reference" id="reference" required placeholder="PVN-0000"></label><label class="field"><span>Cliente</span><input class="input" name="client" id="client" placeholder="Nombre del cliente"></label></div><div class="grid grid-2"><label class="field"><span>Tipo de gestión</span><select class="select" name="priorityMode"><option value="normal">Flujo normal</option><option value="gerencia">Prioridad o salida especial con gerencia</option></select></label><label class="field"><span>Motivo prioridad</span><input class="input" name="priorityReason" placeholder="Urgencia, cliente crítico, autorización especial"></label></div><div class="grid grid-2"><label class="field"><span>Tipo de entrega</span><input class="input" name="deliveryType" id="deliveryType"></label><label class="field"><span>Forma de pago</span><input class="input" name="paymentCondition" id="paymentCondition"></label></div><label class="field"><span>Observación</span><textarea class="textarea" name="description" id="description"></textarea></label><button class="btn btn-primary" type="submit">Crear y enviar</button></form></section>');
  qs("#caseForm").onsubmit=function(e){e.preventDefault();createCase(new FormData(e.target));};
  qs("#pdfInput").onchange=function(e){readPdf(e.target.files[0]);};
}

function readPdf(file){
  if(!file)return;
  if(!window.pdfjsLib){qs("#pdfBox").innerHTML="No cargó el lector PDF. Puedes llenar los datos manualmente.";return;}
  qs("#pdfBox").innerHTML="Leyendo PDF...";
  var reader=new FileReader();
  reader.onload=function(){
    var arr=new Uint8Array(reader.result);
    pdfjsLib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    pdfjsLib.getDocument({data:arr}).promise.then(function(pdf){
      var pages=[];var chain=Promise.resolve();
      for(var i=1;i<=pdf.numPages;i++){
        (function(pageNo){
          chain=chain.then(function(){return pdf.getPage(pageNo);}).then(function(page){return page.getTextContent();}).then(function(tc){pages.push(tc.items.map(function(it){return it.str;}).join(" "));});
        })(i);
      }
      return chain.then(function(){return pages.join(" ");});
    }).then(function(text){
      var x=extractPedido(text);
      state.pdfExtraction=x;
      if(x.orderNumber)qs("#reference").value=x.orderNumber;
      if(x.client)qs("#client").value=x.client;
      if(x.deliveryType)qs("#deliveryType").value=x.deliveryType;
      if(x.paymentCondition)qs("#paymentCondition").value=x.paymentCondition;
      qs("#pdfBox").innerHTML="<strong>PDF leído.</strong><br>Pedido: "+esc(x.orderNumber||"No detectado")+"<br>Cliente: "+esc(x.client||"No detectado")+"<br>Entrega: "+esc(x.deliveryType||"No detectado")+"<br>Pago: "+esc(x.paymentCondition||"No detectado");
    }).catch(function(err){qs("#pdfBox").innerHTML="No se pudo leer el PDF. Llena los datos manualmente. "+esc(err.message||err);});
  };
  reader.readAsArrayBuffer(file);
}

function extractPedido(text){
  text=String(text||"").replace(/\s+/g," ");
  function m(rx){var r=text.match(rx);return r?r[1].trim():"";}
  return {
    orderNumber:m(/No\.\s*([A-Z0-9\-]+)/i),
    client:m(/Cliente\s+(.+?)\s+Dirección/i) || m(/Teléfono:\s*(.+?)\s+Fecha:/i),
    deliveryType:m(/Tipo de Entrega:\s*([A-Z0-9ÁÉÍÓÚÑ\s\-]+)/i),
    paymentCondition:m(/Forma de Pago:\s*([A-Z0-9ÁÉÍÓÚÑ\s\-]+)/i),
    salesAdvisor:m(/Vendedor:\s*([A-ZÁÉÍÓÚÑ\s]+)/i),
    raw:text.slice(0,3000)
  };
}

function createCase(fd){
  var p=fd.get("process");var def=processes[p];var created=now();var priority=fd.get("priorityMode")==="gerencia";
  var x=state.pdfExtraction||{};
  var c={id:uid("PED"),type:def.type,procedureCode:def.code,currentProcess:p,status:priority?"autorizacion_gerencia_pendiente":(state.user.role==="ventas"?"asignado":"en_proceso"),priority:priority?"Gerencia / Prioritario":"Normal",reference:fd.get("reference")||x.orderNumber,client:fd.get("client")||x.client,description:fd.get("description"),deliveryType:fd.get("deliveryType")||x.deliveryType,paymentCondition:fd.get("paymentCondition")||x.paymentCondition,salesAdvisor:x.salesAdvisor||state.user.name,assignedRole:priority?"gerencia":(state.user.role==="ventas"?"logistica":def.ownerRole),assignedName:priority?"Gerencia":(state.user.role==="ventas"?"Logística":roleTitle(def.ownerRole)),assignedTo:"",createdAt:created,createdBy:state.user.uid,createdByName:state.user.name,updatedAt:created,activeStartedAt:state.user.role==="ventas"?null:created,waitStartedAt:priority?created:null,deadStartedAt:(state.user.role==="ventas"&&!priority)?created:null,totalActiveMs:0,totalWaitMs:0,totalDeadMs:0,checklist:{},openRequirement:null,priorityApproval:priority?{status:"pendiente",reason:fd.get("priorityReason")||"Solicitud prioritaria",requestedAt:created,requestedByName:state.user.name}:null,evidence:[],pdfExtraction:x};
  def.checklist.forEach(function(item){c.checklist[item]=initialCheckFromPdf(item,x);});
  persistCase(c,{type:"CASE_CREATED",detail:priority?"Pedido enviado a gerencia":"Caso creado"}).then(function(){state.pdfExtraction=null;state.route="dashboard";render();}).catch(function(e){showError(e.message||e);});
}

function initialCheckFromPdf(item,x){
  if(!x)return"pending";
  if(item==="Contenido del pedido completo")return x.orderNumber&&x.client?"ok":"pending";
  if(item==="Cliente identificado")return x.client?"ok":"pending";
  if(item==="Tipo de entrega definido")return x.deliveryType?"ok":"pending";
  if(item==="Forma de pago definida")return x.paymentCondition?"ok":"pending";
  return "pending";
}

function renderDetail(id){
  var c=caseById(id);if(!c){renderCases();return;}
  var def=processes[c.currentProcess]||processes.recepcion_pedidos;
  var actions="";
  if(!c.closedAt){
    if(c.status==="asignado")actions+='<button class="btn btn-primary" data-action="accept" data-id="'+c.id+'">Aceptar</button>';
    if(c.status==="en_proceso")actions+='<button class="btn btn-gold" data-action="wait" data-id="'+c.id+'">Requerimiento / espera</button>';
    if(c.status==="espera_ventas" && state.user.role==="ventas")actions+='<button class="btn btn-primary" data-action="answer" data-id="'+c.id+'">Responder</button>';
    if(c.status==="autorizacion_gerencia_pendiente" && state.user.role==="gerencia")actions+='<button class="btn btn-success" data-action="approve" data-id="'+c.id+'">Aprobar</button><button class="btn btn-danger" data-action="reject" data-id="'+c.id+'">Rechazar</button>';
    actions+='<button class="btn" data-action="transfer" data-id="'+c.id+'">Relevar</button><button class="btn btn-success" data-action="close" data-id="'+c.id+'">Cerrar</button>';
  }
  var checks=def.checklist.map(function(item){var v=c.checklist[item]||"pending";return'<div class="check-row"><div class="check-title">'+esc(item)+'</div><div class="segment" data-check="'+esc(item)+'" data-id="'+c.id+'">'+["ok|Conforme|ok","bad|No conforme|bad","na|N/A|na","pending|Pendiente|pending"].map(function(x){var a=x.split("|");return'<button class="'+(v===a[0]?'active '+a[2]:'')+'" data-action="check" data-value="'+a[0]+'">'+a[1]+'</button>';}).join("")+'</div></div>';}).join("");
  layout(header(c.reference||c.id,processTitle(c.currentProcess)+" · "+(c.client||"Sin cliente"),'<button class="btn" data-route="cases">Volver</button>'+actions)+'<section class="grid grid-4"><article class="card kpi"><span>Lead Time</span><strong style="font-size:1.55rem">'+fmt(totalMs(c))+'</strong><small>Total</small></article><article class="card kpi"><span>Proceso</span><strong style="font-size:1.55rem">'+fmt(activeMs(c))+'</strong><small>VA</small></article><article class="card kpi"><span>Espera</span><strong style="font-size:1.55rem">'+fmt(waitMs(c))+'</strong><small>NVA</small></article><article class="card kpi"><span>Avance</span><strong>'+progress(c)+'%</strong><small>Checklist</small></article></section>'+(c.openRequirement?'<section class="notice" style="margin-top:16px"><strong>Requerimiento activo:</strong> '+esc(c.openRequirement.reason)+' · '+esc(c.openRequirement.detail||"")+'</section>':"")+'<section class="grid grid-2" style="margin-top:16px"><article class="card"><h3>Checklist</h3><div class="checklist">'+checks+'</div></article><article class="card"><h3>Datos</h3>'+caseInfo(c)+'<h3 style="margin-top:18px">Eventos</h3>'+eventList(c.id)+'</article></section>');
}

function caseInfo(c){var rows=[["Estado",c.status],["Responsable",c.assignedName],["Creado",fmtDate(c.createdAt)],["Cliente",c.client],["Tipo entrega",c.deliveryType],["Forma pago",c.paymentCondition],["Observación",c.description],["Prioridad",c.priority]];return rows.map(function(r){return r[1]?'<div class="case-meta" style="justify-content:space-between;border-bottom:1px solid #eef2f7;padding:8px 0"><span>'+esc(r[0])+'</span><strong>'+esc(r[1])+'</strong></div>':"";}).join("");}
function eventList(id){var list=state.events.filter(function(e){return e.caseId===id;}).slice(0,10);if(!list.length)return'<div class="empty">Sin eventos.</div>';return list.map(function(e){return'<div style="border-bottom:1px solid #eef2f7;padding:8px 0"><strong>'+esc(e.type)+'</strong><br><span style="color:#64748b">'+esc(e.detail||e.reason||"")+' · '+fmtDate(e.timestamp)+'</span></div>';}).join("");}

function renderRequirements(){var list=state.cases.filter(function(c){return c.status==="espera_ventas" || c.openRequirement;});layout(header("Requerimientos","Pendientes de respuesta o escalamiento.")+caseList(list));}
function renderApprovals(){var list=state.cases.filter(function(c){return c.status==="autorizacion_gerencia_pendiente";});layout(header("Aprobaciones","Solicitudes de prioridad o salida especial.")+caseList(list));}

function renderUsers(){
  if(!canManageUsers()){layout(header("Usuarios","Acceso restringido.")+'<div class="empty">Solo admin y gerencia.</div>');return;}
  var ger=state.users.filter(function(u){return u.role==="gerencia";}).length;
  layout(header("Usuarios","Crear usuarios y asignar roles.",'<button class="btn btn-primary" data-action="userModal">Crear usuario</button>')+'<section class="grid grid-3"><article class="card kpi"><span>Usuarios</span><strong>'+state.users.length+'</strong><small>Perfiles</small></article><article class="card kpi"><span>Gerencia</span><strong>'+ger+'/2</strong><small>Límite</small></article><article class="card kpi"><span>Roles</span><strong>'+uniqueRoles()+'</strong><small>Activos</small></article></section><section class="card" style="margin-top:16px"><h3>Directorio</h3><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead><tbody>'+state.users.map(function(u){return'<tr><td>'+esc(u.name)+'</td><td>'+esc(u.email)+'</td><td>'+esc(roleTitle(u.role))+'</td><td>'+(u.isActive===false?"Inactivo":"Activo")+'</td></tr>';}).join("")+'</tbody></table></div></section>');
}
function uniqueRoles(){var m={};state.users.forEach(function(u){m[u.role]=1;});return Object.keys(m).length;}

function renderIndicators(){
  var data=canSeeAll()?state.cases:filteredCases();var total=data.length||1;var open=data.filter(function(c){return !c.closedAt;});var closed=data.filter(function(c){return c.closedAt;});var lead=0,va=0,wait=0,dead=0,rework=0,defects=0,handoffs=0;data.forEach(function(c){lead+=totalMs(c);va+=activeMs(c);wait+=waitMs(c);dead+=deadMs(c);if(state.events.some(function(e){return e.caseId===c.id && (e.type==="WAIT_STARTED"||e.type==="REQUIREMENT_SENT");}))rework++;});state.events.forEach(function(e){if(e.type==="CHECK_UPDATED"&&String(e.detail||"").indexOf("bad")>=0)defects++;if(e.type==="TRANSFER_SENT")handoffs++;});
  var nva=wait+dead;var vaPct=Math.round(va/Math.max(va+nva,1)*100);var fpy=closed.length?Math.round((closed.length-rework)/closed.length*100):0;var reworkPct=Math.round(rework/total*100);
  var rows=Object.keys(processes).map(function(p){var l=data.filter(function(c){return c.currentProcess===p;});var tm=0,ac=0,wt=0;l.forEach(function(c){tm+=totalMs(c);ac+=activeMs(c);wt+=waitMs(c);});return{label:processTitle(p),value:tm,count:l.length,active:ac,wait:wt};}).filter(function(r){return r.count>0;}).sort(function(a,b){return b.value-a.value;});
  layout(header("VSM gerencial","Lead Time, Cycle Time, VA/NVA, WIP, reproceso, FPY y cuello de botella.",'<button class="btn" data-route="approvals">Aprobaciones</button>')+'<section class="grid grid-4"><article class="card kpi"><span>Lead Time</span><strong style="font-size:1.55rem">'+fmt(lead/total)+'</strong><small>Promedio</small></article><article class="card kpi"><span>% VA</span><strong>'+vaPct+'%</strong><small>Valor agregado</small></article><article class="card kpi"><span>WIP</span><strong>'+open.length+'</strong><small>En proceso</small></article><article class="card kpi"><span>FPY</span><strong>'+Math.max(0,fpy)+'%</strong><small>Correctos primera vez</small></article><article class="card kpi"><span>Reproceso</span><strong>'+reworkPct+'%</strong><small>Casos con corrección</small></article><article class="card kpi"><span>No conformidades</span><strong>'+defects+'</strong><small>Errores registrados</small></article><article class="card kpi"><span>Throughput</span><strong>'+closed.length+'</strong><small>Cerrados</small></article><article class="card kpi"><span>Handoffs</span><strong>'+handoffs+'</strong><small>Relevos</small></article></section><section class="grid grid-2" style="margin-top:16px"><article class="chart-card"><div class="chart-title">Resumen por área · tiempo</div>'+bars(rows)+'</article><article class="chart-card"><div class="chart-title">VA vs NVA</div>'+bars([{label:"VA",value:va},{label:"NVA",value:nva},{label:"Espera",value:wait},{label:"Muerto",value:dead}])+'</article></section><section class="card" style="margin-top:16px"><h3>Tabla VSM por macroproceso</h3><div class="table-wrap"><table><thead><tr><th>Macroproceso</th><th>WIP</th><th>Cycle Time</th><th>Espera</th><th>Total</th><th>Cuello</th></tr></thead><tbody>'+rows.map(function(r,i){return'<tr><td>'+esc(r.label)+'</td><td>'+r.count+'</td><td>'+fmt(r.active/Math.max(r.count,1))+'</td><td>'+fmt(r.wait)+'</td><td>'+fmt(r.value)+'</td><td>'+(i===0?'Principal':'—')+'</td></tr>';}).join("")+'</tbody></table></div></section>');
}
function bars(rows){if(!rows.length)return'<div class="empty">Sin datos.</div>';var max=Math.max.apply(null,rows.map(function(r){return r.value;}))||1;return'<div class="bars">'+rows.map(function(r){return'<div class="bar-row"><span>'+esc(r.label)+'</span><div><b style="width:'+Math.max(4,Math.round(r.value/max*100))+'%"></b></div><strong>'+fmt(r.value)+'</strong></div>';}).join("")+'</div>';}

function renderAdmin(){layout(header("Administración","Estado de conexión.")+'<section class="grid grid-2"><article class="card"><h3>Conexión</h3><p>Firebase: <strong>'+(firebaseReady?"activo":"no conectado")+'</strong></p><p>Proyecto: <strong>trazabilidadlog</strong></p></article><article class="card"><h3>Producción</h3><p>Esta versión no carga demos ni datos locales.</p><button class="btn btn-gold" data-action="clearPwa">Actualizar caché PWA</button></article></section>');}

function drawer(html){var d=qs("#drawer");d.innerHTML=html;d.classList.add("open");qsa("[data-close]",d).forEach(function(b){b.onclick=closeDrawer;});d.onclick=function(e){if(e.target===d)closeDrawer();};}
function closeDrawer(){var d=qs("#drawer");if(d){d.classList.remove("open");d.innerHTML="";}}
function modal(title,body){return'<section class="modal"><div class="modal-head"><h3>'+esc(title)+'</h3><button class="btn btn-small" data-close>Cerrar</button></div>'+body+'</section>';}

function openWait(id){var c=caseById(id);var def=processes[c.currentProcess];drawer(modal("Requerimiento / espera",'<form class="form" id="waitForm"><label class="field"><span>Motivo</span><select class="select" name="reason">'+def.waits.map(function(w){return'<option>'+esc(w)+'</option>';}).join("")+'</select></label><label class="field"><span>Área responsable</span><select class="select" name="role"><option value="ventas">Ventas</option><option value="logistica">Logística</option><option value="jefe_logistico">Jefe logístico</option><option value="gerencia">Gerencia</option></select></label><label class="field"><span>Detalle</span><textarea class="textarea" name="detail"></textarea></label><button class="btn btn-primary" type="submit">Enviar</button></form>'));qs("#waitForm").onsubmit=function(e){e.preventDefault();var fd=new FormData(e.target);c.totalActiveMs=Number(c.totalActiveMs||0)+msSince(c.activeStartedAt);c.activeStartedAt=null;c.status=fd.get("role")==="ventas"?"espera_ventas":"en_espera";c.waitStartedAt=now();c.assignedRole=fd.get("role");c.assignedName=roleTitle(fd.get("role"));c.openRequirement={reason:fd.get("reason"),detail:fd.get("detail"),targetRole:fd.get("role")};persistCase(c,{type:"REQUIREMENT_SENT",reason:fd.get("reason"),detail:fd.get("detail")}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});};}
function openAnswer(id){var c=caseById(id);drawer(modal("Responder requerimiento",'<form class="form" id="ansForm"><label class="field"><span>Respuesta</span><textarea class="textarea" name="detail" required></textarea></label><button class="btn btn-primary" type="submit">Responder y devolver a logística</button></form>'));qs("#ansForm").onsubmit=function(e){e.preventDefault();var fd=new FormData(e.target);c.totalWaitMs=Number(c.totalWaitMs||0)+msSince(c.waitStartedAt);c.waitStartedAt=null;c.status="en_proceso";c.assignedRole="logistica";c.assignedName="Logística";c.activeStartedAt=now();c.openRequirement=null;persistCase(c,{type:"REQUIREMENT_ANSWERED",detail:fd.get("detail")}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});};}
function openTransfer(id){var c=caseById(id);var def=processes[c.currentProcess];var opts=(def.next.length?def.next:Object.keys(processes));drawer(modal("Relevar caso",'<form class="form" id="trForm"><label class="field"><span>Proceso destino</span><select class="select" name="process">'+opts.map(function(p){return'<option value="'+p+'">'+esc(processTitle(p))+'</option>';}).join("")+'</select></label><label class="field"><span>Nota</span><textarea class="textarea" name="detail"></textarea></label><button class="btn btn-primary" type="submit">Enviar relevo</button></form>'));qs("#trForm").onsubmit=function(e){e.preventDefault();var fd=new FormData(e.target);var np=fd.get("process");c.totalActiveMs=Number(c.totalActiveMs||0)+msSince(c.activeStartedAt);c.activeStartedAt=null;c.currentProcess=np;c.status="asignado";c.assignedRole=processes[np].ownerRole;c.assignedName=roleTitle(processes[np].ownerRole);c.deadStartedAt=now();c.checklist={};processes[np].checklist.forEach(function(x){c.checklist[x]="pending";});persistCase(c,{type:"TRANSFER_SENT",detail:fd.get("detail")||"Relevo a "+processTitle(np)}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});};}
function openClose(id){var c=caseById(id);drawer(modal("Cerrar caso",'<form class="form" id="closeForm"><label class="field"><span>Resultado</span><select class="select" name="status"><option value="cerrado_conforme">Cerrado conforme</option><option value="cerrado_con_novedad">Cerrado con novedad</option><option value="cancelado">Cancelado</option></select></label><label class="field"><span>Detalle</span><textarea class="textarea" name="detail"></textarea></label><button class="btn btn-success" type="submit">Cerrar</button></form>'));qs("#closeForm").onsubmit=function(e){e.preventDefault();var fd=new FormData(e.target);if(c.activeStartedAt)c.totalActiveMs=Number(c.totalActiveMs||0)+msSince(c.activeStartedAt);if(c.waitStartedAt)c.totalWaitMs=Number(c.totalWaitMs||0)+msSince(c.waitStartedAt);if(c.deadStartedAt)c.totalDeadMs=Number(c.totalDeadMs||0)+msSince(c.deadStartedAt);c.activeStartedAt=null;c.waitStartedAt=null;c.deadStartedAt=null;c.status=fd.get("status");c.closedAt=now();persistCase(c,{type:"CASE_CLOSED",detail:fd.get("detail")}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});};}
function openUserModal(){var ger=state.users.filter(function(u){return u.role==="gerencia";}).length;drawer(modal("Crear usuario",'<form class="form" id="uForm"><label class="field"><span>Nombre</span><input class="input" name="name" required></label><label class="field"><span>Correo</span><input class="input" name="email" type="email" required></label><label class="field"><span>Contraseña temporal</span><input class="input" name="password" type="password" required minlength="6"></label><label class="field"><span>Rol</span><select class="select" name="role">'+Object.keys(roles).map(function(r){return'<option value="'+r+'" '+(r==="gerencia"&&ger>=2?"disabled":"")+'>'+esc(roles[r])+(r==="gerencia"?" · "+ger+"/2":"")+'</option>';}).join("")+'</select></label><button class="btn btn-primary" type="submit">Crear</button></form>'));qs("#uForm").onsubmit=function(e){e.preventDefault();createUser(new FormData(e.target));};}
function createUser(fd){var name=fd.get("name"),email=fd.get("email"),pass=fd.get("password"),role=fd.get("role");if(role==="gerencia"&&state.users.filter(function(u){return u.role==="gerencia";}).length>=2){alert("Solo se permiten dos usuarios de gerencia.");return;}var second=firebase.initializeApp(window.firebaseConfig,"creator_"+Date.now());second.auth().createUserWithEmailAndPassword(email,pass).then(function(cred){return db.collection("users").doc(cred.user.uid).set({name:name,email:email,role:role,isActive:true,createdAt:now(),createdBy:state.user.uid});}).then(function(){return second.auth().signOut();}).then(function(){return second.delete();}).then(function(){return loadData();}).then(function(){closeDrawer();renderUsers();}).catch(function(e){showError(e.message||e);});}

function approve(id){var c=caseById(id);c.totalWaitMs=Number(c.totalWaitMs||0)+msSince(c.waitStartedAt);c.waitStartedAt=null;c.status="asignado";c.assignedRole="logistica";c.assignedName="Logística · Prioritario";c.deadStartedAt=now();c.priority="Gerencia aprobada";if(c.priorityApproval)c.priorityApproval.status="aprobado";persistCase(c,{type:"MANAGER_APPROVED",detail:"Gerencia aprobó prioridad"}).then(function(){renderApprovals();}).catch(function(e){showError(e.message||e);});}
function reject(id){var c=caseById(id);c.status="cancelado";c.closedAt=now();if(c.priorityApproval)c.priorityApproval.status="rechazado";persistCase(c,{type:"MANAGER_REJECTED",detail:"Gerencia rechazó prioridad"}).then(function(){renderApprovals();}).catch(function(e){showError(e.message||e);});}
function accept(id){var c=caseById(id);c.status="en_proceso";c.assignedTo=state.user.uid;c.assignedName=state.user.name;c.totalDeadMs=Number(c.totalDeadMs||0)+msSince(c.deadStartedAt);c.deadStartedAt=null;c.activeStartedAt=now();persistCase(c,{type:"CASE_ACCEPTED",detail:"Caso aceptado"}).then(function(){renderDetail(id);}).catch(function(e){showError(e.message||e);});}
function updateCheck(el){var seg=el.parentNode;var id=seg.getAttribute("data-id");var item=seg.getAttribute("data-check");var val=el.getAttribute("data-value");var c=caseById(id);c.checklist[item]=val;persistCase(c,{type:"CHECK_UPDATED",detail:item+": "+val}).then(function(){renderDetail(id);}).catch(function(e){showError(e.message||e);});}


function clearPwaCache(){
  if("serviceWorker" in navigator){
    navigator.serviceWorker.getRegistrations().then(function(regs){
      regs.forEach(function(r){
        if(r.active){ r.active.postMessage({type:"CLEAR_CACHE"}); }
        r.update();
      });
      setTimeout(function(){ location.reload(); }, 700);
    }).catch(function(){ location.reload(); });
  }else{
    location.reload();
  }
}

function bindActions(){
  qsa("[data-action]").forEach(function(b){b.onclick=function(){var a=b.getAttribute("data-action");var id=b.getAttribute("data-id");if(a==="logout"){sessionStorage.removeItem(storageKey+"_session");if(auth)auth.signOut().catch(function(){});state.user=null;renderLogin();}if(a==="open")renderDetail(id);if(a==="accept")accept(id);if(a==="wait")openWait(id);if(a==="answer")openAnswer(id);if(a==="transfer")openTransfer(id);if(a==="close")openClose(id);if(a==="approve")approve(id);if(a==="reject")reject(id);if(a==="userModal")openUserModal();if(a==="check")updateCheck(b);if(a==="clearPwa")clearPwaCache();};});
}

function render(){
  if(!state.user){renderLogin();return;}
  if(processes[state.route]){state.filters.process=state.route;renderCases();return;}
  if(state.route==="dashboard")renderDashboard();
  else if(state.route==="cases")renderCases();
  else if(state.route==="create")renderCreate();
  else if(state.route==="requirements")renderRequirements();
  else if(state.route==="approvals")renderApprovals();
  else if(state.route==="indicators")renderIndicators();
  else if(state.route==="users")renderUsers();
  else if(state.route==="admin")renderAdmin();
  else renderDashboard();
}

function boot(){
  try{
    initFirebase();
    var saved=sessionStorage.getItem(storageKey+"_session");
    if(saved){try{state.user=JSON.parse(saved);state.route=defaultRoute(state.user.role);}catch(e){}}
    if(state.user){loadData().then(render).catch(function(e){showError(e.message||e);});}
    else renderLogin();
  }catch(e){showError(e.message||e);}
}

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();

})();
