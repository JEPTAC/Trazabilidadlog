(function(){
"use strict";

var appEl = document.getElementById("app");
var logoPath = (window.appSettings && window.appSettings.logoPath) || "./assets/logo-electroingenieria.jpeg";
var storageKey = "ei_trazabilidad_secuencial_v6_ios";
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
  pdfExtraction: null
};

var roles = {
  admin:"Administrador / Desarrollador",
  gerencia:"Gerencia",
  ventas:"Ventas",
  jefe_logistica:"Jefe de logística",
  lider_logistico:"Líder logístico",
  coordinador_logistico:"Coordinador logístico",
  aux_logistica:"Auxiliar logística",
  caja:"Caja",
  inventarios:"Inventarios",
  auditoria:"Auditoría"
};

var FLOW = [
  "recepcion_pedidos",
  "alistamiento",
  "compromiso_mercancia",
  "facturacion",
  "caja",
  "cliente_punto",
  "cliente_recoge",
  "despacho_local",
  "despacho_nacional",
  "cierre_despacho_nacional"
];

var processes = {
  recepcion_pedidos:{
    code:"S-PR-2", title:"Recepción de pedidos", ownerRoles:["lider_logistico","coordinador_logistico"], icon:"RP",
    checklist:["Contenido del pedido completo","Cliente identificado","NIT o identificación visible","Referencia completa","Cantidad completa","Unidad de medida completa","Tipo de entrega definido","Dirección de entrega definida","Bodega definida","Forma de pago definida","Observaciones revisadas","Autorización comercial si aplica","Pedido listo para alistamiento"],
    waits:["Falta referencia","Falta cantidad","Falta unidad de medida","Falta tipo de entrega","Falta dirección de entrega","Falta bodega","Falta forma de pago","Falta autorización comercial","Falta aclaración del asesor","Documento ilegible"],
    next:["alistamiento"]
  },
  alistamiento:{
    code:"S-PR-4", title:"Alistamiento de mercancía", ownerRoles:["aux_logistica"], icon:"AL",
    checklist:["Pedido recibido","Productos y cantidades ubicadas","Referencia coincide","Descripción coincide","Cantidad coincide","Unidad de medida coincide","Ubicación correcta","Estado físico conforme","Lote validado si aplica","Cable validado si aplica","Remanente mínimo validado si aplica"],
    waits:["No se encuentra mercancía","Cantidad insuficiente","Referencia diferente","Unidad de medida diferente","Lote diferente","Ubicación errada","Mercancía averiada","Remanente menor a 50 m","Requiere autorización de líder logístico"],
    next:["compromiso_mercancia"]
  },
  compromiso_mercancia:{
    code:"S-PR-4", title:"Comprometer mercancía", ownerRoles:["lider_logistico","coordinador_logistico"], icon:"CM",
    checklist:["Mercancía físicamente conforme","Pedido validado contra alistamiento","Aprobación de conformidad registrada","Cambio de lote validado si aplica","Conversión de unidad validada si aplica","Mercancía comprometida en ERP","Documento actualizado","Pedido listo para facturación"],
    waits:["Diferencia entre físico y sistema","Requiere cambio de lote","Requiere conversión de unidad","Error al comprometer en ERP","Pedido bloqueado","Requiere autorización logística"],
    next:["facturacion"]
  },
  facturacion:{
    code:"S-PR-5", title:"Facturación del pedido", ownerRoles:["lider_logistico","coordinador_logistico"], icon:"FC",
    checklist:["Pedido recibido para facturar","Tipo de pedido validado","Si es PVC, continúa facturación logística","Si no es PVC, relevar a caja","Factura generada correctamente","Documento validado","Tipo de entrega seleccionado","Factura entregada a despacho"],
    waits:["Pago pendiente","Soporte incompleto","Error en Siesa","Error de factura electrónica","Documento rechazado","Falta autorización de cartera","Cliente con datos incompletos"],
    next:["caja","cliente_punto","cliente_recoge","despacho_local","despacho_nacional"]
  },
  caja:{
    code:"S-PR-5", title:"Caja", ownerRoles:["caja"], icon:"CJ",
    checklist:["Pedido recibido desde facturación","Valor validado","Soporte de pago validado","Recaudo confirmado","Liberación registrada","Pedido listo para despacho"],
    waits:["Cliente no ha pagado","Pago pendiente de validación","Soporte incompleto","Diferencia en valor","Caja no confirma recaudo"],
    next:["cliente_punto","cliente_recoge","despacho_local","despacho_nacional"]
  },
  cliente_punto:{
    code:"S-PR-6", title:"Entrega cliente en punto", ownerRoles:["coordinador_logistico"], icon:"CP",
    checklist:["Factura coincide con pedido","Producto coincide con factura","Cliente identificado","Referencias correctas","Cantidades correctas","Estado físico conforme","Chequeo con el cliente realizado","Cliente recibe conforme","Soporte de entrega registrado","Fotos anexadas si aplica"],
    waits:["Cliente no acepta mercancía","Cliente solicita cambio","Cliente no está autorizado","Cliente no confirma retiro","Documento no coincide","Producto equivocado","Cantidad diferente"],
    next:["cierre_caso"]
  },
  cliente_recoge:{
    code:"S-PR-6", title:"Cliente recoge", ownerRoles:["coordinador_logistico"], icon:"CR",
    checklist:["Factura coincide con pedido","Producto coincide con factura","Autorización de recogida validada","Persona autorizada identificada","Referencias correctas","Cantidades correctas","Estado físico conforme","Empaque conforme","Entrega realizada","Soporte de entrega registrado"],
    waits:["Persona no autorizada","Falta autorización del cliente","Documento no coincide","Producto incompleto","Producto equivocado","Cantidad diferente","Cliente no confirma retiro"],
    next:["cierre_caso"]
  },
  despacho_local:{
    code:"S-PR-6", title:"Despacho local", ownerRoles:["coordinador_logistico"], icon:"DL",
    checklist:["Factura coincide con pedido","Producto coincide con factura","Dirección completa","Documento de salida validado","Empaque conforme","Rotulación conforme","Fotos del material alistado anexadas","Cargue supervisado","Entrega realizada","Confirmación de recibido registrada"],
    waits:["Falta empaque","Falta etiqueta","Mercancía incompleta","Dirección incompleta","Falta documento","Pedido no liberado","Novedad de cargue","Cliente no recibe"],
    next:["cierre_caso"]
  },
  despacho_nacional:{
    code:"S-PR-6", title:"Despacho nacional", ownerRoles:["lider_logistico"], icon:"DN",
    checklist:["Factura coincide con pedido","Producto coincide con factura","Número de unidades definido","Dimensiones registradas","Destino validado","Condiciones de envío definidas","Transportadora coordinada","Guía o flete validado","Fotos del material alistado anexadas","Cargue supervisado","Apoyo de auxiliar logística registrado en cargue"],
    waits:["Falta guía","Falta flete","Transportadora no recoge","Plataforma no disponible","Falta datos de destino","Falta confirmación de recogida","Pedido no liberado"],
    next:["cierre_despacho_nacional"]
  },
  cierre_despacho_nacional:{
    code:"S-PR-6", title:"Cierre despacho nacional", ownerRoles:["coordinador_logistico"], icon:"CD",
    checklist:["Soporte de transporte recibido","Guía validada","Confirmación de entrega validada","Reporte diario a asesores enviado","Novedades registradas si aplica","Proceso cerrado"],
    waits:["Transportadora no confirma entrega","Falta guía","Falta soporte","Pendiente reporte","Novedad sin cierre"],
    next:["cierre_caso"]
  }
};

var routeInfo = {
  dashboard:["Inicio","IN"], cases:["Casos","CS"], create:["Crear pedido","CR"], requirements:["Requerimientos","RQ"],
  approvals:["Aprobaciones","AU"], indicators:["VSM","VS"], users:["Usuarios","US"], admin:["Admin","AD"]
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
function processOwnerRoles(p){return processes[p] ? processes[p].ownerRoles : [];}
function canAccessProcess(role,p){return processOwnerRoles(p).indexOf(role)>=0;}
function primaryOwnerRole(p){return processOwnerRoles(p)[0]||"";}
function processOwnerTitle(p){return processOwnerRoles(p).map(function(r){return roleTitle(r);}).join(" / ");}
function isLeader(){return state.user && (state.user.role==="admin" || state.user.role==="lider_logistico");}
function isJefeLogistica(){return state.user && state.user.role==="jefe_logistica";}
function isExecutive(){return state.user && state.user.role==="gerencia";}
function canManageUsers(){return state.user && (state.user.role==="admin" || state.user.role==="gerencia");}
function canApprovePriority(){return state.user && state.user.role==="gerencia";}
function canSeeAll(){return state.user && (state.user.role==="admin" || state.user.role==="gerencia" || state.user.role==="jefe_logistica");}
function canCreate(){return state.user && state.user.role==="ventas";}
function defaultRoute(role){if(role==="gerencia")return"indicators";if(role==="ventas")return"create";if(role==="jefe_logistica")return"dashboard";if(role==="lider_logistico"||role==="coordinador_logistico")return"recepcion_pedidos";if(role==="aux_logistica")return"alistamiento";if(role==="caja")return"caja";return"dashboard";}
function currentProc(c){return c.currentProcess;}
function procStats(c,p){c.processStats=c.processStats||{};c.processStats[p]=c.processStats[p]||{activeMs:0,waitMs:0,deadMs:0,startedAt:null,completedAt:null,handoffs:0};return c.processStats[p];}
function totalMs(c){return (c.closedAt?new Date(c.closedAt).getTime():Date.now())-new Date(c.createdAt).getTime();}
function activeMs(c){var total=0;Object.keys(c.processStats||{}).forEach(function(k){total+=Number(c.processStats[k].activeMs||0);});if(c.status==="en_proceso"&&c.activeStartedAt)total+=msSince(c.activeStartedAt);return total;}
function waitMs(c){var total=0;Object.keys(c.processStats||{}).forEach(function(k){total+=Number(c.processStats[k].waitMs||0);});if((c.status==="en_espera"||c.status==="espera_ventas"||c.status==="pendiente_gerencia")&&c.waitStartedAt)total+=msSince(c.waitStartedAt);return total;}
function deadMs(c){var total=0;Object.keys(c.processStats||{}).forEach(function(k){total+=Number(c.processStats[k].deadMs||0);});if(c.status==="asignado"&&c.deadStartedAt)total+=msSince(c.deadStartedAt);return total;}
function progress(c){var def=processes[c.currentProcess];var list=def?def.checklist:[];var total=list.length||1;var done=0;for(var k in c.checklist){if(c.checklist[k]==="ok"||c.checklist[k]==="na")done++;}return Math.round(done/total*100);}
function showError(msg){appEl.innerHTML='<main class="error-box"><section class="error-card"><h1>No fue posible iniciar la app</h1><p>El error quedó visible para corregirlo.</p><pre>'+esc(msg)+'</pre><button class="btn btn-primary" onclick="location.reload()">Recargar</button></section></main>';}

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
    db.collection("case_events").orderBy("timestamp","desc").limit(900).get(),
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
  var map={creado_ventas:["Creado por ventas","info"],asignado:["Asignado","primary"],en_proceso:["En proceso","success"],en_espera:["En espera","warning"],espera_ventas:["Ventas pendiente","warning"],pendiente_gerencia:["Gerencia pendiente","warning"],cerrado_conforme:["Cerrado conforme","success"],cerrado_con_novedad:["Cerrado con novedad","danger"],cancelado:["Cancelado","danger"]};
  var m=map[st]||[st||"Sin estado","info"];return '<span class="chip '+m[1]+'">'+esc(m[0])+'</span>';
}

function routes(){
  if(!state.user)return{main:[],processes:[]};
  if(state.user.role==="gerencia")return{main:["indicators","approvals","users"],processes:[]};
  if(state.user.role==="admin")return{main:["dashboard","cases","requirements","approvals","indicators","users","admin"],processes:Object.keys(processes)};
  if(state.user.role==="jefe_logistica"){
    return{main:["dashboard","cases","requirements","approvals","indicators","admin"],processes:Object.keys(processes).filter(function(k){return k!=="caja";})};
  }
  var own=Object.keys(processes).filter(function(k){return canAccessProcess(state.user.role,k);});
  return{main:["dashboard"].concat(canCreate()?["create"]:[]).concat(["requirements","indicators"]),processes:own};
}

function navBtn(r){
  var p=processes[r];var label=p?p.title:(routeInfo[r]?routeInfo[r][0]:r);var icon=p?p.icon:(routeInfo[r]?routeInfo[r][1]:"•");
  return '<button class="'+(state.route===r?'active':'')+'" data-route="'+r+'"><span class="nav-icon">'+esc(icon)+'</span><span>'+esc(label)+'</span></button>';
}

function mobileItems(){
  if(state.user && state.user.role==="gerencia")return [["indicators","VSM","◉"],["approvals","Aprob.","✓"],["users","Usuarios","US"],["dashboard","Inicio","⌂"],["requirements","Req.","↗"]];
  if(state.user && state.user.role==="jefe_logistica")return [["dashboard","Inicio","⌂"],["cases","Casos","▤"],["requirements","Req.","↗"],["approvals","Aprob.","✓"],["indicators","VSM","◉"]];
  var rs=routes();return [["dashboard","Inicio","⌂"],[rs.processes[0]||"cases","Panel","▤"],[canCreate()?"create":"requirements",canCreate()?"Crear":"Req.",canCreate()?"+":"↗"],["requirements","Req.","↗"],["indicators","VSM","◉"]];
}

function allMobileRoutes(){
  var rs=routes();
  var items=[];
  rs.main.forEach(function(r){
    var info=routeInfo[r]||[r,"•"];
    items.push({route:r,label:info[0],icon:info[1],group:"Principal"});
  });
  rs.processes.forEach(function(r){
    if(processes[r])items.push({route:r,label:processes[r].title,icon:processes[r].icon,group:"Macroprocesos"});
  });
  return items;
}

function mobileFullMenuHtml(){
  var items=allMobileRoutes();
  var groups={};
  items.forEach(function(item){
    groups[item.group]=groups[item.group]||[];
    groups[item.group].push(item);
  });
  return '<section class="mobile-menu-panel"><div class="mobile-menu-head"><div><strong>Menú completo</strong><span>'+esc(roleTitle(state.user.role))+'</span></div><button class="btn btn-small" data-action="closeMobileMenu">Cerrar</button></div>'+
    Object.keys(groups).map(function(group){
      return '<div class="mobile-menu-group"><h3>'+esc(group)+'</h3><div class="mobile-menu-grid">'+groups[group].map(function(item){
        return '<button class="'+(state.route===item.route?'active':'')+'" data-route="'+item.route+'"><b>'+esc(item.icon)+'</b><span>'+esc(item.label)+'</span></button>';
      }).join("")+'</div></div>';
    }).join("")+
  '</section>';
}

function layout(content){
  var rs=routes();
  appEl.innerHTML='<div class="app-layout"><aside class="sidebar"><div class="sidebar-brand"><img class="sidebar-logo" src="'+logoPath+'"><div><strong>Electroingeniería</strong><span>'+esc(roleTitle(state.user.role))+'</span></div></div><nav class="nav">'+rs.main.map(navBtn).join("")+(rs.processes.length?'<div style="height:1px;background:rgba(255,255,255,.16);margin:8px 0"></div>':"")+rs.processes.map(navBtn).join("")+'</nav><div class="sidebar-footer"><div><strong>'+esc(state.user.name)+'</strong><div>'+esc(roleTitle(state.user.role))+'</div></div><button class="btn btn-small" data-action="logout">Salir</button></div></aside><header class="mobile-top"><img class="mobile-logo" src="'+logoPath+'"><strong>'+esc(roleTitle(state.user.role))+'</strong><button class="btn btn-small" data-action="openMobileMenu">Menú</button></header><main class="main">'+content+'</main><nav class="bottom-nav">'+mobileItems().map(function(x){return'<button class="'+(state.route===x[0]?'active':'')+'" data-route="'+x[0]+'"><b>'+x[2]+'</b><span>'+x[1]+'</span></button>';}).join("")+'<button data-action="openMobileMenu"><b>☰</b><span>Todo</span></button></nav></div><div class="drawer" id="drawer"></div><div class="mobile-menu-overlay" id="mobileMenu"><div class="mobile-menu-backdrop" data-action="closeMobileMenu"></div>'+mobileFullMenuHtml()+'</div>';
  qsa("[data-route]").forEach(function(b){b.onclick=function(){state.route=b.getAttribute("data-route");closeMobileMenu();render();};});
  bindActions();
}

function header(t,sub,actions){return '<div class="topbar"><div class="page-title"><h2>'+esc(t)+'</h2><p>'+esc(sub||"")+'</p></div><div class="top-actions">'+(actions||"")+'</div></div>';}

function renderLogin(){
  appEl.innerHTML='<main class="login-wrap"><section class="login-card"><div class="brand-panel"><div><div class="logo-box"><img src="'+logoPath+'" alt="Electroingeniería"></div><h1>Trazabilidad secuencial.</h1><p>Ventas inicia, logística valida, aux logística alista, líder o coordinador compromete y factura, y desde facturación se desbloquea la ruta de entrega.</p></div><div class="brand-metrics"><div class="metric"><strong>Secuencia</strong><span>Sin procesos sueltos</span></div><div class="metric"><strong>Tiempo</strong><span>Macroproceso y espera</span></div><div class="metric"><strong>VSM</strong><span>Indicadores por área</span></div></div></div><form class="login-panel" id="loginForm"><h2>Ingreso operativo</h2><p>'+(firebaseReady?'Conexión Firebase activa.':'Firebase no conectó: '+esc(firebaseInitError||"revisa conexión"))+'</p><div class="form"><label class="field"><span>Correo</span><input class="input" name="email" type="email" required placeholder="usuario@empresa.com"></label><label class="field"><span>Contraseña</span><input class="input" name="password" type="password" required placeholder="Contraseña"></label><button class="btn btn-primary" type="submit">Ingresar</button></div></form></section></main>';
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
      state.user={uid:cred.user.uid,email:email,name:p.name||email,role:p.role||"coordinador_logistico"};
      sessionStorage.setItem(storageKey+"_session",JSON.stringify(state.user));
      state.route=defaultRoute(state.user.role);
      return loadData().then(render);
    });
  }).catch(function(err){showError(err.message||err);});
}

