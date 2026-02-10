const fs = require("fs/promises");
const path = require("path");

const DATA_PATH = path.join(__dirname, "..", "data.json");
const HISTORY_PATH = path.join(__dirname, "..", "history.json");
const API_KEY = process.env.YOUTUBE_API_KEY;

const parseChannelId = (url) => {
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

const chunk = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const fetchStats = async (ids) => {
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/channels");
  endpoint.searchParams.set("part", "statistics");
  endpoint.searchParams.set("id", ids.join(","));
  endpoint.searchParams.set("key", API_KEY);

  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const payload = await response.json();
  const statsMap = new Map();
  (payload.items || []).forEach((item) => {
    if (item.id && item.statistics && item.statistics.subscriberCount) {
      statsMap.set(item.id, Number(item.statistics.subscriberCount));
    }
  });

  return statsMap;
};

const loadHistory = async () => {
  try {
    const raw = await fs.readFile(HISTORY_PATH, "utf8");
    const history = JSON.parse(raw);
    return {
      updatedAt: history.updatedAt || null,
      series: history.series || {},
    };
  } catch (error) {
    return { updatedAt: null, series: {} };
  }
};

const upsertHistory = (series, channelId, date, subs) => {
  const list = Array.isArray(series[channelId]) ? series[channelId] : [];
  const existing = list.find((entry) => entry.date === date);
  if (existing) {
    existing.subs = subs;
  } else {
    list.push({ date, subs });
  }
  list.sort((a, b) => a.date.localeCompare(b.date));
  series[channelId] = list;
};

const updateSubscribers = async () => {
  if (!API_KEY) {
    throw new Error("YOUTUBE_API_KEY is not set.");
  }

  const raw = await fs.readFile(DATA_PATH, "utf8");
  const data = JSON.parse(raw);
  const channels = Array.isArray(data.channels) ? data.channels : [];
  const history = await loadHistory();
  const today = new Date().toISOString().slice(0, 10);

  const ids = channels
    .map((channel) => parseChannelId(channel.URL))
    .filter(Boolean);
  const uniqueIds = Array.from(new Set(ids));

  const stats = new Map();
  const batches = chunk(uniqueIds, 50);
  for (const batch of batches) {
    const batchStats = await fetchStats(batch);
    batchStats.forEach((value, key) => stats.set(key, value));
  }

  let updated = 0;
  channels.forEach((channel) => {
    const channelId = parseChannelId(channel.URL);
    if (!channelId) {
      return;
    }
    const subscriberCount = stats.get(channelId);
    if (subscriberCount === undefined) {
      return;
    }

    upsertHistory(history.series, channelId, today, subscriberCount);

    if (channel["登録者数"] !== subscriberCount) {
      channel["登録者数"] = subscriberCount;
      updated += 1;
    }
  });

  const output = JSON.stringify({ channels }, null, "\t");
  await fs.writeFile(DATA_PATH, `${output}\n`, "utf8");
  history.updatedAt = today;
  const historyOutput = JSON.stringify(history, null, "\t");
  await fs.writeFile(HISTORY_PATH, `${historyOutput}\n`, "utf8");

  return { total: channels.length, updated };
};

updateSubscribers()
  .then((result) => {
    console.log(`Updated ${result.updated} / ${result.total} channels.`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
