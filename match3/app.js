(function () {
  "use strict";

  const ROWS = 8;
  const COLS = 8;
  const GEM_COUNT = 7;
  const MATCH_MIN = 3;
  const ANIM_MATCH = 300;
  const ANIM_DROP = 300;

  let board = [];
  let score = 0;
  let selected = null;
  let busy = false;
  let dropDist = [];

  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restart");

  // ---------- helpers ----------

  function rand(n) {
    return Math.floor(Math.random() * n);
  }

  function inBounds(r, c) {
    return r >= 0 && r < ROWS && c >= 0 && c < COLS;
  }

  function isAdjacent(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // ---------- board generation ----------

  function generateBoard() {
    board = [];
    for (var r = 0; r < ROWS; r++) {
      board[r] = [];
      for (var c = 0; c < COLS; c++) {
        board[r][c] = randomGemNoMatch(r, c);
      }
    }
  }

  function randomGemNoMatch(r, c) {
    var gem;
    var tries = 0;
    do {
      gem = rand(GEM_COUNT);
      tries++;
    } while (tries < 50 && wouldMatch(r, c, gem));
    return gem;
  }

  function wouldMatch(r, c, gem) {
    if (c >= 2 && board[r][c - 1] === gem && board[r][c - 2] === gem) return true;
    if (r >= 2 && board[r - 1][c] === gem && board[r - 2][c] === gem) return true;
    return false;
  }

  // ---------- rendering ----------

  function renderBoard() {
    boardEl.innerHTML = "";
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var tile = document.createElement("div");
        tile.className = "tile gem-" + board[r][c];
        tile.dataset.row = r;
        tile.dataset.col = c;
        boardEl.appendChild(tile);
      }
    }
  }

  function tileAt(r, c) {
    return boardEl.children[r * COLS + c];
  }

  function updateScore() {
    scoreEl.textContent = score;
  }

  // ---------- match detection ----------

  function findMatches() {
    var matched = new Set();

    for (var r = 0; r < ROWS; r++) {
      var run = 1;
      for (var c = 1; c < COLS; c++) {
        if (board[r][c] === board[r][c - 1] && board[r][c] !== -1) {
          run++;
        } else {
          if (run >= MATCH_MIN) {
            for (var k = c - run; k < c; k++) matched.add(r * COLS + k);
          }
          run = 1;
        }
      }
      if (run >= MATCH_MIN) {
        for (var k = COLS - run; k < COLS; k++) matched.add(r * COLS + k);
      }
    }

    for (var c = 0; c < COLS; c++) {
      var run = 1;
      for (var r = 1; r < ROWS; r++) {
        if (board[r][c] === board[r - 1][c] && board[r][c] !== -1) {
          run++;
        } else {
          if (run >= MATCH_MIN) {
            for (var k = r - run; k < r; k++) matched.add(k * COLS + c);
          }
          run = 1;
        }
      }
      if (run >= MATCH_MIN) {
        for (var k = ROWS - run; k < ROWS; k++) matched.add(k * COLS + c);
      }
    }

    return matched;
  }

  // ---------- swap ----------

  function swapCells(a, b) {
    var tmp = board[a.row][a.col];
    board[a.row][a.col] = board[b.row][b.col];
    board[b.row][b.col] = tmp;
  }

  function refreshTiles(a, b) {
    tileAt(a.row, a.col).className = "tile gem-" + board[a.row][a.col];
    tileAt(b.row, b.col).className = "tile gem-" + board[b.row][b.col];
  }

  // ---------- gravity ----------

  function applyGravity() {
    dropDist = Array.from({ length: ROWS }, function () {
      return new Array(COLS).fill(0);
    });

    for (var c = 0; c < COLS; c++) {
      var writeRow = ROWS - 1;

      for (var r = ROWS - 1; r >= 0; r--) {
        if (board[r][c] !== -1) {
          var dist = writeRow - r;
          board[writeRow][c] = board[r][c];
          dropDist[writeRow][c] = dist;
          if (writeRow !== r) board[r][c] = -1;
          writeRow--;
        }
      }

      var newCount = writeRow + 1;
      for (var r = writeRow; r >= 0; r--) {
        board[r][c] = rand(GEM_COUNT);
        dropDist[r][c] = newCount;
      }
    }
  }

  function animateDrops() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (dropDist[r][c] > 0) {
          var tile = tileAt(r, c);
          tile.style.setProperty("--drop", dropDist[r][c]);
          tile.classList.add("dropping");
        }
      }
    }
  }

  // ---------- cascade loop ----------

  async function processBoardLoop() {
    busy = true;
    var combos = 0;

    while (true) {
      var matches = findMatches();
      if (matches.size === 0) break;

      combos++;
      score += matches.size * 10 * combos;
      updateScore();

      for (var idx of matches) {
        tileAt(Math.floor(idx / COLS), idx % COLS).classList.add("matched");
      }
      await delay(ANIM_MATCH);

      for (var idx of matches) {
        board[Math.floor(idx / COLS)][idx % COLS] = -1;
      }

      applyGravity();
      renderBoard();
      animateDrops();
      await delay(ANIM_DROP);
    }

    if (!hasValidMove()) {
      shuffleBoard();
      renderBoard();
    }

    busy = false;
  }

  // ---------- valid-move detection ----------

  function hasValidMove() {
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        if (c + 1 < COLS) {
          swapCells({ row: r, col: c }, { row: r, col: c + 1 });
          var ok = findMatches().size > 0;
          swapCells({ row: r, col: c }, { row: r, col: c + 1 });
          if (ok) return true;
        }
        if (r + 1 < ROWS) {
          swapCells({ row: r, col: c }, { row: r + 1, col: c });
          var ok = findMatches().size > 0;
          swapCells({ row: r, col: c }, { row: r + 1, col: c });
          if (ok) return true;
        }
      }
    }
    return false;
  }

  function shuffleBoard() {
    var flat = board.flat();
    for (var i = flat.length - 1; i > 0; i--) {
      var j = rand(i + 1);
      var tmp = flat[i]; flat[i] = flat[j]; flat[j] = tmp;
    }
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        board[r][c] = flat[r * COLS + c];
      }
    }
    clearInstantMatches();
    if (!hasValidMove()) shuffleBoard();
  }

  function clearInstantMatches() {
    var matches = findMatches();
    while (matches.size > 0) {
      for (var idx of matches) {
        var r = Math.floor(idx / COLS);
        var c = idx % COLS;
        board[r][c] = randomGemNoMatch(r, c);
      }
      matches = findMatches();
    }
  }

  // ---------- input handling ----------

  function handleTileClick(r, c) {
    if (busy) return;
    if (!inBounds(r, c)) return;

    if (selected === null) {
      selected = { row: r, col: c };
      tileAt(r, c).classList.add("selected");
      return;
    }

    var prev = selected;
    tileAt(prev.row, prev.col).classList.remove("selected");

    if (prev.row === r && prev.col === c) {
      selected = null;
      return;
    }

    if (!isAdjacent(prev, { row: r, col: c })) {
      selected = { row: r, col: c };
      tileAt(r, c).classList.add("selected");
      return;
    }

    selected = null;
    trySwap(prev, { row: r, col: c });
  }

  async function trySwap(a, b) {
    busy = true;
    swapCells(a, b);
    refreshTiles(a, b);

    if (findMatches().size === 0) {
      await delay(200);
      swapCells(a, b);
      refreshTiles(a, b);
      busy = false;
      return;
    }

    await processBoardLoop();
  }

  // ---------- drag / swipe ----------

  var dragStart = null;

  function pointerDown(e) {
    if (busy) return;
    var tile = e.target.closest(".tile");
    if (!tile) return;
    boardEl.setPointerCapture(e.pointerId);
    dragStart = {
      row: +tile.dataset.row,
      col: +tile.dataset.col,
      x: e.clientX,
      y: e.clientY
    };
  }

  function pointerUp(e) {
    if (!dragStart) return;

    var dx = e.clientX - dragStart.x;
    var dy = e.clientY - dragStart.y;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);

    if (absDx < 10 && absDy < 10) {
      handleTileClick(dragStart.row, dragStart.col);
      dragStart = null;
      return;
    }

    var tr = dragStart.row;
    var tc = dragStart.col;
    if (absDx > absDy) {
      tc += dx > 0 ? 1 : -1;
    } else {
      tr += dy > 0 ? 1 : -1;
    }

    if (inBounds(tr, tc)) {
      if (selected) {
        tileAt(selected.row, selected.col).classList.remove("selected");
        selected = null;
      }
      trySwap(dragStart, { row: tr, col: tc });
    }

    dragStart = null;
  }

  function pointerCancel() {
    dragStart = null;
  }

  boardEl.addEventListener("pointerdown", pointerDown);
  boardEl.addEventListener("pointerup", pointerUp);
  boardEl.addEventListener("pointercancel", pointerCancel);
  boardEl.addEventListener("lostpointercapture", pointerCancel);
  boardEl.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ---------- restart ----------

  restartBtn.addEventListener("click", function () {
    if (busy) return;
    init();
  });

  // ---------- init ----------

  function init() {
    score = 0;
    selected = null;
    busy = false;
    updateScore();
    generateBoard();
    if (!hasValidMove()) shuffleBoard();
    renderBoard();
  }

  init();
})();