function visibleCases(){
  var list=canSeeAll()?state.cases:state.cases.filter(function(c){
    return c.assignedRole===state.user.role || c.createdBy===state.user.uid || c.assignedTo===state.user.uid || canAccessProcess(state.user.role,c.currentProcess);
  });
  var f=state.filters;
  if(f.search){var q=f.search.toLowerCase();list=list.filter(function(c){return [c.reference,c.client,c.assignedName,c.createdByName,c.deliveryType].join(" ").toLowerCase().indexOf(q)>=0;});}
  if(f.status)list=list.filter(function(c){return c.status===f.status;});
  if(f.process)list=list.filter(function(c){return c.currentProcess===f.process;});
  return list.sort(function(a,b){
    var pa=(a.priority==="Alta"||a.managerApproved)?1:0, pb=(b.priority==="Alta"||b.managerApproved)?1:0;
    if(pa!==pb)return pb-pa;
    return new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt);
  });
}

function renderDashboard(){
  if(isExecutive())return renderIndicators();
  var list=visibleCases();var open=list.filter(function(c){return !c.closedAt;});
  var waits=open.filter(function(c){return c.status==="en_espera"||c.status==="espera_ventas"||c.status==="pendiente_gerencia";});
  layout(header("Inicio","Bandeja operativa según el flujo secuencial.",((canNotify()&&Notification.permission!=="granted")?'<button class="btn btn-gold" data-action="notifyOn">Activar notificaciones</button>':'')+(canCreate()?'<button class="btn btn-primary" data-route="create">Crear pedido</button>':''))+'<section class="grid grid-4"><article class="card kpi"><span>Abiertos</span><strong>'+open.length+'</strong><small>Casos visibles</small></article><article class="card kpi"><span>Esperas</span><strong>'+waits.length+'</strong><small>Bloqueos activos</small></article><article class="card kpi"><span>Requerimientos</span><strong>'+state.cases.filter(function(c){return c.status==="espera_ventas"||c.status==="en_espera";}).length+'</strong><small>En resolución</small></article><article class="card kpi"><span>Prioritarios</span><strong>'+state.cases.filter(function(c){return c.priority==="Alta"&&!c.closedAt;}).length+'</strong><small>Gerencia aprobada</small></article></section><section class="card" style="margin-top:16px"><h3>Casos recientes</h3>'+caseList(list.slice(0,10))+'</section>');
}

