import { firebaseConfig, appSettings } from "./firebase-config.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const app = $("#app");
const brandLogo = "./assets/logo-electroingenieria.jpeg";

function applyDeviceClass() {
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMobile = window.matchMedia("(max-width: 760px)").matches || window.innerWidth <= 760;
  document.documentElement.classList.toggle("is-ios", isIOS);
  document.documentElement.classList.toggle("is-mobile-ui", isMobile);
  document.documentElement.style.setProperty("--vh", `${window.innerHeight * 0.01}px`);
}

window.addEventListener("resize", applyDeviceClass);
window.addEventListener("orientationchange", () => setTimeout(applyDeviceClass, 250));
applyDeviceClass();

const configuredFirebase = firebaseConfig?.apiKey && !String(firebaseConfig.apiKey).includes("REEMPLAZAR");
const storageKey = "trazabilidad_logistica_v5";

let fb = null;
let analyticsInstance = null;
let state = {
  mode: "local",
  user: null,
  route: "dashboard",
  selectedCaseId: null,
  cases: [],
  events: [],
  users: [],
  filters: { search: "", status: "", process: "", owner: "" },
  timer: null,
  pdfExtraction: null
};

const roles = {
  admin: "Administrador / Desarrollador",
  ventas: "Ventas",
  logistica: "Logística",
  alistamiento: "Alistamiento",
  facturacion: "Facturación",
  caja: "Caja",
  despacho: "Despacho",
  inventarios: "Inventarios",
  jefe_logistico: "Jefe logístico",
  auditoria: "Auditoría",
  gerencia: "Gerencia"
};

const processDefinitions = {
  recepcion_pedidos: {
    code: "S-PR-2",
    title: "Recepción de pedidos",
    ownerRole: "logistica",
    icon: "RP",
    type: "pedido_venta",
    subtitle: "Pedido creado por ventas, lectura del PDF S-FT-33, validación logística y requerimientos por datos faltantes.",
    checklist: [
      "PDF o documento del pedido recibido",
      "Documento legible y completo",
      "Número de pedido identificado",
      "Fecha del pedido identificada",
      "Cliente e identificación validados",
      "Vendedor o asesor comercial identificado",
      "Forma de pago identificada",
      "Tipo de entrega identificado",
      "Dirección de entrega, ciudad y teléfono identificados",
      "Bodega, C.O. o ubicación identificada",
      "Referencias del pedido identificadas",
      "Cantidades y unidades de medida identificadas",
      "Notas u observaciones revisadas",
      "Información del contenido del pedido completa",
      "Pedido listo para alistamiento"
    ],
    requirementTargets: ["ventas", "jefe_logistico"],
    missingFields: [
      "Número de pedido",
      "Fecha del pedido",
      "Cliente o identificación",
      "Vendedor o asesor",
      "Referencia",
      "Cantidad",
      "Unidad de medida",
      "Tipo de entrega",
      "Dirección de entrega",
      "Ciudad o teléfono",
      "Bodega, C.O. o ubicación",
      "Condición de pago",
      "Autorización comercial",
      "Aclaración de observaciones",
      "Documento ilegible"
    ],
    reasons: [
      "Pedido incompleto",
      "Dato no encontrado en PDF",
      "Documento ilegible",
      "Falta referencia",
      "Falta cantidad",
      "Falta unidad de medida",
      "Falta tipo de entrega",
      "Falta dirección de entrega",
      "Falta bodega o ubicación",
      "Falta condición de pago",
      "Falta autorización comercial",
      "Falta aclaración del asesor"
    ],
    next: ["alistamiento"]
  },
  alistamiento: {
    code: "S-PR-4",
    title: "Alistamiento de mercancía",
    ownerRole: "alistamiento",
    icon: "AL",
    type: "pedido_venta",
    subtitle: "Chequeo físico desde la búsqueda hasta la entrega al siguiente proceso.",
    checklist: [
      "Pedido recibido y aceptado",
      "Referencia física coincide con el pedido",
      "Cantidad física coincide con la solicitada",
      "Unidad de medida coincide",
      "Ubicación física validada",
      "Lote validado si aplica",
      "Estado físico conforme",
      "Si es cable, metraje solicitado identificado",
      "Si es cable, remanente validado mínimo 50 m",
      "Mercancía lista para el siguiente proceso"
    ],
    requirementTargets: ["logistica", "ventas", "jefe_logistico", "facturacion"],
    missingFields: [
      "Referencia no coincide",
      "Cantidad insuficiente",
      "Unidad de medida diferente",
      "Ubicación errada",
      "Lote diferente",
      "Mercancía averiada",
      "Metraje de cable no confirmado",
      "Remanente menor a 50 m",
      "Autorización requerida"
    ],
    reasons: [
      "Diferencia física",
      "Cantidad insuficiente",
      "Referencia diferente",
      "Ubicación errada",
      "Mercancía averiada",
      "Requiere autorización por cable",
      "Requiere aclaración del pedido"
    ],
    next: ["facturacion", "despacho", "recepcion_pedidos"]
  },
  facturacion: {
    code: "S-PR-5",
    title: "Facturación",
    ownerRole: "facturacion",
    icon: "FC",
    type: "pedido_venta",
    subtitle: "Control del paso documental: crédito en logística o contado hacia caja.",
    checklist: [
      "Pedido alistado recibido",
      "Tipo de pago identificado",
      "Si es crédito, documento generado por logística en Siesa",
      "Si es contado, solicitud enviada a caja",
      "Documento confirmado para despacho"
    ],
    requirementTargets: ["caja", "ventas", "jefe_logistico", "despacho"],
    missingFields: [
      "Tipo de pago no definido",
      "Pago no confirmado",
      "Soporte incompleto",
      "Diferencia en valor",
      "Cliente con datos incompletos",
      "Falta autorización de cartera",
      "Documento no generado"
    ],
    reasons: [
      "Pago pendiente",
      "Soporte incompleto",
      "Novedad documental",
      "Falta autorización",
      "Error de facturación"
    ],
    next: ["caja", "despacho"]
  },
  caja: {
    code: "S-PR-5-CJ",
    title: "Caja",
    ownerRole: "caja",
    icon: "CJ",
    type: "pedido_venta",
    subtitle: "Validación de recaudo para pedidos de contado.",
    checklist: [
      "Solicitud de facturación recibida",
      "Cliente identificado",
      "Valor a recaudar validado",
      "Soporte de pago recibido si aplica",
      "Pago confirmado",
      "Confirmación enviada para continuar"
    ],
    requirementTargets: ["facturacion", "ventas", "jefe_logistico"],
    missingFields: [
      "Cliente no ha pagado",
      "Pago pendiente de validación",
      "Soporte incompleto",
      "Diferencia en valor",
      "Datos del cliente incompletos"
    ],
    reasons: [
      "Recaudo pendiente",
      "Soporte incompleto",
      "Diferencia en valor",
      "Pago no confirmado"
    ],
    next: ["despacho", "facturacion"]
  },
  despacho: {
    code: "S-PR-6",
    title: "Entrega o despacho",
    ownerRole: "despacho",
    icon: "DP",
    type: "pedido_venta",
    subtitle: "Chequeo final de factura, producto, empaque, fotos y salida.",
    checklist: [
      "Factura corresponde al pedido",
      "Producto corresponde a la factura",
      "Referencias correctas",
      "Cantidades correctas",
      "Estado físico conforme",
      "Empaque conforme",
      "Rotulación conforme",
      "Documento de salida coincide",
      "Fotografías de salida anexadas",
      "Tipo de entrega confirmado",
      "Entrega registrada o confirmada"
    ],
    requirementTargets: ["facturacion", "alistamiento", "ventas", "jefe_logistico"],
    missingFields: [
      "Factura no coincide",
      "Producto equivocado",
      "Cantidad diferente",
      "Falta empaque",
      "Falta rotulación",
      "Mercancía averiada",
      "Documento no coincide",
      "Cliente no autorizado",
      "Datos de destino incompletos",
      "Falta guía o transportadora"
    ],
    reasons: [
      "Novedad de despacho",
      "Documento no coincide",
      "Producto no conforme",
      "Falta evidencia",
      "Cliente o transportadora pendiente"
    ],
    next: []
  },
  inventarios: {
    code: "S-PR-24",
    title: "Inventarios",
    ownerRole: "inventarios",
    icon: "IV",
    type: "inventario",
    subtitle: "Conteos, diferencias, identificación, validaciones y cierre.",
    checklist: [
      "Tipo de inventario definido",
      "Referencias seleccionadas",
      "Ubicación física registrada",
      "Primer conteo realizado",
      "Sticker validado en primer conteo",
      "Segundo conteo realizado",
      "Sticker validado en segundo conteo",
      "Diferencia calculada",
      "Causa analizada si aplica",
      "Aprobación registrada si aplica",
      "Inventario cerrado"
    ],
    requirementTargets: ["jefe_logistico", "auditoria", "gerencia", "logistica"],
    missingFields: [
      "Mercancía sin sticker",
      "Código ilegible",
      "Código no corresponde",
      "Ubicación no coincide",
      "Producto sin identificación",
      "Diferencia no justificada",
      "Pendiente aprobación"
    ],
    reasons: [
      "Identificación de mercancía",
      "Diferencia de inventario",
      "Pendiente aprobación",
      "Pendiente revisión física o documental"
    ],
    next: []
  }
};

const routeInfo = {
  dashboard: ["Inicio", "IN"],
  cases: ["Casos", "CS"],
  create: ["Crear caso", "CR"],
  requirements: ["Requerimientos", "RQ"],
  approvals: ["Aprobaciones", "AU"],
  indicators: ["VSM gerencial", "VS"],
  users: ["Usuarios", "US"],
  admin: ["Administración", "AD"]
};

