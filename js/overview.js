const HISTORICO_URL = "./data/historico.json?v=3";


function formatoNumero(valor, decimales = 2) {
    return Number(valor).toLocaleString("es-MX", {
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales
    });
}


function formatoPorcentaje(valor, decimales = 4) {
    return `${formatoNumero(valor, decimales)}%`;
}


function calcularUtilizacion(varActual, limite) {
    return (varActual / limite) * 100;
}


function calcularCambio(actual, anterior) {

    if (
        anterior === null ||
        anterior === undefined ||
        anterior === 0
    ) {
        return null;
    }

    return ((actual - anterior) / anterior) * 100;
}


/* =========================================================
   CARGA DE DATOS HISTÓRICOS
   ========================================================= */

async function cargarHistorico() {

    try {

        const response = await fetch(HISTORICO_URL, {
    cache: "no-store"
});

        if (!response.ok) {
            throw new Error(
                `Error HTTP histórico: ${response.status}`
            );
        }

        const data = await response.json();

        console.log(
            "RISK LAB: histórico recibido",
            data
        );

        return data;

    } catch (error) {

        console.error(
            "RISK LAB: no fue posible cargar el histórico",
            error
        );

        throw error;
    }
}


/* =========================================================
   RENDER PRINCIPAL
   ========================================================= */

function renderOverview(data) {

    const fecha =
        new Date(data.fecha + "T00:00:00");


    /* -----------------------------------------
       FECHA
       ----------------------------------------- */

    document.getElementById(
        "overview-date"
    ).textContent =
        fecha.toLocaleDateString("es-MX", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        }).toUpperCase();


    /* -----------------------------------------
       MÉTRICAS PRINCIPALES
       ----------------------------------------- */

    document.getElementById(
        "valor-mercado"
    ).textContent =
        formatoNumero(
            data.cartera.valorMercado
        );


    document.getElementById(
        "valor-mercado-secondary"
    ).textContent =
        "Cierre " + data.periodo;


    document.getElementById(
        "var"
    ).textContent =
        formatoNumero(
            data.riesgo.var
        );


    document.getElementById(
        "var-mdp"
    ).textContent =
        `$${formatoNumero(
            data.riesgo.varMdp
        )} MDP`;


    document.getElementById(
        "volatilidad"
    ).textContent =
        formatoNumero(
            data.cartera.volatilidad
        );


    document.getElementById(
        "cvar"
    ).textContent =
        formatoNumero(
            data.riesgo.cvar
        );


    document.getElementById(
        "cvar-mdp"
    ).textContent =
        `$${formatoNumero(
            data.riesgo.cvarMdp
        )} MDP`;


    /* -----------------------------------------
       MÉTRICAS SECUNDARIAS
       ----------------------------------------- */

    document.getElementById(
        "monto-inversion"
    ).textContent =
        formatoNumero(
            data.cartera.montoInversion
        );


    document.getElementById(
        "duracion"
    ).textContent =
        formatoNumero(
            data.cartera.duracion,
            4
        );


    document.getElementById(
        "convexidad"
    ).textContent =
        formatoNumero(
            data.cartera.convexidad,
            4
        );


    /* -----------------------------------------
       UTILIZACIÓN DE VaR
       ----------------------------------------- */

    const utilizacion =
        calcularUtilizacion(
            data.riesgo.var,
            data.riesgo.limiteVar
        );


    document.getElementById(
        "risk-current"
    ).textContent =
        formatoPorcentaje(
            data.riesgo.var
        );


    document.getElementById(
        "risk-limit"
    ).textContent =
        formatoPorcentaje(
            data.riesgo.limiteVar
        );


    document.getElementById(
        "risk-utilization"
    ).textContent =
        `UTILIZACIÓN ${formatoNumero(
            utilizacion,
            2
        )}%`;


    document.getElementById(
        "risk-limit-footer"
    ).textContent =
        `${formatoNumero(
            data.riesgo.limiteVar,
            2
        )}%`;


    document.getElementById(
        "risk-progress"
    ).style.width =
        `${Math.min(
            utilizacion,
            100
        )}%`;


    /* -----------------------------------------
       CAMBIOS VS. CIERRE ANTERIOR
       ----------------------------------------- */

    const cambioVM =
        calcularCambio(
            data.cartera.valorMercado,
            data.anterior.valorMercado
        );


    const cambioVol =
        calcularCambio(
            data.cartera.volatilidad,
            data.anterior.volatilidad
        );


    const cambioDuracion =
        calcularCambio(
            data.cartera.duracion,
            data.anterior.duracion
        );


    const cambioConvexidad =
        calcularCambio(
            data.cartera.convexidad,
            data.anterior.convexidad
        );


    /* -----------------------------------------
       MARKET PULSE
       ----------------------------------------- */

    document.getElementById(
        "pulse-vm"
    ).textContent =
        `${formatoNumero(
            data.cartera.valorMercado
        )} MDP`;


    document.getElementById(
        "pulse-vol"
    ).textContent =
        formatoPorcentaje(
            data.cartera.volatilidad
        );


    document.getElementById(
        "pulse-duration"
    ).textContent =
        formatoNumero(
            data.cartera.duracion,
            4
        );


    document.getElementById(
        "pulse-convexity"
    ).textContent =
        formatoNumero(
            data.cartera.convexidad,
            4
        );


    actualizarCambio(
        "pulse-vm-change",
        cambioVM
    );


    actualizarCambio(
        "pulse-vol-change",
        cambioVol
    );


    actualizarCambio(
        "pulse-duration-change",
        cambioDuracion
    );


    actualizarCambio(
        "pulse-convexity-change",
        cambioConvexidad
    );


    console.log(
        "Utilización VaR:",
        formatoNumero(
            utilizacion,
            2
        ) + "%"
    );

    console.log(
    "RISK LAB: datos para pulso",
    {
        valorMercado: data.cartera.valorMercado,
        volatilidad: data.cartera.volatilidad,
        duracion: data.cartera.duracion,
        convexidad: data.cartera.convexidad,
        anterior: data.anterior
    }
);
// ==========================================
// PULSO DE MERCADO
// ==========================================