function caseList(list){
  if(!list.length)return'<div class="empty">No hay casos.</div>';
  return'<div class="case-list">'+list.map(function(c){return'<article class="case-card"><div><h3>'+esc(c.reference||c.id)+' · '+esc(c.client||"Caso operativo")+'</h3><div class="case-meta">'+(c.priority==="Alta"?'<span class="chip warning">Prioritario</span>':'')+'<span class="chip primary">'+esc(processes[c.currentProcess]?processes[c.currentProcess].code:"")+'</span><span class="chip">'+esc(processTitle(c.currentProcess))+'</span>'+statusChip(c.status)+'<span class="chip info">'+fmt(totalMs(c))+'</span></div></div><div class="case-actions"><button class="btn btn-small" data-action="open" data-id="'+c.id+'">Ver</button>'+(c.status==="asignado"&&canAccessProcess(state.user.role,c.currentProcess)?'<button class="btn btn-primary btn-small" data-action="accept" data-id="'+c.id+'">Aceptar</button>':"")+'</div></article>';}).join("")+'</div>';
}

function renderCases(){
  var content=header("Casos","Consulta y gestión por macroproceso.",((canNotify()&&Notification.permission!=="granted")?'<button class="btn btn-gold" data-action="notifyOn">Activar notificaciones</button>':'')+(canCreate()?'<button class="btn btn-primary" data-route="create">Crear pedido</button>':''))+'<section class="filters"><input class="input" id="fSearch" placeholder="Buscar"><select class="select" id="fStatus"><option value="">Todos los estados</option><option value="asignado">Asignado</option><option value="en_proceso">En proceso</option><option value="espera_ventas">Ventas pendiente</option><option value="pendiente_gerencia">Gerencia pendiente</option><option value="cerrado_conforme">Cerrado</option></select><select class="select" id="fProcess"><option value="">Todos los macroprocesos</option>'+Object.keys(processes).map(function(k){return'<option value="'+k+'">'+esc(processes[k].title)+'</option>';}).join("")+'</select></section>'+caseList(visibleCases());
  layout(content);
  qs("#fSearch").value=state.filters.search;qs("#fStatus").value=state.filters.status;qs("#fProcess").value=state.filters.process;
  ["fSearch","fStatus","fProcess"].forEach(function(id){qs("#"+id).oninput=function(){state.filters.search=qs("#fSearch").value;state.filters.status=qs("#fStatus").value;state.filters.process=qs("#fProcess").value;renderCases();};});
}

