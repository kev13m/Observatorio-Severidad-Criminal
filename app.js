const state = {
  records: [],
  weights: {},
  territory: null,
  selectedYear: null,
  metric: "weighted_score",
  view: "lines",
  selectedCell: null
};

const chartColors = [
  "#1d4ed8",
  "#b91c1c",
  "#047857",
  "#7c3aed",
  "#c2410c",
  "#0f766e",
  "#be123c",
  "#4338ca",
  "#a16207",
  "#334155",
  "#0891b2"
];

async function init() {
  try {
    const recordsPayload = await fetchJsonWithFallback([
      "./data/records.json",
      "data/records.json",
      "./data/Records.Json",
      "data/Records.Json"
    ]);

    const weightsPayload = await fetchJsonWithFallback([
      "./data/weights.json",
      "data/weights.json",
      "./data/Weights.Json",
      "data/Weights.Json"
    ]);

    state.weights = normalizeWeights(weightsPayload);
    state.records = normalizeRecords(recordsPayload, state.weights);

    if (!state.records.length) {
      throw new Error("records.json se ha cargado, pero no contiene registros válidos.");
    }

    populateControls();
    setupMobileTabs();
    renderWeights();
    render();
  } catch (error) {
    console.error("Error inicializando la aplicación:", error);
    showFatalError(error);
  }
}

async function fetchJsonWithFallback(urls) {
  let lastError = null;

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        cache: "no-store"
      });

      if (!response.ok) {
        lastError = new Error(`${url} devolvió HTTP ${response.status}`);
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No se pudo cargar el archivo JSON.");
}

function normalizeWeights(payload) {
  const weights = {};

  if (Array.isArray(payload)) {
    payload.forEach(item => {
      const crime = pick(item, [
        "crime",
        "Crime",
        "delito",
        "Delito",
        "category",
        "Category",
        "categoria",
        "Categoría"
      ]);

      const weight = pick(item, [
        "weight",
        "Weight",
        "peso",
        "Peso",
        "value",
        "Value",
        "valor",
        "Valor"
      ]);

      if (crime) {
        weights[cleanText(crime)] = parseFlexibleNumber(weight);
      }
    });

    return weights;
  }

  if (payload && typeof payload === "object") {
    Object.entries(payload).forEach(([crime, weight]) => {
      weights[cleanText(crime)] = parseFlexibleNumber(weight);
    });
  }

  return weights;
}

function normalizeRecords(payload, weights) {
  const rows = unwrapArray(payload);

  return rows
    .map(row => normalizeRecord(row, weights))
    .filter(record => {
      return (
        record.territory &&
        record.crime &&
        Number.isFinite(record.year) &&
        Number.isFinite(record.count)
      );
    });
}

function normalizeRecord(row, weights) {
  const territory = cleanText(pick(row, [
    "territory",
    "Territory",
    "territorio",
    "Territorio",
    "ccaa",
    "CCAA",
    "comunidad",
    "Comunidad",
    "comunidad_autonoma",
    "Comunidad Autónoma"
  ]));

  const year = parseFlexibleNumber(pick(row, [
    "year",
    "Year",
    "año",
    "Año",
    "anio",
    "Anio",
    "period",
    "Period",
    "periodo",
    "Periodo"
  ]));

  const crime = cleanText(pick(row, [
    "crime",
    "Crime",
    "delito",
    "Delito",
    "category",
    "Category",
    "categoria",
    "Categoría",
    "tipologia",
    "Tipología",
    "tipologia_penal",
    "Tipología penal"
  ]));

  const count = parseFlexibleNumber(pick(row, [
    "count",
    "Count",
    "casos",
    "Casos",
    "hechos",
    "Hechos",
    "value",
    "Value",
    "valor",
    "Valor",
    "num",
    "NUM"
  ]));

  const explicitWeight = pick(row, [
    "weight",
    "Weight",
    "peso",
    "Peso"
  ]);

  const weight = explicitWeight !== undefined && explicitWeight !== null && explicitWeight !== ""
    ? parseFlexibleNumber(explicitWeight)
    : parseFlexibleNumber(weights[crime] || 0);

  const explicitWeightedScore = pick(row, [
    "weighted_score",
    "weightedScore",
    "Weighted_score",
    "WeightedScore",
    "puntuacion_ponderada",
    "Puntuación ponderada",
    "score",
    "Score"
  ]);

  const weighted_score = explicitWeightedScore !== undefined && explicitWeightedScore !== null && explicitWeightedScore !== ""
    ? parseFlexibleNumber(explicitWeightedScore)
    : count * weight;

  return {
    territory,
    year,
    crime,
    count,
    weight,
    weighted_score
  };
}

function unwrapArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const possibleKeys = [
    "records",
    "data",
    "items",
    "rows",
    "result",
    "results"
  ];

  for (const key of possibleKeys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
  }

  return [];
}

function populateControls() {
  const territorySelect = document.getElementById("territorySelect");
  const yearSelect = document.getElementById("yearSelect");
  const metricSelect = document.getElementById("metricSelect");
  const viewSelect = document.getElementById("viewSelect");

  if (!territorySelect || !yearSelect) {
    throw new Error("No existen los selectores territorySelect/yearSelect en index.html.");
  }

  const territories = [...new Set(state.records.map(record => record.territory))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));

  const years = [...new Set(state.records.map(record => record.year))]
    .filter(year => Number.isFinite(year))
    .sort((a, b) => a - b);

  if (!territories.length) {
    throw new Error("No se han encontrado territorios válidos en records.json.");
  }

  if (!years.length) {
    throw new Error("No se han encontrado años válidos en records.json.");
  }

  territorySelect.innerHTML = "";
  yearSelect.innerHTML = "";

  territories.forEach(territory => {
    const option = document.createElement("option");
    option.value = territory;
    option.textContent = territory;
    territorySelect.appendChild(option);
  });

  years.forEach(year => {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = String(year);
    yearSelect.appendChild(option);
  });

  state.territory = territories.includes("CANARIAS") ? "CANARIAS" : territories[0];
  state.selectedYear = Math.max(...years);

  territorySelect.value = state.territory;
  yearSelect.value = String(state.selectedYear);

  territorySelect.addEventListener("change", event => {
    state.territory = event.target.value;
    state.selectedCell = null;
    render();
  });

  yearSelect.addEventListener("change", event => {
    state.selectedYear = Number(event.target.value);
    state.selectedCell = null;
    render();
  });

  if (metricSelect) {
    metricSelect.addEventListener("change", event => {
      state.metric = event.target.value;
      state.selectedCell = null;
      render();
    });
  }

  if (viewSelect) {
    viewSelect.addEventListener("change", event => {
      state.view = event.target.value;
      render();
    });
  }
}

function setupMobileTabs() {
  const tabs = document.querySelectorAll(".mobile-tab");

  const views = {
    summary: document.getElementById("mobileSummaryView"),
    chart: document.getElementById("mobileChartView"),
    crimes: document.getElementById("mobileCrimesView"),
    timeline: document.getElementById("mobileTimelineView")
  };

  if (!tabs.length) {
    return;
  }

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.mobileView;

      tabs.forEach(item => {
        item.classList.remove("active");
      });

      Object.values(views).forEach(view => {
        if (view) {
          view.classList.remove("active");
        }
      });

      tab.classList.add("active");

      if (views[target]) {
        views[target].classList.add("active");
      }

      if (target === "chart") {
        renderMobileChartPlaceholder();
      }
    });
  });
}

function render() {
  const records = getTerritoryRecords();
  const years = getYears(records);

  if (!records.length || !years.length) {
    console.warn("No hay registros para renderizar.", {
      territory: state.territory,
      selectedYear: state.selectedYear
    });

    return;
  }

  const series = state.view === "total"
    ? getTotalSeries(records, years)
    : getCrimeSeries(records, years);

  updateHeadings();
  renderKpis(records);
  drawChart(years, series);
  renderYearInsight(records);
  renderAnnualTable(records, years);
  renderRanking(records);
  renderSelectedCell(records);

  renderMobileSummary(records);
  renderMobileCrimeCards(records);
  renderMobileTimeline(records, years);
  renderMobileChartPlaceholder();
}

