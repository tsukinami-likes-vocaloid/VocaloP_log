const state = {
  data: [],
  filtered: [],
  tag: "all",
  search: "",
  sort: "subs-desc",
};

const fallbackImage =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><rect width='100%' height='100%' fill='%23f2f2f2'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='16' fill='%23777'>No%20Image</text></svg>";

const elements = {
  total: document.getElementById("stat-total"),
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
  elements.summary.textContent =
    total === state.data.length
      ? `全${total}件を表示中`
      : `${state.data.length}件中 ${total}件を表示中`;

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

  elements.modal.hidden = false;
  document.body.style.overflow = "hidden";
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

    elements.total.textContent = formatSubs.format(state.data.length);
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