function renderCreate(){
  if(!canCreate()){layout(header("Crear pedido","Acceso restringido.")+'<div class="empty">Solo ventas inicia pedidos. Los demás roles reciben por secuencia.</div>');return;}
  layout(header("Crear pedido","Ventas inicia el flujo normal o prioritario hacia gerencia.")+'<section class="card"><form class="form" id="caseForm"><label class="field"><span>PDF pedido S-FT-33 opcional</span><input class="input" type="file" name="pdf" id="pdfInput" accept="application/pdf"></label><div id="pdfBox" class="notice">Si cargas PDF, la app intentará leer número de pedido, cliente, vendedor, pago, entrega y referencias.</div><div class="grid grid-2"><label class="field"><span>Número / pedido / referencia</span><input class="input" name="reference" id="reference" required placeholder="PVN-0000"></label><label class="field"><span>Cliente</span><input class="input" name="client" id="client" placeholder="Nombre del cliente"></label></div><div class="grid grid-2"><label class="field"><span>Tipo de gestión</span><select class="select" name="priorityMode"><option value="normal">Pedido normal a logística</option><option value="gerencia">Pedido prioritario / salida especial a gerencia</option></select></label><label class="field"><span>Motivo prioridad</span><input class="input" name="priorityReason" placeholder="Urgencia, cliente crítico, autorización especial"></label></div><div class="grid grid-2"><label class="field"><span>Tipo de entrega esperado</span><select class="select" name="requestedDelivery" id="requestedDelivery"><option value="">Sin definir</option><option value="cliente_punto">Cliente en punto</option><option value="cliente_recoge">Cliente recoge</option><option value="despacho_local">Despacho local</option><option value="despacho_nacional">Despacho nacional</option></select></label><label class="field"><span>Forma de pago</span><input class="input" name="paymentCondition" id="paymentCondition"></label></div><label class="field"><span>Observación</span><textarea class="textarea" name="description" id="description"></textarea></label><button class="btn btn-primary" type="submit">Crear y enviar</button></form></section>');
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
      for(var i=1;i<=pdf.numPages;i++){(function(pageNo){chain=chain.then(function(){return pdf.getPage(pageNo);}).then(function(page){return page.getTextContent();}).then(function(tc){pages.push(tc.items.map(function(it){return it.str;}).join(" "));});})(i);}
      return chain.then(function(){return pages.join(" ");});
    }).then(function(text){
      var x=extractPedido(text); state.pdfExtraction=x;
      if(x.orderNumber)qs("#reference").value=x.orderNumber;
      if(x.client)qs("#client").value=x.client;
      if(x.paymentCondition)qs("#paymentCondition").value=x.paymentCondition;
      qs("#pdfBox").innerHTML="<strong>PDF leído.</strong><br>Pedido: "+esc(x.orderNumber||"No detectado")+"<br>Cliente: "+esc(x.client||"No detectado")+"<br>Pago: "+esc(x.paymentCondition||"No detectado");
    }).catch(function(err){qs("#pdfBox").innerHTML="No se pudo leer el PDF. Llena los datos manualmente. "+esc(err.message||err);});
  };
  reader.readAsArrayBuffer(file);
}

function extractPedido(text){
  text=String(text||"").replace(/\s+/g," ");
  function m(rx){var r=text.match(rx);return r?r[1].trim():"";}
  return {
    orderNumber:m(/No\.\s*([A-Z0-9\-]+)/i),
    client:m(/Cliente\s+(.+?)\s+Dirección/i) || m(/Señores\s+(.+?)\s+NIT/i),
    paymentCondition:m(/Forma de Pago:\s*([A-Z0-9ÁÉÍÓÚÑ\s\-]+)/i),
    salesAdvisor:m(/Vendedor:\s*([A-ZÁÉÍÓÚÑ\s]+)/i),
    raw:text.slice(0,3000)
  };
}

function createCase(fd){
  var created=now(), p="recepcion_pedidos", def=processes[p], priority=fd.get("priorityMode")==="gerencia", x=state.pdfExtraction||{};
  var c={id:uid("PED"),type:"pedido_venta",procedureCode:def.code,currentProcess:p,status:priority?"pendiente_gerencia":"asignado",priority:priority?"Pendiente gerencia":"Normal",reference:fd.get("reference")||x.orderNumber,client:fd.get("client")||x.client,description:fd.get("description"),requestedDelivery:fd.get("requestedDelivery"),deliveryType:"",paymentCondition:fd.get("paymentCondition")||x.paymentCondition,salesAdvisor:x.salesAdvisor||state.user.name,assignedRole:priority?"gerencia":"coordinador_logistico",assignedName:priority?"Gerencia":"Coordinador logístico / Líder logístico",assignedTo:"",createdAt:created,createdBy:state.user.uid,createdByName:state.user.name,updatedAt:created,activeStartedAt:null,waitStartedAt:priority?created:null,deadStartedAt:priority?null:created,totalRequirements:0,checklist:{},openRequirement:null,priorityApproval:priority?{status:"pendiente",reason:fd.get("priorityReason")||"Solicitud prioritaria",requestedAt:created,requestedByName:state.user.name}:null,evidence:[],pdfExtraction:x,processStats:{}};
  procStats(c,p).startedAt=created;
  if(priority){procStats(c,p).waitMs=0;} else {procStats(c,p).deadMs=0;}
  def.checklist.forEach(function(item){c.checklist[item]=initialCheckFromPdf(item,x);});
  persistCase(c,{type:"CASE_CREATED",detail:priority?"Pedido enviado a gerencia":"Pedido creado por ventas y enviado a logística"}).then(function(){state.pdfExtraction=null;state.route="dashboard";render();}).catch(function(e){showError(e.message||e);});
}

function initialCheckFromPdf(item,x){if(!x)return"pending";if(item==="Contenido del pedido completo")return x.orderNumber&&x.client?"ok":"pending";if(item==="Cliente identificado")return x.client?"ok":"pending";if(item==="Forma de pago definida")return x.paymentCondition?"ok":"pending";return"pending";}

