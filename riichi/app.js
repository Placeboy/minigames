// ── Riichi Mahjong Hand Practice ──────────────────────────────────────────────
// Simplified single-player trainer: draw/discard through a wall, detect tenpai
// and winning hands under basic riichi rules (4 mentsu + 1 jantai, or special).

"use strict";

// ── Tile definitions ─────────────────────────────────────────────────────────

const SUITS = ["man", "pin", "sou"];
const HONORS = ["ton", "nan", "sha", "pei", "haku", "hatsu", "chun"];

// Display characters for tiles
const TILE_LABELS = {
  man: ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"],
  pin: ["", "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"],
  sou: ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
  ton: "東", nan: "南", sha: "西", pei: "北",
  haku: "白", hatsu: "發", chun: "中",
};

const SUIT_NAMES = { man: "萬", pin: "筒", sou: "索" };

function tileId(suit, num) {
  return num !== undefined ? `${suit}${num}` : suit;
}

function parseTile(id) {
  for (const s of SUITS) {
    if (id.startsWith(s)) return { suit: s, num: parseInt(id.slice(s.length), 10) };
  }
  return { suit: id, num: 0 }; // honor
}

function tileLabel(id) {
  const t = parseTile(id);
  if (SUITS.includes(t.suit)) return TILE_LABELS[t.suit][t.num];
  return TILE_LABELS[t.suit] || "?";
}

function tileSuitLabel(id) {
  const t = parseTile(id);
  if (SUITS.includes(t.suit)) return SUIT_NAMES[t.suit];
  return "";
}

function tileSortKey(id) {
  const t = parseTile(id);
  const suitOrder = { man: 0, pin: 1, sou: 2, ton: 3, nan: 4, sha: 5, pei: 6, haku: 7, hatsu: 8, chun: 9 };
  return (suitOrder[t.suit] || 0) * 10 + (t.num || 0);
}

function isHonor(id) {
  return HONORS.includes(parseTile(id).suit);
}

// ── Wall / Deck ──────────────────────────────────────────────────────────────

