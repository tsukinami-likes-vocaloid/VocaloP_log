const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const archivePath = path.join(root, "Archive.csv");
const dataPath = path.join(root, "data.json");
const historyPath = path.join(root, "history.json");

const csvText = fs.readFileSync(archivePath, "utf8");
const rows = csvText
  .split(/\r?\n/)
  .map((line) => line.trimEnd())
  .filter((line) => line.length > 0);

if (rows.length === 0) {
  throw new Error("Archive.csv is empty.");
}

const header = rows[0].split(",");
const rawDates = header.slice(1).map((value) => value.trim());
const dates = rawDates.map((dateValue) => dateValue.replace(/\//g, "-"));

const maxDate = dates.reduce((latest, value) => (value > latest ? value : latest), "");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const channels = Array.isArray(data.channels) ? data.channels : [];

const nameToChannelId = new Map();
const channelIds = [];

channels.forEach((channel) => {
  const name = String(channel["データ名"] || "").trim();
  const url = channel["URL"] || "";
  const match = url.match(/\/channel\/([^/]+)/);
  const channelId = match ? match[1] : null;

  if (channelId) {
    channelIds.push(channelId);
  }

  if (name && channelId && !nameToChannelId.has(name)) {
    nameToChannelId.set(name, channelId);
  }
});

const series = {};
const usedNames = new Set();

for (let i = 1; i < rows.length; i += 1) {
  const row = rows[i].split(",");
  const name = (row[0] || "").trim();

  if (!name || usedNames.has(name)) {
    continue;
  }

  const channelId = nameToChannelId.get(name);
  if (!channelId) {
    continue;
  }

  const entries = [];
  for (let j = 0; j < dates.length; j += 1) {
    const value = row[j + 1];
    if (value === undefined || value === "") {
      continue;
    }
    const subs = Number(value);
    if (!Number.isFinite(subs)) {
      continue;
    }
    entries.push({
      date: dates[j],
      subs: Math.round(subs),
    });
  }

  series[channelId] = entries;
  usedNames.add(name);
}

channelIds.forEach((channelId) => {
  if (!Object.prototype.hasOwnProperty.call(series, channelId)) {
    series[channelId] = [];
  }
});

const historyPayload = {
  updatedAt: maxDate || new Date().toISOString().slice(0, 10),
  series,
};

fs.writeFileSync(historyPath, JSON.stringify(historyPayload, null, "\t") + "\n", "utf8");
console.log("Updated history.json from Archive.csv");