function nowIso() { return new Date().toISOString(); }
function uid(prefix = "id") { return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`; }
function safe(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
function roleTitle(role) { return roles[role] || role || "Sin rol"; }
function processTitle(key) { return processDefinitions[key]?.title || key || "Sin proceso"; }
function ownerOf(process) { return processDefinitions[process]?.ownerRole || "logistica"; }
function isLeader() { return ["admin", "jefe_logistico"].includes(state.user?.role); }
function isExecutive() { return state.user?.role === "gerencia"; }
function canManageUsers() { return ["admin", "gerencia"].includes(state.user?.role); }
function canApprovePriority() { return state.user?.role === "gerencia"; }
function canCreate() {
  if (!state.user) return false;
  if (isExecutive()) return false;
  if (isLeader()) return true;
  return ["ventas", "logistica", "alistamiento", "facturacion", "despacho", "inventarios"].includes(state.user.role);
}
function canSeeAll() { return isLeader() || isExecutive(); }
function durationSince(iso) { return iso ? Date.now() - new Date(iso).getTime() : 0; }
function fmtDate(value) { if (!value) return "—"; return new Intl.DateTimeFormat("es-CO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function fmtTime(ms) {
  if (!Number.isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function defaultRouteFor(role) {
  if (role === "gerencia") return "indicators";
  if (role === "ventas") return "create";
  if (role === "logistica") return "recepcion_pedidos";
  if (role === "alistamiento") return "alistamiento";
  if (role === "facturacion") return "facturacion";
  if (role === "caja") return "caja";
  if (role === "despacho") return "despacho";
  if (role === "inventarios") return "inventarios";
  return "dashboard";
}

function localStore() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || { cases: [], events: [] }; }
  catch { return { cases: [], events: [] }; }
}
function saveLocalStore(data) { localStorage.setItem(storageKey, JSON.stringify(data)); }

async function initFirebase() {
  if (!configuredFirebase) return;
  try {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const fsMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");
    const firebaseApp = appMod.initializeApp(firebaseConfig);
    fb = { auth: authMod.getAuth(firebaseApp), db: fsMod.getFirestore(firebaseApp), authMod, fsMod };
    state.mode = "firebase";
  } catch (error) {
    state.mode = "local";
    console.error(error);
  }
}

async function dataLoad() {
  if (state.mode === "firebase" && fb && state.user?.uid) {
    const qCases = fb.fsMod.query(fb.fsMod.collection(fb.db, "cases"), fb.fsMod.orderBy("updatedAt", "desc"));
    const qEvents = fb.fsMod.query(fb.fsMod.collection(fb.db, "case_events"), fb.fsMod.orderBy("timestamp", "desc"));
    const [caseSnap, eventSnap] = await Promise.all([fb.fsMod.getDocs(qCases), fb.fsMod.getDocs(qEvents)]);
    state.cases = caseSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.events = eventSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    try {
      const userSnap = await fb.fsMod.getDocs(fb.fsMod.collection(fb.db, "users"));
      state.users = userSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch {
      state.users = [];
    }
  } else {
    const data = localStore();
    state.cases = data.cases || [];
    state.events = data.events || [];
    state.users = data.users || [];
  }
}

async function createEvent(payload) {
  const event = { id: uid("ev"), timestamp: nowIso(), userId: state.user?.uid || "local", userName: state.user?.name || "Usuario", ...payload };
  if (state.mode === "firebase" && fb && state.user?.uid) {
    await fb.fsMod.setDoc(fb.fsMod.doc(fb.db, "case_events", event.id), event);
  } else {
    const data = localStore();
    data.events = [event, ...(data.events || [])];
    saveLocalStore(data);
  }
  state.events = [event, ...state.events];
}

async function persistCase(nextCase, event = null) {
  nextCase.updatedAt = nowIso();
  if (state.mode === "firebase" && fb && state.user?.uid) {
    await fb.fsMod.setDoc(fb.fsMod.doc(fb.db, "cases", nextCase.id), nextCase, { merge: true });
  } else {
    const data = localStore();
    const i = (data.cases || []).findIndex(c => c.id === nextCase.id);
    if (i >= 0) data.cases[i] = nextCase;
    else data.cases = [nextCase, ...(data.cases || [])];
    saveLocalStore(data);
  }
  const i = state.cases.findIndex(c => c.id === nextCase.id);
  if (i >= 0) state.cases[i] = nextCase;
  else state.cases = [nextCase, ...state.cases];
  if (event) await createEvent({ caseId: nextCase.id, process: nextCase.currentProcess, ...event });
}

function caseById(id) { return state.cases.find(c => c.id === id); }
function eventsForCase(id) { return state.events.filter(e => e.caseId === id).sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)); }
function currentActiveMs(c) { return Number(c.totalActiveMs || 0) + (["en_proceso", "en_chequeo"].includes(c.status) ? durationSince(c.activeStartedAt) : 0); }
function currentWaitMs(c) { return Number(c.totalWaitMs || 0) + (["en_espera", "en_requerimiento", "autorizacion_pendiente"].includes(c.status) ? durationSince(c.waitStartedAt) : 0); }
function currentDeadMs(c) { return Number(c.totalDeadMs || 0) + (c.status === "asignado" ? durationSince(c.deadStartedAt) : 0); }
function totalMs(c) { return (c.closedAt ? new Date(c.closedAt).getTime() : Date.now()) - new Date(c.createdAt).getTime(); }
function progressPercent(c) {
  const total = Object.keys(c.checklist || {}).length || 1;
  const done = Object.values(c.checklist || {}).filter(v => ["ok", "na"].includes(v)).length;
  return Math.round(done / total * 100);
}

function statusChip(status) {
  const map = {
    nuevo: ["Nuevo", "info"],
    asignado: ["Asignado", "primary"],
    en_proceso: ["En proceso", "success"],
    en_chequeo: ["En chequeo", "primary"],
    en_espera: ["En espera", "warning"],
    en_requerimiento: ["Requerimiento", "warning"],
    autorizacion_pendiente: ["Autorización", "warning"],
    autorizacion_gerencia_pendiente: ["Gerencia pendiente", "warning"],
    cerrado_conforme: ["Cerrado conforme", "success"],
    cerrado_con_novedad: ["Cerrado con novedad", "danger"],
    cancelado: ["Cancelado", "gray"]
  };
  const [label, style] = map[status] || [status || "Sin estado", "gray"];
  return `<span class="chip ${style}">${safe(label)}</span>`;
}

function riskChip(c) {
  if (c.closedAt) return `<span class="chip gray">Finalizado</span>`;
  const idle = durationSince(c.updatedAt) / 60000;
  if (idle >= (appSettings.criticalRiskMinutes || 90)) return `<span class="chip danger">Crítico</span>`;
  if (idle >= (appSettings.idleRiskMinutes || 30)) return `<span class="chip warning">En riesgo</span>`;
  return `<span class="chip success">A tiempo</span>`;
}

function eventLabel(type) {
  return ({
    CASE_CREATED: "Caso creado",
    PDF_READ: "PDF leído",
    CASE_ACCEPTED: "Caso aceptado",
    ASSIGNED: "Caso asignado",
    CHECK_UPDATED: "Chequeo actualizado",
    REQUIREMENT_SENT: "Requerimiento enviado",
    REQUIREMENT_ANSWERED: "Requerimiento respondido",
    WAIT_STARTED: "Espera iniciada",
    WAIT_CLOSED: "Espera cerrada",
    TRANSFER_SENT: "Relevo enviado",
    CASH_DECISION: "Decisión de facturación",
    CABLE_VALIDATED: "Cable validado",
    PHOTO_UPLOADED: "Evidencia cargada",
    CASE_CLOSED: "Caso cerrado"
  })[type] || type;
}

function casesVisibleToUser() {
  if (canSeeAll()) return state.cases;
  const role = state.user?.role;
  return state.cases.filter(c => {
    const ownsProcess = ownerOf(c.currentProcess) === role;
    const assigned = c.assignedRole === role || c.assignedTo === state.user?.uid;
    const required = c.openRequirement?.targetRole === role;
    return ownsProcess || assigned || required;
  });
}

function requirementsForUser() {
  if (canSeeAll()) return state.cases.filter(c => c.openRequirement && !c.closedAt);
  return state.cases.filter(c => c.openRequirement?.targetRole === state.user?.role && !c.closedAt);
}

function visibleRoutes() {
  const role = state.user?.role;
  if (role === "gerencia") {
    return { main: ["indicators", "approvals", "users"], processes: [] };
  }
  if (role === "admin") {
    return {
      main: ["dashboard", "cases", "create", "requirements", "approvals", "indicators", "users", "admin"],
      processes: Object.keys(processDefinitions)
    };
  }
  if (role === "jefe_logistico") {
    return {
      main: ["dashboard", "cases", "requirements", "approvals", "indicators", "admin"],
      processes: Object.keys(processDefinitions)
    };
  }
  const process = Object.entries(processDefinitions).find(([, p]) => p.ownerRole === role)?.[0];
  const main = ["dashboard", "requirements"];
  if (canCreate()) main.splice(1, 0, "create");
  return { main, processes: process ? [process] : [] };
}

function setRoute(route) {
  state.selectedCaseId = null;
  const allowed = [...visibleRoutes().main, ...visibleRoutes().processes];
  state.route = allowed.includes(route) ? route : defaultRouteFor(state.user?.role);
  render();
}

function toast(message) {
  let host = $(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const item = document.createElement("div");
  item.className = "toast";
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.remove(), 3200);
}

async function loginLocal(formData) {
  state.user = {
    uid: `local_${String(formData.get("email") || "usuario").replace(/\W/g, "_")}`,
    name: formData.get("name") || "Usuario",
    email: formData.get("email") || "local@empresa.com",
    role: formData.get("role") || "logistica"
  };
  state.route = defaultRouteFor(state.user.role);
  localStorage.setItem(`${storageKey}_user`, JSON.stringify(state.user));
  await dataLoad();
  render();
}

async function loginFirebase(formData) {
  const email = formData.get("email");
  const password = formData.get("password");
  const userCredential = await fb.authMod.signInWithEmailAndPassword(fb.auth, email, password);
  const profileSnap = await fb.fsMod.getDoc(fb.fsMod.doc(fb.db, "users", userCredential.user.uid));
  const profile = profileSnap.exists() ? profileSnap.data() : {};
  state.user = { uid: userCredential.user.uid, email, name: profile.name || email.split("@")[0], role: profile.role || "logistica" };
  state.route = defaultRouteFor(state.user.role);
  await dataLoad();
  render();
}

function renderLogin() {
  app.innerHTML = `
    <main class="login-wrap">
      <section class="login-card">
        <div class="brand-panel">
          <div>
            <div class="login-logo-wrap"><img class="brand-logo" src="${brandLogo}" alt="Electroingeniería"></div>
            <div class="brand-badge">EI</div>
            <h1>Trazabilidad logística por rol.</h1>
            <p>Pedidos, requerimientos, chequeos, evidencias y tiempos medibles desde cada interfaz operativa.</p>
          </div>
          <div class="brand-metrics">
            <div class="metric-pill"><strong>Rol</strong><span>Panel propio</span></div>
            <div class="metric-pill"><strong>VSM</strong><span>Tiempos reales</span></div>
            <div class="metric-pill"><strong>iOS</strong><span>Uso móvil</span></div>
          </div>
        </div>
        <form class="login-panel" id="loginForm">
          <h2 class="form-title">Ingreso operativo</h2>
          <p class="form-subtitle">${state.mode === "firebase" ? "Conexión Firebase activa." : "Modo local de prueba. La contraseña puede ir vacía."}</p>
          <div class="form-grid">
            <label class="field"><span>Nombre</span><input class="input" name="name" autocomplete="name" placeholder="Nombre del usuario"></label>
            <label class="field"><span>Correo</span><input class="input" name="email" type="email" autocomplete="email" placeholder="usuario@empresa.com" required></label>
            <label class="field"><span>Contraseña</span><input class="input" name="password" type="password" autocomplete="current-password" placeholder="Contraseña"></label>
            <label class="field"><span>Rol de prueba</span><select class="select" name="role">${Object.entries(roles).map(([k,v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
            <button class="btn btn-primary btn-glow" type="submit">Ingresar</button>
          </div>
        </form>
      </section>
    </main>`;
  $("#loginForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      if (state.mode === "firebase" && fd.get("password")) await loginFirebase(fd);
      else await loginLocal(fd);
    } catch (error) {
      console.error(error);
      toast("No fue posible ingresar.");
    }
  });
}

function navButton(route) {
  const process = processDefinitions[route];
  const label = process?.title || routeInfo[route]?.[0] || route;
  const icon = process?.icon || routeInfo[route]?.[1] || "•";
  return `<button class="nav-button ${state.route === route ? "active" : ""}" data-route="${route}"><span class="nav-icon">${safe(icon)}</span><span>${safe(label)}</span></button>`;
}

function mobileNavItems(routes) {
  if (state.user?.role === "gerencia") {
    return [["indicators", "VSM", "◉"], ["approvals", "Aprob.", "✓"], ["users", "Usuarios", "US"], ["dashboard", "Inicio", "⌂"], ["requirements", "Req.", "↗"]];
  }
  if (state.user?.role === "admin") {
    return [["dashboard", "Inicio", "⌂"], ["cases", "Casos", "▤"], ["create", "Crear", "+"], ["users", "Usuarios", "US"], ["indicators", "VSM", "◉"]];
  }
  return [
    ["dashboard", "Inicio", "⌂"],
    [routes.processes[0] || "requirements", "Panel", "▤"],
    [canCreate() ? "create" : "requirements", canCreate() ? "Crear" : "Req.", canCreate() ? "+" : "↗"],
    ["requirements", "Req.", "↗"],
    ["indicators", "VSM", "◉"]
  ];
}

function layout(content) {
  const routes = visibleRoutes();
  app.innerHTML = `
    <div class="app-bg-orb orb-a"></div><div class="app-bg-orb orb-b"></div>
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-brand"><img class="sidebar-logo" src="${brandLogo}" alt="Electroingeniería"><div><strong>${safe(appSettings.companyName || "Electroingeniería")}</strong><span>${safe(roleTitle(state.user.role))}</span></div></div>
        <nav class="nav">
          ${routes.main.map(navButton).join("")}
          ${routes.processes.length ? `<div style="height:1px;background:var(--line);margin:8px 0"></div>` : ""}
          ${routes.processes.map(navButton).join("")}
        </nav>
        <div class="sidebar-footer"><div><div class="user-name">${safe(state.user.name)}</div><div class="user-role">${safe(roleTitle(state.user.role))}</div></div><button class="btn btn-ghost btn-small" data-action="logout">Cerrar sesión</button></div>
      </aside>
      <header class="mobile-top"><img class="mobile-logo" src="${brandLogo}" alt="Electroingeniería"><strong>${safe(roleTitle(state.user.role))}</strong><button class="btn btn-small" data-action="logout">Salir</button></header>
      <main class="main">${content}</main>
      <nav class="bottom-nav">
        ${mobileNavItems(routes).map(([r,l,i]) => `<button class="${state.route === r ? "active" : ""}" data-route="${r}"><b>${i}</b><span>${l}</span></button>`).join("")}
      </nav>
    </div>
    <div class="drawer" id="drawer"></div>`;
  $$('[data-route]').forEach(b => b.addEventListener('click', () => setRoute(b.dataset.route)));
  $$('[data-action="logout"]').forEach(b => b.addEventListener('click', logout));
  bindGlobalActions();
}

function pageHeader(title, subtitle, actions = "") {
  return `<div class="topbar"><div class="page-title"><h2>${safe(title)}</h2><p>${safe(subtitle)}</p></div><div class="top-actions">${actions}</div></div>`;
}

function renderDashboard() {
  if (state.user?.role === "gerencia") return renderExecutiveVSM();
  const visible = casesVisibleToUser().filter(c => !c.closedAt);
  const reqs = requirementsForUser();
  const waits = visible.filter(c => ["en_espera", "en_requerimiento", "autorizacion_pendiente"].includes(c.status));
  const assigned = visible.filter(c => c.status === "asignado");
  const openForRole = visible.filter(c => ownerOf(c.currentProcess) === state.user.role || c.assignedRole === state.user.role || canSeeAll());
  const content = `
    ${pageHeader(`Panel ${roleTitle(state.user.role)}`, "Bandeja de trabajo según usuario, proceso y requerimientos asignados.", `${canCreate() ? `<button class="btn btn-primary" data-route="create">${state.user?.role === "ventas" ? "Crear pedido" : "Crear caso"}</button>` : ""}`)}
    <section class="grid grid-4">
      <article class="card kpi"><span>Asignados al rol</span><strong>${openForRole.length}</strong><small>Casos activos</small></article>
      <article class="card kpi"><span>Requerimientos</span><strong>${reqs.length}</strong><small>Pendientes por responder</small></article>
      <article class="card kpi"><span>En espera</span><strong>${waits.length}</strong><small>Bloqueos activos</small></article>
      <article class="card kpi"><span>Por aceptar</span><strong>${assigned.length}</strong><small>Relevos o asignaciones</small></article>
    </section>
    <section class="grid grid-2" style="margin-top:16px">
      <article class="card"><h3>Mi bandeja</h3>${renderCaseList(openForRole.slice(0,8))}</article>
      <article class="card"><h3>Requerimientos para mi área</h3>${renderCaseList(reqs.slice(0,8), true)}</article>
    </section>`;
  layout(content);
}

function filteredCases(process = null) {
  let list = process ? state.cases.filter(c => c.currentProcess === process) : casesVisibleToUser();
  if (!canSeeAll() && process && ownerOf(process) !== state.user.role) list = list.filter(c => c.openRequirement?.targetRole === state.user.role);
  const q = state.filters.search.toLowerCase();
  if (q) list = list.filter(c => [c.reference, c.client, c.description, c.assignedName, c.supplier, c.documentNumber].some(v => String(v || "").toLowerCase().includes(q)));
  if (state.filters.status) list = list.filter(c => c.status === state.filters.status);
  if (state.filters.owner === "mine") list = list.filter(c => c.assignedTo === state.user.uid || c.assignedRole === state.user.role || c.openRequirement?.targetRole === state.user.role);
  return list.sort((a,b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

function renderCases(process = null) {
  const list = filteredCases(process);
  const title = process ? processTitle(process) : "Casos visibles";
  const subtitle = process ? processDefinitions[process].subtitle : "Casos que corresponden al usuario o al rol activo.";
  const content = `
    ${pageHeader(title, subtitle, `${canCreate() ? `<button class="btn btn-primary" data-route="create">${state.user?.role === "ventas" ? "Crear pedido" : "Crear caso"}</button>` : ""}`)}
    <section class="filters">
      <input class="input" id="filterSearch" placeholder="Buscar caso, cliente, documento o responsable" value="${safe(state.filters.search)}">
      <select class="select" id="filterStatus"><option value="">Todos los estados</option>${["asignado","en_proceso","en_espera","en_requerimiento","cerrado_conforme","cerrado_con_novedad"].map(s => `<option value="${s}" ${state.filters.status === s ? "selected" : ""}>${safe(s.replaceAll("_", " "))}</option>`).join("")}</select>
      <select class="select" id="filterOwner"><option value="">Todos</option><option value="mine" ${state.filters.owner === "mine" ? "selected" : ""}>Mi rol</option></select>
      <button class="btn" data-action="export-csv">Exportar</button>
    </section>
    ${renderCaseList(list)}`;
  layout(content);
  bindFilters();
}

function renderCaseList(list, requirementView = false) {
  if (!list.length) return `<div class="empty">No hay registros pendientes.</div>`;
  return `<div class="case-list">${list.map(c => `
    <article class="case-card">
      <div>
        <h3>${safe(c.reference || c.id)} · ${safe(c.client || c.description || "Caso operativo")}</h3>
        <div class="case-meta">
          <span class="chip primary">${safe(c.procedureCode || processDefinitions[c.currentProcess]?.code)}</span>
          <span class="chip gray">${safe(processTitle(c.currentProcess))}</span>
          ${statusChip(c.status)} ${riskChip(c)}
          <span class="chip info timer" data-timer="${c.id}">${fmtTime(totalMs(c))}</span>
          ${c.openRequirement ? `<span class="chip warning">Para ${safe(roleTitle(c.openRequirement.targetRole))}</span>` : ""}
        </div>
      </div>
      <div class="case-actions">
        <button class="btn btn-small" data-action="open-case" data-id="${c.id}">Ver</button>
        ${c.status === "asignado" && (canSeeAll() || c.assignedRole === state.user.role) ? `<button class="btn btn-primary btn-small" data-action="accept-case" data-id="${c.id}">Aceptar</button>` : ""}
        ${c.openRequirement && (canSeeAll() || c.openRequirement.targetRole === state.user.role) ? `<button class="btn btn-primary btn-small" data-action="answer-requirement" data-id="${c.id}">Responder</button>` : ""}
      </div>
    </article>`).join("")}</div>`;
}

function bindFilters() {
  ["filterSearch", "filterStatus", "filterOwner"].forEach(id => {
    const el = $("#" + id);
    if (!el) return;
    el.addEventListener("input", () => {
      state.filters.search = $("#filterSearch")?.value || "";
      state.filters.status = $("#filterStatus")?.value || "";
      state.filters.owner = $("#filterOwner")?.value || "";
      renderCases(processDefinitions[state.route] ? state.route : null);
    });
  });
}

function creatableProcesses() {
  if (canSeeAll()) return Object.keys(processDefinitions);
  if (state.user?.role === "ventas") return ["recepcion_pedidos"];
  const own = Object.entries(processDefinitions).filter(([, p]) => p.ownerRole === state.user.role).map(([k]) => k);
  return own.length ? own : [];
}

function buildInitialChecklist(def, extracted = null) {
  const checklist = Object.fromEntries(def.checklist.map(i => [i, "pending"]));
  if (!extracted || def.code !== "S-PR-2") return checklist;
  const auto = {
    "PDF o documento del pedido recibido": extracted.fileName ? "ok" : "pending",
    "Documento legible y completo": extracted.rawText ? "ok" : "bad",
    "Número de pedido identificado": extracted.orderNumber ? "ok" : "bad",
    "Fecha del pedido identificada": extracted.date ? "ok" : "bad",
    "Cliente e identificación validados": extracted.client || extracted.clientId ? "ok" : "bad",
    "Vendedor o asesor comercial identificado": extracted.salesAdvisor ? "ok" : "bad",
    "Forma de pago identificada": extracted.paymentCondition ? "ok" : "bad",
    "Tipo de entrega identificado": extracted.deliveryType ? "ok" : "bad",
    "Dirección de entrega, ciudad y teléfono identificados": extracted.deliveryAddress || extracted.city || extracted.phone ? "ok" : "bad",
    "Bodega, C.O. o ubicación identificada": extracted.warehouse || extracted.co ? "ok" : "bad",
    "Referencias del pedido identificadas": extracted.items?.length ? "ok" : "bad",
    "Cantidades y unidades de medida identificadas": extracted.items?.some(i => i.quantity || i.unit) ? "ok" : "bad",
    "Notas u observaciones revisadas": extracted.notes ? "ok" : "na",
    "Información del contenido del pedido completa": extracted.completeness >= 85 ? "ok" : "pending"
  };
  return { ...checklist, ...auto };
}

async function handleOrderPdfSelected(event) {
  const file = event.target.files?.[0];
  const panel = $("#pdfReadPanel");
  if (!file) return;
  panel.innerHTML = "Leyendo PDF y extrayendo datos del pedido...";
  try {
    const rawText = await extractPdfTextFromFile(file);
    const extracted = parseOrderPdf(rawText, file.name);
    state.pdfExtraction = extracted;
    applyExtractionToForm(extracted);
    panel.innerHTML = renderExtractionSummary(extracted);
  } catch (error) {
    state.pdfExtraction = { fileName: file.name, rawText: "", error: error.message, completeness: 0, items: [] };
    panel.innerHTML = `<strong>No fue posible leer el PDF automáticamente.</strong><br>Puede crear el pedido manualmente y logística validará el documento.`;
    console.error(error);
  }
}

async function loadPdfJs() {
  if (window.pdfjsLib) return window.pdfjsLib;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  return window.pdfjsLib;
}

async function extractPdfTextFromFile(file) {
  const pdfjsLib = await loadPdfJs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map(item => item.str).join("\n");
    pages.push(text);
  }
  return pages.join("\n");
}

function pickMatch(text, regex) {
  const match = text.match(regex);
  return match ? String(match[1] || "").trim().replace(/\s+/g, " ") : "";
}

function parseOrderPdf(rawText, fileName = "") {
  const text = String(rawText || "").replace(/\r/g, "\n");
  const compact = text.replace(/\n+/g, "\n");
  const lines = compact.split("\n").map(x => x.trim()).filter(Boolean);
  const orderNumber = pickMatch(compact, /No\.\s*([A-Z0-9\-]+)/i);
  const date = pickMatch(compact, /(\d{2}\/\d{2}\/\d{4})/);
  const salesAdvisor = pickMatch(compact, /Vendedor:\s*([^\n]+)/i);
  const paymentCondition = pickMatch(compact, /Forma de Pago:\s*([^\n]+)/i);
  const deliveryType = pickMatch(compact, /(\d{2}\s*-\s*[A-ZÁÉÍÓÚÑ\s]+)/i);
  const deliveryAddress = pickMatch(compact, /Dirección de Entrega:\s*([^\n]+)/i) || findAddress(lines);
  const phone = pickMatch(compact, /(3\d{9})/);
  const clientId = pickMatch(compact, /NIT:\s*([0-9\.\-]+)/i);
  const client = findClient(lines, salesAdvisor, deliveryAddress);
  const warehouse = findWarehouse(lines);
  const notes = pickMatch(compact, /Notas Totales\s*([^\n]+)/i) || pickNotes(lines);
  const totals = {
    subtotal: pickMoneyAfter(compact, "SubTotal"),
    iva: pickMoneyAfter(compact, "IVA"),
    total: pickMoneyAfter(compact, "TOTAL")
  };
  const items = extractItems(lines);
  const fields = [orderNumber, date, client, salesAdvisor, paymentCondition, deliveryType, deliveryAddress, phone, warehouse];
  const completeness = Math.round((fields.filter(Boolean).length / fields.length) * 100);
  return { fileName, rawText: text, orderNumber, date, client, clientId, salesAdvisor, paymentCondition, deliveryType, deliveryAddress, phone, warehouse, notes, totals, items, completeness };
}

function findClient(lines, advisor, address) {
  const bad = /PEDIDO|ELECTRO|Nit|Tel|Fecha|Vendedor|Forma|Cliente|Descripción|Dirección|Tipo|Bodega|Ubicación|SubTotal|IVA|TOTAL|Notas|Elaborado|ORIGINAL/i;
  const candidates = lines.filter(l => /^[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s\.]{8,}$/.test(l) && !bad.test(l) && l !== advisor && l !== address);
  return candidates[0] || "";
}

function findAddress(lines) {
  return lines.find(l => /^(CR|CRA|CL|CALLE|CARRERA|AV|AVENIDA|DG|TRANSV|TV)\s/i.test(l)) || "";
}

function findWarehouse(lines) {
  const idx = lines.findIndex(l => /Bodega/i.test(l));
  if (idx >= 0) {
    const next = lines.slice(idx + 1, idx + 5).find(l => !/Ubicación|C\.O|Ext/i.test(l));
    if (next) return next;
  }
  return lines.find(l => /PUNTO DE VENTA|PARQUE INDUSTRIAL|DESPACHO|BODEGA/i.test(l)) || "";
}

function pickNotes(lines) {
  const idx = lines.findIndex(l => /Notas Totales/i.test(l));
  if (idx >= 0) return lines.slice(idx + 1, idx + 3).join(" ");
  return "";
}

function pickMoneyAfter(text, label) {
  const idx = text.toLowerCase().indexOf(label.toLowerCase());
  if (idx < 0) return "";
  const part = text.slice(idx, idx + 120);
  const m = part.match(/\$\s*([0-9\.\,]+)/);
  return m ? `$${m[1]}` : "";
}

function extractItems(lines) {
  const items = [];
  const unitPattern = /(UND|UN|M|MT|KG|ROL|CJ|GL|PQ)/i;
  for (const line of lines) {
    const m = line.match(/^(\d{6,})\s+(.+?)\s+(\d+(?:[\.,]\d+)?)\s+(UND|UN|M|MT|KG|ROL|CJ|GL|PQ)\b/i);
    if (m) items.push({ reference: m[1], description: m[2].trim(), quantity: m[3], unit: m[4].toUpperCase() });
    else if (/^\d{6,}/.test(line) && unitPattern.test(line)) items.push({ reference: line.match(/^(\d{6,})/)?.[1] || "", description: line.replace(/^\d{6,}\s*/, ""), quantity: "", unit: "" });
  }
  return items;
}

function applyExtractionToForm(x) {
  if (!x) return;
  const set = (id, value) => { const el = $("#" + id); if (el && value) el.value = value; };
  set("fieldReference", x.orderNumber);
  set("fieldClient", x.client);
  set("fieldSalesAdvisor", x.salesAdvisor);
  set("fieldDeliveryType", x.deliveryType);
  set("fieldWarehouse", x.warehouse);
  set("fieldPaymentCondition", x.paymentCondition);
  set("fieldDocumentNumber", x.orderNumber);
}

function renderExtractionSummary(x) {
  const chip = x.completeness >= 85 ? "success" : x.completeness >= 60 ? "warning" : "danger";
  return `
    <strong>Lectura automática del PDF</strong><br>
    <span class="chip ${chip}" style="margin:8px 0">Confianza ${x.completeness}%</span>
    <div class="grid grid-2" style="margin-top:10px">
      <div class="stat-line"><span>Pedido</span><strong>${safe(x.orderNumber || "No leído")}</strong></div>
      <div class="stat-line"><span>Cliente</span><strong>${safe(x.client || "No leído")}</strong></div>
      <div class="stat-line"><span>Asesor</span><strong>${safe(x.salesAdvisor || "No leído")}</strong></div>
      <div class="stat-line"><span>Pago</span><strong>${safe(x.paymentCondition || "No leído")}</strong></div>
      <div class="stat-line"><span>Entrega</span><strong>${safe(x.deliveryType || "No leído")}</strong></div>
      <div class="stat-line"><span>Ítems</span><strong>${x.items?.length || 0}</strong></div>
    </div>`;
}

function renderPdfExtractionCard(c) {
  const x = c.pdfExtraction;
  if (!x) return "";
  return `<article class="card"><h3>Lectura automática del pedido</h3>${renderExtractionSummary(x)}${x.items?.length ? `<div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>Referencia</th><th>Descripción</th><th>Cantidad</th><th>U.M.</th></tr></thead><tbody>${x.items.map(i => `<tr><td>${safe(i.reference)}</td><td>${safe(i.description)}</td><td>${safe(i.quantity)}</td><td>${safe(i.unit)}</td></tr>`).join("")}</tbody></table></div>` : ""}</article>`;
}


function renderCreate() {
  const processes = creatableProcesses();
  if (!processes.length) {
    layout(`${pageHeader("Crear caso", "El rol actual no tiene creación directa de casos.", "")}<div class="empty">Los casos llegan por asignación o requerimiento.</div>`);
    return;
  }
  const salesMode = state.user?.role === "ventas" && processes.includes("recepcion_pedidos");
  const content = `
    ${pageHeader(salesMode ? "Crear pedido" : "Crear caso", salesMode ? "Registra el pedido, carga el PDF y envíalo a logística para iniciar trazabilidad." : "Inicia la trazabilidad desde el primer punto real de control.", "")}
    <section class="card">
      <form id="createCaseForm" class="form-grid">
        <div class="grid grid-2">
          <label class="field"><span>${salesMode ? "Destino operativo" : "Interfaz / proceso inicial"}</span><select class="select" name="currentProcess" id="createProcess">${processes.map(k => `<option value="${k}">${processDefinitions[k].code} · ${processDefinitions[k].title}</option>`).join("")}</select></label>
          <label class="field"><span>Prioridad</span><select class="select" name="priority"><option>Normal</option><option>Alta</option><option>Crítica</option></select></label>
        </div>
        <div id="dynamicCreateFields"></div>
        <label class="field"><span>Observación inicial</span><textarea class="textarea" name="description" placeholder="Contexto operativo del caso"></textarea></label>
        <button class="btn btn-primary" type="submit">${salesMode ? "Enviar pedido a logística" : "Crear trazabilidad"}</button>
      </form>
    </section>`;
  layout(content);
  state.pdfExtraction = null;
  renderDynamicCreateFields();
  $("#createProcess").addEventListener("change", () => { state.pdfExtraction = null; renderDynamicCreateFields(); });
  $("#createCaseForm").addEventListener("submit", createCaseSubmit);
}

function renderDynamicCreateFields() {
  const process = $("#createProcess")?.value || creatableProcesses()[0];
  const box = $("#dynamicCreateFields");
  if (!box) return;
  const salesMode = state.user?.role === "ventas" && process === "recepcion_pedidos";
  const common = `<div class="grid grid-2"><label class="field"><span>Número o referencia</span><input class="input" name="reference" id="fieldReference" required placeholder="Pedido, factura, conteo o documento"></label><label class="field"><span>Asignar a</span><input class="input" name="assignedName" placeholder="Responsable o área" value="${salesMode ? "Logística" : ""}"></label></div>`;
  if (process === "recepcion_pedidos") {
    box.innerHTML = `
      ${salesMode ? `<div class="notice"><strong>Inicio desde ventas:</strong> crea el pedido, adjunta el PDF S-FT-33 si lo tienes y envíalo a logística. La aceptación de logística medirá el tiempo muerto inicial.</div>` : ""}
      <label class="field"><span>PDF del pedido S-FT-33</span><input class="input" name="orderPdf" id="orderPdf" type="file" accept="application/pdf"></label>
      <div id="pdfReadPanel" class="notice">Cargue el PDF desde archivos o cámara para lectura automática. La lectura prellena campos y activa validaciones para logística.</div>
      ${salesMode ? `<div class="grid grid-2">
        <label class="field"><span>Tipo de gestión</span><select class="select" name="priorityMode"><option value="normal">Flujo normal</option><option value="gerencia">Prioridad o salida con autorización de gerencia</option></select></label>
        <label class="field"><span>Motivo de prioridad</span><input class="input" name="priorityReason" placeholder="Cliente crítico, urgencia, autorización especial"></label>
      </div>` : ""}
      ${common}
      <div class="grid grid-2">
        <label class="field"><span>Cliente</span><input class="input" name="client" id="fieldClient" ${salesMode ? "" : "required"}></label>
        <label class="field"><span>Asesor comercial</span><input class="input" name="salesAdvisor" id="fieldSalesAdvisor" value="${state.user?.role === "ventas" ? safe(state.user.name) : ""}"></label>
        <label class="field"><span>Tipo de entrega</span><input class="input" name="deliveryType" id="fieldDeliveryType"></label>
        <label class="field"><span>Bodega / ubicación</span><input class="input" name="warehouse" id="fieldWarehouse"></label>
        <label class="field"><span>Condición de pago</span><input class="input" name="paymentCondition" id="fieldPaymentCondition"></label>
        <label class="field"><span>Documento Siesa</span><input class="input" name="documentNumber" id="fieldDocumentNumber"></label>
      </div>`;
    const pdfInput = $("#orderPdf");
    if (pdfInput) pdfInput.addEventListener("change", handleOrderPdfSelected);
  } else if (process === "inventarios") {
    box.innerHTML = `${common}<div class="grid grid-2"><label class="field"><span>Tipo de inventario</span><select class="select" name="inventoryType"><option>Cíclico</option><option>Selectivo</option><option>Evento</option><option>ABC</option><option>Ubicaciones</option></select></label><label class="field"><span>Ubicación</span><input class="input" name="location"></label></div>`;
  } else {
    box.innerHTML = `${common}<div class="grid grid-2"><label class="field"><span>Cliente</span><input class="input" name="client"></label><label class="field"><span>Documento relacionado</span><input class="input" name="documentNumber"></label></div>`;
  }
}

async async function createCaseSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const process = fd.get("currentProcess");
  const def = processDefinitions[process];
  const createdAt = nowIso();
  const id = uid(def.type === "inventario" ? "INV" : "PED");
  const salesCreatedOrder = state.user?.role === "ventas" && process === "recepcion_pedidos";
  const priorityByManager = salesCreatedOrder && fd.get("priorityMode") === "gerencia";
  const extracted = state.pdfExtraction || null;
  const c = {
    id,
    type: def.type,
    procedureCode: def.code,
    currentProcess: process,
    status: priorityByManager ? "autorizacion_gerencia_pendiente" : (salesCreatedOrder ? "asignado" : "en_proceso"),
    priority: priorityByManager ? "Gerencia / Prioritario" : (fd.get("priority") || "Normal"),
    reference: fd.get("reference") || extracted?.orderNumber || "",
    client: fd.get("client") || extracted?.client || "",
    salesAdvisor: fd.get("salesAdvisor") || extracted?.salesAdvisor || (state.user?.role === "ventas" ? state.user.name : ""),
    deliveryType: fd.get("deliveryType") || extracted?.deliveryType || "",
    warehouse: fd.get("warehouse") || extracted?.warehouse || "",
    paymentCondition: fd.get("paymentCondition") || extracted?.paymentCondition || "",
    documentNumber: fd.get("documentNumber") || extracted?.orderNumber || "",
    inventoryType: fd.get("inventoryType") || "",
    location: fd.get("location") || "",
    description: fd.get("description") || "",
    assignedTo: salesCreatedOrder ? "" : state.user.uid,
    assignedRole: priorityByManager ? "gerencia" : (salesCreatedOrder ? "logistica" : def.ownerRole),
    assignedName: priorityByManager ? "Gerencia" : (salesCreatedOrder ? "Logística" : (fd.get("assignedName") || state.user.name)),
    createdAt,
    createdBy: state.user.uid,
    createdByName: state.user.name,
    updatedAt: createdAt,
    activeStartedAt: salesCreatedOrder ? null : createdAt,
    waitStartedAt: priorityByManager ? createdAt : null,
    deadStartedAt: salesCreatedOrder && !priorityByManager ? createdAt : null,
    totalActiveMs: 0,
    totalWaitMs: 0,
    totalDeadMs: 0,
    checklist: buildInitialChecklist(def, extracted),
    openRequirement: null,
    openWait: null,
    evidence: [],
    cable: null,
    priorityApproval: priorityByManager ? {
      requested: true,
      status: "pendiente",
      reason: fd.get("priorityReason") || "Solicitud prioritaria",
      requestedAt: createdAt,
      requestedBy: state.user.uid,
      requestedByName: state.user.name
    } : null,
    managerApproved: false,
    pdfExtraction: extracted,
    pdfFileName: fd.get("orderPdf")?.name || ""
  };
  await persistCase(c, { type: "CASE_CREATED", detail: priorityByManager ? "Pedido creado por ventas y enviado a gerencia para aprobación prioritaria" : (salesCreatedOrder ? "Pedido creado por ventas y enviado a logística" : "Inicio de trazabilidad") });
  toast(priorityByManager ? "Pedido enviado a gerencia" : (salesCreatedOrder ? "Pedido enviado a logística" : "Caso creado"));
  state.pdfExtraction = null;
  state.route = priorityByManager ? "dashboard" : (salesCreatedOrder ? "dashboard" : process);
  render();
}

function renderCaseDetail(id) {
  const c = caseById(id);
  if (!c) return renderDashboard();
  const canAct = canSeeAll() || c.assignedRole === state.user.role || ownerOf(c.currentProcess) === state.user.role || c.openRequirement?.targetRole === state.user.role;
  const content = `
    ${pageHeader(c.reference || c.id, `${processTitle(c.currentProcess)} · ${c.client || c.description || "Caso operativo"}`, `<button class="btn" data-route="${state.route}">Volver</button>${canAct ? detailActions(c) : ""}`)}
    <section class="detail-layout">
      <div class="grid">
        <article class="card">
          <div class="case-meta" style="margin-bottom:14px"><span class="chip primary">${safe(c.procedureCode)}</span>${statusChip(c.status)}${riskChip(c)}<span class="chip info timer" data-timer="${c.id}">${fmtTime(totalMs(c))}</span></div>
          <div class="grid grid-3">
            <div class="stat-line"><span>Total</span><strong>${fmtTime(totalMs(c))}</strong></div>
            <div class="stat-line"><span>Proceso</span><strong>${fmtTime(currentActiveMs(c))}</strong></div>
            <div class="stat-line"><span>Espera</span><strong>${fmtTime(currentWaitMs(c))}</strong></div>
            <div class="stat-line"><span>Tiempo muerto</span><strong>${fmtTime(currentDeadMs(c))}</strong></div>
            <div class="stat-line"><span>Avance</span><strong>${progressPercent(c)}%</strong></div>
            <div class="stat-line"><span>Responsable</span><strong>${safe(c.assignedName || roleTitle(c.assignedRole))}</strong></div>
          </div>
          <div style="margin-top:14px" class="progress-bar"><div style="width:${progressPercent(c)}%"></div></div>
        </article>
        ${c.openRequirement ? `<article class="notice"><strong>Requerimiento activo:</strong> ${safe(c.openRequirement.reason)} · Destino: ${safe(roleTitle(c.openRequirement.targetRole))} · Tiempo: <span class="timer">${fmtTime(durationSince(c.waitStartedAt))}</span></article>` : ""}
        ${renderPdfExtractionCard(c)}
        <article class="card"><h3>Chequeo del proceso</h3>${renderChecklist(c)}</article>
      </div>
      <aside class="grid">
        <article class="card"><h3>Datos del caso</h3>${caseInfo(c)}</article>
        <article class="card"><h3>Evidencias</h3>${renderEvidence(c)}</article>
        <article class="card"><h3>Línea de tiempo</h3>${renderTimeline(eventsForCase(c.id))}</article>
      </aside>
    </section>`;
  layout(content);
}

function detailActions(c) {
  if (c.closedAt) return "";
  return `
    ${c.status === "asignado" ? `<button class="btn btn-primary" data-action="accept-case" data-id="${c.id}">Aceptar</button>` : ""}
    ${c.openRequirement && (canSeeAll() || c.openRequirement.targetRole === state.user.role) ? `<button class="btn btn-primary" data-action="answer-requirement" data-id="${c.id}">Responder</button>` : ""}
    <button class="btn" data-action="assign-case" data-id="${c.id}">Asignar</button>
    <button class="btn btn-warning" data-action="open-requirement" data-id="${c.id}">Requerimiento</button>
    ${c.currentProcess === "alistamiento" ? `<button class="btn" data-action="validate-cable" data-id="${c.id}">Validar cable</button>` : ""}
    ${c.currentProcess === "facturacion" ? `<button class="btn" data-action="invoice-decision" data-id="${c.id}">Definir factura</button>` : ""}
    <button class="btn" data-action="add-evidence" data-id="${c.id}">Foto</button>
    <button class="btn" data-action="transfer-case" data-id="${c.id}">Relevar</button>
    <button class="btn btn-success" data-action="close-case" data-id="${c.id}">Cerrar</button>`;
}

function caseInfo(c) {
  const rows = [
    ["Proceso", processTitle(c.currentProcess)], ["Estado", (c.status || "").replaceAll("_", " ")], ["Creado", fmtDate(c.createdAt)], ["Actualizado", fmtDate(c.updatedAt)],
    ["Cliente", c.client], ["Asesor", c.salesAdvisor], ["Tipo entrega", c.deliveryType], ["Bodega", c.warehouse], ["Condición pago", c.paymentCondition], ["Documento", c.documentNumber], ["Inventario", c.inventoryType], ["Ubicación", c.location], ["Observación", c.description]
  ].filter(([,v]) => v);
  if (c.pdfExtraction) {
    rows.push(["PDF leído", c.pdfFileName || c.pdfExtraction.fileName || "Sí"], ["Confianza lectura", `${c.pdfExtraction.completeness || 0}%`], ["Ítems leídos", String(c.pdfExtraction.items?.length || 0)]);
  }
  if (c.cable) {
    rows.push(["Metraje carreto", `${c.cable.totalMeters} m`], ["Corte solicitado", `${c.cable.cutMeters} m`], ["Remanente", `${c.cable.remainingMeters} m`], ["Política cable", c.cable.compliant ? "Cumple" : "Requiere autorización"]);
  }
  return rows.map(([a,b]) => `<div class="stat-line"><span>${safe(a)}</span><strong>${safe(b)}</strong></div>`).join("");
}

function renderChecklist(c) {
  const items = Object.keys(c.checklist || {});
  if (!items.length) return `<div class="empty">Sin checklist configurado.</div>`;
  return `<div class="checklist">${items.map(item => {
    const value = c.checklist[item] || "pending";
    return `<div class="check-row"><div class="check-row-title">${safe(item)}</div><div class="segment" data-case="${c.id}" data-check="${safe(item)}">
      ${[["ok","Conforme","ok"],["bad","No conforme","bad"],["na","No aplica","na"],["pending","Pendiente","pending"]].map(([v,l,cls]) => `<button class="${value === v ? `active ${cls}` : ""}" data-action="update-check" data-value="${v}">${l}</button>`).join("")}
    </div></div>`;
  }).join("")}</div>`;
}

function renderEvidence(c) {
  const list = c.evidence || [];
  if (!list.length) return `<div class="empty">Sin fotografías o evidencias.</div>`;
  return `<div class="grid">${list.map(e => `<a class="case-card" href="${safe(e.url)}" target="_blank" rel="noopener"><div><h3>${safe(e.label || "Evidencia")}</h3><div class="case-meta"><span class="chip gray">${fmtDate(e.createdAt)}</span></div></div></a>`).join("")}</div>`;
}

function renderTimeline(events) {
  if (!events.length) return `<div class="empty">Sin eventos registrados.</div>`;
  return `<div class="timeline">${events.map(e => `<div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content"><strong>${safe(eventLabel(e.type))}</strong><span>${safe(e.detail || e.reason || "")}</span><span>${fmtDate(e.timestamp)} · ${safe(e.userName || "Usuario")}</span></div></div>`).join("")}</div>`;
}

function renderRequirements() {
  const reqs = requirementsForUser();
  const content = `
    ${pageHeader("Requerimientos", "Bandeja de solicitudes enviadas a esta área para desbloquear el flujo.", "")}
    <section class="card"><h3>Por responder</h3>${renderCaseList(reqs, true)}</section>`;
  layout(content);
}

function vsmMetrics(data = state.cases) {
  const totalCases = data.length || 1;
  const open = data.filter(c => !c.closedAt);
  const closed = data.filter(c => c.closedAt);
  const leadTimes = data.map(c => totalMs(c));
  const leadTime = leadTimes.reduce((a,b)=>a+b,0) / totalCases;
  const va = data.reduce((a,c)=>a+currentActiveMs(c),0);
  const wait = data.reduce((a,c)=>a+currentWaitMs(c),0);
  const dead = data.reduce((a,c)=>a+currentDeadMs(c),0);
  const nva = wait + dead;
  const vaPct = Math.round((va / Math.max(va + nva, 1)) * 100);
  const withRework = data.filter(c => state.events.some(e => e.caseId === c.id && ["REQUIREMENT_SENT","WAIT_STARTED"].includes(e.type))).length;
  const correctFirst = closed.filter(c => c.status === "cerrado_conforme" && !state.events.some(e => e.caseId === c.id && ["REQUIREMENT_SENT","WAIT_STARTED"].includes(e.type))).length;
  const fpy = closed.length ? Math.round((correctFirst / closed.length) * 100) : 0;
  const reworkRate = Math.round((withRework / totalCases) * 100);
  const defects = state.events.filter(e => ["REQUIREMENT_SENT","WAIT_STARTED"].includes(e.type) || (e.type === "CHECK_UPDATED" && String(e.detail || "").includes("No conforme"))).length;
  const throughput = closed.length;
  const availableMs = 8 * 60 * 60 * 1000;
  const takt = Math.round(availableMs / Math.max(closed.length || open.length || 1, 1));
  const handoffs = state.events.filter(e => e.type === "TRANSFER_SENT").length;
  const onTime = data.length ? Math.max(0, 100 - Math.round(data.filter(c => riskChip(c).includes("Crítico")).length / data.length * 100)) : 0;
  return { totalCases, open, closed, leadTime, va, wait, dead, nva, vaPct, withRework, fpy, reworkRate, defects, throughput, takt, handoffs, onTime };
}

function groupByProcessTime(data = state.cases) {
  const map = {};
  data.forEach(c => {
    const key = c.currentProcess || "sin_proceso";
    if (!map[key]) map[key] = { process: key, active: 0, wait: 0, dead: 0, total: 0, count: 0 };
    map[key].active += currentActiveMs(c);
    map[key].wait += currentWaitMs(c);
    map[key].dead += currentDeadMs(c);
    map[key].total += totalMs(c);
    map[key].count += 1;
  });
  return Object.values(map).sort((a,b)=>b.total-a.total);
}

function reasonCounts() {
  const map = {};
  state.events.filter(e => ["REQUIREMENT_SENT", "WAIT_STARTED"].includes(e.type)).forEach(e => {
    const k = e.reason || e.detail || "Sin motivo";
    map[k] = (map[k] || 0) + 1;
  });
  return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,8);
}

function svgLine(values, label = "Tendencia") {
  const w=520,h=170,p=22;
  const vals = values.length ? values : [0,0,0,0];
  const max = Math.max(...vals, 1);
  const pts = vals.map((v,i)=>`${p + i*(w-2*p)/Math.max(vals.length-1,1)},${h-p-(v/max)*(h-2*p)}`).join(" ");
  return `<div class="chart-card"><div class="chart-title">${safe(label)}</div><svg viewBox="0 0 ${w} ${h}" class="chart-svg"><polyline fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" points="${pts}"></polyline>${vals.map((v,i)=>`<circle cx="${p + i*(w-2*p)/Math.max(vals.length-1,1)}" cy="${h-p-(v/max)*(h-2*p)}" r="5"></circle>`).join("")}</svg></div>`;
}

function svgBars(rows, label = "Barras") {
  const max = Math.max(...rows.map(r=>r.value), 1);
  return `<div class="chart-card"><div class="chart-title">${safe(label)}</div><div class="chart-bars">${rows.map(r=>`<div class="chart-bar-row"><span>${safe(r.label)}</span><div><b style="width:${Math.max(4, Math.round(r.value/max*100))}%"></b></div><strong>${safe(r.display || fmtTime(r.value))}</strong></div>`).join("")}</div></div>`;
}

function svgStacked(va, nva) {
  const total = Math.max(va+nva,1);
  const vaPct = Math.round(va/total*100);
  const nvaPct = 100-vaPct;
  return `<div class="chart-card"><div class="chart-title">VA vs NVA</div><div class="stacked"><span class="va" style="width:${vaPct}%">${vaPct}% VA</span><span class="nva" style="width:${nvaPct}%">${nvaPct}% NVA</span></div><div class="stat-line"><span>Valor agregado</span><strong>${fmtTime(va)}</strong></div><div class="stat-line"><span>Sin valor agregado</span><strong>${fmtTime(nva)}</strong></div></div>`;
}

function svgGauge(pct, label) {
  const val = Math.max(0, Math.min(100, pct || 0));
  const dash = Math.round(283 * val / 100);
  return `<div class="chart-card gauge-card"><div class="chart-title">${safe(label)}</div><svg viewBox="0 0 120 120" class="gauge"><circle cx="60" cy="60" r="45" class="gauge-bg"></circle><circle cx="60" cy="60" r="45" class="gauge-fg" stroke-dasharray="${dash} 283"></circle><text x="60" y="66" text-anchor="middle">${val}%</text></svg></div>`;
}

function svgRadar(rows) {
  const labels = rows.slice(0,6).map(r=>processTitle(r.process));
  const vals = rows.slice(0,6).map(r=>r.total);
  while (labels.length < 3) { labels.push("Sin dato"); vals.push(0); }
  const max = Math.max(...vals, 1);
  const cx=155, cy=145, radius=100;
  const points = vals.map((v,i) => {
    const a = -Math.PI/2 + i * 2*Math.PI/vals.length;
    const r = radius * (v/max);
    return `${cx + Math.cos(a)*r},${cy + Math.sin(a)*r}`;
  }).join(" ");
  const axes = labels.map((l,i)=>{
    const a=-Math.PI/2+i*2*Math.PI/labels.length;
    const x=cx+Math.cos(a)*radius, y=cy+Math.sin(a)*radius;
    const tx=cx+Math.cos(a)*(radius+30), ty=cy+Math.sin(a)*(radius+30);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"></line><text x="${tx}" y="${ty}" text-anchor="middle">${safe(l.slice(0,14))}</text>`;
  }).join("");
  return `<div class="chart-card"><div class="chart-title">Resumen por área · radar de tiempo</div><svg viewBox="0 0 310 300" class="radar"><polygon points="${points}"></polygon>${axes}</svg></div>`;
}

function renderExecutiveVSM() {
  const data = canSeeAll() ? state.cases : casesVisibleToUser();
  const m = vsmMetrics(data);
  const byProcess = groupByProcessTime(data);
  const cycleRows = byProcess.map(r=>({label: processTitle(r.process), value: r.active / Math.max(r.count,1)})).slice(0,8);
  const wipRows = byProcess.map(r=>({label: processTitle(r.process), value: r.count, display: `${r.count}`})).slice(0,8);
  const pareto = reasonCounts().map(([label,value])=>({label, value, display: `${value}`}));
  const trend = data.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(-12).map(c=>totalMs(c));
  const content = `
    ${pageHeader("VSM gerencial", "Lead time, ciclo, VA/NVA, WIP, reproceso, calidad y cuello de botella.", `${canManageUsers() ? `<button class="btn btn-primary" data-route="users">Crear usuarios</button>` : ""}<button class="btn" data-route="approvals">Aprobaciones</button>`)}
    <section class="grid grid-4">
      <article class="card kpi"><span>Lead Time</span><strong style="font-size:1.75rem">${fmtTime(m.leadTime)}</strong><small>Tiempo total promedio</small></article>
      <article class="card kpi"><span>% Valor agregado</span><strong>${m.vaPct}%</strong><small>VA frente al flujo total</small></article>
      <article class="card kpi"><span>WIP</span><strong>${m.open.length}</strong><small>Trabajo en proceso</small></article>
      <article class="card kpi"><span>FPY</span><strong>${m.fpy}%</strong><small>Correctos a la primera</small></article>
    </section>
    <section class="grid grid-4" style="margin-top:16px">
      <article class="card kpi"><span>Reproceso</span><strong>${m.reworkRate}%</strong><small>Casos con corrección</small></article>
      <article class="card kpi"><span>No conformidades</span><strong>${m.defects}</strong><small>Errores y bloqueos</small></article>
      <article class="card kpi"><span>Throughput</span><strong>${m.throughput}</strong><small>Casos cerrados</small></article>
      <article class="card kpi"><span>Takt estimado</span><strong style="font-size:1.75rem">${fmtTime(m.takt)}</strong><small>8 h / demanda visible</small></article>
    </section>
    <section class="grid grid-2" style="margin-top:16px">
      ${svgLine(trend, "Lead Time total · tendencia")}
      ${svgRadar(byProcess)}
      ${svgBars(cycleRows, "Tiempo de ciclo por actividad")}
      ${svgStacked(m.va, m.nva)}
      ${svgBars(pareto, "Pareto NVA · esperas y reprocesos")}
      ${svgBars(wipRows, "WIP por etapa")}
      ${svgGauge(m.fpy, "First Pass Yield")}
      ${svgGauge(m.onTime, "Cumplimiento estimado")}
    </section>
    <section class="card" style="margin-top:16px">
      <h3>Resumen VSM por área</h3>
      <div class="table-wrap"><table><thead><tr><th>Área</th><th>Casos</th><th>Cycle Time</th><th>Espera</th><th>NVA</th><th>Total</th><th>Cuello de botella</th></tr></thead><tbody>
      ${byProcess.map((r,idx)=>`<tr><td>${safe(processTitle(r.process))}</td><td>${r.count}</td><td>${fmtTime(r.active/Math.max(r.count,1))}</td><td>${fmtTime(r.wait)}</td><td>${fmtTime(r.wait+r.dead)}</td><td>${fmtTime(r.total)}</td><td>${idx===0 ? "Principal" : "—"}</td></tr>`).join("")}
      </tbody></table></div>
    </section>`;
  layout(content);
}

function renderIndicators() {
  return renderExecutiveVSM();
}

function renderAdmin() {
  const content = `
    ${pageHeader("Administración", "Configuración, datos de prueba y exportación.", "")}
    <section class="grid grid-2"><article class="card"><h3>Estado</h3><div class="stat-line"><span>Base</span><strong>${state.mode === "firebase" ? "Firebase" : "Local"}</strong></div><div class="stat-line"><span>Drive</span><strong>${appSettings.driveUploadUrl ? "Activo" : "Pendiente"}</strong></div><div class="stat-line"><span>Casos</span><strong>${state.cases.length}</strong></div></article><article class="card"><h3>Acciones</h3><div class="grid"><button class="btn" data-action="seed-data">Cargar casos de prueba</button><button class="btn" data-action="export-csv">Exportar CSV</button><button class="btn btn-danger" data-action="clear-local">Limpiar datos locales</button></div></article></section>
    <section class="card" style="margin-top:16px"><h3>Interfaces activas</h3><div class="table-wrap"><table><thead><tr><th>Código</th><th>Interfaz</th><th>Rol</th><th>Chequeos</th><th>Destino</th></tr></thead><tbody>${Object.entries(processDefinitions).map(([k,p]) => `<tr><td>${p.code}</td><td>${p.title}</td><td>${roleTitle(p.ownerRole)}</td><td>${p.checklist.length}</td><td>${p.next.map(processTitle).join(", ") || "Cierre"}</td></tr>`).join("")}</tbody></table></div></section>`;
  layout(content);
}


function renderApprovals() {
  const pending = state.cases.filter(c => c.status === "autorizacion_gerencia_pendiente" && !c.closedAt);
  const approved = state.cases.filter(c => c.priorityApproval?.status === "aprobado").slice(0,10);
  const content = `
    ${pageHeader("Aprobaciones de gerencia", "Autorizaciones para prioridad, salida especial o continuidad sin aprobación ordinaria.", "")}
    <section class="card">
      <h3>Pendientes de decisión</h3>
      ${pending.length ? `<div class="case-list">${pending.map(c => `
        <article class="case-card">
          <div>
            <h3>${safe(c.reference || c.id)} · ${safe(c.client || "Cliente pendiente")}</h3>
            <div class="case-meta">${statusChip(c.status)}<span class="chip warning">${safe(c.priorityApproval?.reason || "Solicitud prioritaria")}</span><span class="chip info timer">${fmtTime(durationSince(c.waitStartedAt || c.createdAt))}</span></div>
          </div>
          <div class="case-actions">
            <button class="btn btn-small" data-action="open-case" data-id="${c.id}">Ver</button>
            ${canApprovePriority() ? `<button class="btn btn-success btn-small" data-action="approve-priority" data-id="${c.id}">Aprobar</button><button class="btn btn-danger btn-small" data-action="reject-priority" data-id="${c.id}">Rechazar</button>` : `<span class="chip warning">Solo gerencia aprueba</span>`}
          </div>
        </article>`).join("")}</div>` : `<div class="empty">No hay autorizaciones pendientes.</div>`}
    </section>
    <section class="card" style="margin-top:16px">
      <h3>Autorizaciones recientes</h3>
      ${approved.length ? renderCaseList(approved) : `<div class="empty">Sin aprobaciones registradas.</div>`}
    </section>`;
  layout(content);
}

function renderUsers() {
  if (!canManageUsers()) {
    return layout(`${pageHeader("Usuarios", "Acceso restringido.", "")}<div class="empty">Solo administración y gerencia pueden gestionar usuarios.</div>`);
  }
  const gerentes = (state.users || []).filter(u => u.role === "gerencia");
  const content = `
    ${pageHeader("Usuarios y roles", "Creación controlada de usuarios para acceso por panel.", `<button class="btn btn-primary" data-action="open-user-modal">Crear usuario</button>`)}
    <section class="grid grid-3">
      <article class="card kpi"><span>Usuarios registrados</span><strong>${state.users.length}</strong><small>Perfiles en Firestore</small></article>
      <article class="card kpi"><span>Gerencia</span><strong>${gerentes.length}/2</strong><small>Límite operativo</small></article>
      <article class="card kpi"><span>Roles activos</span><strong>${new Set((state.users||[]).map(u=>u.role)).size}</strong><small>Distribución de acceso</small></article>
    </section>
    <section class="card" style="margin-top:16px">
      <h3>Directorio</h3>
      <div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th></tr></thead><tbody>
      ${(state.users || []).map(u => `<tr><td>${safe(u.name)}</td><td>${safe(u.email)}</td><td>${safe(roleTitle(u.role))}</td><td>${u.isActive === false ? "Inactivo" : "Activo"}</td><td>${fmtDate(u.createdAt)}</td></tr>`).join("") || `<tr><td colspan="5">Sin usuarios cargados.</td></tr>`}
      </tbody></table></div>
    </section>`;
  layout(content);
}

function openCreateUserModal() {
  if (!canManageUsers()) return toast("Acceso restringido.");
  const gerenciaCount = (state.users || []).filter(u => u.role === "gerencia").length;
  drawer(modalShell("Crear usuario", "Define correo, contraseña temporal y rol operativo.", `
    <form id="createUserForm" class="form-grid">
      <label class="field"><span>Nombre</span><input class="input" name="name" required placeholder="Nombre completo"></label>
      <label class="field"><span>Correo</span><input class="input" name="email" type="email" required placeholder="usuario@empresa.com"></label>
      <label class="field"><span>Contraseña temporal</span><input class="input" name="password" type="password" required minlength="6" placeholder="Mínimo 6 caracteres"></label>
      <label class="field"><span>Rol</span><select class="select" name="role" required>
        ${Object.entries(roles).map(([k,v]) => `<option value="${k}" ${k === "gerencia" && gerenciaCount >= 2 ? "disabled" : ""}>${safe(v)}${k === "gerencia" ? ` · ${gerenciaCount}/2` : ""}</option>`).join("")}
      </select></label>
      <button class="btn btn-primary" type="submit">Crear usuario</button>
    </form>`));
  $("#createUserForm").addEventListener("submit", async e => {
    e.preventDefault();
    await createUserFromApp(new FormData(e.currentTarget));
    closeDrawer();
    await dataLoad();
    renderUsers();
  });
}

async function createUserFromApp(fd) {
  const name = String(fd.get("name") || "").trim();
  const email = String(fd.get("email") || "").trim();
  const password = String(fd.get("password") || "");
  const role = String(fd.get("role") || "");
  if (!canManageUsers()) return toast("Acceso restringido.");
  if (role === "gerencia" && (state.users || []).filter(u => u.role === "gerencia").length >= 2) return toast("Solo se permiten dos usuarios con rol gerencia.");
  const createdAt = nowIso();

  if (state.mode === "firebase" && fb) {
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authMod = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const secondaryName = `creator_${Date.now()}`;
    const secondaryApp = appMod.initializeApp(firebaseConfig, secondaryName);
    const secondaryAuth = authMod.getAuth(secondaryApp);
    try {
      const cred = await authMod.createUserWithEmailAndPassword(secondaryAuth, email, password);
      try { await authMod.updateProfile(cred.user, { displayName: name }); } catch {}
      await fb.fsMod.setDoc(fb.fsMod.doc(fb.db, "users", cred.user.uid), {
        name, email, role, isActive: true, createdAt, createdBy: state.user.uid, createdByName: state.user.name
      });
      await authMod.signOut(secondaryAuth);
      toast("Usuario creado.");
    } finally {
      try { await appMod.deleteApp(secondaryApp); } catch {}
    }
  } else {
    const data = localStore();
    const id = uid("usr");
    data.users = [{ id, name, email, role, isActive: true, createdAt, createdBy: state.user?.uid || "local" }, ...(data.users || [])];
    saveLocalStore(data);
    state.users = data.users;
    toast("Usuario creado en modo local.");
  }
}

async function approvePriority(id) {
  if (!canApprovePriority()) return toast("Solo gerencia puede aprobar.");
  const c = caseById(id); if (!c) return;
  const now = nowIso();
  const next = { ...c };
  if (next.waitStartedAt) next.totalWaitMs = Number(next.totalWaitMs || 0) + durationSince(next.waitStartedAt);
  next.waitStartedAt = null;
  next.status = "asignado";
  next.assignedRole = "logistica";
  next.assignedName = "Logística · Prioritario";
  next.deadStartedAt = now;
  next.priority = "Gerencia aprobada";
  next.managerApproved = true;
  next.priorityApproval = { ...(next.priorityApproval || {}), status: "aprobado", approvedAt: now, approvedBy: state.user.uid, approvedByName: state.user.name };
  await persistCase(next, { type: "MANAGER_PRIORITY_APPROVED", detail: "Gerencia aprobó continuidad prioritaria hacia logística" });
  toast("Autorización aprobada.");
  renderApprovals();
}

function openRejectPriorityModal(id) {
  if (!canApprovePriority()) return toast("Solo gerencia puede rechazar.");
  const c = caseById(id); if (!c) return;
  drawer(modalShell("Rechazar autorización", "Registra el motivo de rechazo para trazabilidad.", `
    <form id="rejectPriorityForm" class="form-grid">
      <label class="field"><span>Motivo</span><textarea class="textarea" name="detail" required></textarea></label>
      <button class="btn btn-danger" type="submit">Rechazar</button>
    </form>`));
  $("#rejectPriorityForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = { ...c };
    if (next.waitStartedAt) next.totalWaitMs = Number(next.totalWaitMs || 0) + durationSince(next.waitStartedAt);
    next.waitStartedAt = null;
    next.status = "cancelado";
    next.closedAt = nowIso();
    next.priorityApproval = { ...(next.priorityApproval || {}), status: "rechazado", rejectedAt: nowIso(), rejectedBy: state.user.uid, rejectedByName: state.user.name, rejectionReason: fd.get("detail") };
    await persistCase(next, { type: "MANAGER_PRIORITY_REJECTED", detail: fd.get("detail") });
    toast("Autorización rechazada.");
    closeDrawer();
    renderApprovals();
  });
}


function drawer(html) {
  const d = $("#drawer");
  d.innerHTML = html;
  d.classList.add("open");
  $$('[data-action="close-modal"]', d).forEach(b => b.addEventListener("click", closeDrawer));
  d.addEventListener("click", e => { if (e.target === d) closeDrawer(); }, { once: true });
}
function closeDrawer() { const d = $("#drawer"); if (d) { d.classList.remove("open"); d.innerHTML = ""; } }
function modalShell(title, subtitle, body) { return `<div class="modal"><div class="modal-head"><div><h3>${safe(title)}</h3><p>${safe(subtitle)}</p></div><button class="btn btn-small" data-action="close-modal">Cerrar</button></div>${body}</div>`; }

function bindGlobalActions() {
  $$('[data-action]').forEach(el => el.addEventListener('click', async e => {
    const action = e.currentTarget.dataset.action;
    const id = e.currentTarget.dataset.id;
    if (action === "open-case") { state.selectedCaseId = id; renderCaseDetail(id); }
    if (action === "accept-case") await acceptCase(id);
    if (action === "update-check") await updateCheck(e.currentTarget);
    if (action === "open-requirement") openRequirementModal(id);
    if (action === "answer-requirement") openAnswerRequirementModal(id);
    if (action === "assign-case") openAssignModal(id);
    if (action === "transfer-case") openTransferModal(id);
    if (action === "close-case") openCloseCaseModal(id);
    if (action === "add-evidence") openEvidenceModal(id);
    if (action === "validate-cable") openCableModal(id);
    if (action === "invoice-decision") openInvoiceDecisionModal(id);
    if (action === "export-csv") exportCsv();
    if (action === "seed-data") await seedData();
    if (action === "clear-local") clearLocal();
    if (action === "open-user-modal") openCreateUserModal();
    if (action === "approve-priority") await approvePriority(id);
    if (action === "reject-priority") openRejectPriorityModal(id);
  }));
}

async function acceptCase(id) {
  const c = caseById(id); if (!c) return;
  const next = { ...c, status: "en_proceso", assignedTo: state.user.uid, assignedName: state.user.name, activeStartedAt: nowIso(), deadStartedAt: null, totalDeadMs: Number(c.totalDeadMs || 0) + durationSince(c.deadStartedAt) };
  await persistCase(next, { type: "CASE_ACCEPTED", detail: "Caso aceptado por el responsable" });
  toast("Caso aceptado");
  renderCaseDetail(id);
}

async function updateCheck(button) {
  const segment = button.closest(".segment");
  const id = segment.dataset.case;
  const item = segment.dataset.check;
  const value = button.dataset.value;
  const c = caseById(id); if (!c || c.closedAt) return;
  const next = { ...c, checklist: { ...(c.checklist || {}), [item]: value } };
  await persistCase(next, { type: "CHECK_UPDATED", detail: `${item}: ${labelCheck(value)}` });
  if (value === "bad") setTimeout(() => openRequirementModal(id, item), 120);
  else renderCaseDetail(id);
}
function labelCheck(v) { return ({ ok: "Conforme", bad: "No conforme", na: "No aplica", pending: "Pendiente" })[v] || v; }

function targetOptions(def) {
  const allowed = def.requirementTargets || Object.keys(roles);
  return allowed.map(r => `<option value="${r}">${safe(roleTitle(r))}</option>`).join("");
}

function openRequirementModal(id, sourceItem = "") {
  const c = caseById(id); const def = processDefinitions[c.currentProcess];
  drawer(modalShell("Crear requerimiento", "Envía la solicitud al área responsable y detiene el tiempo operativo hasta recibir respuesta.", `
    <form id="requirementForm" class="form-grid">
      <label class="field"><span>Enviar a</span><select class="select" name="targetRole">${targetOptions(def)}</select></label>
      <label class="field"><span>Motivo</span><select class="select" name="reason">${def.reasons.map(r => `<option ${sourceItem && r.includes(sourceItem) ? "selected" : ""}>${safe(r)}</option>`).join("")}</select></label>
      <div class="grid grid-2">${def.missingFields.map(f => `<label class="field" style="display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:12px"><input type="checkbox" name="fields" value="${safe(f)}" ${sourceItem === f ? "checked" : ""}><span>${safe(f)}</span></label>`).join("")}</div>
      <label class="field"><span>Detalle para el área</span><textarea class="textarea" name="detail" required placeholder="Describe exactamente lo que falta o lo que se debe resolver">${safe(sourceItem || "")}</textarea></label>
      <label class="field"><span>Foto o soporte si aplica</span><input class="input" name="photo" type="file" accept="image/*" capture="environment"></label>
      <button class="btn btn-warning" type="submit">Enviar requerimiento</button>
    </form>`));
  $("#requirementForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await startRequirement(id, fd);
    closeDrawer();
    renderCaseDetail(id);
  });
}

async function startRequirement(id, fd) {
  const c = caseById(id); if (!c) return;
  const now = nowIso();
  const next = { ...c };
  if (next.activeStartedAt) next.totalActiveMs = Number(next.totalActiveMs || 0) + durationSince(next.activeStartedAt);
  next.activeStartedAt = null;
  next.status = fd.get("targetRole") === "jefe_logistico" ? "autorizacion_pendiente" : "en_requerimiento";
  next.waitStartedAt = now;
  next.openRequirement = { id: uid("req"), targetRole: fd.get("targetRole"), reason: fd.get("reason"), fields: fd.getAll("fields"), detail: fd.get("detail"), sentAt: now, sentBy: state.user.uid, sentByName: state.user.name, returnProcess: c.currentProcess };
  const file = fd.get("photo");
  if (file && file.size) {
    const evidence = await uploadPhoto(file, id, `Requerimiento · ${fd.get("reason")}`);
    next.evidence = [...(next.evidence || []), evidence];
    await createEvent({ caseId: id, process: c.currentProcess, type: "PHOTO_UPLOADED", detail: evidence.label });
  }
  await persistCase(next, { type: "REQUIREMENT_SENT", reason: fd.get("reason"), detail: `Para ${roleTitle(fd.get("targetRole"))}: ${fd.get("detail")}` });
  toast("Requerimiento enviado");
}

function openAnswerRequirementModal(id) {
  const c = caseById(id); if (!c?.openRequirement) return;
  const fields = c.openRequirement.fields || [];
  drawer(modalShell("Responder requerimiento", "La respuesta cierra la espera y permite retomar el proceso.", `
    <form id="answerRequirementForm" class="form-grid">
      <div class="notice"><strong>${safe(c.openRequirement.reason)}</strong><br>${safe(c.openRequirement.detail || "")}${fields.length ? `<br>Solicitado: ${safe(fields.join(", "))}` : ""}</div>
      <label class="field"><span>Respuesta</span><textarea class="textarea" name="answer" required placeholder="Registra la información enviada o la autorización"></textarea></label>
      <div class="grid grid-2">
        <label class="field"><span>Tipo de entrega</span><input class="input" name="deliveryType" value="${safe(c.deliveryType || "")}"></label>
        <label class="field"><span>Bodega</span><input class="input" name="warehouse" value="${safe(c.warehouse || "")}"></label>
        <label class="field"><span>Condición de pago</span><input class="input" name="paymentCondition" value="${safe(c.paymentCondition || "")}"></label>
        <label class="field"><span>Documento</span><input class="input" name="documentNumber" value="${safe(c.documentNumber || "")}"></label>
      </div>
      <button class="btn btn-primary" type="submit">Responder y devolver</button>
    </form>`));
  $("#answerRequirementForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const now = nowIso();
    const next = { ...c };
    next.totalWaitMs = Number(next.totalWaitMs || 0) + durationSince(next.waitStartedAt);
    next.waitStartedAt = null;
    next.status = "en_proceso";
    next.activeStartedAt = now;
    next.currentProcess = c.openRequirement.returnProcess || c.currentProcess;
    next.assignedRole = ownerOf(next.currentProcess);
    next.assignedName = roleTitle(next.assignedRole);
    next.deliveryType = fd.get("deliveryType");
    next.warehouse = fd.get("warehouse");
    next.paymentCondition = fd.get("paymentCondition");
    next.documentNumber = fd.get("documentNumber");
    next.lastRequirementAnswer = fd.get("answer");
    next.openRequirement = null;
    await persistCase(next, { type: "REQUIREMENT_ANSWERED", detail: fd.get("answer") });
    toast("Requerimiento respondido");
    closeDrawer();
    state.route = defaultRouteFor(next.assignedRole);
    renderCaseDetail(id);
  });
}

function openAssignModal(id) {
  const c = caseById(id);
  drawer(modalShell("Asignar responsable", "Define quién debe aceptar y ejecutar el siguiente tramo.", `
    <form id="assignForm" class="form-grid">
      <label class="field"><span>Rol responsable</span><select class="select" name="assignedRole">${Object.entries(roles).map(([r,t]) => `<option value="${r}" ${c.assignedRole === r ? "selected" : ""}>${safe(t)}</option>`).join("")}</select></label>
      <label class="field"><span>Nombre o equipo</span><input class="input" name="assignedName" value="${safe(c.assignedName || "")}" required></label>
      <button class="btn btn-primary" type="submit">Asignar</button>
    </form>`));
  $("#assignForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const next = { ...c, status: "asignado", assignedRole: fd.get("assignedRole"), assignedName: fd.get("assignedName"), assignedTo: "", deadStartedAt: nowIso(), activeStartedAt: null };
    if (c.activeStartedAt) next.totalActiveMs = Number(c.totalActiveMs || 0) + durationSince(c.activeStartedAt);
    await persistCase(next, { type: "ASSIGNED", detail: `Asignado a ${roleTitle(fd.get("assignedRole"))} · ${fd.get("assignedName")}` });
    toast("Caso asignado");
    closeDrawer();
    renderCaseDetail(id);
  });
}

