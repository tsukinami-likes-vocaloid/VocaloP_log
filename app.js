const state = {
  data: [],
  filtered: [],
  tag: "all",
  search: "",
  sort: "subs-desc",
  historySource: "history.json",
  historySources: {},
  activeItem: null,
};

const fallbackImage =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='100%' height='100%' fill='%23f2f2f2'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='16' fill='%23777'>No%20Image</text></svg>";

const elements = {
  grid: document.getElementById("grid"),
  empty: document.getElementById("empty"),
  search: document.getElementById("search-input"),
  sort: document.getElementById("sort-select"),
  tagFilter: document.getElementById("tag-filter"),
  summary: document.getElementById("summary-text"),
  template: document.getElementById("card-template"),
  modal: document.getElementById("detail-modal"),
  modalIcon: document.getElementById("detail-icon"),
  modalName: document.getElementById("detail-name"),
  modalReading: document.getElementById("detail-reading"),
  modalSubs: document.getElementById("detail-subs"),
  modalTags: document.getElementById("detail-tags"),
  modalDesc: document.getElementById("detail-desc"),
  modalLink: document.getElementById("detail-link"),
  historyRange: document.getElementById("detail-history-range"),
  historyChart: document.getElementById("detail-chart"),
  historyEmpty: document.getElementById("detail-history-empty"),
  historyTooltip: document.getElementById("detail-history-tooltip"),
  historyToggle: document.getElementById("history-source-toggle"),
};

const formatSubs = new Intl.NumberFormat("ja-JP");

const normalize = (value) =>
  (value || "")
    .toString()
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "");

const nameCollator = new Intl.Collator("ja", {
  numeric: true,
  sensitivity: "base",
  ignorePunctuation: true,
});

const getNameSortKey = (item) => {
  const primary = item["よみがな"] || item["データ名"] || "";
  return primary.toString().replace(/[\s\u3000]+/g, "");
};

const getChannelId = (url) => {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const channelIndex = parts.indexOf("channel");
    if (channelIndex !== -1 && parts[channelIndex + 1]) {
      return parts[channelIndex + 1];
    }
  } catch (error) {
    return null;
  }

  return null;
};

const getHistoryPayloadForSubs = () =>
  state.historySources["history.json"] ||
  state.historySources[state.historySource] ||
  { series: {} };

const getLatestSubsFromSeries = (series) => {
  if (!Array.isArray(series) || series.length === 0) {
    return 0;
  }

  const latest = series.reduce((best, entry) => {
    if (!entry || !entry.date) {
      return best;
    }
    if (!best || entry.date > best.date) {
      return entry;
    }
    return best;
  }, null);

  return latest && Number.isFinite(Number(latest.subs))
    ? Number(latest.subs)
    : 0;
};

const getLatestSubsForItem = (item) => {
  const channelId = getChannelId(item["URL"]);
  if (!channelId) {
    return 0;
  }
  const historyPayload = getHistoryPayloadForSubs();
  const series = historyPayload.series ? historyPayload.series[channelId] : null;
  return getLatestSubsFromSeries(series);
};

const sorters = {
  "subs-desc": (a, b) => getLatestSubsForItem(b) - getLatestSubsForItem(a),
  "subs-asc": (a, b) => getLatestSubsForItem(a) - getLatestSubsForItem(b),
  "name-asc": (a, b) =>
    nameCollator.compare(getNameSortKey(a), getNameSortKey(b)),
};

const buildTags = (items) => {
  const tags = new Set();
  items.forEach((item) => (item["タグ"] || []).forEach((tag) => tags.add(tag)));
  return ["all", ...Array.from(tags)];
};

const renderTags = (tags) => {
  elements.tagFilter.innerHTML = "";
  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = tag === "all" ? "すべて" : tag;
    if (state.tag === tag) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      state.tag = tag;
      applyFilters();
    });
    elements.tagFilter.appendChild(button);
  });
};