const pulseVM =
    document.getElementById("pulse-vm");

const pulseVol =
    document.getElementById("pulse-vol");

const pulseDuration =
    document.getElementById("pulse-duration");

const pulseConvexity =
    document.getElementById("pulse-convexity");


if (pulseVM) {
    pulseVM.textContent =
        formatoNumero(
            data.cartera.valorMercado,
            0
        );
}

if (pulseVol) {
    pulseVol.textContent =
        formatoPorcentaje(
            data.cartera.volatilidad
        );
}

if (pulseDuration) {
    pulseDuration.textContent =
        formatoNumero(
            data.cartera.duracion
        );
}

if (pulseConvexity) {
    pulseConvexity.textContent =
        formatoNumero(
            data.cartera.convexidad
        );
}

// ==========================================
// CAMBIOS MENSUALES
// ==========================================

actualizarCambio(
    "pulse-vm-change",
    calcularCambio(
        data.cartera.valorMercado,
        data.anterior.valorMercado
    )
);

actualizarCambio(
    "pulse-vol-change",
    calcularCambio(
        data.cartera.volatilidad,
        data.anterior.volatilidad
    )
);

actualizarCambio(
    "pulse-duration-change",
    calcularCambio(
        data.cartera.duracion,
        data.anterior.duracion
    )
);

actualizarCambio(
    "pulse-convexity-change",
    calcularCambio(
        data.cartera.convexidad,
        data.anterior.convexidad
    )
);
  
}


/* =========================================================
   PREPARACIÓN DEL HISTÓRICO
   ========================================================= */

function prepararHistorico(historico) {

    if (
        !historico ||
        !Array.isArray(historico.serie)
    ) {

        console.warn(
            "RISK LAB: estructura histórica no válida"
        );

        return null;
    }


    const fechas =
        historico.serie.map(
            item => item.fecha
        );


    const valorMercado =
        historico.serie.map(
            item => item.valorMercado
        );


    const volatilidad =
        historico.serie.map(
            item => item.volatilidad
        );


    const varHistorico =
        historico.serie.map(
            item => item.var
        );


    return {
        fechas,
        valorMercado,
        volatilidad,
        var: varHistorico
    };
}



/* =========================================================
   ACTUALIZAR CAMBIO
   ========================================================= */

