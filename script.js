let pyodide;
let inputQueue = [];

async function loadPyodideAndPackages() {
  pyodide = await loadPyodide();
  console.log("Pyodide loaded");

  // Redirect Python's print to our console
  pyodide.setStdout({
    batched: (msg) => appendToConsole(msg),
  });
  pyodide.setStderr({
    batched: (msg) => appendToConsole("[Error] " + msg),
  });

  // Monkey-patch input() in Python
  await pyodide.runPythonAsync(`
import builtins
from js import inputQueue

def custom_input(prompt=""):
    from js import awaitInput
    print(prompt, end="")
    return awaitInput()

builtins.input = custom_input
  `);
}

function appendToConsole(text) {
  const output = document.getElementById("output");
  output.textContent += text;
  output.scrollTop = output.scrollHeight;
}

async function runCode() {
  const code = document.getElementById("codeInput").value;
  try {
    await pyodide.runPythonAsync(code);
  } catch (err) {
    appendToConsole("[JS Error] " + err + "\n");
  }
}

function clearConsole() {
  document.getElementById("output").textContent = "";
}

function sendInput() {
  const cmdInput = document.getElementById("commandInput");
  const value = cmdInput.value;
  cmdInput.value = "";
  inputQueue.push(value);
}

// Expose function to Python
async function awaitInput() {
  while (inputQueue.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return inputQueue.shift();
}

// Buttons
document.getElementById("runBtn").addEventListener("click", runCode);
document.getElementById("clearBtn").addEventListener("click", clearConsole);
document.getElementById("sendInput").addEventListener("click", sendInput);

loadPyodideAndPackages();