const applyFilters = () => {
  const search = normalize(state.search);
  const tag = state.tag;

  const filtered = state.data.filter((item) => {
    const subscriberCount = getLatestSubsForItem(item);
    if (subscriberCount <= 10000) {
      return false;
    }

    const matchesTag =
      tag === "all" || (item["タグ"] || []).some((t) => t === tag);

    const target = [
      item["データ名"],
      item["よみがな"],
      item["説明"],
      ...(item["タグ"] || []),
    ]
      .map(normalize)
      .join(" ");

    const matchesSearch = search === "" || target.includes(search);
    return matchesTag && matchesSearch;
  });

  state.filtered = filtered.sort(sorters[state.sort]);
  render();
};

const render = () => {
  const total = state.filtered.length;
  const eligibleTotal = state.data.filter(
    (item) => getLatestSubsForItem(item) > 10000
  ).length;
  elements.summary.textContent =
    total === eligibleTotal
      ? `全${total}件を表示中`
      : `${eligibleTotal}件中 ${total}件を表示中`;

  elements.grid.innerHTML = "";
  elements.empty.hidden = total !== 0;

  state.filtered.forEach((item) => {
    const node = elements.template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const img = node.querySelector(".avatar");
    const name = node.querySelector(".name");
    const reading = node.querySelector(".reading");
    const subs = node.querySelector(".subs");
    const tags = node.querySelector(".tags");
    const desc = node.querySelector(".desc");
    const link = node.querySelector(".visit");

    img.src = item["アイコンの画像URL"] || fallbackImage;
    img.alt = `${item["データ名"]} のアイコン`;
    img.addEventListener("error", () => {
      img.src = fallbackImage;
    });

    name.textContent = item["データ名"] || "名称未設定";
    reading.textContent = item["よみがな"] ? `よみ: ${item["よみがな"]}` : "";
    const latestSubs = getLatestSubsForItem(item);
    subs.textContent = `登録者数: ${formatSubs.format(latestSubs)}`;

    (item["タグ"] || []).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.textContent = tag;
      tags.appendChild(chip);
    });

    desc.textContent = item["説明"] || "";
    link.href = item["URL"] || "#";

    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.addEventListener("click", () => openModal(item));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(item);
      }
    });

    elements.grid.appendChild(node);
  });
};

const openModal = (item) => {
  state.activeItem = item;
  elements.modalIcon.src = item["アイコンの画像URL"] || fallbackImage;
  elements.modalIcon.alt = `${item["データ名"]} のアイコン`;
  elements.modalIcon.addEventListener("error", () => {
    elements.modalIcon.src = fallbackImage;
  });

  elements.modalName.textContent = item["データ名"] || "名称未設定";
  elements.modalReading.textContent = item["よみがな"]
    ? `よみ: ${item["よみがな"]}`
    : "";
  const latestSubs = getLatestSubsForItem(item);
  elements.modalSubs.textContent = `登録者数: ${formatSubs.format(latestSubs)}`;
  elements.modalTags.innerHTML = "";
  (item["タグ"] || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag";
    chip.textContent = tag;
    elements.modalTags.appendChild(chip);
  });
  elements.modalDesc.textContent = item["説明"] || "";
  elements.modalLink.href = item["URL"] || "#";

  renderHistoryChart(item);

  elements.modal.hidden = false;
  document.body.style.overflow = "hidden";
};

