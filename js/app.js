const API_URL = "https://script.google.com/macros/s/AKfycbyWUQawZZ5XkBCw_PDr0hZsuXBDVl5bm8YZRkRwv2qbDXxoiXuhBMuTI3_8XEJqIuBL/exec";
const HISTORY_DAYS = 251;
const POLICY_LIMIT_PCT = 1.2;

let latestData = null;
let historyData = [];
let charts = { vm: null, var: null };
let portfolioCharts = { var: null };
// ============================================================
// GRÁFICOS DEL MÓDULO HISTÓRICO
// Independientes de los gráficos del VISOR
// ============================================================

let historyCharts = {
  vm: null,
  var: null
};

let historicalSnapshotA = null;
let historicalSnapshotB = null;


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
  renderPortfolios();
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

/* =========================================================
   PORTAFOLIOS — ADMINISTRACIÓN
   ========================================================= */

const PORTFOLIO_NAMES = [
  "alfa",
  "calce",
  "liquidez",
  "operativo"
];


/*
 * Busca una propiedad utilizando varias rutas posibles.
 * No altera la información recibida desde la API.
 */
function pickPortfolio(obj, paths) {

  for (const path of paths) {

    const parts = path.split(".");

    let value = obj;

    for (const part of parts) {
      value = value?.[part];
    }

    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
}


/*
 * Obtiene la estructura administrativa
 * de los cuatro portafolios.
 *
 * Se contemplan las variantes que puede producir
 * el contrato actual sin modificar el backend.
 */
function getAdministrativePortfolios() {

  const d = latestData || {};

  const root =
    d.administrador ||
    d.administradores ||
    d.portafolios ||
    {};

  const result = {};

  PORTFOLIO_NAMES.forEach(nombre => {

    const direct =
      root[nombre] ||
      d[nombre] ||
      {};

    result[nombre] = {

      valorMercado:
        pickPortfolio(direct, [
          "valorMercado",
          "valormercado",
          "valorMercadoMdp",
          "valormercadomdp"
        ]),

      var:
        pickPortfolio(direct, [
          "valorenriesgo",
          "valorEnRiesgo",
          "var",
          "var.porcentaje",
          "valorEnRiesgo.porcentaje"
        ]),

      volatilidad:
        pickPortfolio(direct, [
          "volatilidad"
        ])

    };

  });

  return result;
}


/*
 * Renderiza las cuatro tarjetas.
 */
function renderPortfolioCards(portfolios) {

  PORTFOLIO_NAMES.forEach(nombre => {

    const p = portfolios[nombre];

    const vm =
      $(`portfolio-${nombre}-vm`);

    const varEl =
      $(`portfolio-${nombre}-var`);

    const vol =
      $(`portfolio-${nombre}-vol`);


    if (vm) {

      vm.textContent =
        p.valorMercado == null
          ? "—"
          : fmtNumber(p.valorMercado, 2);

    }


    if (varEl) {

      varEl.textContent =
        p.var == null
          ? "—"
          : fmtPct(p.var, 4);

    }


    if (vol) {

      vol.textContent =
        p.volatilidad == null
          ? "—"
          : fmtPct(p.volatilidad, 2);

    }

  });
}


/*
 * Tabla operativa.
 */
function renderPortfolioAdministrationTable(
  portfolios
) {

  const table =
    $("portfolio-table");

  if (!table) return;


  const fecha =
    latestData?.fecha ||
    $("current-date")?.textContent ||
    "—";


  $("portfolio-date").textContent =
    fecha;


  table.innerHTML = `

    <div class="portfolio-table-header">

      <span>Portafolio</span>
      <span>Valor de mercado</span>
      <span>Valor en riesgo</span>
      <span>Volatilidad</span>

    </div>

    ${
      PORTFOLIO_NAMES.map(nombre => {

        const p =
          portfolios[nombre];

        const label =
          nombre.toUpperCase();

        return `

          <div class="portfolio-table-row">

            <span class="portfolio-table-name">
              ${label}
            </span>

            <span>
              ${
                p.valorMercado == null
                  ? "—"
                  : `${fmtNumber(
                      p.valorMercado,
                      2
                    )} mdp`
              }
            </span>

            <span>
              ${
                p.var == null
                  ? "—"
                  : fmtPct(
                      p.var,
                      4
                    )
              }
            </span>

            <span>
              ${
                p.volatilidad == null
                  ? "—"
                  : fmtPct(
                      p.volatilidad,
                      2
                    )
              }
            </span>

          </div>

        `;

      }).join("")
    }

  `;
}


/*
 * Gráfico comparativo de los cuatro portafolios.
 *
 * Importante:
 * NO utiliza POLICY_LIMIT_PCT.
 * El objetivo es comparar los portafolios entre sí.
 */
function renderPortfolioVarChart(
  portfolios
) {

  const canvas =
    $("portfolio-var-chart");

  if (
    !canvas ||
    !window.Chart
  ) {
    return;
  }


  const values =
    PORTFOLIO_NAMES.map(nombre => {

      const value =
        portfolios[nombre].var;

      return value == null
        ? null
        : Number(value) * 100;

    });


  if (portfolioCharts.var) {
    portfolioCharts.var.destroy();
  }


  portfolioCharts.var =
    new Chart(canvas, {

      type: "bar",

      data: {

        labels: [
          "ALFA",
          "CALCE",
          "LIQUIDEZ",
          "OPERATIVO"
        ],

        datasets: [

          {
            label: "VaR",
            data: values,

            backgroundColor: [
              "#4da3ff",
              "#4fd18b",
              "#e8bd5c",
              "#ef6b73"
            ],

            borderWidth: 0,

            borderRadius: 3,

            maxBarThickness: 46
          }

        ]

      },


      options: {

        responsive: true,

        maintainAspectRatio: false,

        plugins: {

          legend: {
            display: false
          },

          tooltip: {

            backgroundColor: "#0b0f14",

            borderColor: "#202a33",

            borderWidth: 1,

            titleColor: "#e6edf3",

            bodyColor: "#e6edf3",

            callbacks: {

              label: context => {

                const value =
                  context.raw;

                return value == null
                  ? "VaR: —"
                  : `VaR: ${Number(value).toFixed(4)}%`;

              }

            }

          }

        },


        scales: {

          x: {

            grid: {
              display: false
            },

            ticks: {
              color: "#84909c",

              font: {
                family: "IBM Plex Mono",
                size: 10
              }
            }

          },

          y: {

            beginAtZero: true,

            grid: {
              color: "#18212a"
            },

            ticks: {

              color: "#65727f",

              callback: value =>
                `${Number(value).toFixed(2)}%`

            }

          }

        }

      }

    });

}


/*
 * Render principal del módulo.
 */
function renderPortfolios() {

  const portfolios =
    getAdministrativePortfolios();


  renderPortfolioCards(
    portfolios
  );


  renderPortfolioAdministrationTable(
    portfolios
  );


  renderPortfolioVarChart(
    portfolios
  );

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

// ============================================================
// HISTÓRICO — CONSULTA DE FECHAS
// ============================================================

async function loadHistoricalDate(fecha) {

  if (!fecha) {
    throw new Error("No se seleccionó una fecha.");
  }

  // El input date entrega YYYY-MM-DD.
  // La API de RiskLab recibe DD/MM/YYYY.

  const partes = fecha.split("-");

  if (partes.length !== 3) {
    throw new Error("Formato de fecha inválido.");
  }

  const fechaApi = `${partes[2]}/${partes[1]}/${partes[0]}`;

  const response = await api("date", {
    fecha: fechaApi
  });

  return response;
}


// ============================================================
// CONVERSIÓN DE FECHA DEL INPUT
// ============================================================

function fechaInputDesdeISO(value) {

  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return "";
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}


// ============================================================
// COMPARATIVO DE DOS FECHAS
// ============================================================

async function compareHistoricalDates() {

  const inputA = $("history-date-a");
  const inputB = $("history-date-b");
  const status = $("history-status");
  const button = $("history-compare-btn");

  if (!inputA || !inputB) return;

  const fechaA = inputA.value;
  const fechaB = inputB.value;

  if (!fechaA || !fechaB) {

    status.textContent =
      "Selecciona las dos fechas antes de comparar.";

    return;
  }

  button.disabled = true;

  status.textContent = "Obteniendo información histórica…";

  try {

    const [responseA, responseB] = await Promise.all([
      loadHistoricalDate(fechaA),
      loadHistoricalDate(fechaB)
    ]);

    historicalSnapshotA = responseA;
    historicalSnapshotB = responseB;

    renderHistoricalComparison(
      responseA,
      responseB
    );

    renderHistoricalCharts(
      responseA,
      responseB
    );

    status.textContent = "Comparativo actualizado.";

  } catch (error) {

    console.error(error);

    status.textContent =
      `Error: ${error.message}`;

  } finally {

    button.disabled = false;
  }
}


// ============================================================
// EXTRACCIÓN DE DATOS
// ============================================================

function getHistoricalPortfolio(response) {

  return response?.data?.portafolio?.completo || {};
}


// ============================================================
// TABLA COMPARATIVA
// ============================================================

function renderHistoricalComparison(
  responseA,
  responseB
) {

  const table = $("history-comparison-table");

  if (!table) return;

  const a = getHistoricalPortfolio(responseA);
  const b = getHistoricalPortfolio(responseB);

  const fechaA =
    responseA?.metadata?.fecha ||
    responseA?.data?.fecha ||
    "Fecha A";

  const fechaB =
    responseB?.metadata?.fecha ||
    responseB?.data?.fecha ||
    "Fecha B";

  $("history-comparison-date").textContent =
    `${fechaA} ↔ ${fechaB}`;

  const rows = [

    [
      "Valor de mercado",
      a.valormercadomdp,
      b.valormercadomdp,
      value => `${fmtNumber(value)} mdp`
    ],

    [
      "Volatilidad",
      a.volatilidad,
      b.volatilidad,
      value => fmtPct(value, 4)
    ],

    [
      "Duración",
      a.duracion,
      b.duracion,
      value => `${fmtNumber(value, 4)} años`
    ],

    [
      "Convexidad",
      a.convexidad,
      b.convexidad,
      value => fmtNumber(value, 4)
    ],

    [
      "Plazo",
      a.plazo,
      b.plazo,
      value => fmtNumber(value, 0)
    ],

    [
      "VaR",
      a.monto?.porcentaje,
      b.monto?.porcentaje,
      value => fmtPct(value)
    ],

    [
      "VaR individual",
      a.individual?.porcentaje,
      b.individual?.porcentaje,
      value => fmtPct(value)
    ],

    [
      "VaR condicional",
      a.condicional?.porcentaje,
      b.condicional?.porcentaje,
      value => fmtPct(value)
    ],

    [
      "Límite de política",
      a.limitePolitica,
      b.limitePolitica,
      value => `${fmtNumber(value)} mdp`
    ]

  ];

  table.innerHTML = `

    <div class="history-table-header">
      <span>Indicador</span>
      <span>${fechaA}</span>
      <span>${fechaB}</span>
      <span>Variación</span>
    </div>

    ${rows.map(row => {

      const [
        label,
        valueA,
        valueB,
        formatter
      ] = row;

      let variation = null;

      if (
        valueA !== null &&
        valueA !== undefined &&
        valueB !== null &&
        valueB !== undefined &&
        Number(valueA) !== 0
      ) {

        variation =
          ((Number(valueB) - Number(valueA)) /
            Math.abs(Number(valueA))) * 100;
      }

      return `

        <div class="history-table-row">

          <span class="metric-label">
            ${label}
          </span>

          <span class="metric-value">
            ${
              valueA == null
                ? "—"
                : formatter(valueA)
            }
          </span>

          <span class="metric-value">
            ${
              valueB == null
                ? "—"
                : formatter(valueB)
            }
          </span>

          <span
  class="metric-value history-variation ${
    variation == null
      ? ""
      : variation > 0
        ? "positive"
        : variation < 0
          ? "negative"
          : "neutral"
  }"
>
  ${
    variation == null
      ? "—"
      : `${variation > 0 ? "+" : ""}${fmtNumber(variation, 2)}%`
  }
</span>

        </div>

      `;

    }).join("")}

  `;
}


// ============================================================
// GRÁFICOS DEL HISTÓRICO
// ============================================================

function renderHistoricalCharts(
  responseA,
  responseB
) {

  if (!window.Chart) return;

  const a = getHistoricalPortfolio(responseA);
  const b = getHistoricalPortfolio(responseB);

  const fechaA =
    responseA?.metadata?.fecha || "Fecha A";

  const fechaB =
    responseB?.metadata?.fecha || "Fecha B";


  // ==========================================================
  // DATOS
  // ==========================================================

  const vmA = Number(a.valormercadomdp);
  const vmB = Number(b.valormercadomdp);

  const invA =
    a.montoinvertido != null
      ? Number(a.montoinvertido) / 1000000
      : null;

  const invB =
    b.montoinvertido != null
      ? Number(b.montoinvertido) / 1000000
      : null;

  const varA =
    a.monto?.porcentaje != null
      ? Number(a.monto.porcentaje) * 100
      : null;

  const varB =
    b.monto?.porcentaje != null
      ? Number(b.monto.porcentaje) * 100
      : null;


  // ==========================================================
  // VARIACIONES
  // ==========================================================

  const variacionVM =
    vmA !== 0
      ? ((vmB - vmA) / Math.abs(vmA)) * 100
      : null;

  const variacionInv =
    invA !== null && invA !== 0 && invB !== null
      ? ((invB - invA) / Math.abs(invA)) * 100
      : null;

  const variacionVar =
    varA !== null && varB !== null
      ? varB - varA
      : null;


  // ==========================================================
  // COLORES SEGÚN VARIACIÓN
  // ==========================================================

  const COLOR_POSITIVO = "#4da3ff";
  const COLOR_NEGATIVO = "#ef6b73";
  const COLOR_NEUTRO = "#84909c";

  const colorVariacion = value => {

    if (value == null || value === 0) {
      return COLOR_NEUTRO;
    }

    return value > 0
      ? COLOR_POSITIVO
      : COLOR_NEGATIVO;
  };


  // ==========================================================
  // 1. VALOR DE MERCADO + MONTO INVERTIDO
  // ==========================================================

  if (historyCharts.vm) {
    historyCharts.vm.destroy();
  }

  const canvasVM = $("history-chart-vm");

  if (canvasVM) {

    historyCharts.vm = new Chart(
      canvasVM,
      {
        type: "bar",

        data: {

          labels: [
            fechaA,
            fechaB
          ],

          datasets: [

            {
              label: "Valor de mercado",

              data: [
                vmA,
                vmB
              ],

              borderWidth: 1
            },

            {
              label: "Monto invertido",

              data: [
                invA,
                invB
              ],

              borderWidth: 1
            }

          ]

        },

        options: {

          responsive: true,
          maintainAspectRatio: false,

          interaction: {
            intersect: false,
            mode: "index"
          },

          plugins: {

            legend: {
              labels: {
                boxWidth: 10,
                usePointStyle: true,
                color: "#84909c",
                font: {
                  size: 10
                }
              }
            },

            tooltip: {

              backgroundColor: "#0b0f14",
              borderColor: "#202a33",
              borderWidth: 1,

              titleColor: "#e6edf3",
              bodyColor: "#e6edf3",

              callbacks: {

                label: function(context) {

                  const value =
                    Number(context.raw);

                  return context.datasetIndex === 1
                    ? `${context.dataset.label}: ${fmtNumber(value, 2)} mdp`
                    : `${context.dataset.label}: ${fmtNumber(value, 2)} mdp`;

                }

              }

            }

          },

          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {
                color: "#65727f"
              }

            },

            y: {

              grid: {
                color: "#18212a"
              },

              ticks: {

                color: "#65727f",

                callback: value =>
                  Number(value).toLocaleString("es-MX")

              }

            }

          }

        }

      }
    );

  }


  // ==========================================================
  // 2. VAR — BARRA DE UTILIZACIÓN DEL LÍMITE
  // ==========================================================

  if (historyCharts.var) {
    historyCharts.var.destroy();
  }

  const canvasVAR = $("history-chart-var");

  if (canvasVAR) {

    historyCharts.var = new Chart(
      canvasVAR,
      {
        type: "bar",

        data: {

          labels: [
            fechaA,
            fechaB
          ],

          datasets: [

            {
              label: "Utilización del límite",

              data: [
                varA !== null
                  ? (varA / POLICY_LIMIT_PCT) * 100
                  : null,

                varB !== null
                  ? (varB / POLICY_LIMIT_PCT) * 100
                  : null
              ],

              backgroundColor: [
                varA !== null
                  ? colorVariacion(variacionVar)
                  : COLOR_NEUTRO,

                varB !== null
                  ? colorVariacion(variacionVar)
                  : COLOR_NEUTRO
              ],

              borderWidth: 0,

              borderRadius: 5,

              barPercentage: 0.55,

              categoryPercentage: 0.65
            }

          ]

        },

        options: {

          responsive: true,
          maintainAspectRatio: false,

          plugins: {

            legend: {
              display: false
            },

            tooltip: {

              backgroundColor: "#0b0f14",
              borderColor: "#202a33",
              borderWidth: 1,

              titleColor: "#e6edf3",
              bodyColor: "#e6edf3",

              callbacks: {

                label: function(context) {

                  const porcentaje =
                    Number(context.raw);

                  const varReal =
                    (porcentaje / 100) *
                    POLICY_LIMIT_PCT;

                  return [
                    `VaR: ${fmtNumber(varReal, 4)}%`,
                    `Uso del límite: ${fmtNumber(porcentaje, 1)}%`
                  ];

                }

              }

            }

          },

          scales: {

            x: {

              grid: {
                display: false
              },

              ticks: {
                color: "#65727f"
              }

            },

            y: {

              min: 0,
              max: 100,

              grid: {
                color: "#18212a"
              },

              ticks: {

                color: "#65727f",

                callback: value =>
                  `${Number(value).toFixed(0)}%`

              }

            }

          }

        },

        plugins: [

          {

            id: "historyVarLabels",

            afterDatasetsDraw(chart) {

              const {
                ctx
              } = chart;

              const meta =
                chart.getDatasetMeta(0);

              ctx.save();

              meta.data.forEach(
                (bar, index) => {

                  const value =
                    chart.data.datasets[0]
                      .data[index];

                  if (value == null) return;

                  const varReal =
                    (Number(value) / 100) *
                    POLICY_LIMIT_PCT;

                  let texto =
                    `VaR ${fmtNumber(varReal, 4)}%`;

                  if (variacionVar !== null) {

                    const signo =
                      variacionVar > 0
                        ? "+"
                        : "";

                    texto +=
                      ` (${signo}${fmtNumber(
                        variacionVar,
                        4
                      )} pp)`;
                  }

                  ctx.font =
                    '500 10px "IBM Plex Mono", monospace';

                  ctx.textAlign = "center";
                  ctx.textBaseline = "bottom";

                  ctx.fillStyle =
                    colorVariacion(
                      variacionVar
                    );

                  ctx.fillText(
                    texto,
                    bar.x,
                    bar.y - 8
                  );

                }
              );

              ctx.restore();

            }

          }

        ]

      }
    );

  }

}