function openTransferModal(id) {
  const c = caseById(id); const def = processDefinitions[c.currentProcess];
  const options = def.next.length ? def.next : Object.keys(processDefinitions).filter(k => k !== c.currentProcess);
  drawer(modalShell("Relevar proceso", "El caso pasa al panel del proceso destino y queda pendiente por aceptar.", `
    <form id="transferForm" class="form-grid">
      <label class="field"><span>Proceso destino</span><select class="select" name="nextProcess">${options.map(k => `<option value="${k}">${processDefinitions[k].code} · ${processDefinitions[k].title}</option>`).join("")}</select></label>
      <label class="field"><span>Asignar a</span><input class="input" name="assignedName" placeholder="Responsable o área destino"></label>
      <label class="field"><span>Nota de relevo</span><textarea class="textarea" name="detail"></textarea></label>
      <button class="btn btn-primary" type="submit">Enviar relevo</button>
    </form>`));
  $("#transferForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    await transferCase(id, fd.get("nextProcess"), fd.get("assignedName"), fd.get("detail"));
    closeDrawer();
    renderCaseDetail(id);
  });
}

async function transferCase(id, nextProcess, assignedName = "", detail = "") {
  const c = caseById(id); if (!c) return;
  const now = nowIso(); const def = processDefinitions[nextProcess];
  const next = { ...c };
  if (next.activeStartedAt) next.totalActiveMs = Number(next.totalActiveMs || 0) + durationSince(next.activeStartedAt);
  next.activeStartedAt = null;
  next.currentProcess = nextProcess;
  next.procedureCode = def.code;
  next.status = "asignado";
  next.deadStartedAt = now;
  next.assignedTo = "";
  next.assignedRole = def.ownerRole;
  next.assignedName = assignedName || roleTitle(def.ownerRole);
  next.checklist = Object.fromEntries(def.checklist.map(i => [i, "pending"]));
  next.openRequirement = null;
  await persistCase(next, { type: "TRANSFER_SENT", detail: detail || `Relevo a ${def.title}` });
  toast("Relevo enviado");
}

