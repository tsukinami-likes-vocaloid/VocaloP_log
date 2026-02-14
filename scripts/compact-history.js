const fs = require("fs/promises");
const path = require("path");

const HISTORY_PATH = path.join(__dirname, "..", "history.json");
const OUTPUT_PATH = path.join(__dirname, "..", "history.json");

const parseDate = (value) => new Date(`${value}T00:00:00Z`);

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
};

const cleanFlag = (entry) => {
  const { _isSig, ...rest } = entry;
  return rest;
};

const compactSeries = (entries, cutoff1Month, cutoff1Year) => {
  if (!entries || entries.length === 0) {
    return [];
  }

  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

  // 1. 直近1ヶ月はそのまま残す
  const rawRecent = sorted.filter((entry) => parseDate(entry.date) >= cutoff1Month);
  const rawOlder = sorted.filter((entry) => parseDate(entry.date) < cutoff1Month);

  if (rawOlder.length === 0) {
    return rawRecent;
  }

  // --- Phase 1: 1ヶ月以上前の処理 ---
  // Step A: "まびいていない状態で全体を見る" -> 変動（2%）による重要点を特定
  const significantIndices = new Set();
  significantIndices.add(0); // 最初は必須
  significantIndices.add(rawOlder.length - 1); // 最後は必須

  let lastSigIndex = 0;
  for (let i = 1; i < rawOlder.length; i += 1) {
    const lastVal = rawOlder[lastSigIndex].subs;
    const currentVal = rawOlder[i].subs;
    // 変動閾値: 2%
    const threshold = Math.abs(lastVal) * 0.02;

    // 変動が大きい場合、重要点としてマーク
    if (Math.abs(currentVal - lastVal) >= threshold) {
      significantIndices.add(i);
      lastSigIndex = i;
    }
  }

  // Step B: "残さない点にだけ注目し、期間に応じてまびく" (30日)
  const stage1 = [];
  let lastKeptDate = null;

  for (let i = 0; i < rawOlder.length; i += 1) {
    const entry = rawOlder[i];
    const isSignificant = significantIndices.has(i);
    let shouldKeep = false;

    if (isSignificant) {
      shouldKeep = true;
    } else {
      // 重要点でない場合、前回残した点から30日経過しているか
      if (lastKeptDate) {
        const currentDate = parseDate(entry.date);
        const diffDays = (currentDate - lastKeptDate) / (1000 * 60 * 60 * 24);
        if (diffDays >= 30) {
          shouldKeep = true;
        }
      }
    }

    if (shouldKeep) {
      // 後続処理のためにフラグ付きオブジェクトで保存
      stage1.push({ ...entry, _isSig: isSignificant });
      lastKeptDate = parseDate(entry.date);
    }
  }

  // --- Phase 2: 1年以上前の処理 ---
  const stage1Recent = stage1.filter((entry) => parseDate(entry.date) >= cutoff1Year);
  const stage1Older = stage1.filter((entry) => parseDate(entry.date) < cutoff1Year);

  if (stage1Older.length === 0) {
    return [...stage1.map(cleanFlag), ...rawRecent];
  }

  // Step C: "～1年の点"の処理
  // 重要点（急増点）は全て残す。それ以外（期間埋め点）は60日に間引く。
  const stage2 = [];
  let lastKeptDate2 = null;

  for (let i = 0; i < stage1Older.length; i += 1) {
    const entry = stage1Older[i];
    const isSignificant = entry._isSig; // Phase 1で判定された重要性
    let shouldKeep = false;

    if (isSignificant) {
      // Phase 1で「重要」と判定された点は無条件に残す（間隔が30日未満でも残る）
      shouldKeep = true;
    } else {
      // 期間埋めの点なら60日ルール適用
      if (lastKeptDate2) {
        const currentDate = parseDate(entry.date);
        const diffDays = (currentDate - lastKeptDate2) / (1000 * 60 * 60 * 24);
        if (diffDays >= 60) {
          shouldKeep = true;
        }
      } else {
        shouldKeep = true; // 先頭
      }
    }

    if (shouldKeep) {
      stage2.push(entry);
      lastKeptDate2 = parseDate(entry.date);
    }
  }

  // 結合してフラグ除去
  const result = [...stage2, ...stage1Recent].map(cleanFlag);
  return [...result, ...rawRecent];
};

const run = async () => {
  const raw = await fs.readFile(HISTORY_PATH, "utf8");
  const history = JSON.parse(raw);

  const today = process.env.COMPACT_TODAY || history.updatedAt;
  if (!today) {
    throw new Error("COMPACT_TODAY or history.updatedAt is required.");
  }

  const cutoff1Month = addMonths(parseDate(today), -1);
  const cutoff1Year = addMonths(parseDate(today), -12);

  const series = history.series || {};
  const result = { updatedAt: today, series: {} };

  let beforeTotal = 0;
  let afterTotal = 0;
  let changedChannels = 0;

  Object.entries(series).forEach(([channelId, entries]) => {
    const compacted = compactSeries(entries, cutoff1Month, cutoff1Year);
    result.series[channelId] = compacted;

    beforeTotal += entries.length;
    afterTotal += compacted.length;

    if (entries.length !== compacted.length) {
      changedChannels += 1;
    }
  });

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, "\t")}\n`, "utf8");

  console.log("Compaction test complete.");
  console.log(`Date Reference: ${today}`);
  console.log(`Cutoff (1 Month): ${cutoff1Month.toISOString().slice(0, 10)}`);
  console.log(`Cutoff (1 Year) : ${cutoff1Year.toISOString().slice(0, 10)}`);
  console.log(`Total points: ${beforeTotal} -> ${afterTotal}`);
  console.log(`Channels compacted: ${changedChannels}`);
  console.log(`Output: ${OUTPUT_PATH}`);
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
