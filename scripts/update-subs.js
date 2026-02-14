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
  endpoint.searchParams.set("part", "statistics,snippet");
  endpoint.searchParams.set("id", ids.join(","));
  endpoint.searchParams.set("key", API_KEY);

  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const payload = await response.json();
  const results = new Map();
  (payload.items || []).forEach((item) => {
    const entry = {};
    if (item.statistics && item.statistics.subscriberCount) {
      entry.subs = Number(item.statistics.subscriberCount);
    }
    if (item.snippet && item.snippet.thumbnails) {
      const thumbs = item.snippet.thumbnails;
      // Prefer high > medium > default
      entry.icon = (thumbs.high || thumbs.medium || thumbs.default || {}).url;
    }
    if (item.id && (entry.subs !== undefined || entry.icon)) {
      results.set(item.id, entry);
    }
  });

  return results;
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

const parseDate = (value) => new Date(`${value}T00:00:00Z`);

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const compactSeries = (entries, cutoffDate) => {
  if (!entries || entries.length === 0) {
    return [];
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const older = sorted.filter((entry) => parseDate(entry.date) < cutoffDate);
  const recent = sorted.filter((entry) => parseDate(entry.date) >= cutoffDate);

  if (older.length <= 2) {
    return [...older, ...recent];
  }

  const compacted = [older[0]];
  for (let i = 1; i < older.length - 1; i += 1) {
    const current = older[i];
    const lastKept = compacted[compacted.length - 1];
    const lastDate = parseDate(lastKept.date);
    const currentDate = parseDate(current.date);
    const daysSinceLast = (currentDate - lastDate) / (1000 * 60 * 60 * 24);
    const dynamicThreshold = Math.abs(lastKept.subs || 0) / 1000;
    if (
      daysSinceLast >= 7 ||
      Math.abs(current.subs - lastKept.subs) >= dynamicThreshold
    ) {
      compacted.push(current);
    }
  }

  const lastOlder = older[older.length - 1];
  if (compacted[compacted.length - 1].date !== lastOlder.date) {
    compacted.push(lastOlder);
  }

  return [...compacted, ...recent];
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
  const cutoffDate = addMonths(parseDate(today), -1);

  const ids = channels
    .map((channel) => parseChannelId(channel.URL))
    .filter(Boolean);
  const uniqueIds = Array.from(new Set(ids));

  const fetchedData = new Map();
  const batches = chunk(uniqueIds, 50);
  for (const batch of batches) {
    const batchResults = await fetchStats(batch);
    batchResults.forEach((value, key) => fetchedData.set(key, value));
  }

  let updated = 0;
  let iconUpdated = 0;

  channels.forEach((channel) => {
    const channelId = parseChannelId(channel.URL);
    if (!channelId) {
      return;
    }
    const result = fetchedData.get(channelId);
    if (!result) {
      return;
    }

    if (result.subs !== undefined) {
      upsertHistory(history.series, channelId, today, result.subs);
      updated += 1;
    }

    if (result.icon) {
      if (channel["アイコンの画像URL"] !== result.icon) {
        channel["アイコンの画像URL"] = result.icon;
        iconUpdated += 1;
      }
    }
  });

  Object.keys(history.series).forEach((channelId) => {
    history.series[channelId] = compactSeries(
      history.series[channelId],
      cutoffDate
    );
  });
  history.updatedAt = today;
  
  const historyOutput = JSON.stringify(history, null, "\t");
  await fs.writeFile(HISTORY_PATH, `${historyOutput}\n`, "utf8");

  // Save updated icons to data.json
  if (iconUpdated > 0) {
    const dataOutput = JSON.stringify(data, null, "\t");
    await fs.writeFile(DATA_PATH, `${dataOutput}\n`, "utf8");
  }

  return { total: channels.length, updated, iconUpdated };
};

updateSubscribers()
  .then((result) => {
    console.log(`Updated stats for ${result.updated} channels.`);
    console.log(`Updated icons for ${result.iconUpdated} channels.`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