function getTerritoryRecords() {
  return state.records.filter(record => record.territory === state.territory);
}

function getYears(records) {
  return [...new Set(records.map(record => record.year))]
    .filter(year => Number.isFinite(year))
    .sort((a, b) => a - b);
}

function getCrimes(records) {
  return [...new Set(records.map(record => record.crime))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));
}

function getRecord(records, crime, year) {
  return records.find(record => {
    return record.crime === crime && Number(record.year) === Number(year);
  });
}

function getYearTotal(records, year, field) {
  return records
    .filter(record => Number(record.year) === Number(year))
    .reduce((sum, record) => sum + Number(record[field] || 0), 0);
}

function getCrimeSeries(records, years) {
  return getCrimes(records).map(crime => ({
    name: crime,
    values: years.map(year => {
      const item = getRecord(records, crime, year);
      return item ? Number(item[state.metric]) : 0;
    })
  }));
}

function getTotalSeries(records, years) {
  return [{
    name: state.metric === "weighted_score" ? "Índice ponderado total" : "Casos totales",
    values: years.map(year => getYearTotal(records, year, state.metric))
  }];
}

function updateHeadings() {
  const metricLabel = state.metric === "weighted_score"
    ? "Puntuación ponderada: casos × peso"
    : "Casos registrados";

  const viewLabel = state.view === "total"
    ? "total agregado"
    : "líneas por delito";

  setText("chartTitle", `${state.territory}: ${viewLabel}`);
  setText("chartSubtitle", metricLabel);
  setText("yearPanelSubtitle", `Detalle de ${state.selectedYear}`);
  setText("rankingTitle", `Ranking por delito · ${state.selectedYear}`);
}

function renderKpis(records) {
  const currentYear = state.selectedYear;
  const previousYear = currentYear - 1;

  const weightedCurrent = getYearTotal(records, currentYear, "weighted_score");
  const weightedPrevious = getYearTotal(records, previousYear, "weighted_score");
  const weightedBase = getYearTotal(records, 2016, "weighted_score");

  const casesCurrent = getYearTotal(records, currentYear, "count");
  const casesPrevious = getYearTotal(records, previousYear, "count");

  const yoyWeighted = calculatePercentageChange(weightedPrevious, weightedCurrent);
  const sinceBase = calculatePercentageChange(weightedBase, weightedCurrent);
  const yoyCases = calculatePercentageChange(casesPrevious, casesCurrent);

  setText("kpiWeighted", formatNumber(weightedCurrent));
  setText("kpiWeightedContext", `Puntuación total ponderada en ${currentYear}`);

  setText("kpiCases", formatNumber(casesCurrent));
  setText("kpiCasesContext", `Variación de casos vs ${previousYear}: ${formatPercentage(yoyCases)}`);

  setHTML("kpiYoY", formatPercentageWithBadge(yoyWeighted));
  setText(
    "kpiYoYContext",
    previousYear >= 2016 ? `Comparado con ${previousYear}` : "No hay año anterior en la serie"
  );

  setHTML("kpiSinceBase", formatPercentageWithBadge(sinceBase));
  setText("kpiSinceBaseContext", "Comparado con 2016");
}