function openInvoiceDecisionModal(id) {
  const c = caseById(id);
  drawer(modalShell("Definir facturación", "Crédito continúa desde facturación; contado se envía a caja.", `
    <form id="invoiceDecisionForm" class="form-grid">
      <label class="field"><span>Tipo de pedido</span><select class="select" name="kind"><option value="credito">Crédito</option><option value="contado">Contado</option></select></label>
      <label class="field"><span>Observación</span><textarea class="textarea" name="detail"></textarea></label>
      <button class="btn btn-primary" type="submit">Continuar</button>
    </form>`));
  $("#invoiceDecisionForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (fd.get("kind") === "contado") {
      await transferCase(id, "caja", "Caja", fd.get("detail") || "Pedido de contado enviado a caja");
    } else {
      await createEvent({ caseId: id, process: c.currentProcess, type: "CASH_DECISION", detail: fd.get("detail") || "Pedido a crédito continúa por facturación logística" });
      toast("Pedido marcado como crédito");
    }
    closeDrawer();
    renderCaseDetail(id);
  });
}

function openCableModal(id) {
  const c = caseById(id);
  drawer(modalShell("Validar cable", "Calcula remanente y controla la política mínima de 50 metros.", `
    <form id="cableForm" class="form-grid">
      <div class="grid grid-2"><label class="field"><span>Metraje total del carreto</span><input class="input" name="total" type="number" min="0" step="0.01" required></label><label class="field"><span>Metraje solicitado</span><input class="input" name="cut" type="number" min="0" step="0.01" required></label></div>
      <label class="field"><span>Observación</span><textarea class="textarea" name="detail"></textarea></label>
      <button class="btn btn-primary" type="submit">Validar remanente</button>
    </form>`));
  $("#cableForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const total = Number(fd.get("total")); const cut = Number(fd.get("cut")); const remaining = Math.round((total - cut) * 100) / 100;
    const compliant = remaining >= 50;
    const next = { ...c, cable: { totalMeters: total, cutMeters: cut, remainingMeters: remaining, compliant, detail: fd.get("detail") || "" } };
    await persistCase(next, { type: "CABLE_VALIDATED", detail: `Remanente: ${remaining} m · ${compliant ? "Cumple" : "Requiere autorización"}` });
    closeDrawer();
    if (!compliant) {
      const formData = new FormData();
      formData.append("targetRole", "jefe_logistico");
      formData.append("reason", "Requiere autorización por cable");
      formData.append("fields", "Remanente menor a 50 m");
      formData.append("detail", `El corte solicitado deja remanente de ${remaining} m. Se requiere autorización.`);
      await startRequirement(id, formData);
    }
    renderCaseDetail(id);
  });
}

