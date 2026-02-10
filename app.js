const state = {
  data: [],
  filtered: [],
  tag: "all",
  search: "",
  sort: "subs-desc",
  history: {
    series: {},
  },
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

const sorters = {
  "subs-desc": (a, b) => b["登録者数"] - a["登録者数"],
  "subs-asc": (a, b) => a["登録者数"] - b["登録者数"],
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
    const subscriberCount = Number(item["登録者数"] || 0);
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
    (item) => Number(item["登録者数"] || 0) > 10000
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
    subs.textContent = `登録者数: ${formatSubs.format(item["登録者数"] || 0)}`;

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
  elements.modalIcon.src = item["アイコンの画像URL"] || fallbackImage;
  elements.modalIcon.alt = `${item["データ名"]} のアイコン`;
  elements.modalIcon.addEventListener("error", () => {
    elements.modalIcon.src = fallbackImage;
  });

  elements.modalName.textContent = item["データ名"] || "名称未設定";
  elements.modalReading.textContent = item["よみがな"]
    ? `よみ: ${item["よみがな"]}`
    : "";
  elements.modalSubs.textContent = `登録者数: ${formatSubs.format(
    item["登録者数"] || 0
  )}`;
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
  const range = max - min || 1;

  const width = 320;
  const height = 120;
  const padding = 12;
  const step = (width - padding * 2) / (sorted.length - 1);

  const points = sorted.map((entry, index) => {
    const x = padding + step * index;
    const y =
      height -
      padding -
      ((entry.subs - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const dots = sorted
    .map((entry, index) => {
      const x = padding + step * index;
      const y =
        height -
        padding -
        ((entry.subs - min) / range) * (height - padding * 2);
      return `<circle cx="${x}" cy="${y}" r="2.5" fill="${"#1f9c9a"}" />`;
    })
    .join("");

  elements.historyChart.innerHTML = `
    <polyline
      fill="none"
      stroke="#1f9c9a"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      points="${points.join(" ")}"
    />
    ${dots}
  `;

  elements.historyChart.style.display = "block";
  elements.historyEmpty.hidden = true;
  elements.historyRange.textContent = `${sorted[0].date} - ${
    sorted[sorted.length - 1].date
  }`;
};

const closeModal = () => {
  elements.modal.hidden = true;
  document.body.style.overflow = "";
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
        state.history = await historyResponse.json();
      }
    } catch (error) {
      state.history = { series: {} };
    }

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
