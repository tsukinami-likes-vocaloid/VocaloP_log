const fs = require("fs/promises");
const path = require("path");

const HISTORY_PATH = path.join(__dirname, "..", "history.json");
const OUTPUT_PATH = path.join(__dirname, "..", "history.compacted.json");

const parseDate = (value) => new Date(`${value}T00:00:00Z`);

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const compactSeries = (entries, cutoffDate, threshold) => {
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
    if (Math.abs(current.subs - lastKept.subs) >= threshold) {
      compacted.push(current);
    }
  }

  const lastOlder = older[older.length - 1];
  if (compacted[compacted.length - 1].date !== lastOlder.date) {
    compacted.push(lastOlder);
  }

  return [...compacted, ...recent];
};

const run = async () => {
  const raw = await fs.readFile(HISTORY_PATH, "utf8");
  const history = JSON.parse(raw);

  const today = process.env.COMPACT_TODAY || history.updatedAt;
  if (!today) {
    throw new Error("COMPACT_TODAY or history.updatedAt is required.");
  }

  const threshold = Number(process.env.COMPACT_THRESHOLD || 1000);
  const cutoffDate = addMonths(parseDate(today), -6);

  const series = history.series || {};
  const result = { updatedAt: today, series: {} };

  let beforeTotal = 0;
  let afterTotal = 0;
  let changedChannels = 0;

  Object.entries(series).forEach(([channelId, entries]) => {
    const compacted = compactSeries(entries, cutoffDate, threshold);
    result.series[channelId] = compacted;

    beforeTotal += entries.length;
    afterTotal += compacted.length;

    if (entries.length !== compacted.length) {
      changedChannels += 1;
    }
  });

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, "\t")}\n`, "utf8");

  console.log("Compaction test complete.");
  console.log(`Date 기준: ${today} (cutoff: ${cutoffDate.toISOString().slice(0, 10)})`);
  console.log(`Threshold: ±${threshold}`);
  console.log(`Total points: ${beforeTotal} -> ${afterTotal}`);
  console.log(`Channels compacted: ${changedChannels}`);
  console.log(`Output: ${OUTPUT_PATH}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