function openEvidenceModal(id) {
  const c = caseById(id);
  drawer(modalShell("Agregar evidencia", "Anexa fotos cuando el proceso lo requiera, especialmente en salida o novedad.", `
    <form id="evidenceForm" class="form-grid">
      <label class="field"><span>Descripción</span><input class="input" name="label" value="${c.currentProcess === "despacho" ? "Fotografía de salida" : "Evidencia"}" required></label>
      <label class="field"><span>Foto</span><input class="input" name="photo" type="file" accept="image/*" capture="environment" required></label>
      <button class="btn btn-primary" type="submit">Guardar evidencia</button>
    </form>`));
  $("#evidenceForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const file = fd.get("photo");
    const evidence = await uploadPhoto(file, id, fd.get("label"));
    const next = { ...c, evidence: [...(c.evidence || []), evidence] };
    await persistCase(next, { type: "PHOTO_UPLOADED", detail: fd.get("label") });
    toast("Evidencia guardada");
    closeDrawer();
    renderCaseDetail(id);
  });
}

function openCloseCaseModal(id) {
  const c = caseById(id);
  drawer(modalShell("Cerrar caso", "Finaliza el flujo del proceso actual.", `
    <form id="closeCaseForm" class="form-grid">
      <label class="field"><span>Resultado</span><select class="select" name="result"><option value="cerrado_conforme">Cerrado conforme</option><option value="cerrado_con_novedad">Cerrado con novedad</option><option value="cancelado">Cancelado</option></select></label>
      <label class="field"><span>Observación</span><textarea class="textarea" name="detail"></textarea></label>
      <button class="btn btn-success" type="submit">Cerrar</button>
    </form>`));
  $("#closeCaseForm").addEventListener("submit", async e => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget); const next = { ...c };
    if (next.activeStartedAt) next.totalActiveMs = Number(next.totalActiveMs || 0) + durationSince(next.activeStartedAt);
    if (next.waitStartedAt) next.totalWaitMs = Number(next.totalWaitMs || 0) + durationSince(next.waitStartedAt);
    if (next.deadStartedAt) next.totalDeadMs = Number(next.totalDeadMs || 0) + durationSince(next.deadStartedAt);
    next.activeStartedAt = null; next.waitStartedAt = null; next.deadStartedAt = null;
    next.status = fd.get("result"); next.closedAt = nowIso(); next.closeDetail = fd.get("detail") || "";
    await persistCase(next, { type: "CASE_CLOSED", detail: fd.get("detail") || next.status });
    toast("Caso cerrado"); closeDrawer(); renderCaseDetail(id);
  });
}

