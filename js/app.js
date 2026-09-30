const API_URL = "https://script.google.com/macros/s/AKfycbyWUQawZZ5XkBCw_PDr0hZsuXBDVl5bm8YZRkRwv2qbDXxoiXuhBMuTI3_8XEJqIuBL/exec";
const HISTORY_DAYS = 251;
const POLICY_LIMIT_PCT = 1.2;

let latestData = null;
let historyData = [];
let snapshotA = null;
let snapshotB = null;
let chartVm = null;
let chartVar = null;
let chartHistoryVm = null;
let chartHistoryVar = null;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  bindNavigation();
  bindHistoryControls();
  loadLatest();
});

function bindNavigation() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view;
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");

      document.querySelectorAll(".view").forEach((section) => {
        section.hidden = section.id !== `view-${view}`;
      });

      const titles = {
        visor: "Visor",
        historico: "Histórico",
        portafolios: "Portafolios",
        riesgo: "Riesgo",
        mandatarios: "Mandatarios",
        administradores: "Administradores"
      };
      $("view-title").textContent = titles[view] || "RiskLab";

      if (view === "historico" && historyData.length === 0) {
        loadHistory();
      }
    });
  });
}

function bindHistoryControls() {
  $("history-load-a").addEventListener("click", () => loadSnapshot("A"));
  $("history-load-b").addEventListener("click", () => loadSnapshot("B"));
  $("history-compare").addEventListener("click", compareSelectedDates);

  document.querySelectorAll("[data-range]").forEach((button) => {
    button.addEventListener("click", () => applyHistoryRange(Number(button.dataset.range)));
  });

  $("history-date-a").addEventListener("change", updateDateLabels);
  $("history-date-b").addEventListener("change", updateDateLabels);
}

async function loadLatest() {
  setApiStatus("Conectando…");

  try {
    const payload = await apiGet("latest");
    if (!payload.ok) throw new Error(payload.error?.message || "La API devolvió un error.");

    latestData = payload.data || {};
    $("current-date").textContent = payload.metadata?.fecha || "—";
    setApiStatus("API conectada");
    renderLatest(latestData);
  } catch (error) {
    setApiStatus("Error API");
    showError(`No fue posible cargar latest: ${error.message}`);
  }
}

async function loadHistory() {
  try {
    $("history-query-status").textContent = "Cargando serie…";
    const payload = await apiGet("history", { dias: HISTORY_DAYS });
    if (!payload.ok) throw new Error(payload.error?.message || "No fue posible cargar history.");

    historyData = Array.isArray(payload.data) ? payload.data : [];
    $("history-query-status").textContent =
      `${historyData.length} registros · ${payload.metadata?.diasSolicitados ?? HISTORY_DAYS} días`;

    initializeHistoryDates();
    renderHistoryChartsFromSeries();
  } catch (error) {
    $("history-query-status").textContent = "Error";
    showError(`No fue posible cargar el histórico: ${error.message}`);
  }
}

async function loadSnapshot(slot) {
  const input = slot === "A" ? $("history-date-a") : $("history-date-b");
  const value = input.value;

  if (!value) {
    showError(`Selecciona la fecha ${slot} antes de consultar.`);
    return;
  }

  const fecha = isoInputToApiDate(value);

  try {
    setSnapshotStatus(slot, "Consultando…");
    const payload = await apiGet("date", { fecha });

    if (!payload.ok) {
      throw new Error(payload.error?.message || `No existe información para ${fecha}.`);
    }

    const snapshot = {
      fecha: payload.metadata?.fecha || fecha,
      fechaISO: payload.metadata?.fechaISO || `${value}T00:00:00`,
      data: payload.data || {}
    };

    if (slot === "A") snapshotA = snapshot;
    else snapshotB = snapshot;

    renderSnapshot(slot, snapshot);
    setSnapshotStatus(slot, "CARGADO");
    updateComparisonAvailability();
  } catch (error) {
    setSnapshotStatus(slot, "ERROR");
    showError(`No fue posible consultar ${fecha}: ${error.message}`);
  }
}

