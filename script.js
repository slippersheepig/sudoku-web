(function () {
  "use strict";

  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));

  // ---- 常量与文案 ----
  const SIZE = 9;
  const BLOCK = 3;
  const MAX_IDX = SIZE - 1;
  const TOAST_MS = 2000;
  const DIFFICULTY_ERASE = { easy: 20, normal: 35, hard: 50 };
  const VALID_KEYMAPS = new Set(["wasd", "vim"]);

  const I18N = {
    en: {
      language: "Language",
      keymap: "Keymap",
      difficulty: "Difficulty",
      easy: "Easy",
      normal: "Normal",
      hard: "Hard",
      newGame: "New Game",
      check: "Check (Enter)",
      undo: "Undo (u)",
      save: "Save",
      load: "Load",
      continue: "Continue",
      quit: "Quit",
      legend: "Green = editable; Blue = current cell; Yellow = same number as current.",
      clear: "Clear",
      saved: "Saved",
      loaded: "Loaded",
      quitMsg: "Quit game? Save progress?",
      quitDone: "Game reset. A new game has started.",
      loadFail: "Load progress failed!",
      undoError: "No more action to undo.",
      win: "Congratulations! You win!",
      notCompleted: "Sorry, not completed.",
    },
    zh: {
      language: "语言",
      keymap: "键位",
      difficulty: "难度",
      easy: "简单",
      normal: "普通",
      hard: "困难",
      newGame: "新游戏",
      check: "检测完成(Enter)",
      undo: "撤销(u)",
      save: "保存",
      load: "载入",
      continue: "继续",
      quit: "退出",
      legend: "绿色=可编辑；蓝色=当前格；黄色=与当前格相同数字。",
      clear: "清空",
      saved: "已保存",
      loaded: "载入成功",
      quitMsg: "退出游戏？是否保存进度？",
      quitDone: "已退出当前游戏，开始新的一局。",
      loadFail: "载入进度失败！",
      undoError: "没有更多可撤销的操作。",
      win: "恭喜！你赢了！",
      notCompleted: "抱歉，尚未完成。",
    },
  };

  // ---- DOM 引用 ----
  const gridEl = qs("#grid");
  const arrowRow = qs("#arrowRow");
  const numPad = qs("#numPad");
  const langSel = qs("#lang");
  const keymapSel = qs("#keymap");
  const diffSel = qs("#difficulty");
  const dialogQuit = qs("#quitDialog");
  const dialogToast = qs("#toast");
  const toastText = qs("#toastText");

  // ---- 运行时状态 ----
  let lang = "zh";
  let keymap = "wasd";
  let cur = { x: 0, y: 0 };
  let cells = [];
  let undoStack = [];
  let toastTimer = null;
  let openQuitOnEscKeyUp = false;
  const arrowEls = [];
  const cellEls = [];

  // ---- 工具函数 ----
  const idx = (x, y) => y * SIZE + x;
  const getCell = (x, y) => cells[idx(x, y)];

  function t(key) {
    return I18N[lang][key] || key;
  }

  function applyI18n() {
    document.documentElement.lang = lang;
    qsa("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
  }

  function showToast(msg) {
    toastText.textContent = msg;
    if (!dialogToast.open) {
      dialogToast.show();
    }
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (dialogToast.open) {
        dialogToast.close();
      }
    }, TOAST_MS);
  }

  function clampInt(val, min, max, fallback = min) {
    const num = Number(val);
    if (!Number.isFinite(num)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(num)));
  }

  function clampCur(point) {
    return {
      x: clampInt(point?.x, 0, MAX_IDX, 0),
      y: clampInt(point?.y, 0, MAX_IDX, 0),
    };
  }

  // ---- 棋盘生成 ----
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pattern(r, c) {
    return (BLOCK * (r % BLOCK) + Math.floor(r / BLOCK) + c) % SIZE;
  }

  function randomBoard() {
    const groups = [0, 1, 2];
    const rows = shuffle(groups.slice()).flatMap((g) =>
      shuffle(groups.slice()).map((r) => g * BLOCK + r)
    );
    const cols = shuffle(groups.slice()).flatMap((g) =>
      shuffle(groups.slice()).map((c) => g * BLOCK + c)
    );
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        board[r][c] = nums[pattern(rows[r], cols[c])];
      }
    }
    return board;
  }

  function eraseCells(board, count) {
    const coords = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        coords.push({ x, y });
      }
    }
    shuffle(coords);
    for (let i = 0; i < count && i < coords.length; i++) {
      const { x, y } = coords[i];
      board[y][x] = 0;
    }
  }

  function newGame() {
    const board = randomBoard();
    const erase = DIFFICULTY_ERASE[diffSel.value] ?? DIFFICULTY_ERASE.normal;
    eraseCells(board, erase);

    cells = [];
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const value = board[y][x];
        const fixed = value !== 0;
        cells.push({
          value,
          fixed,
          state: fixed ? "INITED" : "ERASED",
        });
      }
    }
    cur = { x: 0, y: 0 };
    undoStack = [];
    render();
  }

  // ---- 棋盘 DOM 初始化与渲染 ----
  function initBoardDOM() {
    const arrowFrag = document.createDocumentFragment();
    for (let x = 0; x < SIZE; x++) {
      const arrow = document.createElement("div");
      arrow.className = "arrow";
      arrowEls.push(arrow);
      arrowFrag.appendChild(arrow);
    }
    arrowRow.appendChild(arrowFrag);

    const gridFrag = document.createDocumentFragment();
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.dataset.x = String(x);
        cell.dataset.y = String(y);
        if ((x + 1) % BLOCK === 0 && x !== MAX_IDX) cell.dataset.blockEdge = "true";
        if ((y + 1) % BLOCK === 0 && y !== MAX_IDX) cell.dataset.rowEdge = "true";
        cell.tabIndex = -1;
        cell.setAttribute("role", "button");
        cell.setAttribute("aria-label", `r${y + 1}c${x + 1}`);
        cellEls.push(cell);
        gridFrag.appendChild(cell);
      }
    }
    gridEl.appendChild(gridFrag);
  }

  function render() {
    for (let x = 0; x < SIZE; x++) {
      arrowEls[x].textContent = x === cur.x ? "^" : "";
    }

    const highlighted = getCell(cur.x, cur.y)?.value || 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = idx(x, y);
        const data = cells[i];
        const el = cellEls[i];
        const isCurrent = x === cur.x && y === cur.y;
        const isSame = highlighted !== 0 && data.value === highlighted && !isCurrent;

        el.className =
          "cell " +
          (data.fixed ? "fixed" : "editable") +
          (isCurrent ? " current" : "") +
          (isSame ? " same" : "");
        el.textContent = data.value ? String(data.value) : "";
      }
    }
  }

  // ---- 棋盘操作与校验 ----
  function moveCur(dx, dy) {
    const nextX = clampInt(cur.x + dx, 0, MAX_IDX, cur.x);
    const nextY = clampInt(cur.y + dy, 0, MAX_IDX, cur.y);
    if (nextX === cur.x && nextY === cur.y) return;
    cur = { x: nextX, y: nextY };
    render();
  }

  function setCell(x, y, val) {
    if (!Number.isInteger(val) || val < 0 || val > SIZE) return false;
    const cell = getCell(x, y);
    if (!cell || cell.fixed) return false;
    const preValue = cell.value;
    if (preValue === val) return false;
    cell.value = val;
    undoStack.push({ x, y, preValue, curValue: val });
    render();
    return true;
  }

  function undo() {
    if (undoStack.length === 0) {
      showToast(t("undoError"));
      return;
    }
    const last = undoStack.pop();
    const cell = getCell(last.x, last.y);
    if (!cell || cell.fixed) return;
    cell.value = last.preValue;
    cur = { x: last.x, y: last.y };
    render();
  }

  function isValidGroup(values) {
    const seen = new Set(values);
    if (seen.size !== SIZE) return false;
    for (const v of seen) {
      if (!Number.isInteger(v) || v < 1 || v > SIZE) return false;
    }
    return true;
  }

  function isComplete() {
    if (cells.some((c) => c.value === 0)) return false;

    for (let y = 0; y < SIZE; y++) {
      const row = Array.from({ length: SIZE }, (_, x) => getCell(x, y).value);
      if (!isValidGroup(row)) return false;
    }

    for (let x = 0; x < SIZE; x++) {
      const col = Array.from({ length: SIZE }, (_, y) => getCell(x, y).value);
      if (!isValidGroup(col)) return false;
    }

    for (let by = 0; by < BLOCK; by++) {
      for (let bx = 0; bx < BLOCK; bx++) {
        const block = [];
        for (let y = by * BLOCK; y < by * BLOCK + BLOCK; y++) {
          for (let x = bx * BLOCK; x < bx * BLOCK + BLOCK; x++) {
            block.push(getCell(x, y).value);
          }
        }
        if (!isValidGroup(block)) return false;
      }
    }

    return true;
  }

  function checkCompletion() {
    showToast(isComplete() ? t("win") : t("notCompleted"));
  }

  // ---- 保存与载入 ----
  function exportProgress() {
    const data = {
      map: cells.map((c) => ({ value: c.value, state: c.state, fixed: c.fixed })),
      cur,
      commands: undoStack.slice(),
      keymap,
      lang,
      difficulty: diffSel.value,
      ts: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sudoku-progress-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t("saved"));
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onerror = () => showToast(t("loadFail"));
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.map) || data.map.length !== SIZE * SIZE) {
          throw new Error("invalid map");
        }

        const nextCells = data.map.map((o) => {
          if (!o || typeof o !== "object") throw new Error("invalid cell");
          const fixed = Boolean(o.fixed);
          return {
            value: clampInt(o.value, 0, SIZE, 0),
            fixed,
            state: typeof o.state === "string" ? o.state : fixed ? "INITED" : "ERASED",
          };
        });

        const nextCur = clampCur(data.cur);
        const nextUndoStack = Array.isArray(data.commands)
          ? data.commands
              .filter(
                (cmd) =>
                  cmd &&
                  Number.isInteger(cmd.x) &&
                  Number.isInteger(cmd.y) &&
                  cmd.x >= 0 &&
                  cmd.x <= MAX_IDX &&
                  cmd.y >= 0 &&
                  cmd.y <= MAX_IDX &&
                  Number.isInteger(cmd.preValue) &&
                  cmd.preValue >= 0 &&
                  cmd.preValue <= SIZE &&
                  !nextCells[idx(cmd.x, cmd.y)].fixed
              )
              .map((cmd) => ({
                x: cmd.x,
                y: cmd.y,
                preValue: cmd.preValue,
                curValue: clampInt(cmd.curValue, 0, SIZE, 0),
              }))
          : [];

        cells = nextCells;
        cur = nextCur;
        undoStack = nextUndoStack;

        if (VALID_KEYMAPS.has(data.keymap)) {
          keymap = data.keymap;
          keymapSel.value = keymap;
        }
        if (Object.prototype.hasOwnProperty.call(I18N, data.lang)) {
          lang = data.lang;
          langSel.value = lang;
          applyI18n();
        }
        if (Object.prototype.hasOwnProperty.call(DIFFICULTY_ERASE, data.difficulty)) {
          diffSel.value = data.difficulty;
        }

        render();
        showToast(t("loaded"));
      } catch {
        showToast(t("loadFail"));
      }
    };
    reader.readAsText(file);
  }

  // ---- 键盘控制 ----
  function onKeyDown(e) {
    if (dialogQuit.open) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    // 焦点位于下拉框或输入框时，不拦截其原生键盘交互
    const activeTag = document.activeElement?.tagName;
    if (activeTag === "SELECT" || activeTag === "INPUT" || activeTag === "TEXTAREA") {
      return;
    }

    // 延迟至 keyup 打开退出弹窗，避免 Chromium CloseWatcher 在同一次 Esc 松开时立即关闭弹窗
    if (e.key === "Escape") {
      e.preventDefault();
      if (!e.repeat) {
        openQuitOnEscKeyUp = true;
      }
      return;
    }

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      setCell(cur.x, cur.y, parseInt(e.key, 10));
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      setCell(cur.x, cur.y, 0);
      return;
    }

    const k = e.key.toLowerCase();
    if (k === "u") {
      e.preventDefault();
      undo();
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      checkCompletion();
      return;
    }

    const arrowMoves = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (arrowMoves[e.key]) {
      e.preventDefault();
      const [dx, dy] = arrowMoves[e.key];
      moveCur(dx, dy);
      return;
    }

    const wasdMoves = { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
    const vimMoves = { h: [-1, 0], l: [1, 0], k: [0, -1], j: [0, 1] };
    const move = keymap === "wasd" ? wasdMoves[k] : vimMoves[k];
    if (move) {
      e.preventDefault();
      moveCur(move[0], move[1]);
    }
  }

  // ---- 事件绑定 ----
  if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
    numPad.classList.remove("hidden");
  }

  gridEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (!cell) return;
    cur = { x: Number(cell.dataset.x), y: Number(cell.dataset.y) };
    render();
    gridEl.focus();
  });

  numPad.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-num]");
    if (!btn) return;
    setCell(cur.x, cur.y, parseInt(btn.dataset.num, 10));
  });

  qs("#newGame").addEventListener("click", () => {
    newGame();
    gridEl.focus();
  });
  qs("#check").addEventListener("click", () => {
    checkCompletion();
    gridEl.focus();
  });
  qs("#undo").addEventListener("click", () => {
    undo();
    gridEl.focus();
  });
  qs("#save").addEventListener("click", () => {
    exportProgress();
    gridEl.focus();
  });
  qs("#loadFile").addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      importProgress(e.target.files[0]);
    }
    e.target.value = "";
    gridEl.focus();
  });

  langSel.addEventListener("change", () => {
    lang = langSel.value;
    applyI18n();
    if (dialogToast.open) {
      dialogToast.close();
      clearTimeout(toastTimer);
    }
    gridEl.focus();
  });
  keymapSel.addEventListener("change", () => {
    keymap = keymapSel.value;
    gridEl.focus();
  });
  diffSel.addEventListener("change", () => {
    gridEl.focus();
  });

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (e) => {
    if (e.key === "Escape" && openQuitOnEscKeyUp) {
      openQuitOnEscKeyUp = false;
      if (!dialogQuit.open) {
        dialogQuit.showModal();
      }
    }
  });
  window.addEventListener("blur", () => {
    openQuitOnEscKeyUp = false;
  });

  dialogQuit.addEventListener("close", () => {
    const action = dialogQuit.returnValue;
    if (action === "save") {
      exportProgress();
    } else if (action === "quit") {
      newGame();
      showToast(t("quitDone"));
    }
    gridEl.focus();
  });

  // ---- 初始化 ----
  initBoardDOM();
  applyI18n();
  newGame();
  gridEl.focus();
})();
