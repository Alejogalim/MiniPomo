const $ = (id) => document.getElementById(id);
const WEEKS = 20;
const DAYS = WEEKS * 7;

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

const history = read("history", {});
let todos = read("todos", []);

function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderGraph() {
  const graph = $("graph");
  graph.textContent = "";

  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (DAYS - 7));

  for (let i = 0; i < DAYS; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = dayKey(date);
    const count = history[key] ?? 0;
    const cell = document.createElement("i");
    cell.className = `cell level-${Math.min(4, count)}`;
    cell.title = `${key} — ${count} ${count === 1 ? "cycle" : "cycles"}`;
    graph.append(cell);
  }

  // streak: consecutive days with at least one cycle, up to today
  let streak = 0;
  const cursor = new Date(today);
  if (!history[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  while (history[dayKey(cursor)]) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const total = Object.values(history).reduce((a, b) => a + b, 0);
  $("streak").textContent = `${streak} day streak · ${total} cycles`;
}

function saveTodos() {
  localStorage.setItem("todos", JSON.stringify(todos));
}

function renderTodos() {
  const todo = $("todo");
  const done = $("done");
  todo.textContent = "";
  done.textContent = "";

  for (const item of todos) {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = item.text;
    li.append(label);

    if (item.done) {
      // click to bring it back, the × removes it for good
      li.onclick = () => {
        item.done = false;
        saveTodos();
        renderTodos();
      };
      const remove = document.createElement("button");
      remove.className = "del";
      remove.textContent = "×";
      remove.title = "Delete task";
      remove.setAttribute("aria-label", `Delete ${item.text}`);
      remove.onclick = (event) => {
        event.stopPropagation();
        todos = todos.filter((t) => t !== item);
        saveTodos();
        renderTodos();
      };
      li.append(remove);
    } else {
      li.onclick = () => {
        item.done = true;
        saveTodos();
        renderTodos();
      };
    }

    (item.done ? done : todo).append(li);
  }

  if (!todos.some((t) => !t.done)) {
    const empty = document.createElement("li");
    empty.textContent = "nothing to do";
    empty.className = "muted";
    empty.style.cursor = "default";
    empty.style.borderStyle = "none";
    todo.append(empty);
  }
}

$("add").addEventListener("submit", (event) => {
  event.preventDefault();
  const text = $("text").value.trim();
  if (!text) return;
  todos.push({ text, done: false });
  $("text").value = "";
  saveTodos();
  renderTodos();
});

const themeButton = $("theme");
function applyTheme(theme) {
  document.body.className = theme;
  themeButton.textContent = theme === "dark" ? "☀" : "☾";
  localStorage.setItem("theme", theme);
}
themeButton.onclick = () => applyTheme(document.body.classList.contains("dark") ? "light" : "dark");

applyTheme(localStorage.getItem("theme") === "dark" ? "dark" : "light");
renderGraph();
renderTodos();