async function compareSelectedDates() {
  if (!$("history-date-a").value || !$("history-date-b").value) {
    showError("Selecciona Fecha A y Fecha B.");
    return;
  }

  $("comparison-status").textContent = "CONSULTANDO";
  $("comparison-status").className = "status-pill";

  try {
    if (!snapshotA || isoInputToApiDate($("history-date-a").value) !== snapshotA.fecha) {
      await loadSnapshot("A");
    }
    if (!snapshotB || isoInputToApiDate($("history-date-b").value) !== snapshotB.fecha) {
      await loadSnapshot("B");
    }

    if (!snapshotA || !snapshotB) {
      throw new Error("No se pudieron cargar ambas fechas.");
    }

    renderComparison();
    renderHistoryComparisonCharts();

    $("comparison-status").textContent = "COMPARADO";
    $("comparison-status").className = "status-pill ok";
  } catch (error) {
    $("comparison-status").textContent = "ERROR";
    $("comparison-status").className = "status-pill danger";
    showError(`No fue posible completar el comparativo: ${error.message}`);
  }
}

async function apiGet(action, params = {}) {
  if (!API_URL || API_URL.includes("PEGAR_AQUI")) {
    throw new Error("Falta configurar API_URL en js/app.js.");
  }

  const url = new URL(API_URL);
  url.searchParams.set("action", action);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function renderLatest(data) {
  const completo = data.portafolio?.completo || {};
  const varActual = numberOrNull(completo.monto?.porcentaje);

  $("kpi-vm").textContent = formatNumber(completo.valormercadomdp);
  $("kpi-inversion").textContent = formatNumber(
    completo.montoinvertido != null ? completo.montoinvertido / 1e6 : null
  );
  $("kpi-var").textContent = formatPct(varActual, 4);
  $("kpi-limite").textContent = `${POLICY_LIMIT_PCT.toFixed(2)}%`;

  renderRiskControl(varActual);
  renderPortfolioTable("complete-table", completo);

  const restringido =
    data.portafolio?.restringido ||
    data.portafolio?.incompleto ||
    data.portafolio?.modified ||
    {};

  renderPortfolioTable("restricted-table", restringido);

  renderMainCharts(data);
}

function renderPortfolioTable(targetId, p) {
  const rows = [
    ["Valor de mercado", `${formatNumber(p.valormercadomdp)} mdp`],
    ["Volatilidad", formatPct(p.volatilidad, 4)],
    ["Duración", formatNumber(p.duracion, 4)],
    ["Convexidad", formatNumber(p.convexidad, 4)],
    ["Plazo", formatNumber(p.plazo, 0)],
    ["Portafolio", `${formatNumber(p.monto?.millones)} mdp`],
    ["Portafolio %", formatPct(p.monto?.porcentaje, 4)],
    ["Individual", `${formatNumber(p.individual?.millones)} mdp`],
    ["Individual %", formatPct(p.individual?.porcentaje, 4)],
    ["Condicional", `${formatNumber(p.condicional?.millones)} mdp`],
    ["Condicional %", formatPct(p.condicional?.porcentaje, 4)],
    ["Límite de política", `${formatNumber(p.limitePolitica)} mdp`]
  ];

  $(targetId).innerHTML = rows.map(([label, value]) =>
    `<div class="metric-row"><span>${label}</span><strong>${value}</strong></div>`
  ).join("");
}

function renderRiskControl(varActual) {
  if (varActual == null) {
    $("risk-fill").style.width = "0%";
    $("risk-utilization").textContent = "—";
    $("var-status").textContent = "SIN DATO";
    $("var-status").className = "status-pill";
    return;
  }

  const utilization = (varActual * 100) / POLICY_LIMIT_PCT;
  $("risk-fill").style.width = `${Math.min(Math.max(utilization, 0), 100)}%`;
  $("risk-utilization").textContent = `${(varActual * 100).toFixed(3)}%`;

  if (varActual * 100 < POLICY_LIMIT_PCT) {
    $("var-status").textContent = "DENTRO DE LÍMITE";
    $("var-status").className = "status-pill ok";
  } else if (varActual * 100 === POLICY_LIMIT_PCT) {
    $("var-status").textContent = "EN LÍMITE";
    $("var-status").className = "status-pill warn";
  } else {
    $("var-status").textContent = "SOBRE LÍMITE";
    $("var-status").className = "status-pill danger";
  }
}

function renderMainCharts(data) {
  if (!window.Chart) return;

  const p = data.portafolio?.completo || {};
  const vm = numberOrNull(p.valormercadomdp);
  const inversion = p.montoinvertido != null ? p.montoinvertido / 1e6 : null;
  const varPct = p.monto?.porcentaje != null ? p.monto.porcentaje * 100 : null;

  chartVm?.destroy();
  chartVar?.destroy();

  chartVm = new Chart($("chart-vm"), {
    type: "bar",
    data: {
      labels: ["Actual"],
      datasets: [
        { label: "Valor de mercado", data: [vm], borderWidth: 0 },
        { label: "Monto invertido", data: [inversion], borderWidth: 0 }
      ]
    },
    options: chartOptions("mdp")
  });

  chartVar = new Chart($("chart-var"), {
    type: "bar",
    data: {
      labels: ["Actual"],
      datasets: [
        { label: "VaR", data: [varPct], borderWidth: 0 },
        { label: "Límite de política", data: [POLICY_LIMIT_PCT], borderWidth: 0 }
      ]
    },
    options: chartOptions("%")
  });
}

function initializeHistoryDates() {
  if (!historyData.length) return;

  const first = historyData[0];
  const last = historyData[historyData.length - 1];

  const currentA = $("history-date-a").value;
  const currentB = $("history-date-b").value;

  if (!currentA) $("history-date-a").value = isoToInputDate(first.fechaISO);
  if (!currentB) $("history-date-b").value = isoToInputDate(last.fechaISO);

  updateDateLabels();
}

function applyHistoryRange(days) {
  if (!historyData.length) {
    showError("El histórico todavía no está cargado.");
    return;
  }

  const last = historyData[historyData.length - 1];
  const lastDate = new Date(last.fechaISO);
  const start = new Date(lastDate);
  start.setDate(start.getDate() - days + 1);

  const candidates = historyData.filter((item) => new Date(item.fechaISO) >= start);
  const first = candidates[0] || historyData[0];

  $("history-date-a").value = isoToInputDate(first.fechaISO);
  $("history-date-b").value = isoToInputDate(last.fechaISO);

  updateDateLabels();
  loadSnapshot("A");
  loadSnapshot("B");
}

function updateDateLabels() {
  const a = $("history-date-a").value;
  const b = $("history-date-b").value;

  $("history-date-a-label").textContent = a ? formatDisplayDate(a) : "—";
  $("history-date-b-label").textContent = b ? formatDisplayDate(b) : "—";
}

function renderSnapshot(slot, snapshot) {
  const target = slot === "A" ? $("snapshot-a") : $("snapshot-b");
  const title = slot === "A" ? $("snapshot-a-title") : $("snapshot-b-title");
  const data = snapshot.data || {};
  const p = data.portafolio?.completo || {};

  title.textContent = snapshot.fecha;

  const metrics = [
    ["Valor de mercado", `${formatNumber(p.valormercadomdp)} mdp`],
    ["Monto invertido", `${formatNumber(p.montoinvertido != null ? p.montoinvertido / 1e6 : null)} mdp`],
    ["VaR", formatPct(p.monto?.porcentaje, 4)],
    ["Volatilidad", formatPct(p.volatilidad, 4)],
    ["Duración", formatNumber(p.duracion, 4)],
    ["Convexidad", formatNumber(p.convexidad, 4)],
    ["Plazo", formatNumber(p.plazo, 0)]
  ];

  target.className = "snapshot-metrics";
  target.innerHTML = metrics.map(([label, value]) =>
    `<div class="snapshot-row"><span>${label}</span><strong>${value}</strong></div>`
  ).join("");
}

function renderComparison() {
  const a = snapshotA.data?.portafolio?.completo || {};
  const b = snapshotB.data?.portafolio?.completo || {};

  $("comparison-title").textContent = `${snapshotA.fecha} → ${snapshotB.fecha}`;

  const metrics = [
    { label: "Valor de mercado", a: numberOrNull(a.valormercadomdp), b: numberOrNull(b.valormercadomdp), unit: "mdp", decimals: 2 },
    { label: "Monto invertido", a: toMdp(a.montoinvertido), b: toMdp(b.montoinvertido), unit: "mdp", decimals: 2 },
    { label: "VaR", a: toPct(a.monto?.porcentaje), b: toPct(b.monto?.porcentaje), unit: "%", decimals: 4 },
    { label: "Volatilidad", a: toPct(a.volatilidad), b: toPct(b.volatilidad), unit: "%", decimals: 4 },
    { label: "Duración", a: numberOrNull(a.duracion), b: numberOrNull(b.duracion), unit: "", decimals: 4 },
    { label: "Convexidad", a: numberOrNull(a.convexidad), b: numberOrNull(b.convexidad), unit: "", decimals: 4 },
    { label: "Plazo", a: numberOrNull(a.plazo), b: numberOrNull(b.plazo), unit: "", decimals: 0 }
  ];

  $("comparison-body").innerHTML = metrics.map((m) => {
    const delta = m.a != null && m.b != null ? m.b - m.a : null;
    const deltaPct = m.a != null && m.b != null && m.a !== 0 ? (delta / Math.abs(m.a)) * 100 : null;

    return `
      <tr>
        <td>${m.label}</td>
        <td>${formatMetric(m.a, m.unit, m.decimals)}</td>
        <td>${formatMetric(m.b, m.unit, m.decimals)}</td>
        <td class="${deltaClass(delta)}">${formatSignedMetric(delta, m.unit, m.decimals)}</td>
        <td class="${deltaClass(deltaPct)}">${formatSignedPct(deltaPct, 2)}</td>
      </tr>`;
  }).join("");
}

function renderHistoryChartsFromSeries() {
  if (!window.Chart || !historyData.length) return;

  const rows = historyData.map((item) => {
    const p = item.portafolio?.completo || {};
    return {
      label: formatChartDate(item.fechaISO),
      vm: numberOrNull(p.valormercadomdp),
      inversion: toMdp(p.montoinvertido),
      varPct: toPct(p.monto?.porcentaje)
    };
  });

  chartHistoryVm?.destroy();
  chartHistoryVar?.destroy();

  chartHistoryVm = new Chart($("chart-history-vm"), {
    type: "line",
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        { label: "Valor de mercado", data: rows.map((r) => r.vm), tension: .22, pointRadius: 0 },
        { label: "Monto invertido", data: rows.map((r) => r.inversion), tension: .22, pointRadius: 0 }
      ]
    },
    options: chartOptions("mdp", true)
  });

  chartHistoryVar = new Chart($("chart-history-var"), {
    type: "line",
    data: {
      labels: rows.map((r) => r.label),
      datasets: [
        { label: "VaR", data: rows.map((r) => r.varPct), tension: .22, pointRadius: 0 },
        { label: "Límite de política", data: rows.map(() => POLICY_LIMIT_PCT), borderDash: [5, 5], pointRadius: 0 }
      ]
    },
    options: chartOptions("%", true)
  });
}