function renderYearInsight(records) {
  const box = document.getElementById("yearInsightBox");

  if (!box) {
    return;
  }

  const year = state.selectedYear;
  const previousYear = year - 1;

  const currentWeighted = getYearTotal(records, year, "weighted_score");
  const previousWeighted = getYearTotal(records, previousYear, "weighted_score");
  const change = calculatePercentageChange(previousWeighted, currentWeighted);

  const currentRecords = records
    .filter(record => Number(record.year) === Number(year))
    .sort((a, b) => Number(b.weighted_score) - Number(a.weighted_score));

  const top = currentRecords.slice(0, 3);

  box.innerHTML = `
    <p>
      En <strong>${escapeHtml(state.territory)}</strong>, el índice ponderado de <strong>${year}</strong> es
      <strong>${formatNumber(currentWeighted)}</strong>.
    </p>

    <p>
      La variación frente a ${previousYear} es
      ${formatPercentageWithBadge(change)}.
    </p>

    <p>Las tres categorías que más contribuyen al índice en ${year} son:</p>

    <ol>
      ${top.map(record => `
        <li>
          <strong>${escapeHtml(record.crime)}</strong>: ${formatNumber(record.weighted_score)}
          <span class="muted-text">(${formatNumber(record.count)} casos)</span>
        </li>
      `).join("")}
    </ol>
  `;
}

function renderAnnualTable(records, years) {
  const head = document.getElementById("annualTableHead");
  const body = document.getElementById("annualTableBody");

  if (!head || !body) {
    return;
  }

  head.innerHTML = "";
  body.innerHTML = "";

  const headerRow = document.createElement("tr");

  const crimeHeader = document.createElement("th");
  crimeHeader.textContent = "Delito";
  headerRow.appendChild(crimeHeader);

  years.forEach(year => {
    const th = document.createElement("th");
    th.textContent = String(year);
    th.className = "year-header";

    th.addEventListener("click", () => {
      state.selectedYear = year;
      state.selectedCell = null;
      syncYearSelect();
      render();
    });

    headerRow.appendChild(th);
  });

  head.appendChild(headerRow);

  getCrimes(records).forEach(crime => {
    const row = document.createElement("tr");

    const crimeCell = document.createElement("td");
    crimeCell.textContent = crime;
    row.appendChild(crimeCell);

    years.forEach(year => {
      const record = getRecord(records, crime, year);
      const previousRecord = getRecord(records, crime, year - 1);

      const value = record ? Number(record[state.metric]) : 0;
      const previousValue = previousRecord ? Number(previousRecord[state.metric]) : null;
      const change = previousValue === null
        ? null
        : calculatePercentageChange(previousValue, value);

      const td = document.createElement("td");
      td.className = "annual-cell";

      if (
        state.selectedCell &&
        state.selectedCell.crime === crime &&
        Number(state.selectedCell.year) === Number(year)
      ) {
        td.classList.add("selected-cell");
      }

      td.innerHTML = `
        <span class="cell-value">${formatNumber(value)}</span>
        <span class="cell-change ${getChangeClass(change)}">${formatCellChange(change)}</span>
      `;

      td.title = `${crime} · ${year}`;

      td.addEventListener("click", () => {
        state.selectedCell = {
          crime,
          year
        };

        state.selectedYear = year;
        syncYearSelect();
        render();
      });

      row.appendChild(td);
    });

    body.appendChild(row);
  });
}

