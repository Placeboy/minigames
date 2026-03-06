// ============================================================
// Texas Hold'em – single-player demo (no external dependencies)
// ============================================================

(() => {
  "use strict";

  // ----- constants ------------------------------------------
  const SUITS = ["♠", "♥", "♦", "♣"];
  const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  const RANK_VALUES = Object.fromEntries(RANKS.map((r, i) => [r, i + 2]));
  const HAND_NAMES = [
    "High Card",
    "Pair",
    "Two Pair",
    "Three of a Kind",
    "Straight",
    "Flush",
    "Full House",
    "Four of a Kind",
    "Straight Flush",
    "Royal Flush",
  ];
  const STARTING_CHIPS = 1000;
  const SMALL_BLIND = 10;
  const BIG_BLIND = 20;
  const PLAYER_NAMES = ["You", "Alice", "Bob", "Carol"];

  // ----- deck -----------------------------------------------
  function makeDeck() {
    const d = [];
    for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r });
    return d;
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ----- hand evaluation ------------------------------------
  function evaluateHand(cards) {
    // Given 5-7 cards, find best 5-card hand.
    const combos = combinations(cards, 5);
    let best = null;
    for (const c of combos) {
      const score = score5(c);
      if (!best || compareSc(score, best) > 0) best = score;
    }
    return best;
  }

  function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
    const without = combinations(rest, k);
    return withFirst.concat(without);
  }

  function score5(cards) {
    const vals = cards.map((c) => RANK_VALUES[c.rank]).sort((a, b) => a - b);
    const suits = cards.map((c) => c.suit);
    const isFlush = suits.every((s) => s === suits[0]);
    let isStraight = false;
    let straightHigh = 0;

    // Check straight
    const unique = [...new Set(vals)].sort((a, b) => a - b);
    if (unique.length === 5) {
      if (unique[4] - unique[0] === 4) {
        isStraight = true;
        straightHigh = unique[4];
      }
      // Ace-low straight (A-2-3-4-5)
      if (
        unique[0] === 2 &&
        unique[1] === 3 &&
        unique[2] === 4 &&
        unique[3] === 5 &&
        unique[4] === 14
      ) {
        isStraight = true;
        straightHigh = 5;
      }
    }

    // Count ranks
    const counts = {};
    for (const v of vals) counts[v] = (counts[v] || 0) + 1;
    const groups = Object.entries(counts)
      .map(([v, c]) => ({ val: +v, cnt: c }))
      .sort((a, b) => b.cnt - a.cnt || b.val - a.val);

    let rank, kickers;

    if (isStraight && isFlush) {
      rank = straightHigh === 14 && vals.includes(13) ? 9 : 8; // Royal vs Straight Flush
      kickers = [straightHigh];
    } else if (groups[0].cnt === 4) {
      rank = 7;
      kickers = [groups[0].val, groups[1].val];
    } else if (groups[0].cnt === 3 && groups[1].cnt === 2) {
      rank = 6;
      kickers = [groups[0].val, groups[1].val];
    } else if (isFlush) {
      rank = 5;
      kickers = vals.slice().sort((a, b) => b - a);
    } else if (isStraight) {
      rank = 4;
      kickers = [straightHigh];
    } else if (groups[0].cnt === 3) {
      rank = 3;
      kickers = [groups[0].val, ...groups.slice(1).map((g) => g.val).sort((a, b) => b - a)];
    } else if (groups[0].cnt === 2 && groups[1].cnt === 2) {
      rank = 2;
      const pairs = [groups[0].val, groups[1].val].sort((a, b) => b - a);
      kickers = [...pairs, groups[2].val];
    } else if (groups[0].cnt === 2) {
      rank = 1;
      kickers = [groups[0].val, ...groups.slice(1).map((g) => g.val).sort((a, b) => b - a)];
    } else {
      rank = 0;
      kickers = vals.slice().sort((a, b) => b - a);
    }

    return { rank, kickers, name: HAND_NAMES[rank] };
  }

  function compareSc(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
      if (a.kickers[i] !== b.kickers[i]) return a.kickers[i] - b.kickers[i];
    }
    return 0;
  }

  // ----- game state -----------------------------------------
  let state;

  function initState() {
    state = {
      players: PLAYER_NAMES.map((name, i) => ({
        name,
        chips: STARTING_CHIPS,
        hole: [],
        folded: false,
        isHuman: i === 0,
        bet: 0,
        totalBet: 0,
        allIn: false,
      })),
      deck: [],
      community: [],
      pot: 0,
      stage: "preflop", // preflop, flop, turn, river, showdown
      currentPlayer: -1,
      dealerIdx: 0,
      highestBet: 0,
      minRaise: BIG_BLIND,
      lastRaiser: -1,
      roundStarted: false,
      message: "",
      winners: [],
      revealAll: false,
    };
  }

  // ----- game flow ------------------------------------------
  function startRound() {
    // Reset per-round state
    const s = state;
    s.deck = shuffle(makeDeck());
    s.community = [];
    s.pot = 0;
    s.stage = "preflop";
    s.highestBet = 0;
    s.minRaise = BIG_BLIND;
    s.lastRaiser = -1;
    s.message = "";
    s.winners = [];
    s.revealAll = false;

    // Reset players who can still play
    for (const p of s.players) {
      p.hole = [];
      p.folded = p.chips <= 0;
      p.bet = 0;
      p.totalBet = 0;
      p.allIn = false;
    }

    // Move dealer
    s.dealerIdx = nextActive(s.dealerIdx);

    // Deal 2 cards each
    for (let i = 0; i < 2; i++) {
      for (const p of s.players) {
        if (!p.folded) p.hole.push(s.deck.pop());
      }
    }

    // Post blinds
    const sbIdx = nextActive(s.dealerIdx);
    const bbIdx = nextActive(sbIdx);
    postBlind(sbIdx, SMALL_BLIND);
    postBlind(bbIdx, BIG_BLIND);
    s.highestBet = BIG_BLIND;
    s.minRaise = BIG_BLIND;

    // First to act is after BB
    s.currentPlayer = nextActive(bbIdx);
    s.lastRaiser = s.currentPlayer;
    s.roundStarted = true;

    render();
    if (!s.players[s.currentPlayer].isHuman) scheduleAI();
  }

  function postBlind(idx, amount) {
    const p = state.players[idx];
    const actual = Math.min(amount, p.chips);
    p.chips -= actual;
    p.bet += actual;
    p.totalBet += actual;
    state.pot += actual;
    if (p.chips === 0) p.allIn = true;
  }

  function nextActive(from) {
    let i = (from + 1) % 4;
    let tries = 0;
    while ((state.players[i].folded || state.players[i].chips <= 0) && tries < 4) {
      i = (i + 1) % 4;
      tries++;
    }
    return i;
  }

  function activePlayers() {
    return state.players.filter((p) => !p.folded);
  }

  function activeNonAllIn() {
    return state.players.filter((p) => !p.folded && !p.allIn);
  }

  // ----- player actions -------------------------------------
  function doFold(idx) {
    state.players[idx].folded = true;
    // Check if only one left
    if (activePlayers().length === 1) {
      endRound();
      return;
    }
    advanceTurn(idx);
  }

  function doCall(idx) {
    const p = state.players[idx];
    const toCall = state.highestBet - p.bet;
    const actual = Math.min(toCall, p.chips);
    p.chips -= actual;
    p.bet += actual;
    p.totalBet += actual;
    state.pot += actual;
    if (p.chips === 0) p.allIn = true;
    advanceTurn(idx);
  }

  function doRaise(idx, totalBet) {
    const p = state.players[idx];
    const raiseAmount = totalBet - p.bet;
    const actual = Math.min(raiseAmount, p.chips);
    p.chips -= actual;
    p.bet += actual;
    p.totalBet += actual;
    state.pot += actual;
    state.minRaise = Math.max(state.minRaise, p.bet - state.highestBet);
    state.highestBet = p.bet;
    state.lastRaiser = idx;
    if (p.chips === 0) p.allIn = true;
    advanceTurn(idx);
  }

  function doCheck(idx) {
    advanceTurn(idx);
  }

  function advanceTurn(fromIdx) {
    const next = nextActive(fromIdx);

    // Stage complete when we get back to lastRaiser or everyone has matched / is all-in
    const stageComplete = isStageComplete(next);

    if (stageComplete) {
      advanceStage();
    } else {
      state.currentPlayer = next;
      render();
      if (!state.players[next].isHuman) scheduleAI();
    }
  }

  function isStageComplete(nextIdx) {
    // If only one active non-folded player can act, stage is complete
    if (activeNonAllIn().length <= 1) return true;

    // Check if all active non-all-in players have matched the highest bet
    // and the next player is the last raiser (or everyone has acted)
    if (nextIdx === state.lastRaiser) return true;

    // Also check if all non-folded, non-all-in players have same bet
    const active = activeNonAllIn();
    if (active.length > 0 && active.every((p) => p.bet === state.highestBet)) {
      if (nextIdx === state.lastRaiser) return true;
    }

    return false;
  }

  function advanceStage() {
    const s = state;

    // Reset bets for new street
    for (const p of s.players) p.bet = 0;
    s.highestBet = 0;
    s.minRaise = BIG_BLIND;

    if (s.stage === "preflop") {
      s.stage = "flop";
      s.deck.pop(); // burn
      s.community.push(s.deck.pop(), s.deck.pop(), s.deck.pop());
    } else if (s.stage === "flop") {
      s.stage = "turn";
      s.deck.pop(); // burn
      s.community.push(s.deck.pop());
    } else if (s.stage === "turn") {
      s.stage = "river";
      s.deck.pop(); // burn
      s.community.push(s.deck.pop());
    } else if (s.stage === "river") {
      s.stage = "showdown";
      endRound();
      return;
    }

    // First to act after dealer
    if (activeNonAllIn().length <= 1) {
      // Everyone all-in, deal remaining cards
      dealRemaining();
      return;
    }

    s.currentPlayer = nextActive(s.dealerIdx);
    // Make sure current player is not all-in
    while (s.players[s.currentPlayer].allIn) {
      s.currentPlayer = nextActive(s.currentPlayer);
    }
    s.lastRaiser = s.currentPlayer;

    render();
    if (!s.players[s.currentPlayer].isHuman) scheduleAI();
  }

  function dealRemaining() {
    const s = state;
    while (s.community.length < 5) {
      s.deck.pop(); // burn
      s.community.push(s.deck.pop());
    }
    s.stage = "showdown";
    endRound();
  }

  function buildSidePots() {
    // Build side pots from player totalBet contributions.
    // Each pot has an amount and a list of eligible player indices.
    const eligible = state.players
      .map((p, i) => ({ idx: i, totalBet: p.totalBet, folded: p.folded }))
      .filter((e) => e.totalBet > 0);

    // Sort by totalBet ascending to peel off contribution layers
    const sorted = eligible.slice().sort((a, b) => a.totalBet - b.totalBet);

    const pots = [];
    let processed = 0; // contribution already accounted for

    for (let i = 0; i < sorted.length; i++) {
      const level = sorted[i].totalBet;
      if (level <= processed) continue; // duplicate level

      const layer = level - processed;
      // Every player whose totalBet >= level contributes `layer` to this pot
      const contributors = eligible.filter((e) => e.totalBet >= level);
      const potAmount = layer * contributors.length;
      // Eligible to win: contributors who have NOT folded
      const eligibleToWin = contributors.filter((e) => !e.folded).map((e) => e.idx);
      pots.push({ amount: potAmount, eligible: eligibleToWin });
      processed = level;
    }

    return pots;
  }

  function endRound() {
    const s = state;
    s.stage = "showdown";
    s.revealAll = true;

    const active = activePlayers();
    if (active.length === 1) {
      const winner = active[0];
      winner.chips += s.pot;
      s.winners = [winner.name];
      s.message = `${winner.name} wins $${s.pot}!`;
    } else {
      // Evaluate hands for all active players
      const scores = {};
      for (const p of active) {
        const allCards = [...p.hole, ...s.community];
        const score = evaluateHand(allCards);
        p.handName = score.name;
        scores[p.name] = score;
      }

      // Build and resolve side pots
      const pots = buildSidePots();
      const allWinners = new Set();
      const msgParts = [];

      for (const pot of pots) {
        if (pot.amount === 0) continue;

        // Find the best hand among eligible players for this pot
        let bestScore = null;
        let potWinners = [];
        for (const idx of pot.eligible) {
          const p = s.players[idx];
          const sc = scores[p.name];
          if (!sc) continue;
          if (!bestScore || compareSc(sc, bestScore) > 0) {
            bestScore = sc;
            potWinners = [p];
          } else if (compareSc(sc, bestScore) === 0) {
            potWinners.push(p);
          }
        }

        if (potWinners.length === 0) continue;

        const share = Math.floor(pot.amount / potWinners.length);
        for (const w of potWinners) w.chips += share;
        const remainder = pot.amount - share * potWinners.length;
        if (remainder > 0) potWinners[0].chips += remainder;

        for (const w of potWinners) allWinners.add(w.name);

        if (potWinners.length === 1) {
          msgParts.push(`${potWinners[0].name} wins $${pot.amount} with ${bestScore.name}`);
        } else {
          msgParts.push(
            `${potWinners.map((w) => w.name).join(" & ")} split $${pot.amount} with ${bestScore.name}`
          );
        }
      }

      s.winners = [...allWinners];
      s.message = msgParts.join(" | ");
    }

    s.roundStarted = false;
    render();
  }

  // ----- AI logic -------------------------------------------
  function scheduleAI() {
    setTimeout(doAI, 400 + Math.random() * 400);
  }

  function doAI() {
    const s = state;
    if (s.stage === "showdown" || !s.roundStarted) return;
    const idx = s.currentPlayer;
    const p = s.players[idx];
    if (p.folded || p.allIn || p.isHuman) return;

    const toCall = s.highestBet - p.bet;
    const handStrength = estimateStrength(p, s.community);

    if (toCall === 0) {
      // Check or raise
      if (handStrength > 0.75 && Math.random() < 0.5) {
        const raiseAmt = s.highestBet + s.minRaise + Math.floor(Math.random() * s.pot * 0.3);
        const maxRaise = p.bet + p.chips;
        doRaise(idx, Math.min(raiseAmt, maxRaise));
      } else {
        doCheck(idx);
      }
    } else {
      // Fold, call, or raise
      if (handStrength < 0.25 && toCall > BIG_BLIND) {
        doFold(idx);
      } else if (handStrength > 0.7 && Math.random() < 0.4) {
        const raiseAmt = s.highestBet + s.minRaise + Math.floor(Math.random() * s.pot * 0.3);
        const maxRaise = p.bet + p.chips;
        doRaise(idx, Math.min(raiseAmt, maxRaise));
      } else if (handStrength < 0.15 && toCall > BIG_BLIND * 3) {
        doFold(idx);
      } else {
        doCall(idx);
      }
    }
  }

  function estimateStrength(player, community) {
    const allCards = [...player.hole, ...community];
    if (allCards.length < 5) {
      // Preflop or early – use simple heuristic
      const v1 = RANK_VALUES[player.hole[0].rank];
      const v2 = RANK_VALUES[player.hole[1].rank];
      const high = Math.max(v1, v2);
      const low = Math.min(v1, v2);
      const paired = v1 === v2;
      const suited = player.hole[0].suit === player.hole[1].suit;
      let s = (high - 2) / 12 * 0.5 + (low - 2) / 12 * 0.2;
      if (paired) s += 0.25;
      if (suited) s += 0.05;
      if (high - low <= 4 && high - low > 0) s += 0.05;
      return Math.min(1, s);
    }
    const score = evaluateHand(allCards);
    // Normalise: rank 0-9 → 0.1-1.0
    return 0.1 + score.rank * 0.1 + (score.kickers[0] || 0) / 140;
  }

  // ----- UI rendering ---------------------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function cardHTML(card, hidden) {
    if (hidden) return `<div class="card card-back"></div>`;
    const red = card.suit === "♥" || card.suit === "♦";
    return `<div class="card ${red ? "red" : "black"}">${card.rank}<span class="suit">${card.suit}</span></div>`;
  }

  function render() {
    const s = state;

    // Community cards
    const commEl = $("community");
    commEl.innerHTML = "";
    for (let i = 0; i < 5; i++) {
      if (i < s.community.length) {
        commEl.innerHTML += cardHTML(s.community[i]);
      } else {
        commEl.innerHTML += `<div class="card card-placeholder"></div>`;
      }
    }

    // Pot and stage
    $("pot-display").textContent = `Pot: $${s.pot}`;
    $("stage-display").textContent = s.stage === "showdown" ? "Showdown" : capitalize(s.stage);

    // Players
    for (let i = 0; i < 4; i++) {
      const p = s.players[i];
      const el = $(`player-${i}`);
      el.className = "player-area" +
        (i === s.currentPlayer && s.roundStarted ? " active-player" : "") +
        (p.folded ? " folded-player" : "") +
        (s.winners.includes(p.name) ? " winner-player" : "");

      $(`name-${i}`).textContent = p.name + (i === s.dealerIdx ? " (D)" : "");
      $(`chips-${i}`).textContent = `$${p.chips}`;

      const holeEl = $(`hole-${i}`);
      holeEl.innerHTML = "";
      if (p.hole.length) {
        const show = p.isHuman || s.revealAll;
        holeEl.innerHTML = p.hole.map((c) => cardHTML(c, !show && !p.folded)).join("");
      }

      const statusEl = $(`status-${i}`);
      if (p.folded) statusEl.textContent = "Folded";
      else if (p.allIn) statusEl.textContent = "All-In";
      else if (s.stage === "showdown" && p.handName) statusEl.textContent = p.handName;
      else if (p.bet > 0 && s.roundStarted) statusEl.textContent = `Bet: $${p.bet}`;
      else statusEl.textContent = "";
    }

    // Message
    $("message").textContent = s.message;

    // Actions
    renderActions();
  }

  function renderActions() {
    const s = state;
    const actionsEl = $("actions");
    actionsEl.innerHTML = "";

    if (!s.roundStarted) {
      // Check if game can continue (at least 2 players with chips)
      const playable = s.players.filter((p) => p.chips > 0);
      if (playable.length >= 2) {
        const btn = document.createElement("button");
        btn.textContent = "Deal Next Hand";
        btn.className = "btn btn-primary";
        btn.onclick = startRound;
        actionsEl.appendChild(btn);
      } else {
        const btn = document.createElement("button");
        btn.textContent = "Restart Game";
        btn.className = "btn btn-primary";
        btn.onclick = restartGame;
        actionsEl.appendChild(btn);
      }

      const restartBtn = document.createElement("button");
      restartBtn.textContent = "Restart Game";
      restartBtn.className = "btn btn-secondary";
      restartBtn.onclick = restartGame;
      actionsEl.appendChild(restartBtn);
      return;
    }

    const me = s.players[0];
    if (s.currentPlayer !== 0 || me.folded || me.allIn) return;

    const toCall = s.highestBet - me.bet;

    // Fold
    const foldBtn = document.createElement("button");
    foldBtn.textContent = "Fold";
    foldBtn.className = "btn btn-danger";
    foldBtn.onclick = () => doFold(0);
    actionsEl.appendChild(foldBtn);

    if (toCall === 0) {
      // Check
      const checkBtn = document.createElement("button");
      checkBtn.textContent = "Check";
      checkBtn.className = "btn btn-primary";
      checkBtn.onclick = () => doCheck(0);
      actionsEl.appendChild(checkBtn);
    } else {
      // Call
      const callAmt = Math.min(toCall, me.chips);
      const callBtn = document.createElement("button");
      callBtn.textContent = `Call $${callAmt}`;
      callBtn.className = "btn btn-primary";
      callBtn.onclick = () => doCall(0);
      actionsEl.appendChild(callBtn);
    }

    // Raise
    if (me.chips > toCall) {
      const minTotal = s.highestBet + s.minRaise;
      const maxTotal = me.bet + me.chips;

      const raiseDiv = document.createElement("div");
      raiseDiv.className = "raise-controls";

      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = Math.min(minTotal, maxTotal);
      slider.max = maxTotal;
      slider.value = Math.min(minTotal, maxTotal);
      slider.className = "raise-slider";

      const label = document.createElement("span");
      label.className = "raise-label";
      label.textContent = `Raise to $${slider.value}`;
      slider.oninput = () => {
        label.textContent = `Raise to $${slider.value}`;
      };

      const raiseBtn = document.createElement("button");
      raiseBtn.textContent = "Raise";
      raiseBtn.className = "btn btn-warning";
      raiseBtn.onclick = () => doRaise(0, +slider.value);

      raiseDiv.appendChild(slider);
      raiseDiv.appendChild(label);
      raiseDiv.appendChild(raiseBtn);
      actionsEl.appendChild(raiseDiv);
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function restartGame() {
    initState();
    render();
    setTimeout(startRound, 300);
  }

  // ----- bootstrap ------------------------------------------
  function boot() {
    initState();
    render();
    $("start-btn").onclick = startRound;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