function renderHistoryComparisonCharts() {
  if (!window.Chart || !snapshotA || !snapshotB) return;

  const a = snapshotA.data?.portafolio?.completo || {};
  const b = snapshotB.data?.portafolio?.completo || {};

  chartHistoryVm?.destroy();
  chartHistoryVar?.destroy();

  chartHistoryVm = new Chart($("chart-history-vm"), {
    type: "bar",
    data: {
      labels: [snapshotA.fecha, snapshotB.fecha],
      datasets: [
        { label: "Valor de mercado", data: [a.valormercadomdp ?? null, b.valormercadomdp ?? null], borderWidth: 0 },
        { label: "Monto invertido", data: [toMdp(a.montoinvertido), toMdp(b.montoinvertido)], borderWidth: 0 }
      ]
    },
    options: chartOptions("mdp")
  });

  chartHistoryVar = new Chart($("chart-history-var"), {
    type: "bar",
    data: {
      labels: [snapshotA.fecha, snapshotB.fecha],
      datasets: [
        { label: "VaR", data: [toPct(a.monto?.porcentaje), toPct(b.monto?.porcentaje)], borderWidth: 0 },
        { label: "Límite de política", data: [POLICY_LIMIT_PCT, POLICY_LIMIT_PCT], borderWidth: 0 }
      ]
    },
    options: chartOptions("%")
  });
}

