const state = {
  data: [],
  filtered: [],
  selectedTags: new Set(),
  search: "",
  sort: "subs-desc",
  history: { series: {} },
  ranks: {},
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
  chartDetails: document.querySelector(".chart-details"),
  chartSummary: document.querySelector(".chart-summary"),
  chartContent: document.querySelector(".modal-chart"),
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
  const series = state.history.series ? state.history.series[channelId] : null;
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
    button.dataset.tag = tag;
    
    // Initial active state
    if (tag === "all") {
      if (state.selectedTags.size === 0) {
        button.classList.add("active");
      }
    } else {
      if (state.selectedTags.has(tag)) {
        button.classList.add("active");
      }
    }

    button.addEventListener("click", () => {
      // Toggle logic
      if (tag === "all") {
        state.selectedTags.clear();
      } else {
        if (state.selectedTags.has(tag)) {
          state.selectedTags.delete(tag);
        } else {
          state.selectedTags.add(tag);
        }
      }

      // Update UI classes
      Array.from(elements.tagFilter.children).forEach((btn) => {
        const btnTag = btn.dataset.tag;
        if (btnTag === "all") {
          btn.classList.toggle("active", state.selectedTags.size === 0);
        } else {
          btn.classList.toggle("active", state.selectedTags.has(btnTag));
        }
      });

      applyFilters();
    });
    elements.tagFilter.appendChild(button);
  });
};

const applyFilters = () => {
  const search = normalize(state.search);
  const selectedTags = state.selectedTags;

  const filtered = state.data.filter((item) => {
    const subscriberCount = getLatestSubsForItem(item);
    if (subscriberCount <= 10000) {
      return false;
    }

    let matchesTag = true;
    if (selectedTags.size > 0) {
      // OR condition: item has ANY of the selected tags
      const itemTags = item["タグ"] || [];
      matchesTag = itemTags.some((t) => selectedTags.has(t));
    }

    const target = [
      item["データ名"],
      item["よみがな"],
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

  const fragment = document.createDocumentFragment();

  // Determine if we need to show rank
  // Only show if sort is subs-desc AND no tag filtering, or maybe just purely based on sort?
  // The user said "When sorted by subscriber count".
  // Note: state.filtered is already sorted.
  const isRankMode = state.sort === "subs-desc";

  state.filtered.forEach((item, index) => {
    const node = elements.template.content.cloneNode(true);
    const card = node.querySelector(".card");
    const img = node.querySelector(".avatar");
    const name = node.querySelector(".name");
    const subs = node.querySelector(".subs");
    const tags = node.querySelector(".tags");

    img.src = item["アイコンの画像URL"] || fallbackImage;
    img.alt = `${item["データ名"]} のアイコン`;
    img.addEventListener("error", () => {
      img.src = fallbackImage;
    });

    const displayName = item["データ名"] || "名称未設定";
    const channelId = getChannelId(item["URL"]);
    
    if (isRankMode) {
      let diffHtml = "";
      if (channelId && state.ranks[channelId] !== undefined) {
        const diff = state.ranks[channelId];
        if (diff === "new") {
           diffHtml = `<span class="rank-diff rank-new">NEW</span>`;
        } else if (diff > 0) {
          diffHtml = `<span class="rank-diff rank-up" aria-label="ランクアップ">↑</span>`;
        } else if (diff < 0) {
          diffHtml = `<span class="rank-diff rank-down" aria-label="ランクダウン">↓</span>`;
        } else {
          diffHtml = `<span class="rank-diff rank-stay" aria-label="変動なし">-</span>`;
        }
      }
      name.innerHTML = `<span class="rank-number">${index + 1}</span>${displayName} ${diffHtml}`;
    } else {
      name.textContent = displayName;
    }

    const latestSubs = getLatestSubsForItem(item);
    subs.textContent = `登録者数: ${formatSubs.format(latestSubs)}`;

    (item["タグ"] || []).forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.textContent = tag;
      tags.appendChild(chip);
    });

    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.addEventListener("click", () => openModal(item, index));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openModal(item, index);
      }
    });

    fragment.appendChild(node);
  });
  elements.grid.appendChild(fragment);
};

