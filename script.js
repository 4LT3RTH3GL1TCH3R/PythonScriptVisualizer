let monacoEditor, pyodide;
const ROOT = "/workspace";
let activePath = ROOT + "/main.py";
let state;
let liveTimer;

// DOM helpers
const $ = sel => document.querySelector(sel);

// Console
function writeConsole(target, text, type="out") {
  const el = document.createElement("div");
  el.className = type;
  el.textContent = text;
  $(target).appendChild(el);
  $(target).scrollTop = $(target).scrollHeight;
}
function clearConsole(which="console") { $(which==="consoleLive" ? "#consoleLive" : "#console").innerHTML = ""; }

// File tree persistence
const LS_KEY = "py-ide-files";
function defaultTree() {
  return {
    type: "dir", name: "workspace", path: ROOT, children: [
      { type:"file", name:"main.py", path: ROOT+"/main.py", content:'print("Hello, World!")\n' }
    ]
  };
}
function loadTree() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || defaultTree(); }
  catch { return defaultTree(); }
}
function saveTree() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }

// Tree rendering
function renderTree(node, container) {
  container.innerHTML = "";
  function walk(n, parent) {
    const div = document.createElement("div");
    div.className = "node" + (n.path===activePath?" active":"");
    div.textContent = n.name;
    div.onclick = () => {
      activePath = n.path;
      if(n.type==="file") monacoEditor.setValue(n.content||"");
      renderTree(state, container);
    };
    container.appendChild(div);
    if(n.children) n.children.forEach(c => walk(c, div));
  }
  walk(node, container);
}

// Sync to Pyodide FS
function syncFS(node) {
  if(node.type==="dir") {
    try { pyodide.FS.mkdir(node.path); } catch {}
    node.children.forEach(syncFS);
  } else {
    pyodide.FS.writeFile(node.path, new TextEncoder().encode(node.content||""));
  }
}

// Python execution
async function runPython(code, target="console") {
  const preamble = `
import sys, io, os
_stdout, _stderr = io.StringIO(), io.StringIO()
sys.stdout, sys.stderr = _stdout, _stderr
os.chdir("${ROOT}")
`;
  try {
    pyodide.FS.writeFile(activePath, new TextEncoder().encode(code));
    await pyodide.runPythonAsync(preamble + code);
    const out = pyodide.runPython("_stdout.getvalue()");
    const err = pyodide.runPython("_stderr.getvalue()");
    if(target==="console") clearConsole("console");
    if(out) writeConsole("#"+target, out, "out");
    if(err) writeConsole("#"+target, err, "err");
  } catch(e) {
    writeConsole("#"+target, e.message||String(e), "err");
  }
}

// Boot
async function boot() {
  // Monaco
  await new Promise(r => require(["vs/editor/editor.main"], r));
  monacoEditor = monaco.editor.create($("#editor"), {
    value: "", language:"python", theme:"vs-dark", automaticLayout:true
  });
  monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => $("#runBtn").click());

  // Pyodide
  pyodide = await loadPyodide({ indexURL:"https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
  try { pyodide.FS.mkdir(ROOT); } catch {}

  // Load state
  state = loadTree();
  renderTree(state, $("#fileTree"));
  const mainFile = state.children.find(f=>f.name==="main.py");
  if(mainFile) monacoEditor.setValue(mainFile.content);

  syncFS(state);

  // Editor change → live run
  monacoEditor.onDidChangeModelContent(() => {
    const node = state.children.find(f=>f.path===activePath);
    if(node) node.content = monacoEditor.getValue();
    saveTree(); syncFS(state);
    clearTimeout(liveTimer);
    liveTimer = setTimeout(()=> runPython(monacoEditor.getValue(), "consoleLive"), 600);
  });

  // Buttons
  $("#runBtn").onclick = ()=> runPython(monacoEditor.getValue(), "console");
  $("#resetLiveBtn").onclick = ()=> runPython(monacoEditor.getValue(), "consoleLive");
  $("#clearConsole").onclick = ()=> clearConsole("console");

  // Tabs
  document.querySelectorAll(".tab").forEach(b=>{
    b.onclick = ()=>{
      document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      document.querySelectorAll(".pane").forEach(p=>p.classList.remove("active"));
      $("#pane-"+b.dataset.tab).classList.add("active");
    };
  });

  // First run
  runPython(monacoEditor.getValue(), "consoleLive");
}
boot();