function updateComparisonAvailability() {
  if (snapshotA && snapshotB) {
    $("comparison-status").textContent = "LISTO PARA COMPARAR";
    $("comparison-status").className = "status-pill ok";
  }
}

function setSnapshotStatus(slot, text) {
  const id = slot === "A" ? "snapshot-a-status" : "snapshot-b-status";
  $(id).textContent = text;
}

function setApiStatus(text) {
  $("api-status").textContent = text;
}

function showError(message) {
  const box = $("error-box");
  box.textContent = message;
  box.hidden = false;
  clearTimeout(showError.timer);
  showError.timer = setTimeout(() => box.hidden = true, 6000);
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toMdp(value) {
  const n = numberOrNull(value);
  return n == null ? null : n / 1e6;
}

function toPct(value) {
  const n = numberOrNull(value);
  return n == null ? null : n * 100;
}

function formatNumber(value, decimals = 2) {
  const n = numberOrNull(value);
  if (n == null) return "—";
  return n.toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatPct(value, decimals = 4) {
  const n = numberOrNull(value);
  if (n == null) return "—";
  return `${(n * 100).toLocaleString("es-MX", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}%`;
}

function formatMetric(value, unit, decimals) {
  if (value == null) return "—";
  return `${formatNumber(value, decimals)}${unit ? ` ${unit}` : ""}`;
}

function formatSignedMetric(value, unit, decimals) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, decimals)}${unit ? ` ${unit}` : ""}`;
}

function formatSignedPct(value, decimals = 2) {
  if (value == null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatNumber(value, decimals)}%`;
}

function deltaClass(value) {
  if (value == null || value === 0) return "delta-neutral";
  return value > 0 ? "delta-up" : "delta-down";
}

function isoInputToApiDate(value) {
  const [y, m, d] = value.split("-");
  return `${d}/${m}/${y}`;
}

function isoToInputDate(iso) {
  const date = new Date(iso);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDisplayDate(input) {
  const [y, m, d] = input.split("-");
  return `${d}/${m}/${y}`;
}

function formatChartDate(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "2-digit" });
}

function chartOptions(unit, dense = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#84909C", boxWidth: 9, font: { size: 10 } }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, unit === "%" ? 3 : 2)} ${unit}`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#697681", maxTicksLimit: dense ? 10 : 6, font: { size: 9 } },
        grid: { color: "rgba(32,42,51,.45)" }
      },
      y: {
        ticks: {
          color: "#697681",
          font: { size: 9 },
          callback: (value) => `${value}${unit === "%" ? "%" : ""}`
        },
        grid: { color: "rgba(32,42,51,.45)" }
      }
    }
  };
}