function buildWall() {
  const wall = [];
  for (const s of SUITS) {
    for (let n = 1; n <= 9; n++) {
      for (let c = 0; c < 4; c++) wall.push(tileId(s, n));
    }
  }
  for (const h of HONORS) {
    for (let c = 0; c < 4; c++) wall.push(h);
  }
  // Fisher-Yates shuffle
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

// ── Hand analysis (simplified riichi rules) ──────────────────────────────────
// A winning hand (agari) = 4 mentsu (sets) + 1 jantai (pair)
// Mentsu: shuntsu (sequence of 3 in same suit) or koutsu (triplet)
// Also recognise: chiitoitsu (7 pairs) and kokushi musou (13 orphans)

function countTiles(hand) {
  const c = {};
  for (const t of hand) c[t] = (c[t] || 0) + 1;
  return c;
}

// Check standard 4-mentsu + 1-jantai win via recursive backtracking
function canWinStandard(counts, nMentsu, hasPair) {
  if (nMentsu === 4 && hasPair) {
    // all tiles consumed?
    return Object.values(counts).every(v => v === 0);
  }

  // Find first tile with count > 0
  let first = null;
  for (const id of Object.keys(counts).sort((a, b) => tileSortKey(a) - tileSortKey(b))) {
    if (counts[id] > 0) { first = id; break; }
  }
  if (!first) return nMentsu === 4 && hasPair;

  const t = parseTile(first);

  // Try pair
  if (!hasPair && counts[first] >= 2) {
    counts[first] -= 2;
    if (canWinStandard(counts, nMentsu, true)) { counts[first] += 2; return true; }
    counts[first] += 2;
  }

  // Try koutsu (triplet)
  if (nMentsu < 4 && counts[first] >= 3) {
    counts[first] -= 3;
    if (canWinStandard(counts, nMentsu + 1, hasPair)) { counts[first] += 3; return true; }
    counts[first] += 3;
  }

  // Try shuntsu (sequence) — numbered suits only
  if (nMentsu < 4 && SUITS.includes(t.suit) && t.num <= 7) {
    const b = tileId(t.suit, t.num + 1);
    const c = tileId(t.suit, t.num + 2);
    if ((counts[b] || 0) >= 1 && (counts[c] || 0) >= 1) {
      counts[first]--; counts[b]--; counts[c]--;
      if (canWinStandard(counts, nMentsu + 1, hasPair)) {
        counts[first]++; counts[b]++; counts[c]++;
        return true;
      }
      counts[first]++; counts[b]++; counts[c]++;
    }
  }

  return false;
}

function isChiitoitsu(hand) {
  if (hand.length !== 14) return false;
  const c = countTiles(hand);
  const pairs = Object.values(c).filter(v => v === 2);
  return pairs.length === 7;
}

function isKokushi(hand) {
  if (hand.length !== 14) return false;
  const orphans = [
    "man1","man9","pin1","pin9","sou1","sou9",
    "ton","nan","sha","pei","haku","hatsu","chun"
  ];
  const c = countTiles(hand);
  let hasPair = false;
  for (const o of orphans) {
    if (!c[o]) return false;
    if (c[o] === 2) hasPair = true;
  }
  return hasPair;
}

function isWinningHand(hand) {
  if (hand.length !== 14) return false;
  if (isChiitoitsu(hand)) return true;
  if (isKokushi(hand)) return true;
  const c = countTiles(hand);
  return canWinStandard(c, 0, false);
}

// ── Tenpai detection ─────────────────────────────────────────────────────────
// A 13-tile hand is tenpai if adding any possible tile makes it a winning hand.

function allPossibleTiles() {
  const tiles = [];
  for (const s of SUITS) {
    for (let n = 1; n <= 9; n++) tiles.push(tileId(s, n));
  }
  for (const h of HONORS) tiles.push(h);
  return tiles;
}

function getTenpaiWaits(hand) {
  if (hand.length !== 13) return [];
  const waits = [];
  const handCounts = countTiles(hand);
  for (const tile of allPossibleTiles()) {
    // Check there are copies available (max 4 in mahjong)
    if ((handCounts[tile] || 0) >= 4) continue;
    const test = [...hand, tile];
    if (isWinningHand(test)) waits.push(tile);
  }
  return waits;
}

// ── Shanten estimation (simplified) ──────────────────────────────────────────
// For status display: -1 = tenpai, 0 = won, positive = tiles away

function estimateShanten(hand) {
  if (hand.length === 14 && isWinningHand(hand)) return -1;
  if (hand.length === 13 && getTenpaiWaits(hand).length > 0) return 0;
  // Rough estimate: count isolated tiles
  const c = countTiles(hand);
  let pairs = 0, sets = 0, partial = 0;
  const used = {};
  const sorted = Object.keys(c).sort((a, b) => tileSortKey(a) - tileSortKey(b));
  for (const id of sorted) {
    if (c[id] >= 3) { sets++; c[id] -= 3; }
    if (c[id] >= 2) { pairs++; c[id] -= 2; }
  }
  // Recount for sequences
  for (const s of SUITS) {
    for (let n = 1; n <= 7; n++) {
      const a = tileId(s, n), b = tileId(s, n+1), cc = tileId(s, n+2);
      while ((c[a]||0) >= 1 && (c[b]||0) >= 1 && (c[cc]||0) >= 1) {
        c[a]--; c[b]--; c[cc]--;
        sets++;
      }
    }
    for (let n = 1; n <= 8; n++) {
      const a = tileId(s, n), b = tileId(s, n+1);
      while ((c[a]||0) >= 1 && (c[b]||0) >= 1) {
        c[a]--; c[b]--;
        partial++;
      }
    }
  }
  const totalMentsu = sets;
  const totalPartial = partial + Math.min(pairs, 1);
  const needed = 4 - totalMentsu;
  return Math.max(needed - totalPartial, 1);
}

// ── Game state ───────────────────────────────────────────────────────────────

const state = {
  wall: [],
  hand: [],
  drawTile: null,
  discards: [],
  turnsPlayed: 0,
  gameOver: false,
  won: false,
  message: "",
  tenpaiWaits: [],
  shantenNum: 99,
};

function newGame() {
  state.wall = buildWall();
  state.hand = [];
  state.drawTile = null;
  state.discards = [];
  state.turnsPlayed = 0;
  state.gameOver = false;
  state.won = false;
  state.message = "Draw your starting hand.";
  state.tenpaiWaits = [];
  state.shantenNum = 99;

  // Deal 13 tiles
  for (let i = 0; i < 13; i++) state.hand.push(state.wall.pop());
  state.hand.sort((a, b) => tileSortKey(a) - tileSortKey(b));

  // Draw 14th tile
  drawFromWall();
  render();
}

function drawFromWall() {
  if (state.wall.length === 0) {
    state.gameOver = true;
    state.message = "Wall exhausted — ryuukyoku (draw game).";
    return;
  }
  state.drawTile = state.wall.pop();
  state.turnsPlayed++;

  // Check if the draw completes a winning hand — notify but let the player
  // explicitly declare tsumo so the drawn tile stays visible in the UI.
  const fullHand = [...state.hand, state.drawTile];
  if (isWinningHand(fullHand)) {
    state.message = "Winning tile drawn! Declare Tsumo or discard.";
  } else {
    state.message = "Choose a tile to discard.";
  }
}

function discard(index, fromDraw) {
  if (state.gameOver) return;

  let discarded;
  if (fromDraw) {
    discarded = state.drawTile;
    state.drawTile = null;
  } else {
    // Discard from hand, add draw tile into hand
    discarded = state.hand.splice(index, 1)[0];
    if (state.drawTile) {
      state.hand.push(state.drawTile);
      state.drawTile = null;
    }
  }

  state.discards.push(discarded);
  state.hand.sort((a, b) => tileSortKey(a) - tileSortKey(b));

  // Evaluate tenpai
  state.tenpaiWaits = getTenpaiWaits(state.hand);
  if (state.tenpaiWaits.length > 0) {
    state.shantenNum = 0;
    state.message = `Tenpai! Waiting on: ${state.tenpaiWaits.map(t => tileLabel(t) + tileSuitLabel(t)).join(" ")}`;
  } else {
    state.shantenNum = estimateShanten(state.hand);
    state.message = `Shanten: ~${state.shantenNum}. Draw next tile.`;
  }

  // Draw next
  if (!state.gameOver) {
    drawFromWall();
  }

  render();
}

function declareTsumo() {
  if (state.gameOver || !state.drawTile) return;
  const fullHand = [...state.hand, state.drawTile];
  if (isWinningHand(fullHand)) {
    state.won = true;
    state.gameOver = true;
    state.hand = fullHand;
    state.hand.sort((a, b) => tileSortKey(a) - tileSortKey(b));
    state.drawTile = null;
    state.message = "Tsumo declared! You win!";
    render();
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

function tileColorClass(id) {
  const t = parseTile(id);
  if (t.suit === "man") return "tile-man";
  if (t.suit === "pin") return "tile-pin";
  if (t.suit === "sou") return "tile-sou";
  if (t.suit === "hatsu") return "tile-hatsu";
  if (t.suit === "chun") return "tile-chun";
  return "tile-honor";
}

function createTileEl(id, opts = {}) {
  const el = document.createElement("div");
  el.className = `tile ${tileColorClass(id)}`;
  if (opts.clickable) el.classList.add("clickable");
  if (opts.highlight) el.classList.add("highlight");
  if (opts.dim) el.classList.add("dim");
  if (opts.draw) el.classList.add("draw-tile");
  if (opts.wait) el.classList.add("wait-tile");
  if (opts.small) el.classList.add("tile-small");

  const label = document.createElement("span");
  label.className = "tile-label";
  label.textContent = tileLabel(id);
  el.appendChild(label);

  const suit = tileSuitLabel(id);
  if (suit) {
    const suitEl = document.createElement("span");
    suitEl.className = "tile-suit";
    suitEl.textContent = suit;
    el.appendChild(suitEl);
  }

  if (opts.onClick) el.addEventListener("click", opts.onClick);
  return el;
}

function render() {
  // Hand
  const handEl = document.getElementById("hand");
  handEl.innerHTML = "";
  state.hand.forEach((id, i) => {
    const isTenpai = state.tenpaiWaits.length > 0 && !state.gameOver;
    const el = createTileEl(id, {
      clickable: !state.gameOver && state.drawTile !== null,
      highlight: false,
      onClick: () => discard(i, false),
    });
    handEl.appendChild(el);
  });

  // Draw tile
  const drawEl = document.getElementById("draw-tile");
  drawEl.innerHTML = "";
  if (state.drawTile) {
    const el = createTileEl(state.drawTile, {
      clickable: !state.gameOver,
      draw: true,
      onClick: () => discard(0, true),
    });
    drawEl.appendChild(el);
  }

  // Discards
  const discardEl = document.getElementById("discards");
  discardEl.innerHTML = "";
  state.discards.forEach(id => {
    discardEl.appendChild(createTileEl(id, { small: true, dim: true }));
  });

  // Waits
  const waitsEl = document.getElementById("waits");
  waitsEl.innerHTML = "";
  if (state.tenpaiWaits.length > 0 && !state.won) {
    state.tenpaiWaits.forEach(id => {
      waitsEl.appendChild(createTileEl(id, { small: true, wait: true }));
    });
  }

  // Status
  document.getElementById("message").textContent = state.message;
  document.getElementById("turns").textContent = state.turnsPlayed;
  document.getElementById("wall-count").textContent = state.wall.length;
  document.getElementById("discard-count").textContent = state.discards.length;

  const statusTag = document.getElementById("status-tag");
  if (state.won) {
    statusTag.textContent = "AGARI";
    statusTag.className = "status-tag won";
  } else if (state.tenpaiWaits.length > 0) {
    statusTag.textContent = "TENPAI";
    statusTag.className = "status-tag tenpai";
  } else if (state.gameOver) {
    statusTag.textContent = "RYUUKYOKU";
    statusTag.className = "status-tag draw";
  } else {
    statusTag.textContent = `~${state.shantenNum > 10 ? "?" : state.shantenNum} shanten`;
    statusTag.className = "status-tag playing";
  }

  // Tsumo button
  const tsumoBtn = document.getElementById("tsumo-btn");
  if (state.drawTile && !state.gameOver) {
    const test = [...state.hand, state.drawTile];
    if (isWinningHand(test)) {
      tsumoBtn.style.display = "inline-block";
    } else {
      tsumoBtn.style.display = "none";
    }
  } else {
    tsumoBtn.style.display = "none";
  }

  // Restart always visible
  document.getElementById("restart-btn").style.display = "inline-block";
}

// ── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("restart-btn").addEventListener("click", newGame);
  document.getElementById("tsumo-btn").addEventListener("click", declareTsumo);
  newGame();
});