function renderDetail(id){
  var c=caseById(id);if(!c){renderCases();return;}
  var def=processes[c.currentProcess]||processes.recepcion_pedidos, actions="";
  if(!c.closedAt){
    if(c.status==="asignado"&&canAccessProcess(state.user.role,c.currentProcess))actions+='<button class="btn btn-primary" data-action="accept" data-id="'+c.id+'">Aceptar</button>';
    if(c.status==="en_proceso"&&canAccessProcess(state.user.role,c.currentProcess))actions+='<button class="btn btn-gold" data-action="wait" data-id="'+c.id+'">Requerimiento / espera</button>';
    if(c.status==="espera_ventas"&&state.user.role==="ventas")actions+='<button class="btn btn-primary" data-action="answer" data-id="'+c.id+'">Responder</button>';
    if(c.status==="en_espera"&&state.user.role===c.assignedRole)actions+='<button class="btn btn-primary" data-action="answer" data-id="'+c.id+'">'+(state.user.role==="jefe_logistica"?"Aprobar / resolver":"Resolver")+'</button>';
    if(isJefeLogistica()&&!c.closedAt)actions+='<button class="btn btn-gold" data-action="supervise" data-id="'+c.id+'">Observación jefe logística</button>';
    if(c.status==="pendiente_gerencia"&&state.user.role==="gerencia")actions+='<button class="btn btn-success" data-action="approve" data-id="'+c.id+'">Aprobar</button><button class="btn btn-danger" data-action="reject" data-id="'+c.id+'">Rechazar</button>';
    if(c.status==="en_proceso"&&canAccessProcess(state.user.role,c.currentProcess)){
      if(c.currentProcess==="facturacion")actions+='<button class="btn btn-primary" data-action="delivery" data-id="'+c.id+'">Definir facturación / entrega</button>';
      else if(c.currentProcess==="caja")actions+='<button class="btn btn-primary" data-action="delivery" data-id="'+c.id+'">Confirmar caja / enviar a despacho</button>';
      else actions+=nextActionButtons(c);
    }
    if(c.status==="en_proceso"&&canAccessProcess(state.user.role,c.currentProcess)&&canCloseHere(c))actions+='<button class="btn btn-success" data-action="close" data-id="'+c.id+'">Cerrar caso</button>';
  }
  var checks=def.checklist.map(function(item){var v=c.checklist[item]||"pending";return'<div class="check-row"><div class="check-title">'+esc(item)+'</div><div class="segment" data-check="'+esc(item)+'" data-id="'+c.id+'">'+["ok|Conforme|ok","bad|No conforme|bad","na|N/A|na","pending|Pendiente|pending"].map(function(x){var a=x.split("|");return'<button class="'+(v===a[0]?'active '+a[2]:'')+'" data-action="check" data-value="'+a[0]+'">'+a[1]+'</button>';}).join("")+'</div></div>';}).join("");
  layout(header(c.reference||c.id,processTitle(c.currentProcess)+" · "+(c.client||"Sin cliente"),'<button class="btn" data-route="cases">Volver</button>'+actions)+'<section class="grid grid-4"><article class="card kpi"><span>Lead Time</span><strong style="font-size:1.55rem">'+fmt(totalMs(c))+'</strong><small>Desde ventas</small></article><article class="card kpi"><span>VA</span><strong style="font-size:1.55rem">'+fmt(activeMs(c))+'</strong><small>Tiempo activo</small></article><article class="card kpi"><span>NVA</span><strong style="font-size:1.55rem">'+fmt(waitMs(c)+deadMs(c))+'</strong><small>Espera + muerto</small></article><article class="card kpi"><span>Avance</span><strong>'+progress(c)+'%</strong><small>Checklist</small></article></section>'+(c.openRequirement?'<section class="notice" style="margin-top:16px"><strong>Requerimiento activo:</strong> '+esc(c.openRequirement.reason)+' · '+esc(c.openRequirement.detail||"")+'</section>':"")+'<section class="grid grid-2" style="margin-top:16px"><article class="card"><h3>Checklist</h3><div class="checklist">'+checks+'</div></article><article class="card"><h3>Datos del caso</h3>'+caseInfo(c)+'<h3 style="margin-top:18px">Secuencia y tiempos</h3>'+timeline(c)+'<h3 style="margin-top:18px">Eventos</h3>'+eventList(c.id)+'</article></section>');
}

function nextActionButtons(c){
  var next=(processes[c.currentProcess]||{}).next||[];
  return next.filter(function(n){return n!=="cierre_caso";}).map(function(n){return'<button class="btn btn-primary" data-action="transfer" data-next="'+n+'" data-id="'+c.id+'">Enviar a '+esc(processTitle(n))+'</button>';}).join("");
}
function canCloseHere(c){var next=(processes[c.currentProcess]||{}).next||[];return next.indexOf("cierre_caso")>=0;}
function caseInfo(c){var rows=[["Estado",c.status],["Responsable",c.assignedName],["Creado",fmtDate(c.createdAt)],["Cliente",c.client],["Entrega solicitada",processTitle(c.requestedDelivery)],["Entrega definida",processTitle(c.deliveryType)],["Forma pago",c.paymentCondition],["Prioridad",c.priority],["Requerimientos",c.totalRequirements]];return rows.map(function(r){return r[1]?'<div class="case-meta" style="justify-content:space-between;border-bottom:1px solid #eef2f7;padding:8px 0"><span>'+esc(r[0])+'</span><strong>'+esc(r[1])+'</strong></div>':"";}).join("");}
function timeline(c){
  return '<div class="timeline">'+FLOW.filter(function(p){return c.processStats&&c.processStats[p];}).map(function(p){var s=c.processStats[p];return'<div class="timeline-row"><b>'+esc(processes[p].icon+' · '+processTitle(p))+'</b><span>VA '+fmt(s.activeMs||0)+' · Espera '+fmt(s.waitMs||0)+' · Muerto '+fmt(s.deadMs||0)+'</span><strong>'+esc(s.completedAt?"Cerrado":"Activo")+'</strong></div>';}).join("")+'</div>';
}
function eventList(id){var list=state.events.filter(function(e){return e.caseId===id;}).slice(0,12);if(!list.length)return'<div class="empty">Sin eventos.</div>';return list.map(function(e){return'<div style="border-bottom:1px solid #eef2f7;padding:8px 0"><strong>'+esc(e.type)+'</strong><br><span style="color:#64748b">'+esc(e.detail||e.reason||"")+' · '+fmtDate(e.timestamp)+'</span></div>';}).join("");}

function renderRequirements(){var list=state.cases.filter(function(c){return c.status==="espera_ventas"||c.status==="en_espera"||c.openRequirement;});layout(header("Requerimientos","Trazabilidad de tiempos de resolución.")+caseList(list));}
function renderApprovals(){
  var list;
  var title="Aprobaciones";
  var subtitle="Pedidos prioritarios o salidas especiales enviados por ventas.";
  if(state.user && state.user.role==="jefe_logistica"){
    title="Aprobaciones logísticas";
    subtitle="Excepciones, conformidades, requerimientos críticos y casos detenidos.";
    list=state.cases.filter(function(c){
      return !c.closedAt && (
        c.assignedRole==="jefe_logistica" ||
        (c.openRequirement && c.openRequirement.targetRole==="jefe_logistica") ||
        c.priority==="Alta" ||
        c.status==="en_espera" ||
        c.status==="espera_ventas"
      );
    });
  }else{
    list=state.cases.filter(function(c){return c.status==="pendiente_gerencia";});
  }
  layout(header(title,subtitle)+caseList(list));
}

