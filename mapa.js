(() => {
  "use strict";

  const state = {
    records: [],
    crime: "",
    metric: "count",
    startYear: null,
    endYear: null,
    selectedTerritory: "MADRID (COMUNIDAD DE)",
    nationalAverage: null,
    nationalAggregate: null,
    data: []
  };

  const colors = {
    riseLow: [254, 226, 226],
    riseHigh: [153, 27, 27],
    fallLow: [224, 242, 254],
    fallHigh: [15, 118, 110],
    flat: "#e5e7eb",
    noData: "#f1f5f9"
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    try {
      const payload = await fetchJsonWithFallback([
        "./data/records.json",
        "data/records.json",
        "./data/Records.Json",
        "data/Records.Json"
      ]);

      state.records = normalizeRecords(payload);

      if (!state.records.length) {
        throw new Error("records.json se ha cargado, pero no contiene registros válidos.");
      }

      populateControls();
      bindEvents();
      render();
    } catch (error) {
      console.error("Error en mapa.js:", error);
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
    const crimeSelect = getEl("heatCrimeSelect");
    const startYearSelect = getEl("heatStartYearSelect");
    const endYearSelect = getEl("heatEndYearSelect");

    if (!crimeSelect || !startYearSelect || !endYearSelect) {
      throw new Error("Faltan controles en mapa.html. Revisa los IDs heatCrimeSelect, heatStartYearSelect y heatEndYearSelect.");
    }

    const crimes = unique(state.records.map(record => record.crime))
      .sort((a, b) => a.localeCompare(b, "es"));

    const years = unique(state.records.map(record => record.year))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    state.crime = crimes.includes("Hurtos") ? "Hurtos" : crimes[0];
    state.startYear = Math.min(...years);
    state.endYear = Math.max(...years);

    crimeSelect.innerHTML = crimes
      .map(crime => `<option value="${escapeHtml(crime)}">${escapeHtml(crime)}</option>`)
      .join("");

    startYearSelect.innerHTML = years
      .map(year => `<option value="${year}">${year}</option>`)
      .join("");

    endYearSelect.innerHTML = years
      .map(year => `<option value="${year}">${year}</option>`)
      .join("");

    crimeSelect.value = state.crime;
    startYearSelect.value = String(state.startYear);
    endYearSelect.value = String(state.endYear);
  }

  function bindEvents() {
    bindSelect("heatCrimeSelect", value => {
      state.crime = value;
      render();
    });

    bindSelect("heatMetricSelect", value => {
      state.metric = value;
      render();
    });

    bindSelect("heatStartYearSelect", value => {
      state.startYear = Number(value);

      if (state.startYear > state.endYear) {
        state.endYear = state.startYear;
        setSelectValue("heatEndYearSelect", state.endYear);
      }

      render();
    });

    bindSelect("heatEndYearSelect", value => {
      state.endYear = Number(value);

      if (state.endYear < state.startYear) {
        state.startYear = state.endYear;
        setSelectValue("heatStartYearSelect", state.startYear);
      }

      render();
    });

    document.querySelectorAll(".heat-region").forEach(region => {
      region.addEventListener("click", () => {
        selectTerritory(region.dataset.territory);
      });

      region.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectTerritory(region.dataset.territory);
        }
      });
    });
  }

  function render() {
    state.data = buildHeatData();
    state.nationalAverage = calculateNationalAverage(state.data);
    state.nationalAggregate = calculateNationalAggregate();

    if (!state.data.some(item => item.territory === state.selectedTerritory)) {
      state.selectedTerritory = state.data[0] ? state.data[0].territory : null;
    }

    setText("heatMapTitle", `${state.crime} · ${getMetricLabel()}`);
    setText("heatMapSubtitle", `${state.startYear}-${state.endYear} · rojo = subida del delito seleccionado`);
    setText("heatContextLabel", `${state.crime} · ${state.startYear}-${state.endYear} · comparación con media nacional`);

    renderMap();
    renderSummary();
    renderSelectedBox();
    renderTopList();
    renderTable();
  }

  function buildHeatData() {
    const territories = unique(state.records.map(record => record.territory))
      .sort((a, b) => a.localeCompare(b, "es"));

    return territories.map(territory => {
      const startValue = getValue(territory, state.startYear);
      const endValue = getValue(territory, state.endYear);
      const change = calculatePercentageChange(startValue, endValue);

      return {
        territory,
        startValue,
        endValue,
        change,
        absoluteChange: endValue - startValue
      };
    });
  }

  function getValue(territory, year) {
    return state.records
      .filter(record => {
        return (
          record.territory === territory &&
          Number(record.year) === Number(year) &&
          record.crime === state.crime
        );
      })
      .reduce((sum, record) => sum + Number(record[state.metric] || 0), 0);
  }

  function calculateNationalAverage(data) {
    const validChanges = data
      .map(item => item.change)
      .filter(value => Number.isFinite(value));

    if (!validChanges.length) {
      return null;
    }

    return validChanges.reduce((sum, value) => sum + value, 0) / validChanges.length;
  }

  function calculateNationalAggregate() {
    const startTotal = state.data.reduce((sum, item) => sum + item.startValue, 0);
    const endTotal = state.data.reduce((sum, item) => sum + item.endValue, 0);

    return calculatePercentageChange(startTotal, endTotal);
  }

  function renderMap() {
    const dataByTerritory = new Map(state.data.map(item => [item.territory, item]));
    const maxRise = Math.max(...state.data.map(item => Number(item.change) > 0 ? item.change : 0), 1);
    const maxFall = Math.max(...state.data.map(item => Number(item.change) < 0 ? Math.abs(item.change) : 0), 1);

    document.querySelectorAll(".heat-region").forEach(region => {
      const territory = region.dataset.territory;
      const item = dataByTerritory.get(territory);
      const shapes = region.querySelectorAll(".heat-region-shape");
      const label = region.querySelector(".heat-map-label");
      const title = region.querySelector("title");
      const selected = territory === state.selectedTerritory;
      const color = item ? getColorForChange(item.change, maxRise, maxFall) : colors.noData;

      shapes.forEach(shape => {
        shape.style.fill = color;
      });

      region.classList.toggle("selected", selected);
      region.setAttribute("aria-pressed", selected ? "true" : "false");

      if (label) {
        label.style.fill = shouldUseLightText(color) ? "#ffffff" : "#0f172a";
      }

      if (title && item) {
        title.textContent = `${territory}: ${formatPercentage(item.change)} entre ${state.startYear} y ${state.endYear}`;
      }
    });
  }

  function getColorForChange(change, maxRise, maxFall) {
    if (!Number.isFinite(change)) {
      return colors.noData;
    }

    if (Math.abs(change) < 0.05) {
      return colors.flat;
    }

    if (change > 0) {
      const ratio = clamp(change / maxRise, 0.18, 1);
      return mixRgb(colors.riseLow, colors.riseHigh, ratio);
    }

    const ratio = clamp(Math.abs(change) / maxFall, 0.18, 1);
    return mixRgb(colors.fallLow, colors.fallHigh, ratio);
  }

  function renderSummary() {
    const box = getEl("heatSummary");

    if (!box) {
      return;
    }

    const rising = state.data.filter(item => Number(item.change) > 0).length;
    const falling = state.data.filter(item => Number(item.change) < 0).length;
    const top = [...state.data]
      .filter(item => Number.isFinite(item.change))
      .sort((a, b) => b.change - a.change)[0];

    box.innerHTML = `
      <div class="heat-stat-grid">
        <div>
          <span>Periodo</span>
          <strong>${state.startYear}-${state.endYear}</strong>
        </div>

        <div>
          <span>Media nacional</span>
          <strong>${formatPercentage(state.nationalAverage)}</strong>
        </div>

        <div>
          <span>Total agregado</span>
          <strong>${formatPercentage(state.nationalAggregate)}</strong>
        </div>
      </div>

      <p>
        Para <strong>${escapeHtml(state.crime)}</strong>, ${rising} territorios suben y ${falling} bajan en la métrica
        <strong>${escapeHtml(getMetricLabel().toLowerCase())}</strong>. La comunidad con mayor crecimiento es
        <strong>${top ? escapeHtml(top.territory) : "n/a"}</strong>, con ${top ? formatPercentage(top.change) : "n/a"}.
      </p>
    `;
  }

  function renderSelectedBox() {
    const box = getEl("heatSelectedBox");

    if (!box) {
      return;
    }

    const selected = state.data.find(item => item.territory === state.selectedTerritory);

    if (!selected) {
      box.innerHTML = "";
      return;
    }

    const diff = Number.isFinite(selected.change) && Number.isFinite(state.nationalAverage)
      ? selected.change - state.nationalAverage
      : null;

    const direction = selected.change > 0
      ? "ha subido"
      : selected.change < 0
        ? "ha bajado"
        : "se mantiene estable";

    box.innerHTML = `
      <div class="heat-selected-title">
        <span>Territorio seleccionado</span>
        <strong>${escapeHtml(selected.territory)}</strong>
      </div>

      <div class="heat-selected-metrics">
        <div>
          <span>${state.startYear}</span>
          <strong>${formatNumber(selected.startValue)}</strong>
        </div>

        <div>
          <span>${state.endYear}</span>
          <strong>${formatNumber(selected.endValue)}</strong>
        </div>

        <div>
          <span>Variación</span>
          <strong>${formatPercentageWithBadge(selected.change)}</strong>
        </div>
      </div>

      <p>
        En <strong>${escapeHtml(selected.territory)}</strong>, el delito seleccionado ${direction} entre
        <strong>${state.startYear}</strong> y <strong>${state.endYear}</strong>.
        La diferencia frente a la media nacional es ${formatPoints(diff)}.
      </p>
    `;
  }

  function renderTopList() {
    const box = getEl("heatTopList");

    if (!box) {
      return;
    }

    const topItems = [...state.data]
      .filter(item => Number.isFinite(item.change))
      .sort((a, b) => b.change - a.change)
      .slice(0, 6);

    box.innerHTML = topItems.map((item, index) => {
      const width = Math.max(Math.min(Math.abs(item.change), 100), 4);

      return `
        <button class="heat-top-item ${getTrendClass(item.change)}" type="button" data-territory="${escapeHtml(item.territory)}">
          <span class="heat-top-rank">${index + 1}</span>
          <span class="heat-top-name">${escapeHtml(item.territory)}</span>
          <strong>${formatPercentage(item.change)}</strong>
          <span class="heat-top-track">
            <span class="heat-top-fill" style="width: ${width}%"></span>
          </span>
        </button>
      `;
    }).join("");

    box.querySelectorAll(".heat-top-item").forEach(button => {
      button.addEventListener("click", () => {
        selectTerritory(button.dataset.territory);
      });
    });
  }

  function renderTable() {
    const tbody = getEl("heatTableBody");

    if (!tbody) {
      return;
    }

    tbody.innerHTML = [...state.data]
      .sort((a, b) => b.change - a.change)
      .map(item => {
        const diff = Number.isFinite(item.change) && Number.isFinite(state.nationalAverage)
          ? item.change - state.nationalAverage
          : null;

        const selectedClass = item.territory === state.selectedTerritory ? "selected-row" : "";

        return `
          <tr class="${selectedClass}" data-territory="${escapeHtml(item.territory)}">
            <td>${escapeHtml(item.territory)}</td>
            <td>${formatNumber(item.startValue)}</td>
            <td>${formatNumber(item.endValue)}</td>
            <td>${formatPercentageWithBadge(item.change)}</td>
            <td>${formatPoints(diff)}</td>
          </tr>
        `;
      }).join("");

    tbody.querySelectorAll("tr").forEach(row => {
      row.addEventListener("click", () => {
        selectTerritory(row.dataset.territory);
      });
    });
  }

  function selectTerritory(territory) {
    if (!territory) {
      return;
    }

    state.selectedTerritory = territory;
    renderMap();
    renderSelectedBox();
    renderTable();
  }

  function normalizeRecords(payload) {
    return unwrapArray(payload)
      .map(normalizeRecord)
      .filter(record => {
        return (
          record.territory &&
          record.crime &&
          Number.isFinite(record.year) &&
          Number.isFinite(record.count)
        );
      });
  }

  function normalizeRecord(row) {
    return {
      territory: cleanText(pick(row, [
        "territory",
        "Territory",
        "territorio",
        "Territorio",
        "ccaa",
        "CCAA",
        "comunidad",
        "Comunidad"
      ])),
      year: parseFlexibleNumber(pick(row, [
        "year",
        "Year",
        "año",
        "Año",
        "anio",
        "Anio"
      ])),
      crime: cleanText(pick(row, [
        "crime",
        "Crime",
        "delito",
        "Delito",
        "category",
        "Category",
        "categoria",
        "Categoría"
      ])),
      count: parseFlexibleNumber(pick(row, [
        "count",
        "Count",
        "casos",
        "Casos",
        "hechos",
        "Hechos",
        "value",
        "Value"
      ])),
      weighted_score: parseFlexibleNumber(pick(row, [
        "weighted_score",
        "weightedScore",
        "Weighted_score",
        "WeightedScore",
        "puntuacion_ponderada",
        "Puntuación ponderada",
        "score",
        "Score"
      ]))
    };
  }

  function unwrapArray(payload) {
    if (Array.isArray(payload)) {
      return payload;
    }

    if (!payload || typeof payload !== "object") {
      return [];
    }

    for (const key of ["records", "data", "rows", "items", "values"]) {
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
      if (Object.prototype.hasOwnProperty.call(object, key)) {
        return object[key];
      }
    }

    return undefined;
  }

  function cleanText(value) {
    return String(value === null || value === undefined ? "" : value).trim();
  }

  function parseFlexibleNumber(value) {
    if (value === null || value === undefined || value === "") {
      return 0;
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    const text = String(value)
      .trim()
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");

    const number = Number(text);

    return Number.isFinite(number) ? number : 0;
  }

  function calculatePercentageChange(previous, current) {
    if (previous === null || previous === undefined || previous === 0) {
      return null;
    }

    return ((current - previous) / previous) * 100;
  }

  function getMetricLabel() {
    return state.metric === "weighted_score"
      ? "Puntuación ponderada"
      : "Casos registrados";
  }

  function getTrendClass(value) {
    if (value > 0) {
      return "is-rise";
    }

    if (value < 0) {
      return "is-fall";
    }

    return "is-flat";
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

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function mixRgb(start, end, ratio) {
    const values = start.map((channel, index) => {
      return Math.round(channel + ((end[index] - channel) * ratio));
    });

    return `rgb(${values[0]}, ${values[1]}, ${values[2]})`;
  }

  function shouldUseLightText(color) {
    const match = color.match(/\d+/g);

    if (!match || match.length < 3) {
      return false;
    }

    const [red, green, blue] = match.map(Number);
    const luminance = (0.299 * red) + (0.587 * green) + (0.114 * blue);

    return luminance < 130;
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

  function formatPoints(value) {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return "n/a";
    }

    const prefix = value >= 0 ? "+" : "";
    return `${prefix}${value.toFixed(1)} p.p.`;
  }

  function formatNumber(value) {
    return Math.round(Number(value || 0)).toLocaleString("es-ES");
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

  function showFatalError(error) {
    const main = document.querySelector("main");

    if (!main) {
      return;
    }

    main.insertAdjacentHTML("afterbegin", `
      <section class="method-warning">
        <strong>Error cargando el mapa de calor:</strong>
        ${escapeHtml(error.message)}
      </section>
    `);
  }
})();
