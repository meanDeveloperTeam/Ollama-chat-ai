// Autonomous Coding Agent (prototype)
// ====================================
// This file provides a *minimal but functional* planner–executor agent
// that leverages the local Ollama model plus the RAG/tools you already
// exposed in server/index.js.  The goal is to give you a starting point
// which you can extend iteratively instead of trying to generate a
// full-blown solution in one pass.
//
// Usage:
//   node agent.js "Fix the login bug in the payment module"
//
// Requirements:
//   – ripgrep (`rg`) for repo search
//   – `patch` utility for unified-diff application
//   – git initialised in project root
//   – Ollama (or any chat endpoint) running at http://localhost:11434
//
// ------------------------------------------------------------

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { exec } = require('child_process');
const fetch = require('node-fetch');

// Adjust if your repo root differs
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MODEL_ENDPOINT = 'http://localhost:11434/api/chat';

/* ----------------------------------------------------------
   TOOL IMPLEMENTATIONS (available to the LLM)               
---------------------------------------------------------- */
function runShell(cmd, timeout = 60000) {
  return new Promise((resolve) => {
    exec(cmd, { cwd: PROJECT_ROOT, timeout }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

async function searchRepo({ regex, maxFiles = 50 }) {
  const rgCmd = `rg --json -m ${maxFiles} "${regex}" ${PROJECT_ROOT}`;
  const { stdout } = await runShell(rgCmd);
  const matches = stdout.split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter((o) => o && o.type === 'match');
  return matches;
}

async function readFile({ relPath, start = 0, end = 400 }) {
  const p = path.join(PROJECT_ROOT, relPath);
  const data = await fsp.readFile(p, 'utf8');
  return data.split('\n').slice(start, end).join('\n');
}

async function patchFile({ relPath, diff }) {
  const target = path.join(PROJECT_ROOT, relPath);
  const patchPath = target + '.patch';
  await fsp.writeFile(patchPath, diff);
  await runShell(`patch ${target} ${patchPath}`);
  await fsp.unlink(patchPath).catch(() => {});
  return 'patched';
}

async function gitCommit({ message }) {
  await runShell('git add -A');
  await runShell(`git commit -m "${message.replace(/"/g, '')}"`);
  return 'committed';
}

async function runCmd({ cmd }) {
  return runShell(cmd);
}

const toolRegistry = {
  search_repo: { fn: searchRepo, description: 'Search repository with ripgrep.' },
  read_file: { fn: readFile, description: 'Read file snippet.' },
  patch_file: { fn: patchFile, description: 'Apply unified diff to file.' },
  git_commit: { fn: gitCommit, description: 'Commit staged changes.' },
  run_cmd: { fn: runCmd, description: 'Run shell command in project root.' },
};

/* ----------------------------------------------------------
   LLM helper (function-calling style)                        
---------------------------------------------------------- */
async function chatWithModel(messages, tools = {}) {
  const body = {
    model: 'mistral:7b',
    messages,
    tools: Object.keys(tools).map((name) => ({ name, description: tools[name].description })),
    stream: false,
  };
  const res = await fetch(MODEL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}`);
  return res.json();
}

/* ----------------------------------------------------------
   PLANNER → EXECUTOR LOOP                                    
---------------------------------------------------------- */
async function runAgent(userTask) {
  // -------- PLANNING PHASE --------
  const planResp = await chatWithModel([
    { role: 'system', content: 'You are a senior software planner. Break the task into numbered executable steps.' },
    { role: 'user', content: userTask },
  ]);
  console.log('\n=== PLAN ===');
  console.log(planResp.content);

  const steps = planResp.content.split(/\n+/).filter((l) => /^\d+\./.test(l));

  // -------- EXECUTION PHASE --------
  for (const step of steps) {
    console.log(`\n>>> Executing: ${step}`);
    let messages = [
      { role: 'system', content: 'You are an execution agent. Use tool calls to complete the step. End with a short confirmation when done.' },
      { role: 'user', content: step },
    ];
    let done = false;
    let attempts = 0;
    while (!done && attempts < 6) {
      attempts++;
      const response = await chatWithModel(messages, toolRegistry);
      if (response.tool_call) {
        const { name, arguments: args } = response.tool_call;
        if (!toolRegistry[name]) {
          messages.push({ role: 'tool', name, content: `ERROR: unknown tool ${name}` });
          continue;
        }
        try {
          const result = await toolRegistry[name].fn(args || {});
          messages.push({ role: 'tool', name, content: JSON.stringify(result).slice(0, 1000) });
        } catch (e) {
          messages.push({ role: 'tool', name, content: `ERROR: ${e.message}` });
        }
      } else {
        console.log('Agent:', response.content);
        done = true;
      }
    }
  }
  console.log('\n### Task complete');
}

/* ----------------------------------------------------------
   CLI entrypoint                                             
---------------------------------------------------------- */
if (require.main === module) {
  const task = process.argv.slice(2).join(' ');
  if (!task) {
    console.error('Provide a task:  node agent.js "Add dark-mode toggle"');
    process.exit(1);
  }
  runAgent(task).catch((e) => console.error(e));
}
