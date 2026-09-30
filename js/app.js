const API_URL = "https://script.google.com/macros/s/AKfycbyWUQawZZ5XkBCw_PDr0hZsuXBDVl5bm8YZRkRwv2qbDXxoiXuhBMuTI3_8XEJqIuBL/exec";
const HISTORY_DAYS = 251;
const POLICY_LIMIT_PCT = 1.2;

let latestData = null;
let historyData = [];
let charts = { vm: null, var: null };

const $ = (id) => document.getElementById(id);

function fmtNumber(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function fmtPct(value, decimals = 4) {
  if (value === null || value === undefined || value === "") return "—";
  return `${fmtNumber(Number(value) * 100, decimals)}%`;
}

function fmtMdp(value, decimals = 2) {
  if (value === null || value === undefined || value === "") return "—";
  return fmtNumber(value / 1000000, decimals);
}

function fechaCorta(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("es-MX", {day:"2-digit", month:"short"}).replace(".", "");
}

function fechaLarga(value) {
  if (!value) return "—";
  const d = new Date(value);
  return d.toLocaleDateString("es-MX", {day:"2-digit", month:"short", year:"numeric"}).toUpperCase();
}

function pick(obj, paths) {
  for (const path of paths) {
    const parts = path.split(".");
    let value = obj;
    for (const p of parts) value = value?.[p];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

async function api(action, params = {}) {
  if (API_URL.includes("PEGAR_AQUI")) {
    throw new Error("Configura API_URL en js/app.js con el nuevo deployment de RiskLab.");
  }
  const url = new URL(API_URL);
  url.searchParams.set("action", action);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const response = await fetch(url.toString(), {cache:"no-store"});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const json = await response.json();
  if (!json.ok) throw new Error(json.error?.message || "La API devolvió un error.");
  return json;
}

async function loadLatest() {
  const response = await api("latest");
  latestData = response.data;
  $("api-status").textContent = "API ONLINE";
  $("api-status").classList.add("online");
  $("current-date").textContent = fechaLarga(response.metadata?.fechaISO || latestData?.fecha);
  renderLatest();
}

async function loadHistory() {
  /* Requiere el endpoint action=history del parche de Apps Script incluido
     con esta V2. El frontend no vuelve a usar historico.json. */
  const response = await api("history", {dias: HISTORY_DAYS});
  historyData = Array.isArray(response.data) ? response.data : [];
  renderCharts();
}

function renderLatest() {
  const d = latestData;
  const completo = d?.portafolio?.completo || {};
  const restringido = d?.portafolio?.restringido || d?.portafolio?.incompleto || d?.portafolio?.modificado || {};
  const varActual = pick(completo, ["monto.porcentaje", "var.porcentaje"]);
  const limite = POLICY_LIMIT_PCT / 100;

  $("kpi-vm").textContent = fmtNumber(completo.valormercadomdp);
  $("kpi-inversion").textContent = fmtMdp(completo.montoinvertido);
  $("kpi-var").textContent = fmtPct(varActual);
  $("kpi-limite").textContent = `${fmtNumber(POLICY_LIMIT_PCT, 2)}%`;

  const util = limite ? (Number(varActual) / Number(limite)) * 100 : null;
  $("risk-fill").style.width = `${Math.max(0, Math.min(util || 0, 100))}%`;
  $("risk-utilization").textContent = util == null ? "—" : `${fmtNumber(util,1)}% utilizado`;

  const status = $("var-status");
  status.textContent = util == null ? "SIN DATO" : (util < 100 ? "DENTRO DE LÍMITE" : "SOBRE LÍMITE");
  status.style.color = util == null ? "var(--muted)" : (util < 100 ? "var(--green)" : "var(--red)");

  renderPortfolioTable("complete-table", completo);
  renderPortfolioTable("restricted-table", restringido);
}

function renderPortfolioTable(id, p) {
  const rows = [
    ["Valor de mercado", p.valormercadomdp == null ? null : `${fmtNumber(p.valormercadomdp)} mdp`],
    ["Volatilidad", p.volatilidad == null ? null : fmtPct(p.volatilidad, 4)],
    ["Duración", p.duracion == null ? null : `${fmtNumber(p.duracion,4)} años`],
    ["Convexidad", p.convexidad == null ? null : fmtNumber(p.convexidad,4)],
    ["Plazo", p.plazo == null ? null : fmtNumber(p.plazo,0)],
    ["VaR", p.monto?.porcentaje == null ? null : fmtPct(p.monto.porcentaje)],
    ["VaR individual", p.individual?.porcentaje == null ? null : fmtPct(p.individual.porcentaje)],
    ["VaR condicional", p.condicional?.porcentaje == null ? null : fmtPct(p.condicional.porcentaje)],
    ["Límite de política", p.limitePolitica == null ? null : `${fmtNumber(p.limitePolitica)} mdp`]
  ];
  $(id).innerHTML = rows.map(([label,value]) =>
    `<div class="metric-row"><span class="metric-label">${label}</span><span class="metric-value">${value ?? "—"}</span></div>`
  ).join("");
}

function renderCharts() {
  if (!window.Chart || !historyData.length) return;
  const labels = historyData.map(x => fechaCorta(x.fechaISO || x.fecha));
  const vm = historyData.map(x => x.portafolio?.completo?.valormercadomdp ?? null);
  const inv = historyData.map(x => (x.portafolio?.completo?.montoinvertido ?? null) / 1000000);
  const varSeries = historyData.map(x => {
    const v = x.portafolio?.completo?.monto?.porcentaje;
    return v == null ? null : Number(v) * 100;
  });
  const limit = historyData.map(() => POLICY_LIMIT_PCT);

  const common = {
    responsive:true, maintainAspectRatio:false,
    interaction:{intersect:false,mode:"index"},
    plugins:{legend:{labels:{boxWidth:10,usePointStyle:true,color:"#84909c",font:{size:10}}},
      tooltip:{backgroundColor:"#0b0f14",borderColor:"#202a33",borderWidth:1,titleColor:"#e6edf3",bodyColor:"#e6edf3"}},
    scales:{x:{grid:{display:false},ticks:{color:"#65727f",maxTicksLimit:8}},
      y:{grid:{color:"#18212a"},ticks:{color:"#65727f"}}}
  };

  if (charts.vm) charts.vm.destroy();
  charts.vm = new Chart($("chart-vm"), {
    type:"line", data:{labels,datasets:[
      {label:"Valor de mercado",data:vm,borderColor:"#4da3ff",backgroundColor:"transparent",borderWidth:2,pointRadius:1,tension:.25},
      {label:"Monto invertido",data:inv,borderColor:"#4fd18b",backgroundColor:"transparent",borderWidth:2,pointRadius:1,tension:.25}
    ]},
    options:{...common,scales:{...common.scales,y:{...common.scales.y,ticks:{...common.scales.y.ticks,callback:v=>Number(v).toLocaleString("es-MX")}}}}
  });

  if (charts.var) charts.var.destroy();
  charts.var = new Chart($("chart-var"), {
    type:"line", data:{labels,datasets:[
      {label:"VaR portafolio",data:varSeries,borderColor:"#e8bd5c",backgroundColor:"transparent",borderWidth:2,pointRadius:1,tension:.25},
      {label:"Límite de política",data:limit,borderColor:"#ef6b73",backgroundColor:"transparent",borderWidth:1.5,borderDash:[6,5],pointRadius:0,tension:0}
    ]},
    options:{...common,scales:{...common.scales,y:{...common.scales.y,ticks:{...common.scales.y.ticks,callback:v=>`${Number(v).toFixed(2)}%`}}}}
  });
}

function initNavigation() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", () => {
      document.querySelectorAll(".nav-item").forEach(x => x.classList.remove("active"));
      item.classList.add("active");
      document.querySelectorAll(".view").forEach(v => v.hidden = true);
      const view = $("view-" + item.dataset.view);
      if (view) view.hidden = false;
      $("view-title").textContent = item.textContent.trim().replace(/^\d+\s*/, "");
    });
  });
}

async function init() {
  initNavigation();
  try {
    await loadLatest();
    await loadHistory();
  } catch (error) {
    console.error(error);
    $("api-status").textContent = "API OFFLINE";
    $("error-box").hidden = false;
    $("error-box").textContent = `RiskLab: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