// ============================================================
// INICIALIZACIÓN DEL MÓDULO HISTÓRICO
// ============================================================

function initHistoricalModule() {

  const button = $("history-compare-btn");

  if (!button) return;

  button.addEventListener(
    "click",
    compareHistoricalDates
  );

}



// ============================================================
// FECHAS POR DEFECTO DEL HISTÓRICO
// ============================================================

function initHistoricalDates() {

  const inputA = $("history-date-a");
  const inputB = $("history-date-b");

  if (!inputA || !inputB) return;

  // Si ya fueron seleccionadas, no las modificamos.
  if (inputA.value && inputB.value) return;

  if (!historyData.length) return;

  const first = historyData[0];
  const last = historyData[historyData.length - 1];

  const fechaFirst =
    fechaInputDesdeISO(first.fechaISO);

  const fechaLast =
    fechaInputDesdeISO(last.fechaISO);

  if (!inputA.value) {
    inputA.value = fechaFirst;
  }

  if (!inputB.value) {
    inputB.value = fechaLast;
  }

}

function renderPortfolios() {

  const d = latestData;

  const administradores =
    d?.administradores ||
    d?.administrador ||
    {};

  const portfolios = {
    alfa: administradores.alfa || {},
    calce: administradores.calce || {},
    liquidez: administradores.liquidez || {},
    operativo: administradores.operativo || {}
  };

  const nombres = [
    "alfa",
    "calce",
    "liquidez",
    "operativo"
  ];

  nombres.forEach(nombre => {

    const p = portfolios[nombre];

    const vm =
      p.valorMercado ??
      p.valormercado ??
      p.valorMercadoMdp;

    const varValue =
      p.var ??
      p.valorEnRiesgo ??
      p.valorenriesgo;

    const vol =
      p.volatilidad;

    const vmEl = $(`portfolio-${nombre}-vm`);
    const varEl = $(`portfolio-${nombre}-var`);
    const volEl = $(`portfolio-${nombre}-vol`);

    if (vmEl) {
      vmEl.textContent =
        vm == null ? "—" : fmtNumber(vm, 2);
    }

    if (varEl) {
      varEl.textContent =
        varValue == null ? "—" : fmtPct(varValue, 4);
    }

    if (volEl) {
      volEl.textContent =
        vol == null ? "—" : fmtPct(vol, 2);
    }
  });

  renderPortfolioAdministrationTable(portfolios);
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
      if (item.dataset.view === "historico") {initHistoricalDates();}
    });
  });
}

async function init() {
  initNavigation();
  initHistoricalModule();
  try {
    await loadLatest();
    await loadHistory();
    // Preparar fechas del módulo Histórico
    initHistoricalDates();
  } catch (error) {
    console.error(error);
    $("api-status").textContent =
      "API OFFLINE";
    $("error-box").hidden = false;
    $("error-box").textContent =
      `RiskLab: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);


async function loadLatest() {
  const response = await api("latest");

  console.log("RISKLAB latest completo:", response);
  console.log("RISKLAB latest.data:", response.data);
  console.log(
    "RISKLAB claves raíz:",
    Object.keys(response.data || {})
  );

  latestData = response.data;

  $("api-status").textContent = "API ONLINE";
  $("api-status").classList.add("online");

  $("current-date").textContent =
    fechaLarga(
      response.metadata?.fechaISO ||
      latestData?.fecha
    );

  renderLatest();
}