const openModal = (item, rankIndex) => {
  state.activeItem = item;
  elements.modalIcon.src = item["アイコンの画像URL"] || fallbackImage;
  elements.modalIcon.alt = `${item["データ名"]} のアイコン`;
  elements.modalIcon.addEventListener("error", () => {
    elements.modalIcon.src = fallbackImage;
  });

  const displayName = item["データ名"] || "名称未設定";
  const channelId = getChannelId(item["URL"]);

  if (state.sort === "subs-desc" && typeof rankIndex === "number") {
    let diffHtml = "";
    if (channelId && state.ranks[channelId] !== undefined) {
      const diff = state.ranks[channelId];
      if (diff === "new") {
          diffHtml = `<span class="rank-diff rank-new">NEW</span>`;
      } else if (diff > 0) {
        // More descriptive text for modal
        diffHtml = `<span class="rank-diff rank-up">↑ (${diff}UP)</span>`;
      } else if (diff < 0) {
        diffHtml = `<span class="rank-diff rank-down">↓ (${Math.abs(diff)}DOWN)</span>`;
      } else {
        diffHtml = `<span class="rank-diff rank-stay">-</span>`;
      }
    }
    elements.modalName.innerHTML = `<span class="rank-number">${rankIndex + 1}</span>${displayName} <span style="font-size: 0.8em; font-weight: normal;">${diffHtml}</span>`;
  } else {
    elements.modalName.textContent = displayName;
  }

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
  const series = channelId && state.history.series
    ? state.history.series[channelId]
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
  const rawRange = Math.max(max - min, 10000);
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

  const xLabelIndices = [0, sorted.length - 1]
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
    ${xAxisLabels}
    ${yAxisLabels}
    <polyline
      fill="none"
      stroke="#1f9c9a"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      points="${points.join(" ")}"
      style="pointer-events: none;"
    />
    ${dots}
  `;

  const formatDateForRange = (dateStr) => {
    const [y, m, d] = dateStr.split("-");
    return `${Number(y)}/${Number(m)}/${Number(d)}`;
  };

  elements.historyChart.style.display = "block";
  elements.historyEmpty.hidden = true;
  elements.historyRange.textContent = `${formatDateForRange(
    sorted[0].date
  )} - ${formatDateForRange(sorted[sorted.length - 1].date)}`;
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

const init = async () => {
  try {
    const response = await fetch("./data.json");
    const payload = await response.json();
    state.data = payload.channels || [];
    state.filtered = [...state.data];

    try {
      const historyResponse = await fetch("./history.json");
      if (historyResponse.ok) {
        const data = await historyResponse.json();
        if (data && data.series) {
          state.history = data;
        }
      }
    } catch (error) {
      console.warn("Failed to load history:", error);
    }

    try {
      const rankResponse = await fetch("./rank-diff.json");
      if (rankResponse.ok) {
        state.ranks = await rankResponse.json();
      }
    } catch (error) {
      console.warn("Failed to load rank diffs:", error);
    }

    renderTags(buildTags(state.data));

    elements.search.addEventListener("input", (event) => {
      state.search = event.target.value;
      applyFilters();
    });

    elements.sort.addEventListener("change", (event) => {
      state.sort = event.target.value;
      event.target.blur(); // Remove focus to improve UX for the rotated icon style
      applyFilters();
    });

    elements.modal.addEventListener("click", (event) => {
      if (event.target.dataset.close === "true") {
        closeModal();
      }
    });

    if (elements.chartSummary) {
      elements.chartSummary.addEventListener("click", (e) => {
        e.preventDefault();
        const details = elements.chartDetails;
        const content = elements.chartContent;
        if (!details || !content) return;

        if (details.open) {
          // Closing
          const startHeight = content.offsetHeight;
          content.style.height = `${startHeight}px`;
          content.style.overflow = "hidden";
          
          requestAnimationFrame(() => {
            content.style.transition = "all 0.3s ease-out";
            content.style.height = "0px";
            content.style.opacity = "0";
            content.style.paddingTop = "0px";
            content.style.paddingBottom = "0px";
            content.style.borderTopWidth = "0px";
            content.style.borderBottomWidth = "0px";
            content.style.marginTop = "0px";
            content.style.marginBottom = "0px";
          });

          content.addEventListener("transitionend", function handler() {
            details.removeAttribute("open");
            content.style.height = "";
            content.style.opacity = "";
            content.style.transition = "";
            content.style.overflow = "";
            content.style.paddingTop = "";
            content.style.paddingBottom = "";
            content.style.borderTopWidth = "";
            content.style.borderBottomWidth = "";
            content.style.marginTop = "";
            content.style.marginBottom = "";
            content.removeEventListener("transitionend", handler);
          }, { once: true });
        } else {
          // Opening
          details.setAttribute("open", "");
          const endHeight = content.offsetHeight;
          
          content.style.height = "0px";
          content.style.opacity = "0";
          content.style.paddingTop = "0px";
          content.style.paddingBottom = "0px";
          content.style.borderTopWidth = "0px";
          content.style.borderBottomWidth = "0px";
          content.style.marginTop = "0px";
          content.style.marginBottom = "0px";
          content.style.overflow = "hidden";
          content.style.transition = "all 0.3s ease-out";

          requestAnimationFrame(() => {
            content.style.height = `${endHeight}px`;
            content.style.opacity = "1";
            content.style.paddingTop = "";
            content.style.paddingBottom = "";
            content.style.borderTopWidth = "";
            content.style.borderBottomWidth = "";
            content.style.marginTop = "";
            content.style.marginBottom = "";
          });

          content.addEventListener("transitionend", function handler() {
            content.style.height = "";
            content.style.opacity = "";
            content.style.transition = "";
            content.style.overflow = "";
            content.style.paddingTop = "";
            content.style.paddingBottom = "";
            content.style.borderTopWidth = "";
            content.style.borderBottomWidth = "";
            content.style.marginTop = "";
            content.style.marginBottom = "";
            content.removeEventListener("transitionend", handler);
          }, { once: true });
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