function renderRanking(records) {
  const tbody = document.getElementById("rankingBody");

  if (!tbody) {
    return;
  }

  tbody.innerHTML = "";

  const year = state.selectedYear;
  const previousYear = year - 1;

  const rows = records
    .filter(record => Number(record.year) === Number(year))
    .map(record => {
      const previous = getRecord(records, record.crime, previousYear);
      const previousWeighted = previous ? previous.weighted_score : null;
      const change = previousWeighted === null
        ? null
        : calculatePercentageChange(previousWeighted, record.weighted_score);

      return {
        ...record,
        change
      };
    })
    .sort((a, b) => Number(b.weighted_score) - Number(a.weighted_score));

  rows.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${escapeHtml(row.crime)}</td>
      <td>${formatNumber(row.count)}</td>
      <td>${formatNumber(row.weighted_score)}</td>
      <td>${formatNumber(row.weight)}</td>
      <td>${formatPercentageWithBadge(row.change)}</td>
    `;

    tbody.appendChild(tr);
  });
}

function renderSelectedCell(records) {
  const box = document.getElementById("selectedCellBox");

  if (!box) {
    return;
  }

  if (!state.selectedCell) {
    box.innerHTML = "Selecciona una celda de la tabla anual para ver el detalle.";
    return;
  }

  const { crime, year } = state.selectedCell;

  const record = getRecord(records, crime, year);
  const previousRecord = getRecord(records, crime, year - 1);

  if (!record) {
    box.innerHTML = "No hay datos para esta celda.";
    return;
  }

  const previousValue = previousRecord ? Number(previousRecord[state.metric]) : null;
  const change = previousValue === null
    ? null
    : calculatePercentageChange(previousValue, Number(record[state.metric]));

  box.innerHTML = `
    <p><strong>${escapeHtml(crime)}</strong></p>
    <p>Año: <strong>${year}</strong></p>
    <p>Casos registrados: <strong>${formatNumber(record.count)}</strong></p>
    <p>Peso aplicado: <strong>${formatNumber(record.weight)}</strong></p>
    <p>Puntuación ponderada: <strong>${formatNumber(record.weighted_score)}</strong></p>
    <p>Variación vs ${year - 1}: ${formatPercentageWithBadge(change)}</p>
  `;
}

function renderWeights() {
  const box = document.getElementById("weightsBox");

  if (!box) {
    return;
  }

  box.innerHTML = "";

  Object.entries(state.weights).forEach(([crime, weight]) => {
    const div = document.createElement("div");
    div.className = "weight-card";

    div.innerHTML = `
      <span>${escapeHtml(crime)}</span>
      <strong>${formatNumber(weight)}</strong>
    `;

    box.appendChild(div);
  });
}

function renderMobileSummary(records) {
  const box = document.getElementById("mobileSummaryContent");

  if (!box) {
    return;
  }

  const year = state.selectedYear;
  const previousYear = year - 1;

  const weightedCurrent = getYearTotal(records, year, "weighted_score");
  const weightedPrevious = getYearTotal(records, previousYear, "weighted_score");
  const casesCurrent = getYearTotal(records, year, "count");
  const casesPrevious = getYearTotal(records, previousYear, "count");

  const weightedChange = calculatePercentageChange(weightedPrevious, weightedCurrent);
  const casesChange = calculatePercentageChange(casesPrevious, casesCurrent);

  const topCrime = records
    .filter(record => Number(record.year) === Number(year))
    .sort((a, b) => Number(b.weighted_score) - Number(a.weighted_score))[0];

  box.innerHTML = `
    <div class="mobile-summary-card primary">
      <span class="mobile-label">${escapeHtml(state.territory)} · año seleccionado</span>
      <strong>${year}</strong>
      <p>
        Lectura móvil del índice experimental. Las variaciones mostradas comparan
        ${year} frente a ${previousYear}.
      </p>
    </div>

    <div class="mobile-metric-grid">
      <div class="mobile-metric">
        <span>Índice ponderado</span>
        <strong>${formatNumber(weightedCurrent)}</strong>
        <small>vs ${previousYear}: ${formatPercentage(weightedChange)}</small>
      </div>

      <div class="mobile-metric">
        <span>Casos registrados</span>
        <strong>${formatNumber(casesCurrent)}</strong>
        <small>vs ${previousYear}: ${formatPercentage(casesChange)}</small>
      </div>
    </div>

    <div class="mobile-summary-card">
      <span class="mobile-label">Mayor contribución en ${year}</span>
      <strong>${topCrime ? escapeHtml(topCrime.crime) : "n/a"}</strong>
      <p>
        ${
          topCrime
            ? `${formatNumber(topCrime.weighted_score)} puntos ponderados · ${formatNumber(topCrime.count)} casos registrados.`
            : "No hay datos disponibles."
        }
      </p>
    </div>

    <div class="mobile-note-box">
      El índice mide severidad registrada, no criminalidad real total ni delitos no denunciados.
    </div>
  `;
}

function renderMobileCrimeCards(records) {
  const box = document.getElementById("mobileCrimeCards");

  if (!box) {
    return;
  }

  const year = state.selectedYear;
  const previousYear = year - 1;

  const metricLabel = state.metric === "weighted_score"
    ? "índice ponderado"
    : "casos registrados";

  const rows = records
    .filter(record => Number(record.year) === Number(year))
    .map(record => {
      const previous = getRecord(records, record.crime, previousYear);
      const previousWeighted = previous ? previous.weighted_score : null;
      const change = previousWeighted === null
        ? null
        : calculatePercentageChange(previousWeighted, record.weighted_score);

      return {
        ...record,
        change
      };
    })
    .sort((a, b) => Number(b.weighted_score) - Number(a.weighted_score));

  box.innerHTML = `
    <div class="mobile-context-card">
      <span class="mobile-label">Contexto activo</span>
      <strong>${year}</strong>
      <p>
        Ranking ordenado por <b>${metricLabel}</b>. La variación de cada delito compara
        <b>${year}</b> frente a <b>${previousYear}</b>.
      </p>
    </div>

    ${rows.map((record, index) => `
      <button
        class="mobile-crime-card"
        type="button"
        data-crime="${encodeURIComponent(record.crime)}"
        data-year="${year}"
      >
        <div class="mobile-card-top">
          <span class="mobile-rank">#${index + 1}</span>

          <div class="mobile-change-box">
            <small>vs ${previousYear}</small>
            ${formatPercentageWithBadge(record.change)}
          </div>
        </div>

        <strong>${escapeHtml(record.crime)}</strong>

        <div class="mobile-card-stats">
          <span>
            <small>Año</small>
            ${year}
          </span>

          <span>
            <small>Casos</small>
            ${formatNumber(record.count)}
          </span>

          <span>
            <small>Ponderado</small>
            ${formatNumber(record.weighted_score)}
          </span>
        </div>

        <div class="mobile-card-compare">
          Comparación: ${year} frente a ${previousYear}
        </div>
      </button>
    `).join("")}
  `;

  document.querySelectorAll(".mobile-crime-card").forEach(card => {
    card.addEventListener("click", () => {
      state.selectedCell = {
        crime: decodeURIComponent(card.dataset.crime),
        year: Number(card.dataset.year)
      };

      state.selectedYear = Number(card.dataset.year);
      syncYearSelect();
      render();
    });
  });
}

function renderMobileTimeline(records, years) {
  const box = document.getElementById("mobileTimelineContent");

  if (!box) {
    return;
  }

  const metricLabel = state.metric === "weighted_score"
    ? "Índice ponderado"
    : "Casos registrados";

  const selectedValue = getYearTotal(records, state.selectedYear, state.metric);
  const selectedPreviousValue = getYearTotal(records, state.selectedYear - 1, state.metric);
  const selectedChange = calculatePercentageChange(selectedPreviousValue, selectedValue);

  const maxValue = Math.max(
    ...years.map(year => getYearTotal(records, year, state.metric)),
    1
  );

  box.innerHTML = `
    <div class="mobile-context-card">
      <span class="mobile-label">Año seleccionado</span>
      <strong>${state.selectedYear}</strong>
      <p>
        ${metricLabel}: <b>${formatNumber(selectedValue)}</b>.
        Comparación frente a <b>${state.selectedYear - 1}</b>:
        ${formatPercentageWithBadge(selectedChange)}
      </p>
    </div>

    ${years.map(year => {
      const value = getYearTotal(records, year, state.metric);
      const previousValue = getYearTotal(records, year - 1, state.metric);
      const change = calculatePercentageChange(previousValue, value);
      const width = Math.max((value / maxValue) * 100, 4);

      const selectedClass = Number(year) === Number(state.selectedYear) ? "selected" : "";
      const selectedText = Number(year) === Number(state.selectedYear) ? " · seleccionado" : "";

      return `
        <button class="mobile-year-row ${selectedClass}" type="button" data-year="${year}">
          <div class="mobile-year-header">
            <strong>${year}${selectedText}</strong>
            ${formatPercentageWithBadge(change)}
          </div>

          <div class="mobile-bar-track">
            <span class="mobile-bar-fill" style="width: ${width}%"></span>
          </div>

          <div class="mobile-year-footer">
            <span>${metricLabel} · vs ${year - 1}</span>
            <strong>${formatNumber(value)}</strong>
          </div>
        </button>
      `;
    }).join("")}
  `;

  document.querySelectorAll(".mobile-year-row").forEach(row => {
    row.addEventListener("click", () => {
      state.selectedYear = Number(row.dataset.year);
      state.selectedCell = null;
      syncYearSelect();
      render();
    });
  });
}

function renderMobileChartPlaceholder() {
  const box = document.getElementById("mobileChartContent");

  if (!box) {
    return;
  }

  box.innerHTML = `
    <div class="mobile-summary-card">
      <span class="mobile-label">Gráfica avanzada</span>
      <strong>La gráfica interactiva irá en una página independiente.</strong>
      <p>
        Para mantener estable el dashboard principal, la visualización avanzada se construirá en una nueva página.
      </p>
      <p>
        Página prevista: <strong>grafica.html</strong>
      </p>
    </div>
  `;
}

function activateMobileView(target) {
  const tab = document.querySelector(`[data-mobile-view="${target}"]`);
  const view = document.getElementById(`mobile${capitalize(target)}View`);

  document.querySelectorAll(".mobile-tab").forEach(item => {
    item.classList.remove("active");
  });

  document.querySelectorAll(".mobile-view").forEach(item => {
    item.classList.remove("active");
  });

  if (tab) {
    tab.classList.add("active");
  }

  if (view) {
    view.classList.add("active");
  }
}

function drawChart(years, series) {
  const canvas = document.getElementById("chartCanvas");

  if (!canvas || !series.length) {
    return;
  }

  const ctx = canvas.getContext("2d");

  const width = canvas.width;
  const height = canvas.height;

  const margin = {
    top: 70,
    right: 36,
    bottom: 74,
    left: 102
  };

  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const allValues = series.flatMap(item => item.values);
  const maxValue = Math.max(...allValues, 1);

  drawGrid(ctx, width, margin, plotHeight, maxValue);
  drawXAxis(ctx, years, margin, plotWidth, height);
  drawSelectedYearBand(ctx, years, margin, plotWidth, plotHeight);
  drawLines(ctx, years, series, margin, plotWidth, plotHeight, maxValue);
  drawLegend(ctx, series, margin);
}

function drawGrid(ctx, width, margin, plotHeight, maxValue) {
  ctx.strokeStyle = "#e5e7eb";
  ctx.fillStyle = "#64748b";
  ctx.lineWidth = 1;
  ctx.font = "14px system-ui";

  for (let i = 0; i <= 5; i++) {
    const y = margin.top + (plotHeight * i / 5);
    const value = maxValue - (maxValue * i / 5);

    ctx.beginPath();
    ctx.moveTo(margin.left, y);
    ctx.lineTo(width - margin.right, y);
    ctx.stroke();

    ctx.fillText(formatCompactNumber(value), 16, y + 5);
  }
}

function drawXAxis(ctx, years, margin, plotWidth, height) {
  ctx.fillStyle = "#64748b";
  ctx.font = "14px system-ui";

  years.forEach((year, index) => {
    const x = margin.left + (plotWidth * index / Math.max(years.length - 1, 1));
    ctx.fillText(String(year), x - 16, height - 34);
  });
}

function drawSelectedYearBand(ctx, years, margin, plotWidth, plotHeight) {
  const index = years.indexOf(state.selectedYear);

  if (index === -1) {
    return;
  }

  const x = margin.left + (plotWidth * index / Math.max(years.length - 1, 1));

  ctx.fillStyle = "rgba(29, 78, 216, 0.07)";
  ctx.fillRect(x - 18, margin.top, 36, plotHeight);

  ctx.strokeStyle = "rgba(29, 78, 216, 0.3)";
  ctx.beginPath();
  ctx.moveTo(x, margin.top);
  ctx.lineTo(x, margin.top + plotHeight);
  ctx.stroke();
}

function drawLines(ctx, years, series, margin, plotWidth, plotHeight, maxValue) {
  series.forEach((item, seriesIndex) => {
    const color = chartColors[seriesIndex % chartColors.length];

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.3;
    ctx.beginPath();

    item.values.forEach((value, index) => {
      const x = margin.left + (plotWidth * index / Math.max(years.length - 1, 1));
      const y = margin.top + plotHeight - ((value / maxValue) * plotHeight);

      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    item.values.forEach((value, index) => {
      const x = margin.left + (plotWidth * index / Math.max(years.length - 1, 1));
      const y = margin.top + plotHeight - ((value / maxValue) * plotHeight);

      ctx.beginPath();
      ctx.arc(x, y, 3.6, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function drawLegend(ctx, series, margin) {
  ctx.font = "12px system-ui";

  series.slice(0, 11).forEach((item, index) => {
    const x = margin.left + (index % 3) * 360;
    const y = 24 + Math.floor(index / 3) * 17;

    ctx.fillStyle = chartColors[index % chartColors.length];
    ctx.fillRect(x, y - 10, 10, 10);

    ctx.fillStyle = "#334155";
    ctx.fillText(item.name, x + 16, y);
  });
}

function calculatePercentageChange(previous, current) {
  if (previous === null || previous === undefined || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function formatPercentage(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPercentageWithBadge(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return `<span class="badge badge-neutral">n/a</span>`;
  }

  const className = value > 0
    ? "badge-positive"
    : value < 0
      ? "badge-negative"
      : "badge-neutral";

  return `<span class="badge ${className}">${formatPercentage(value)}</span>`;
}

function getChangeClass(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "change-neutral";
  }

  if (value > 0) {
    return "change-positive";
  }

  if (value < 0) {
    return "change-negative";
  }

  return "change-neutral";
}

function formatCellChange(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  if (value > 0) {
    return `▲ ${value.toFixed(1)}%`;
  }

  if (value < 0) {
    return `▼ ${Math.abs(value).toFixed(1)}%`;
  }

  return "0,0%";
}

function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString("es-ES");
}

function formatCompactNumber(value) {
  const number = Number(value || 0);

  if (number >= 1000000) {
    return `${(number / 1000000).toFixed(1)}M`;
  }

  if (number >= 1000) {
    return `${(number / 1000).toFixed(0)}k`;
  }

  return Math.round(number).toLocaleString("es-ES");
}

function parseFlexibleNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (value === null || value === undefined || value === "") {
    return 0;
  }

  let text = String(value).trim();

  if (!text) {
    return 0;
  }

  text = text.replace(/\s/g, "");

  if (text.includes(",") && text.includes(".")) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      text = text.replace(/\./g, "").replace(",", ".");
    } else {
      text = text.replace(/,/g, "");
    }
  } else if (text.includes(",")) {
    text = text.replace(",", ".");
  }

  text = text.replace(/[^\d.-]/g, "");

  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
}

function pick(object, keys) {
  if (!object || typeof object !== "object") {
    return undefined;
  }

  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(object, key) &&
      object[key] !== undefined &&
      object[key] !== null &&
      object[key] !== ""
    ) {
      return object[key];
    }
  }

  return undefined;
}

function cleanText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
}

function setHTML(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.innerHTML = value;
  }
}

function syncYearSelect() {
  const yearSelect = document.getElementById("yearSelect");

  if (yearSelect) {
    yearSelect.value = String(state.selectedYear);
  }
}

function capitalize(value) {
  if (!value) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showFatalError(error) {
  const main = document.querySelector("main");

  if (!main) {
    return;
  }

  main.insertAdjacentHTML("afterbegin", `
    <section class="method-warning">
      <strong>Error de carga:</strong>
      no se han podido cargar los datos de la aplicación.
      <br />
      Detalle técnico: ${escapeHtml(error.message)}
    </section>
  `);
}

init();