const renderHistoryChart = (item) => {
  const channelId = getChannelId(item["URL"]);
  const historyPayload =
    state.historySources[state.historySource] ||
    state.historySources["history.json"] ||
    { series: {} };
  const series = channelId && historyPayload.series
    ? historyPayload.series[channelId]
    : null;

  if (!series || series.length < 2) {
    elements.historyChart.innerHTML = "";
    elements.historyChart.style.display = "none";
    elements.historyEmpty.hidden = false;
    elements.historyRange.textContent = "";
    return;
  }

  const sorted = [...series].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted.map((entry) => entry.subs);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rawRange = max - min || 1;
  const niceStep = (rangeValue, ticks) => {
    const rough = rangeValue / ticks;
    const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
    const residual = rough / magnitude;
    let nice = 1;
    if (residual >= 5) {
      nice = 5;
    } else if (residual >= 2) {
      nice = 2;
    }
    return nice * magnitude;
  };

  const yTicks = 3;
  const stepValue = niceStep(rawRange, yTicks);
  const niceMin = Math.floor(min / stepValue) * stepValue;
  const niceMax = Math.ceil(max / stepValue) * stepValue;
  const range = niceMax - niceMin || 1;

  const width = 320;
  const height = 120;
  const padding = 16;
  const paddingLeft = 38;
  const minTime = Date.parse(sorted[0].date);
  const maxTime = Date.parse(sorted[sorted.length - 1].date);
  const timeSpan = Math.max(maxTime - minTime, 1);
  const xForIndex = (index) => {
    const time = Date.parse(sorted[index].date);
    const ratio = Number.isFinite(time) ? (time - minTime) / timeSpan : 0;
    return paddingLeft + ratio * (width - paddingLeft - padding);
  };

  const points = sorted.map((entry, index) => {
    const x = xForIndex(index);
    const y =
      height -
      padding -
      ((entry.subs - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const dots = sorted
    .map((entry, index) => {
      const x = xForIndex(index);
      const y =
        height -
        padding -
        ((entry.subs - min) / range) * (height - padding * 2);
      return `<circle
        class="chart-dot"
        cx="${x}"
        cy="${y}"
        r="3"
        fill="#1f9c9a"
        data-date="${entry.date}"
        data-subs="${entry.subs}"
      />`;
    })
    .join("");

  const yStep = (height - padding * 2) / yTicks;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, index) => {
    const y = padding + yStep * index;
    const value = Math.round(niceMax - (range * index) / yTicks);
    return {
      y,
      value,
    };
  });

  const xLabelIndices = [0, Math.floor((sorted.length - 1) / 2), sorted.length - 1]
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a - b);

  let lastYear = null;
    const xLabels = xLabelIndices.map((index) => {
      const xRaw = xForIndex(index);
      const anchor = index === 0 ? "start" : index === sorted.length - 1 ? "end" : "middle";
      const x =
        index === 0
          ? paddingLeft + 2
          : index === sorted.length - 1
            ? width - padding - 2
            : xRaw;
      const date = sorted[index].date;
      const [year, month, day] = date.split("-");
      const monthValue = String(Number(month));
      const dayValue = String(Number(day));
      const showYear = year !== lastYear;
      if (showYear) {
        lastYear = year;
      }
      const label = showYear
        ? `${year}/${monthValue}/${dayValue}`
        : `${monthValue}/${dayValue}`;
      return {
        x,
        label,
        anchor,
      };
    });

  const gridLines = yLabels
    .map((label) => {
      return `<line class="chart-grid-line" x1="${paddingLeft}" y1="${label.y}" x2="${
        width - padding
      }" y2="${label.y}" />`;
    })
    .join("");

  const yAxisLabels = yLabels
    .map((label) => {
      return `<text class="chart-axis-label" x="${paddingLeft - 6}" y="${
        label.y - 2
      }" text-anchor="end">${formatSubs.format(label.value)}</text>`;
    })
    .join("");

  const xAxisLabels = xLabels
    .map((label) => {
      return `<text class="chart-axis-label" x="${label.x}" y="${
        height - 2
      }" text-anchor="${label.anchor}">${label.label}</text>`;
    })
    .join("");

  elements.historyChart.innerHTML = `
    ${gridLines}
    <polyline
      fill="none"
      stroke="#1f9c9a"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      points="${points.join(" ")}"
    />
    ${dots}
    ${yAxisLabels}
    ${xAxisLabels}
  `;

  elements.historyChart.style.display = "block";
  elements.historyEmpty.hidden = true;
  elements.historyRange.textContent = `${sorted[0].date} - ${
    sorted[sorted.length - 1].date
  }`;
  elements.historyTooltip.hidden = true;

  const dotNodes = elements.historyChart.querySelectorAll(".chart-dot");
  dotNodes.forEach((dot) => {
    dot.addEventListener("mouseenter", (event) => {
      const subs = Number(event.target.dataset.subs || 0);
      const date = event.target.dataset.date || "";
      elements.historyTooltip.textContent = `${date} / ${formatSubs.format(subs)}`;
      elements.historyTooltip.hidden = false;
      positionTooltip(event.target);
    });

    dot.addEventListener("mousemove", (event) => {
      positionTooltip(event.target);
    });

    dot.addEventListener("mouseleave", () => {
      elements.historyTooltip.hidden = true;
    });
  });
};

const positionTooltip = (dot) => {
  const svgRect = elements.historyChart.getBoundingClientRect();
  const chartRect = elements.historyChart.parentElement.getBoundingClientRect();
  const cx = Number(dot.getAttribute("cx"));
  const cy = Number(dot.getAttribute("cy"));

  const left = (cx / 320) * svgRect.width + (svgRect.left - chartRect.left);
  const top = (cy / 120) * svgRect.height + (svgRect.top - chartRect.top);

  elements.historyTooltip.style.left = `${left}px`;
  elements.historyTooltip.style.top = `${top}px`;
};

const closeModal = () => {
  elements.modal.hidden = true;
  document.body.style.overflow = "";
  state.activeItem = null;
};

const updateHistoryToggleUI = () => {
  const toggleButtons = elements.historyToggle
    ? Array.from(elements.historyToggle.querySelectorAll("button"))
    : [];
  if (!toggleButtons.length) {
    return;
  }

  const sources = Object.keys(state.historySources);
  const hasRaw = sources.includes("history.json");
  const hasCompacted = sources.includes("history.compacted.json");

  toggleButtons.forEach((button) => {
    const source = button.dataset.source;
    const isAvailable =
      source === "history.json" ? hasRaw : source === "history.compacted.json" ? hasCompacted : false;
    button.disabled = !isAvailable;
    button.classList.toggle("active", state.historySource === source);
  });
};

const init = async () => {
  try {
    const response = await fetch("./data.json");
    const payload = await response.json();
    state.data = payload.channels || [];
    state.filtered = [...state.data];

    try {
      const historyFiles = ["history.json", "history.compacted.json"];
      const historyResults = await Promise.all(
        historyFiles.map(async (file) => {
          try {
            const historyResponse = await fetch(`./${file}`);
            if (!historyResponse.ok) {
              return { file, data: null };
            }
            return { file, data: await historyResponse.json() };
          } catch (error) {
            return { file, data: null };
          }
        })
      );

      historyResults.forEach(({ file, data }) => {
        if (data && data.series) {
          state.historySources[file] = data;
        }
      });

      if (!state.historySources["history.json"]) {
        const availableSource = Object.keys(state.historySources)[0];
        if (availableSource) {
          state.historySource = availableSource;
        }
      }
    } catch (error) {
      state.historySources = {};
    }

    updateHistoryToggleUI();

    renderTags(buildTags(state.data));

    elements.search.addEventListener("input", (event) => {
      state.search = event.target.value;
      applyFilters();
    });

    elements.sort.addEventListener("change", (event) => {
      state.sort = event.target.value;
      applyFilters();
    });

    elements.modal.addEventListener("click", (event) => {
      if (event.target.dataset.close === "true") {
        closeModal();
      }
    });

    if (elements.historyToggle) {
      elements.historyToggle.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button || button.disabled) {
          return;
        }
        const source = button.dataset.source;
        if (!source || source === state.historySource) {
          return;
        }
        state.historySource = source;
        updateHistoryToggleUI();
        if (state.activeItem && !elements.modal.hidden) {
          renderHistoryChart(state.activeItem);
        }
      });
    }

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.modal.hidden) {
        closeModal();
      }
    });

    applyFilters();
  } catch (error) {
    elements.summary.textContent = "データの読み込みに失敗しました。";
    elements.empty.hidden = false;
  }
};

init();