function renderUsers(){
  if(!canManageUsers()){layout(header("Usuarios","Acceso restringido.")+'<div class="empty">Solo admin y gerencia.</div>');return;}
  var ger=state.users.filter(function(u){return u.role==="gerencia";}).length;
  layout(header("Usuarios","Crear usuarios y asignar roles.",'<button class="btn btn-primary" data-action="userModal">Crear usuario</button>')+'<section class="grid grid-3"><article class="card kpi"><span>Usuarios</span><strong>'+state.users.length+'</strong><small>Perfiles</small></article><article class="card kpi"><span>Gerencia</span><strong>'+ger+'/2</strong><small>Límite</small></article><article class="card kpi"><span>Roles</span><strong>'+uniqueRoles()+'</strong><small>Activos</small></article></section><section class="card" style="margin-top:16px"><h3>Directorio</h3><div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th></tr></thead><tbody>'+state.users.map(function(u){return'<tr><td>'+esc(u.name)+'</td><td>'+esc(u.email)+'</td><td>'+esc(roleTitle(u.role))+'</td><td>'+(u.isActive===false?"Inactivo":"Activo")+'</td></tr>';}).join("")+'</tbody></table></div></section>');
}
function uniqueRoles(){var m={};state.users.forEach(function(u){m[u.role]=1;});return Object.keys(m).length;}

function renderIndicators(){
  var data=canSeeAll()?state.cases:visibleCases(), total=data.length||1, open=data.filter(function(c){return !c.closedAt;}), closed=data.filter(function(c){return c.closedAt;});
  var lead=0,va=0,wait=0,dead=0,rework=0,defects=0,handoffs=0;
  data.forEach(function(c){lead+=totalMs(c);va+=activeMs(c);wait+=waitMs(c);dead+=deadMs(c);if(Number(c.totalRequirements||0)>0)rework++;});
  state.events.forEach(function(e){if(e.type==="CHECK_UPDATED"&&String(e.detail||"").indexOf("bad")>=0)defects++;if(e.type==="TRANSFER_SENT")handoffs++;});
  var nva=wait+dead, vaPct=Math.round(va/Math.max(va+nva,1)*100), fpy=closed.length?Math.round((closed.length-rework)/closed.length*100):0, reworkPct=Math.round(rework/total*100);
  var rows=FLOW.map(function(p){var count=0, ac=0, wt=0, dd=0;data.forEach(function(c){if(c.processStats&&c.processStats[p]){count++;ac+=Number(c.processStats[p].activeMs||0);wt+=Number(c.processStats[p].waitMs||0);dd+=Number(c.processStats[p].deadMs||0);}});return{label:processTitle(p),value:ac+wt+dd,count:count,active:ac,wait:wt,dead:dd};}).filter(function(r){return r.count>0;}).sort(function(a,b){return b.value-a.value;});
  layout(header("Visualización secuencial VSM","Tiempo por macroproceso desde ventas hasta cierre, esperas y resolución de requerimientos.")+'<section class="grid grid-4"><article class="card kpi"><span>Lead Time</span><strong style="font-size:1.55rem">'+fmt(lead/total)+'</strong><small>Promedio</small></article><article class="card kpi"><span>% VA</span><strong>'+vaPct+'%</strong><small>Valor agregado</small></article><article class="card kpi"><span>WIP</span><strong>'+open.length+'</strong><small>En proceso</small></article><article class="card kpi"><span>FPY</span><strong>'+Math.max(0,fpy)+'%</strong><small>Correctos primera vez</small></article><article class="card kpi"><span>Reproceso</span><strong>'+reworkPct+'%</strong><small>Con requerimientos</small></article><article class="card kpi"><span>No conformidades</span><strong>'+defects+'</strong><small>Checks no conformes</small></article><article class="card kpi"><span>Throughput</span><strong>'+closed.length+'</strong><small>Cerrados</small></article><article class="card kpi"><span>Handoffs</span><strong>'+handoffs+'</strong><small>Relevos</small></article></section><section class="grid grid-2" style="margin-top:16px"><article class="chart-card"><div class="chart-title">Tiempo por macroproceso</div>'+bars(rows)+'</article><article class="chart-card"><div class="chart-title">VA vs NVA</div>'+bars([{label:"VA",value:va},{label:"NVA",value:nva},{label:"Espera",value:wait},{label:"Tiempo muerto",value:dead}])+'</article></section><section class="card" style="margin-top:16px"><h3>Tabla VSM por macroproceso</h3><div class="table-wrap"><table><thead><tr><th>Macroproceso</th><th>Casos</th><th>VA</th><th>Espera</th><th>Muerto</th><th>Total</th><th>Cuello</th></tr></thead><tbody>'+rows.map(function(r,i){return'<tr><td>'+esc(r.label)+'</td><td>'+r.count+'</td><td>'+fmt(r.active)+'</td><td>'+fmt(r.wait)+'</td><td>'+fmt(r.dead)+'</td><td>'+fmt(r.value)+'</td><td>'+(i===0?'Principal':'—')+'</td></tr>';}).join("")+'</tbody></table></div></section>');
}
function bars(rows){if(!rows.length)return'<div class="empty">Sin datos.</div>';var max=Math.max.apply(null,rows.map(function(r){return r.value;}))||1;return'<div class="bars">'+rows.map(function(r){return'<div class="bar-row"><span>'+esc(r.label)+'</span><div><b style="width:'+Math.max(4,Math.round(r.value/max*100))+'%"></b></div><strong>'+fmt(r.value)+'</strong></div>';}).join("")+'</div>';}

function renderAdmin(){layout(header("Administración","Estado de conexión y PWA.")+'<section class="grid grid-2"><article class="card"><h3>Conexión</h3><p>Firebase: <strong>'+(firebaseReady?"activo":"no conectado")+'</strong></p><p>Proyecto: <strong>trazabilidadlog</strong></p></article><article class="card"><h3>PWA</h3><p>Service worker funcional con actualización controlada.</p><button class="btn btn-gold" data-action="clearPwa">Actualizar caché PWA</button></article></section>');}

function drawer(html){var d=qs("#drawer");d.innerHTML=html;d.classList.add("open");qsa("[data-close]",d).forEach(function(b){b.onclick=closeDrawer;});d.onclick=function(e){if(e.target===d)closeDrawer();};}
function closeDrawer(){var d=qs("#drawer");if(d){d.classList.remove("open");d.innerHTML="";}}
function modal(title,body){return'<section class="modal"><div class="modal-head"><h3>'+esc(title)+'</h3><button class="btn btn-small" data-close>Cerrar</button></div>'+body+'</section>';}

function startActive(c){
  if(c.deadStartedAt){procStats(c,c.currentProcess).deadMs+=msSince(c.deadStartedAt);}
  c.deadStartedAt=null;c.activeStartedAt=now();c.status="en_proceso";c.assignedTo=state.user.uid;c.assignedName=state.user.name;
}
function stopActive(c){
  if(c.activeStartedAt){procStats(c,c.currentProcess).activeMs+=msSince(c.activeStartedAt);}
  c.activeStartedAt=null;
}
function stopWait(c){
  if(c.waitStartedAt){procStats(c,c.currentProcess).waitMs+=msSince(c.waitStartedAt);}
  c.waitStartedAt=null;
}
function assignToProcess(c,next,detail){
  var current=c.currentProcess;
  stopActive(c);stopWait(c);
  procStats(c,current).completedAt=now();
  c.currentProcess=next;c.status="asignado";c.assignedRole=primaryOwnerRole(next);c.assignedName=processOwnerTitle(next);c.assignedTo="";c.deadStartedAt=now();c.activeStartedAt=null;c.waitStartedAt=null;c.openRequirement=null;c.checklist={};
  var s=procStats(c,next);s.startedAt=s.startedAt||now();s.handoffs=Number(s.handoffs||0)+1;
  processes[next].checklist.forEach(function(x){c.checklist[x]="pending";});
  return persistCase(c,{type:"TRANSFER_SENT",detail:detail||("Relevo a "+processTitle(next))});
}

