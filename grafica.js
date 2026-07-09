(() => {
  "use strict";

  const state = {
    records: [],
    weights: {},
    territory: "",
    crime: "__total__",
    metric: "weighted_score",
    mode: "line",
    startYear: null,
    endYear: null,
    selectedYear: null
  };

  const colors = {
    blue: "#1d4ed8",
    navy: "#0f172a",
    muted: "#64748b",
    border: "#e5e7eb",
    red: "#b91c1c",
    green: "#047857",
    white: "#ffffff"
  };

  const geometry = {
    points: []
  };

  document.addEventListener("DOMContentLoaded", init);

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
      bindEvents();
      render();
    } catch (error) {
      console.error("Error en grafica.js:", error);
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

  function populateControls() {
    const territorySelect = getEl("advancedTerritorySelect");
    const crimeSelect = getEl("advancedCrimeSelect");
    const startYearSelect = getEl("advancedStartYearSelect");
    const endYearSelect = getEl("advancedEndYearSelect");

    if (!territorySelect || !crimeSelect || !startYearSelect || !endYearSelect) {
      throw new Error("Faltan selectores en grafica.html. Revisa los IDs advancedTerritorySelect, advancedCrimeSelect, advancedStartYearSelect y advancedEndYearSelect.");
    }

    const territories = unique(state.records.map(record => record.territory))
      .sort((a, b) => a.localeCompare(b, "es"));

    const crimes = unique(state.records.map(record => record.crime))
      .sort((a, b) => a.localeCompare(b, "es"));

    const years = unique(state.records.map(record => record.year))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    if (!territories.length || !crimes.length || !years.length) {
      throw new Error("No hay territorios, delitos o años válidos en records.json.");
    }

    state.territory = territories.includes("CANARIAS") ? "CANARIAS" : territories[0];
    state.crime = "__total__";
    state.metric = "weighted_score";
    state.mode = "line";
    state.startYear = Math.min(...years);
    state.endYear = Math.max(...years);
    state.selectedYear = state.endYear;

    territorySelect.innerHTML = territories
      .map(territory => `<option value="${escapeHtml(territory)}">${escapeHtml(territory)}</option>`)
      .join("");

    crimeSelect.innerHTML = `
      <option value="__total__">Total agregado</option>
      ${crimes
        .map(crime => `<option value="${escapeHtml(crime)}">${escapeHtml(crime)}</option>`)
        .join("")}
    `;

    startYearSelect.innerHTML = years
      .map(year => `<option value="${year}">${year}</option>`)
      .join("");

    endYearSelect.innerHTML = years
      .map(year => `<option value="${year}">${year}</option>`)
      .join("");

    territorySelect.value = state.territory;
    crimeSelect.value = state.crime;
    startYearSelect.value = String(state.startYear);
    endYearSelect.value = String(state.endYear);
  }

  function bindEvents() {
    bindSelect("advancedTerritorySelect", value => {
      state.territory = value;
      render();
    });

    bindSelect("advancedCrimeSelect", value => {
      state.crime = value;
      render();
    });

    bindSelect("advancedMetricSelect", value => {
      state.metric = value;
      render();
    });

    bindSelect("advancedModeSelect", value => {
      state.mode = value;
      render();
    });

    bindSelect("advancedStartYearSelect", value => {
      state.startYear = Number(value);

      if (state.startYear > state.endYear) {
        state.endYear = state.startYear;
        setSelectValue("advancedEndYearSelect", state.endYear);
      }

      if (state.selectedYear < state.startYear) {
        state.selectedYear = state.startYear;
      }

      render();
    });

    bindSelect("advancedEndYearSelect", value => {
      state.endYear = Number(value);

      if (state.endYear < state.startYear) {
        state.startYear = state.endYear;
        setSelectValue("advancedStartYearSelect", state.startYear);
      }

      if (state.selectedYear > state.endYear) {
        state.selectedYear = state.endYear;
      }

      render();
    });

    const canvas = getEl("advancedChartCanvas");

    if (canvas) {
      canvas.addEventListener("click", event => {
        const year = getNearestYearFromClick(event);

        if (year !== null) {
          state.selectedYear = year;
          render();
        }
      });
    }

    window.addEventListener("resize", debounce(render, 120));
  }

  function renderAttemptDisclaimer() {
    const box = document.getElementById("attemptDisclaimerBox");

    if (!box) {
      return;
    }

    const isAttemptCategory =
      state.crime &&
      state.crime.toLowerCase().includes("tentativas") &&
      state.crime.toLowerCase().includes("homicidio");

    if (!isAttemptCategory) {
      box.hidden = true;
      box.innerHTML = "";
      return;
    }

    box.hidden = false;
    box.innerHTML = `
      <strong>Categoría calculada.</strong>
      La categoría “Tentativas de homicidio/asesinato” no se muestra aquí como una serie bruta autónoma.
      Se obtiene mediante una operación sobre series oficiales:
      <strong>Total oficial de homicidios dolosos/asesinatos − homicidios/asesinatos consumados = tentativas calculadas.</strong>
      Esta separación se utiliza exclusivamente para distinguir consumados y tentativas dentro del índice experimental de severidad.
    `;
  }

  function render() {
    const records = getTerritoryRecords();
    const years = getVisibleYears();

    if (!records.length || !years.length) {
      renderEmpty("No hay datos para la selección actual.");
      return;
    }

    const data = buildSeries(records, years);

    if (!years.includes(state.selectedYear)) {
      state.selectedYear = years[years.length - 1];
    }

    const subject = getSubjectLabel();
    const metric = getMetricLabel();

    setText("advancedChartTitle", `${subject} · ${state.territory}`);
    setText("advancedChartSubtitle", `${metric} · ${state.startYear}-${state.endYear}`);
    setText("advancedDetailSubtitle", `${subject} · ${state.territory}`);

    renderAttemptDisclaimer();

    drawChart(data, subject, metric);
    renderInsight(data, subject, metric);
    renderTable(data);
    renderMobileList(data, metric);
  }

  function getTerritoryRecords() {
    return state.records.filter(record => record.territory === state.territory);
  }

  function getVisibleYears() {
    return unique(state.records.map(record => record.year))
      .filter(year => {
        return (
          Number.isFinite(year) &&
          Number(year) >= Number(state.startYear) &&
          Number(year) <= Number(state.endYear)
        );
      })
      .sort((a, b) => a - b);
  }

  function buildSeries(records, years) {
    return years.map(year => {
      const value = state.crime === "__total__"
        ? sumYear(records, year, state.metric)
        : valueForCrime(records, state.crime, year, state.metric);

      const previousValue = state.crime === "__total__"
        ? sumYear(records, year - 1, state.metric)
        : valueForCrime(records, state.crime, year - 1, state.metric);

      return {
        year,
        value,
        previousValue,
        change: calculatePercentageChange(previousValue, value)
      };
    });
  }

  function drawChart(data, subject, metric) {
    const canvas = getEl("advancedChartCanvas");

    if (!canvas) {
      return;
    }

    const wrapper = canvas.parentElement;
    const cssWidth = Math.max(wrapper ? wrapper.clientWidth : 900, 320);
    const cssHeight = window.innerWidth <= 760 ? 360 : 500;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.floor(cssWidth * ratio);
    canvas.height = Math.floor(cssHeight * ratio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = colors.white;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const margin = {
      top: 58,
      right: 24,
      bottom: 58,
      left: 56
    };

    const plotWidth = cssWidth - margin.left - margin.right;
    const plotHeight = cssHeight - margin.top - margin.bottom;
    const maxValue = Math.max(...data.map(item => item.value), 1);

    drawGrid(ctx, cssWidth, margin, plotHeight, maxValue);
    drawXAxis(ctx, data, margin, plotWidth, cssHeight);
    drawSelectedYear(ctx, data, margin, plotWidth, plotHeight);
    drawChartHeader(ctx, subject, metric);

    if (state.mode === "bar") {
      drawBars(ctx, data, margin, plotWidth, plotHeight, maxValue);
    } else {
      drawLine(ctx, data, margin, plotWidth, plotHeight, maxValue);
    }
  }

  function drawGrid(ctx, width, margin, plotHeight, maxValue) {
    ctx.strokeStyle = colors.border;
    ctx.fillStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.font = "12px system-ui";

    for (let i = 0; i <= 5; i++) {
      const y = margin.top + (plotHeight * i / 5);
      const value = maxValue - (maxValue * i / 5);

      ctx.beginPath();
      ctx.moveTo(margin.left, y);
      ctx.lineTo(width - margin.right, y);
      ctx.stroke();

      ctx.fillText(formatCompactNumber(value), 14, y + 4);
    }
  }

  function drawXAxis(ctx, data, margin, plotWidth, height) {
    ctx.fillStyle = colors.muted;
    ctx.font = "12px system-ui";

    const step = Math.max(1, Math.ceil((data.length * 36) / plotWidth));

    data.forEach((item, index) => {
      if (index % step === 0 || index === data.length - 1) {
        const x = getX(index, data.length, margin, plotWidth);
        
        if (index === data.length - 1 && index % step !== 0) {
          const prevIndex = Math.floor((data.length - 1) / step) * step;
          const prevX = getX(prevIndex, data.length, margin, plotWidth);
          if (x - prevX < 36) return;
        }
        
        ctx.fillText(String(item.year), x - 14, height - 25);
      }
    });
  }

  function drawSelectedYear(ctx, data, margin, plotWidth, plotHeight) {
    const index = data.findIndex(item => Number(item.year) === Number(state.selectedYear));

    if (index === -1) {
      return;
    }

    const x = getX(index, data.length, margin, plotWidth);

    ctx.fillStyle = "rgba(29, 78, 216, 0.08)";
    ctx.fillRect(x - 18, margin.top, 36, plotHeight);

    ctx.strokeStyle = "rgba(29, 78, 216, 0.35)";
    ctx.beginPath();
    ctx.moveTo(x, margin.top);
    ctx.lineTo(x, margin.top + plotHeight);
    ctx.stroke();
  }

  function drawChartHeader(ctx, subject, metric) {
    ctx.fillStyle = colors.navy;
    ctx.font = "700 13px system-ui";
    ctx.fillText(`${subject} · ${metric}`, 86, 28);

    ctx.fillStyle = colors.muted;
    ctx.font = "12px system-ui";
    ctx.fillText("Haz clic sobre la gráfica para seleccionar un año", 86, 45);
  }

  function drawLine(ctx, data, margin, plotWidth, plotHeight, maxValue) {
    const points = data.map((item, index) => {
      const x = getX(index, data.length, margin, plotWidth);
      const y = margin.top + plotHeight - ((item.value / maxValue) * plotHeight);

      return {
        ...item,
        x,
        y
      };
    });

    geometry.points = points;

    ctx.strokeStyle = colors.blue;
    ctx.lineWidth = 2.6;
    ctx.beginPath();

    points.forEach((point, index) => {
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });

    ctx.stroke();

    points.forEach(point => {
      const selected = Number(point.year) === Number(state.selectedYear);

      ctx.beginPath();
      ctx.arc(point.x, point.y, selected ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = selected ? colors.navy : colors.blue;
      ctx.fill();
    });
  }

  function drawBars(ctx, data, margin, plotWidth, plotHeight, maxValue) {
    const slot = plotWidth / Math.max(data.length, 1);
    const barWidth = Math.max(Math.min(slot * 0.54, 44), 14);

    const points = data.map((item, index) => {
      const x = margin.left + slot * index + slot / 2;
      const barHeight = (item.value / maxValue) * plotHeight;
      const y = margin.top + plotHeight - barHeight;

      return {
        ...item,
        x,
        y,
        barHeight,
        barWidth
      };
    });

    geometry.points = points;

    points.forEach(point => {
      const selected = Number(point.year) === Number(state.selectedYear);

      ctx.fillStyle = selected ? colors.navy : colors.blue;
      ctx.fillRect(
        point.x - point.barWidth / 2,
        point.y,
        point.barWidth,
        point.barHeight
      );
    });
  }

  function getX(index, length, margin, plotWidth) {
    if (length <= 1) {
      return margin.left + plotWidth / 2;
    }

    return margin.left + (plotWidth * index / (length - 1));
  }

  function getNearestYearFromClick(event) {
    if (!geometry.points.length) {
      return null;
    }

    const canvas = getEl("advancedChartCanvas");

    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;

    let nearest = null;
    let distance = Infinity;

    geometry.points.forEach(point => {
      const currentDistance = Math.abs(point.x - clickX);

      if (currentDistance < distance) {
        distance = currentDistance;
        nearest = point;
      }
    });

    return nearest ? nearest.year : null;
  }

  function renderInsight(data, subject, metric) {
    const box = getEl("advancedInsightBox");

    if (!box) {
      return;
    }

    const selected = data.find(item => Number(item.year) === Number(state.selectedYear)) || data[data.length - 1];
    const first = data[0];
    const last = data[data.length - 1];

    const peak = [...data].sort((a, b) => b.value - a.value)[0];
    const low = [...data].sort((a, b) => a.value - b.value)[0];
    const periodChange = calculatePercentageChange(first.value, last.value);

    box.innerHTML = `
      <div class="advanced-selected-year">
        <span>Año seleccionado</span>
        <strong>${selected.year}</strong>
      </div>

      <div class="advanced-detail-grid">
        <div>
          <span>${escapeHtml(metric)}</span>
          <strong>${formatNumber(selected.value)}</strong>
        </div>

        <div>
          <span>Variación vs ${selected.year - 1}</span>
          <strong>${formatPercentageWithBadge(selected.change)}</strong>
        </div>

        <div>
          <span>Máximo del periodo</span>
          <strong>${peak.year} · ${formatNumber(peak.value)}</strong>
        </div>

        <div>
          <span>Mínimo del periodo</span>
          <strong>${low.year} · ${formatNumber(low.value)}</strong>
        </div>
      </div>

      <p>
        Serie seleccionada: <strong>${escapeHtml(subject)}</strong>.
        Entre <strong>${first.year}</strong> y <strong>${last.year}</strong>, la variación acumulada es
        ${formatPercentageWithBadge(periodChange)}.
      </p>
    `;
  }

  function renderTable(data) {
    const tbody = getEl("advancedTableBody");

    if (!tbody) {
      return;
    }

    tbody.innerHTML = data.map(item => {
      const selectedClass = Number(item.year) === Number(state.selectedYear)
        ? "selected-row"
        : "";

      return `
        <tr class="${selectedClass}" data-year="${item.year}">
          <td>${item.year}</td>
          <td>${formatNumber(item.value)}</td>
          <td>${formatPercentageWithBadge(item.change)}</td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("tr").forEach(row => {
      row.addEventListener("click", () => {
        state.selectedYear = Number(row.dataset.year);
        render();
      });
    });
  }

  function renderMobileList(data, metric) {
    const box = getEl("advancedMobileList");

    if (!box) {
      return;
    }

    const maxValue = Math.max(...data.map(item => item.value), 1);

    box.innerHTML = data.map(item => {
      const selectedClass = Number(item.year) === Number(state.selectedYear)
        ? "selected"
        : "";

      const width = Math.max((item.value / maxValue) * 100, 4);

      return `
        <button class="advanced-year-card ${selectedClass}" type="button" data-year="${item.year}">
          <div class="advanced-year-card-top">
            <strong>${item.year}</strong>
            ${formatPercentageWithBadge(item.change)}
          </div>

          <div class="advanced-mobile-bar-track">
            <span class="advanced-mobile-bar-fill" style="width: ${width}%"></span>
          </div>

          <div class="advanced-year-card-bottom">
            <span>${escapeHtml(metric)}</span>
            <strong>${formatNumber(item.value)}</strong>
          </div>
        </button>
      `;
    }).join("");

    box.querySelectorAll(".advanced-year-card").forEach(card => {
      card.addEventListener("click", () => {
        state.selectedYear = Number(card.dataset.year);
        render();
      });
    });
  }

  function renderEmpty(message) {
    setText("advancedChartTitle", "Sin datos disponibles");
    setText("advancedChartSubtitle", message);

    const insight = getEl("advancedInsightBox");
    const table = getEl("advancedTableBody");
    const mobile = getEl("advancedMobileList");

    if (insight) {
      insight.innerHTML = escapeHtml(message);
    }

    if (table) {
      table.innerHTML = "";
    }

    if (mobile) {
      mobile.innerHTML = "";
    }
  }

  function showFatalError(error) {
    const main = document.querySelector("main");

    if (!main) {
      document.body.innerHTML = `
        <main style="padding:24px;font-family:system-ui">
          <h1>Error cargando gráfica avanzada</h1>
          <p>${escapeHtml(error.message)}</p>
        </main>
      `;
      return;
    }

    main.insertAdjacentHTML("afterbegin", `
      <section class="method-warning">
        <strong>Error cargando gráfica avanzada:</strong>
        ${escapeHtml(error.message)}
      </section>
    `);
  }

  function bindSelect(id, callback) {
    const element = getEl(id);

    if (!element) {
      return;
    }

    element.addEventListener("change", event => {
      callback(event.target.value);
    });
  }

  function setSelectValue(id, value) {
    const element = getEl(id);

    if (element) {
      element.value = String(value);
    }
  }

  function getEl(id) {
    return document.getElementById(id);
  }

  function unique(values) {
    return [...new Set(values)].filter(value => value !== null && value !== undefined && value !== "");
  }

  function sumYear(records, year, field) {
    return records
      .filter(record => Number(record.year) === Number(year))
      .reduce((sum, record) => sum + Number(record[field] || 0), 0);
  }

  function valueForCrime(records, crime, year, field) {
    const record = records.find(item => {
      return item.crime === crime && Number(item.year) === Number(year);
    });

    return record ? Number(record[field] || 0) : 0;
  }

  function getMetricLabel() {
    return state.metric === "weighted_score"
      ? "Puntuación ponderada"
      : "Casos registrados";
  }

  function getSubjectLabel() {
    return state.crime === "__total__"
      ? "Total agregado"
      : state.crime;
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
    return unwrapArray(payload)
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

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setText(id, value) {
    const element = getEl(id);

    if (element) {
      element.textContent = value;
    }
  }

  function debounce(callback, wait) {
    let timeout = null;

    return function debounced() {
      clearTimeout(timeout);
      timeout = setTimeout(callback, wait);
    };
  }
})();