async function uploadPhoto(file, caseId, label) {
  const compressed = await compressImage(file);
  if (appSettings.driveUploadUrl) {
    const payload = { fileName: `${caseId}_${Date.now()}_${file.name}`, mimeType: compressed.mimeType, base64: compressed.base64, caseId, label };
    const res = await fetch(appSettings.driveUploadUrl, { method: "POST", body: JSON.stringify(payload), headers: { "Content-Type": "text/plain;charset=utf-8" } });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "No fue posible cargar la foto");
    return { id: uid("evd"), label, url: data.url, createdAt: nowIso(), source: "drive" };
  }
  return { id: uid("evd"), label, url: URL.createObjectURL(file), createdAt: nowIso(), source: "local" };
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); const img = new Image();
    reader.onload = () => { img.onload = () => {
      const max = 1440; const ratio = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * ratio); canvas.height = Math.round(img.height * ratio);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const mimeType = "image/jpeg"; const dataUrl = canvas.toDataURL(mimeType, 0.78);
      resolve({ mimeType, base64: dataUrl.split(",")[1] });
    }; img.onerror = reject; img.src = reader.result; };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

function exportCsv() {
  const data = canSeeAll() ? state.cases : casesVisibleToUser();
  const headers = ["id","referencia","proceso","estado","cliente","responsable","creado","cerrado","total","proceso","espera","muerto","avance"];
  const rows = data.map(c => [c.id, c.reference || "", processTitle(c.currentProcess), c.status || "", c.client || "", c.assignedName || roleTitle(c.assignedRole), c.createdAt || "", c.closedAt || "", fmtTime(totalMs(c)), fmtTime(currentActiveMs(c)), fmtTime(currentWaitMs(c)), fmtTime(currentDeadMs(c)), `${progressPercent(c)}%`]);
  const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(",")).join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `trazabilidad_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
}

async function seedData() {
  const samples = [
    { process: "recepcion_pedidos", reference: "PVN-10582", client: "Industrias ABC", status: "en_requerimiento", req: { targetRole: "ventas", reason: "Pedido incompleto", fields: ["Tipo de entrega", "Condición de pago"], detail: "Faltan datos para continuar el flujo." } },
    { process: "alistamiento", reference: "PVN-10591", client: "Obras del Norte", status: "asignado" },
    { process: "facturacion", reference: "PVN-10599", client: "Comercial Delta", status: "asignado" },
    { process: "despacho", reference: "PVN-10602", client: "Servicios Andinos", status: "en_proceso" },
    { process: "recepcion_pedidos", reference: "PVN-PRIORIDAD", client: "Cliente Prioritario", status: "autorizacion_gerencia_pendiente", priorityApproval: true }
  ];
  for (const s of samples) {
    const def = processDefinitions[s.process]; const createdAt = new Date(Date.now() - Math.random()*3600000).toISOString();
    const c = { id: uid("PED"), type: def.type, procedureCode: def.code, currentProcess: s.process, status: s.status, priority: s.priorityApproval ? "Gerencia / Prioritario" : "Normal", reference: s.reference, client: s.client, description: "Caso de prueba", assignedRole: s.priorityApproval ? "gerencia" : (s.req ? s.req.targetRole : def.ownerRole), assignedName: s.priorityApproval ? "Gerencia" : (s.req ? roleTitle(s.req.targetRole) : roleTitle(def.ownerRole)), assignedTo: "", createdAt, createdBy: state.user.uid, createdByName: state.user.name, updatedAt: createdAt, activeStartedAt: s.status === "en_proceso" ? createdAt : null, waitStartedAt: (s.req || s.priorityApproval) ? createdAt : null, deadStartedAt: s.status === "asignado" ? createdAt : null, totalActiveMs: 0, totalWaitMs: 0, totalDeadMs: 0, checklist: Object.fromEntries(def.checklist.map(i => [i, "pending"])), openRequirement: s.req ? { id: uid("req"), ...s.req, sentAt: createdAt, sentBy: state.user.uid, sentByName: state.user.name, returnProcess: s.process } : null, priorityApproval: s.priorityApproval ? { requested: true, status: "pendiente", reason: "Salida prioritaria autorizable", requestedAt: createdAt, requestedBy: state.user.uid, requestedByName: state.user.name } : null, evidence: [] };
    await persistCase(c, { type: "CASE_CREATED", detail: "Caso de prueba" });
    if (s.req) await createEvent({ caseId: c.id, process: c.currentProcess, type: "REQUIREMENT_SENT", reason: s.req.reason, detail: s.req.detail });
  }
  toast("Casos de prueba cargados"); render();
}

function clearLocal() {
  if (state.mode === "firebase") return toast("Esta acción solo aplica en modo local.");
  localStorage.removeItem(storageKey); state.cases = []; state.events = []; toast("Datos locales limpiados"); render();
}

async function logout() {
  if (state.mode === "firebase" && fb?.auth) { try { await fb.authMod.signOut(fb.auth); } catch {} }
  state.user = null; localStorage.removeItem(`${storageKey}_user`); renderLogin();
}

function render() {
  if (!state.user) return renderLogin();
  const allowed = [...visibleRoutes().main, ...visibleRoutes().processes];
  if (!allowed.includes(state.route)) state.route = defaultRouteFor(state.user.role);
  if (state.selectedCaseId) return renderCaseDetail(state.selectedCaseId);
  if (state.route === "dashboard") renderDashboard();
  else if (state.route === "cases") renderCases();
  else if (state.route === "create") renderCreate();
  else if (state.route === "requirements") renderRequirements();
  else if (state.route === "indicators") renderIndicators();
  else if (state.route === "approvals") renderApprovals();
  else if (state.route === "users") renderUsers();
  else if (state.route === "admin") renderAdmin();
  else if (processDefinitions[state.route]) renderCases(state.route);
  else renderDashboard();
  startTimer();
}

function startTimer() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    $$('[data-timer]').forEach(el => { const c = caseById(el.dataset.timer); if (c) el.textContent = fmtTime(totalMs(c)); });
  }, 1000);
}

async function bootstrap() {
  app.innerHTML = `<div class="loading">Cargando aplicación</div>`;
  await initFirebase();
  const saved = localStorage.getItem(`${storageKey}_user`);
  if (saved && state.mode === "local") { state.user = JSON.parse(saved); state.route = defaultRouteFor(state.user.role); await dataLoad(); }
  render();
}

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./service-worker.js").catch(() => {}));
bootstrap();