function openWait(id){
  var c=caseById(id), def=processes[c.currentProcess];
  drawer(modal("Requerimiento / espera",'<form class="form" id="waitForm"><label class="field"><span>Motivo</span><select class="select" name="reason">'+def.waits.map(function(w){return'<option>'+esc(w)+'</option>';}).join("")+'</select></label><label class="field"><span>Área responsable</span><select class="select" name="role"><option value="ventas">Ventas</option><option value="coordinador_logistico">Coordinador logístico</option><option value="lider_logistico">Líder logístico</option><option value="jefe_logistica">Jefe de logística</option><option value="aux_logistica">Auxiliar logística</option><option value="gerencia">Gerencia</option></select></label><label class="field"><span>Detalle</span><textarea class="textarea" name="detail"></textarea></label><button class="btn btn-primary" type="submit">Enviar requerimiento</button></form>'));
  qs("#waitForm").onsubmit=function(e){e.preventDefault();var fd=new FormData(e.target);stopActive(c);c.status=fd.get("role")==="ventas"?"espera_ventas":"en_espera";c.waitStartedAt=now();c.assignedRole=fd.get("role");c.assignedName=roleTitle(fd.get("role"));c.openRequirement={reason:fd.get("reason"),detail:fd.get("detail"),targetRole:fd.get("role"),sentAt:now(),sentBy:state.user.uid,returnProcess:c.currentProcess};c.totalRequirements=Number(c.totalRequirements||0)+1;persistCase(c,{type:"REQUIREMENT_SENT",reason:fd.get("reason"),detail:fd.get("detail"),targetRole:fd.get("role")}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});};
}
function openAnswer(id){
  var c=caseById(id);
  drawer(modal("Responder / resolver requerimiento",'<form class="form" id="ansForm"><label class="field"><span>Respuesta</span><textarea class="textarea" name="detail" required></textarea></label><button class="btn btn-primary" type="submit">Resolver y devolver al proceso</button></form>'));
  qs("#ansForm").onsubmit=function(e){e.preventDefault();var fd=new FormData(e.target);var ret=c.openRequirement?c.openRequirement.returnProcess:c.currentProcess;stopWait(c);c.currentProcess=ret;c.status="en_proceso";c.assignedRole=primaryOwnerRole(ret);c.assignedName=processOwnerTitle(ret);c.activeStartedAt=now();c.openRequirement=null;persistCase(c,{type:"REQUIREMENT_ANSWERED",detail:fd.get("detail")}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});};
}
function openDelivery(id){
  var c=caseById(id);
  var isCaja = c.currentProcess === "caja";
  var title = isCaja ? "Confirmar caja y enviar a despacho" : "Definir facturación y ruta de entrega";
  var typeField = isCaja ? "" : '<label class="field"><span>Tipo de pedido</span><select class="select" name="billingType" required><option value="PVC">PVC · continúa facturación logística</option><option value="NO_PVC">No es PVC · relevar a caja</option></select></label>';
  drawer(modal(title,'<form class="form" id="delForm">'+typeField+'<label class="field"><span>Tipo de entrega</span><select class="select" name="next" required><option value="cliente_punto">Cliente en punto · Coordinador</option><option value="cliente_recoge">Cliente recoge · Coordinador</option><option value="despacho_local">Despacho local · Coordinador</option><option value="despacho_nacional">Despacho nacional · Líder logístico</option></select></label><label class="field"><span>Observación</span><textarea class="textarea" name="detail"></textarea></label><button class="btn btn-primary" type="submit">Continuar flujo</button></form>'));
  qs("#delForm").onsubmit=function(e){
    e.preventDefault();
    var fd=new FormData(e.target), next=fd.get("next"), billingType=fd.get("billingType")||"CAJA_OK";
    c.deliveryType=next;
    if(!isCaja && billingType==="NO_PVC"){
      c.pendingDeliveryType=next;
      c.billingType="NO_PVC";
      assignToProcess(c,"caja",fd.get("detail")||"Facturación identifica No PVC y releva a caja").then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});
      return;
    }
    if(isCaja && c.pendingDeliveryType){ next=c.pendingDeliveryType; c.pendingDeliveryType=""; }
    c.billingType=billingType;
    assignToProcess(c,next,fd.get("detail")||((isCaja?"Caja libera y envía a ":"Facturación define ")+processTitle(next))).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});
  };
}
function openClose(id){
  var c=caseById(id);
  drawer(modal("Cerrar caso",'<form class="form" id="closeForm"><label class="field"><span>Resultado</span><select class="select" name="status"><option value="cerrado_conforme">Cerrado conforme</option><option value="cerrado_con_novedad">Cerrado con novedad</option><option value="cancelado">Cancelado</option></select></label><label class="field"><span>Detalle</span><textarea class="textarea" name="detail"></textarea></label><button class="btn btn-success" type="submit">Cerrar</button></form>'));
  qs("#closeForm").onsubmit=function(e){e.preventDefault();var fd=new FormData(e.target);stopActive(c);stopWait(c);if(c.deadStartedAt){procStats(c,c.currentProcess).deadMs+=msSince(c.deadStartedAt);c.deadStartedAt=null;}procStats(c,c.currentProcess).completedAt=now();c.status=fd.get("status");c.closedAt=now();persistCase(c,{type:"CASE_CLOSED",detail:fd.get("detail")}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});};
}
function openSupervisorNote(id){
  var c=caseById(id);
  drawer(modal("Observación jefe de logística",'<form class="form" id="supForm"><label class="field"><span>Tipo de intervención</span><select class="select" name="type"><option value="SUPERVISION">Seguimiento</option><option value="APPROVAL">Aprobación logística</option><option value="EXCEPTION">Excepción autorizada</option><option value="REASSIGNMENT_NOTE">Nota de reasignación</option><option value="RISK">Riesgo de atraso</option></select></label><label class="field"><span>Detalle</span><textarea class="textarea" name="detail" required></textarea></label><button class="btn btn-primary" type="submit">Registrar trazabilidad</button></form>'));
  qs("#supForm").onsubmit=function(e){
    e.preventDefault();
    var fd=new FormData(e.target);
    c.supervisionNotes=c.supervisionNotes||[];
    c.supervisionNotes.push({type:fd.get("type"),detail:fd.get("detail"),by:state.user.uid,byName:state.user.name,at:now()});
    persistCase(c,{type:"LOGISTICS_CHIEF_"+fd.get("type"),detail:fd.get("detail")}).then(function(){closeDrawer();renderDetail(id);}).catch(function(e){showError(e.message||e);});
  };
}

