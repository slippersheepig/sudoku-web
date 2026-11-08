(function () {
  const qs = (s, el = document) => el.querySelector(s);
  const qsa = (s, el = document) => Array.from(el.querySelectorAll(s));
  const numPad = qs("#numPad");

  // ---- i18n ----
  const I18N = {
    en: {
      language: "Language",
      keymap: "Keymap",
      difficulty: "Difficulty",
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

  // ---- State ----
  const DIFFICULTY_ERASE = { easy: 20, normal: 35, hard: 50 };
  const gridEl = qs("#grid");
  const arrowRow = qs("#arrowRow");
  const langSel = qs("#lang");
  const keymapSel = qs("#keymap");
  const diffSel = qs("#difficulty");
  const dialogQuit = qs("#quitDialog");
  const dialogToast = qs("#toast");
  const toastText = qs("#toastText");

  let lang = "zh";
  let keymap = "wasd";
  let size = 9;
  let cur = { x: 0, y: 0 }; // x:col, y:row
  let cells = []; // 81 objects: {value, fixed(bool), state:"INITED|ERASED"}
  let undoStack = [];
  let toastTimer = null;

  // ---- Helpers ----
  const idx = (x, y) => y * size + x;

  function showToast(msg) {
    toastText.textContent = msg;
    dialogToast.show();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dialogToast.close(), 900);
  }

  function t(key) {
    return I18N[lang][key] || key;
  }

  function applyI18n() {
    qsa("[data-i18n]").forEach(el => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
  }

  // ---- Generator (base pattern + shuffles), then erase N cells ----
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pattern(r, c) { // base pattern for a valid solution
    const base = 3;
    return (base * (r % base) + Math.floor(r / base) + c) % size;
  }

  function randomBoard() {
    const rBase = [0, 1, 2];
    const rows = [].concat(...shuffle(rBase.slice()).map(g => shuffle(rBase.slice()).map(r => g * 3 + r)));
    const cols = [].concat(...shuffle(rBase.slice()).map(g => shuffle(rBase.slice()).map(c => g * 3 + c)));
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const board = Array.from({ length: size }, () => Array(size).fill(0));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        board[r][c] = nums[pattern(rows[r], cols[c])];
      }
    }
    return board;
  }

  function eraseCells(board, count) {
    const coords = [];
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) coords.push({ x, y });
    shuffle(coords);
    for (let i = 0; i < count && i < coords.length; i++) {
      const { x, y } = coords[i];
      board[y][x] = 0;
    }
  }

  function newGame() {
    const board = randomBoard();
    const erase = DIFFICULTY_ERASE[diffSel.value] ?? 35;
    eraseCells(board, erase);

    cells = [];
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const v = board[y][x];
        const fixed = v !== 0;
        cells.push({
          value: v,
          fixed,
          state: fixed ? "INITED" : "ERASED",
        });
      }
    }
    cur = { x: 0, y: 0 };
    undoStack = [];
    render();
  }

  // ---- Rendering ----
  function renderArrows() {
    arrowRow.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (let x = 0; x < 9; x++) {
      const d = document.createElement("div");
      d.className = "arrow";
      d.textContent = (x === cur.x) ? "^" : " ";
      fragment.appendChild(d);
    }
    arrowRow.appendChild(fragment);
  }

  function render() {
    gridEl.innerHTML = "";
    renderArrows();
    const fragment = document.createDocumentFragment();

    const highlighted = getCell(cur.x, cur.y)?.value || 0;

    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        const c = getCell(x, y);
        const cell = document.createElement("div");
        cell.className = "cell " + (c.fixed ? "fixed" : "editable");
        if (x === cur.x && y === cur.y) cell.classList.add("current");
        if (highlighted && c.value === highlighted && !(x === cur.x && y === cur.y)) {
          cell.classList.add("same");
        }
        // bold 3x3 separators
        if ((x + 1) % 3 === 0 && x !== 8) cell.dataset.blockEdge = "true";
        if ((y + 1) % 3 === 0 && y !== 8) cell.dataset.rowEdge = "true";

        cell.textContent = c.value ? String(c.value) : " ";
        cell.tabIndex = -1;
        cell.setAttribute("role", "button");
        cell.setAttribute("aria-label", `r${y + 1}c${x + 1}`);
        cell.addEventListener("click", () => {
          cur = { x, y };
          render();
          gridEl.focus();
        });
        fragment.appendChild(cell);
      }
    }
    gridEl.appendChild(fragment);
  }

  function getCell(x, y) { return cells[idx(x, y)]; }
  function setCell(x, y, val) {
    if (!Number.isInteger(val) || val < 0 || val > 9) return false;
    const c = getCell(x, y);
    if (c.fixed) return false;
    const pre = c.value;
    if (pre === val) return false;
    c.value = val;
    undoStack.push({ x, y, preValue: pre, curValue: val });
    render();
    return true;
  }

  function undo() {
    if (undoStack.length === 0) {
      showToast(t("undoError"));
      return;
    }
    const last = undoStack.pop();
    getCell(last.x, last.y).value = last.preValue;
    render();
  }

  function clampCur(point) {
    return {
      x: Math.min(8, Math.max(0, point?.x ?? 0)),
      y: Math.min(8, Math.max(0, point?.y ?? 0)),
    };
  }

  // ---- Validation ----
  function isComplete() {
    // all filled
    if (cells.some(c => c.value === 0)) return false;
    // rows/cols/blocks valid
    const validSet = arr => {
      const s = new Set(arr);
      if (s.size !== 9) return false;
      for (const v of s) if (v < 1 || v > 9) return false;
      return true;
    };
    // rows
    for (let y = 0; y < 9; y++) {
      if (!validSet(Array.from({ length: 9 }, (_, x) => getCell(x, y).value))) return false;
    }
    // cols
    for (let x = 0; x < 9; x++) {
      if (!validSet(Array.from({ length: 9 }, (_, y) => getCell(x, y).value))) return false;
    }
    // blocks
    for (let by = 0; by < 3; by++) for (let bx = 0; bx < 3; bx++) {
      const arr = [];
      for (let y = by * 3; y < by * 3 + 3; y++) for (let x = bx * 3; x < bx * 3 + 3; x++) arr.push(getCell(x, y).value);
      if (!validSet(arr)) return false;
    }
    return true;
  }

  // ---- Save / Load ----
  function exportProgress() {
    const data = {
      map: cells.map(c => ({ value: c.value, state: c.state, fixed: c.fixed })),
      cur,
      commands: undoStack.slice(), // record history (same info as C++ command log)
      keymap,
      lang,
      difficulty: diffSel.value,
      ts: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const name = `sudoku-progress-${Date.now()}.json`;
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(t("saved"));
  }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.map) || data.map.length !== 81) throw new Error("bad");
        cells = data.map.map(o => ({ value: Math.min(9, Math.max(0, o.value | 0)), state: o.state, fixed: !!o.fixed }));
        cur = clampCur(data.cur);
        undoStack = Array.isArray(data.commands)
          ? data.commands.filter(cmd => Number.isInteger(cmd?.x) && Number.isInteger(cmd?.y))
          : [];
        if (data.keymap) { keymap = data.keymap; keymapSel.value = keymap; }
        if (data.lang) { lang = data.lang; langSel.value = lang; applyI18n(); }
        if (data.difficulty && DIFFICULTY_ERASE[data.difficulty]) diffSel.value = data.difficulty;
        render();
        showToast(t("loaded"));
      } catch (e) {
        showToast(t("loadFail"));
      }
    };
    reader.readAsText(file);
  }

  // ---- Keyboard ----
  function onKeyDown(e) {
    // 退出弹窗打开时不响应游戏按键，避免穿透修改棋盘
    if (dialogQuit.open) return;
    // 不拦截浏览器/系统快捷键（如 Ctrl+U 查看源码）
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === "Escape") {
      dialogQuit.showModal();
      return;
    }

    // digits
    if (/^[0-9]$/.test(e.key)) {
      setCell(cur.x, cur.y, parseInt(e.key, 10));
      return;
    }

    // undo
    if (e.key.toLowerCase() === "u") {
      undo();
      return;
    }

    // Enter = check
    if (e.key === "Enter") {
      showToast(isComplete() ? t("win") : t("notCompleted"));
      return;
    }

    // movement
    const moveLeft = () => { cur.x = Math.max(0, cur.x - 1); render(); };
    const moveRight = () => { cur.x = Math.min(8, cur.x + 1); render(); };
    const moveUp = () => { cur.y = Math.max(0, cur.y - 1); render(); };
    const moveDown = () => { cur.y = Math.min(8, cur.y + 1); render(); };

    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      ({ ArrowLeft: moveLeft, ArrowRight: moveRight, ArrowUp: moveUp, ArrowDown: moveDown })[e.key]();
      return;
    }
    const k = e.key.toLowerCase();
    // WASD mode
    if (keymap === "wasd") {
      if (k === "a") return moveLeft();
      if (k === "d") return moveRight();
      if (k === "w") return moveUp();
      if (k === "s") return moveDown();
    }
    // VIM mode
    if (keymap === "vim") {
      if (k === "h") return moveLeft();
      if (k === "l") return moveRight();
      if (k === "k") return moveUp();
      if (k === "j") return moveDown();
    }
  }

  // ---- Events ----
  // 显示数字键盘（仅触屏设备）
  if ("ontouchstart" in window || navigator.maxTouchPoints > 0) {
    numPad.classList.remove("hidden");
  }
  qs("#newGame").addEventListener("click", newGame);
  qs("#check").addEventListener("click", () => showToast(isComplete() ? t("win") : t("notCompleted")));
  qs("#undo").addEventListener("click", undo);
  qs("#save").addEventListener("click", exportProgress);
  qs("#loadFile").addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) importProgress(e.target.files[0]);
    e.target.value = "";
  });

  langSel.addEventListener("change", () => { lang = langSel.value; applyI18n(); });
  keymapSel.addEventListener("change", () => { keymap = keymapSel.value; });
  gridEl.addEventListener("keydown", onKeyDown);
  window.addEventListener("keydown", (e) => { if (document.activeElement !== gridEl) onKeyDown(e); });

  dialogQuit.addEventListener("close", () => {
    const v = dialogQuit.returnValue;
    if (v === "save") exportProgress();
    else if (v === "quit") {
      // quit = 放弃当前进度，直接开新局
      newGame();
      showToast(t("quitDone"));
    }
  });

  // ---- Init ----
  applyI18n();
  newGame();
  gridEl.focus();

  // 数字按钮点击处理
  numPad.querySelectorAll("button").forEach(btn => {
    btn.addEventListener("click", () => {
      setCell(cur.x, cur.y, parseInt(btn.dataset.num, 10));
    });
  });
})();
