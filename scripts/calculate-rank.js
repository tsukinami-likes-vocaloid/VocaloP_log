const fs = require('fs');
const path = require('path');

const historyPath = path.join(__dirname, '../history.json');
const outputPath = path.join(__dirname, '../rank-diff.json');

try {
  if (!fs.existsSync(historyPath)) {
    console.log('history.json not found. Skipping rank calculation.');
    fs.writeFileSync(outputPath, '{}');
    process.exit(0);
  }

  const history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  const series = history.series || {};

  const currentList = [];
  const prevList = [];

  Object.keys(series).forEach(channelId => {
    const entries = series[channelId];
    if (!entries || !Array.isArray(entries) || entries.length === 0) return;

    // Sort by date explicitly to be safe
    const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));

    // Get the last valid entry
    const current = sorted[sorted.length - 1];
    
    // Get the previous valid entry
    // Note: If running right after an update, the last one is "today".
    // The previous one is the one before that.
    const prev = sorted.length >= 2 ? sorted[sorted.length - 2] : null;

    if (current && typeof current.subs === 'number') {
      currentList.push({ id: channelId, subs: current.subs });
    }
    if (prev && typeof prev.subs === 'number') {
      prevList.push({ id: channelId, subs: prev.subs });
    }
  });

  const getRankMap = (list) => {
    // Sort descending by subs
    // If subs are equal, the sort is unstable, but typically fine for rough ranking.
    // Ideally we should stabilize with ID, but subs is primary.
    list.sort((a, b) => {
      if (b.subs !== a.subs) return b.subs - a.subs;
      return a.id.localeCompare(b.id);
    });
    
    const map = new Map();
    list.forEach((item, index) => {
      map.set(item.id, index + 1);
    });
    return map;
  };

  const currentRanks = getRankMap(currentList);
  const prevRanks = getRankMap(prevList);

  const diffs = {};

  currentRanks.forEach((currentRank, id) => {
    if (prevRanks.has(id)) {
      const prevRank = prevRanks.get(id);
      const diff = prevRank - currentRank;
      // diff > 0: Rank improved (e.g. 2 -> 1, diff = 1)
      // diff < 0: Rank dropped (e.g. 1 -> 2, diff = -1)
      // diff = 0: Same
      diffs[id] = diff;
    } else {
      // New entry
      diffs[id] = 'new';
    }
  });

  fs.writeFileSync(outputPath, JSON.stringify(diffs, null, 2));
  console.log(`Rank diffs generated for ${Object.keys(diffs).length} channels.`);

} catch (error) {
  console.error('Error calculating ranks:', error);
  process.exit(1);
}