function openUserModal(){
  var ger=state.users.filter(function(u){return u.role==="gerencia";}).length;
  drawer(modal("Crear usuario",'<form class="form" id="uForm"><label class="field"><span>Nombre</span><input class="input" name="name" required></label><label class="field"><span>Correo</span><input class="input" name="email" type="email" required></label><label class="field"><span>Contraseña temporal</span><input class="input" name="password" type="password" required minlength="6"></label><label class="field"><span>Rol</span><select class="select" name="role">'+Object.keys(roles).map(function(r){return'<option value="'+r+'" '+(r==="gerencia"&&ger>=2?"disabled":"")+'>'+esc(roles[r])+(r==="gerencia"?" · "+ger+"/2":"")+'</option>';}).join("")+'</select></label><button class="btn btn-primary" type="submit">Crear</button></form>'));
  qs("#uForm").onsubmit=function(e){e.preventDefault();createUser(new FormData(e.target));};
}
function createUser(fd){
  var name=fd.get("name"),email=fd.get("email"),pass=fd.get("password"),role=fd.get("role");
  if(role==="gerencia"&&state.users.filter(function(u){return u.role==="gerencia";}).length>=2){alert("Solo se permiten dos usuarios de gerencia.");return;}
  var second=firebase.initializeApp(window.firebaseConfig,"creator_"+Date.now());
  second.auth().createUserWithEmailAndPassword(email,pass).then(function(cred){
    return db.collection("users").doc(cred.user.uid).set({name:name,email:email,role:role,isActive:true,createdAt:now(),createdBy:state.user.uid});
  }).then(function(){return second.auth().signOut();}).then(function(){return second.delete();}).then(function(){return loadData();}).then(function(){closeDrawer();renderUsers();}).catch(function(e){showError(e.message||e);});
}
function approve(id){
  var c=caseById(id);stopWait(c);c.status="asignado";c.assignedRole="coordinador_logistico";c.assignedName="Coordinador logístico / Líder logístico";c.deadStartedAt=now();c.priority="Alta";c.managerApproved=true;if(c.priorityApproval)c.priorityApproval.status="aprobado";persistCase(c,{type:"MANAGER_APPROVED",detail:"Gerencia aprobó prioridad. Pasa a logística primero."}).then(function(){renderApprovals();}).catch(function(e){showError(e.message||e);});
}
function reject(id){
  var c=caseById(id);stopWait(c);c.status="cancelado";c.closedAt=now();if(c.priorityApproval)c.priorityApproval.status="rechazado";persistCase(c,{type:"MANAGER_REJECTED",detail:"Gerencia rechazó prioridad"}).then(function(){renderApprovals();}).catch(function(e){showError(e.message||e);});
}
function accept(id){var c=caseById(id);startActive(c);persistCase(c,{type:"CASE_ACCEPTED",detail:"Caso aceptado por "+state.user.name}).then(function(){renderDetail(id);}).catch(function(e){showError(e.message||e);});}
function transfer(id,next){var c=caseById(id);assignToProcess(c,next,"Relevo a "+processTitle(next)).then(function(){renderDetail(id);}).catch(function(e){showError(e.message||e);});}
function updateCheck(el){var seg=el.parentNode,id=seg.getAttribute("data-id"),item=seg.getAttribute("data-check"),val=el.getAttribute("data-value"),c=caseById(id);c.checklist[item]=val;persistCase(c,{type:"CHECK_UPDATED",detail:item+": "+val}).then(function(){renderDetail(id);}).catch(function(e){showError(e.message||e);});}
function clearPwaCache(){if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(regs){regs.forEach(function(r){if(r.active)r.active.postMessage({type:"CLEAR_CACHE"});r.update();});setTimeout(function(){location.reload();},700);}).catch(function(){location.reload();});}else location.reload();}


var reminderMemory = {};

function canNotify(){
  return "Notification" in window;
}

function requestNotifications(){
  if(!canNotify()){alert("Este navegador no soporta notificaciones.");return;}
  Notification.requestPermission().then(function(){notifyUser("Notificaciones activadas","Recibirás recordatorios de casos asignados y retrasos.",true);});
}

function playBeep(){
  try{
    var AC=window.AudioContext||window.webkitAudioContext;
    var ctx=new AC();
    var osc=ctx.createOscillator();
    var gain=ctx.createGain();
    osc.type="sine";
    osc.frequency.value=880;
    gain.gain.setValueAtTime(0.0001,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22,ctx.currentTime+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.34);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime+0.36);
  }catch(e){}
}

function notifyUser(title,msg,force){
  playBeep();
  if(canNotify()&&Notification.permission==="granted"){
    try{new Notification(title,{body:msg,icon:"./assets/app-icon.svg",badge:"./assets/app-icon.svg"});}catch(e){}
  }
  if(force){alert(title+"\\n"+msg);}
}

function reminderCheck(){
  if(!state.user||!state.cases.length)return;
  var visible=visibleCases().filter(function(c){return !c.closedAt;});
  visible.forEach(function(c){
    var key="", msg="", title="";
    if(c.status==="asignado"&&c.deadStartedAt&&msSince(c.deadStartedAt)>10*60*1000){
      key=c.id+"_asignado_10";
      title="Caso asignado sin aceptar";
      msg=(c.reference||c.id)+" lleva más de 10 minutos asignado en "+processTitle(c.currentProcess)+".";
    }else if(c.status==="en_proceso"&&c.activeStartedAt&&msSince(c.activeStartedAt)>30*60*1000){
      key=c.id+"_proceso_30";
      title="Recordatorio de proceso";
      msg=(c.reference||c.id)+" lleva más de 30 minutos en "+processTitle(c.currentProcess)+".";
    }else if((c.status==="en_espera"||c.status==="espera_ventas")&&c.waitStartedAt&&msSince(c.waitStartedAt)>20*60*1000){
      key=c.id+"_espera_20";
      title="Requerimiento en espera";
      msg=(c.reference||c.id)+" tiene un requerimiento pendiente por más de 20 minutos.";
    }
    if(key&&!reminderMemory[key]){
      reminderMemory[key]=true;
      notifyUser(title,msg,false);
    }
  });
}

function startReminderLoop(){
  if(window.__eiReminderLoop)return;
  window.__eiReminderLoop=setInterval(reminderCheck,60000);
  setTimeout(reminderCheck,4000);
}


function openMobileMenu(){
  var m=qs("#mobileMenu");
  if(m)m.classList.add("open");
}

function closeMobileMenu(){
  var m=qs("#mobileMenu");
  if(m)m.classList.remove("open");
}

function bindActions(){
  qsa("[data-action]").forEach(function(b){b.onclick=function(){var a=b.getAttribute("data-action"),id=b.getAttribute("data-id");
    if(a==="logout"){sessionStorage.removeItem(storageKey+"_session");if(auth)auth.signOut().catch(function(){});state.user=null;renderLogin();}
    if(a==="open")renderDetail(id);
    if(a==="accept")accept(id);
    if(a==="wait")openWait(id);
    if(a==="answer")openAnswer(id);
    if(a==="delivery")openDelivery(id);
    if(a==="transfer")transfer(id,b.getAttribute("data-next"));
    if(a==="close")openClose(id);
    if(a==="approve")approve(id);
    if(a==="reject")reject(id);
    if(a==="userModal")openUserModal();
    if(a==="check")updateCheck(b);
    if(a==="clearPwa")clearPwaCache();
    if(a==="openMobileMenu")openMobileMenu();
    if(a==="closeMobileMenu")closeMobileMenu();
    if(a==="supervise")openSupervisorNote(id);
    if(a==="notifyOn")requestNotifications();
  };});
}

function render(){
  if(!state.user){renderLogin();return;}
  startReminderLoop();
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