function actualizarCambio(
    elementId,
    cambio
) {

    const elemento =
        document.getElementById(
            elementId
        );


    if (!elemento) {

        console.warn(
            `No existe el elemento #${elementId}`
        );

        return;
    }


    if (cambio === null) {

        elemento.textContent = "—";

        elemento.classList.remove(
            "positive",
            "negative",
            "neutral"
        );

        elemento.classList.add(
            "neutral"
        );

        return;
    }


    const signo =
        cambio > 0
            ? "+"
            : "";


    elemento.textContent =
        `${signo}${formatoNumero(
            cambio,
            2
        )}%`;


    elemento.classList.remove(
        "positive",
        "negative",
        "neutral"
    );


    if (cambio > 0) {

        elemento.classList.add(
            "positive"
        );

    } else if (cambio < 0) {

        elemento.classList.add(
            "negative"
        );

    } else {

        elemento.classList.add(
            "neutral"
        );
    }
}

function renderMarketValueChart(historico) {

    const canvas = document.getElementById(
        "market-value-chart"
    );

    if (!canvas) {
        console.warn(
            "RISK LAB: no existe #market-value-chart"
        );
        return;
    }

    if (
        !historico ||
        !Array.isArray(historico.serie)
    ) {
        console.warn(
            "RISK LAB: datos históricos no disponibles"
        );
        return;
    }

    const labels = historico.serie.map(item => {

        const fecha = new Date(
            item.fecha + "T00:00:00"
        );

        return fecha.toLocaleDateString(
            "es-MX",
            {
                month: "short",
                year: "2-digit"
            }
        ).replace(".", "");
    });

    const valores = historico.serie.map(
        item => item.valorMercado
    );

    new Chart(canvas, {

        type: "line",

        data: {

            labels: labels,

            datasets: [
                {
                    label: "Valor de mercado",

                    data: valores,

                    tension: 0.35,

                    borderWidth: 2,

                    pointRadius: 3,

                    pointHoverRadius: 5,

                    fill: false
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
                    display: false
                },

                tooltip: {

                    callbacks: {

                        label: function(context) {

                            return (
                                " " +
                                formatoNumero(
                                    context.parsed.y
                                ) +
                                " MDP"
                            );
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
                        maxRotation: 0
                    }
                },

                y: {

                    ticks: {

                        callback: function(value) {

                            return formatoNumero(
                                value,
                                0
                            );
                        }
                    }
                }
            }
        }
    });
}

function renderRiskProfileChart(historico) {

    const canvas = document.getElementById(
        "risk-profile-chart"
    );

    if (!canvas) {
        console.warn(
            "RISK LAB: no existe #risk-profile-chart"
        );
        return;
    }

    if (
        !historico ||
        !Array.isArray(historico.serie)
    ) {
        console.warn(
            "RISK LAB: datos históricos no disponibles"
        );
        return;
    }

    const labels = historico.serie.map(item => {

        const fecha = new Date(
            item.fecha + "T00:00:00"
        );

        return fecha.toLocaleDateString(
            "es-MX",
            {
                month: "short",
                year: "2-digit"
            }
        ).replace(".", "");
    });

    const volatilidad = historico.serie.map(
        item => item.volatilidad
    );

    const varHistorico = historico.serie.map(
        item => item.var
    );

    new Chart(canvas, {

        type: "line",

        data: {

            labels: labels,

            datasets: [

                {
                    label: "Volatilidad",

                    data: volatilidad,

                    tension: 0.35,

                    borderWidth: 2,

                    pointRadius: 3,

                    pointHoverRadius: 5,

                    fill: false
                },

                {
                    label: "VaR",

                    data: varHistorico,

                    tension: 0.35,

                    borderWidth: 2,

                    pointRadius: 3,

                    pointHoverRadius: 5,

                    fill: false
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
                    display: true
                },

                tooltip: {

                    callbacks: {

                        label: function(context) {

                            return (
                                " " +
                                context.dataset.label +
                                ": " +
                                formatoNumero(
                                    context.parsed.y
                                ) +
                                "%"
                            );
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
                        maxRotation: 0
                    }
                },

                y: {

                    ticks: {

                        callback: function(value) {

                            return (
                                formatoNumero(
                                    value
                                ) +
                                "%"
                            );
                        }
                    }
                }
            }
        }
    });
}
