// Lean 4 in a Web Worker: the real parser, elaborator and kernel, compiled to
// WebAssembly. Boots once (the runtime and the Init library, from the service
// worker's cache after the first visit), imports Init, then checks code in
// milliseconds. Driven by app/src/lean/lean.ts; the asset URLs arrive absolute
// in the `start` message.
//
// A check is two passes over the same source:
//  1. `lean_wasm_compile` elaborates it: type errors, unsolved goals,
//     `trace_state`, `#eval` output. But this build loses parse errors: its
//     command loop (Lean/Shell.lean in the cauli/lean4 fork) reads the message
//     log after `elabCommandTopLevel` has reset it, so a syntax error vanishes
//     and the declaration silently becomes `sorry`.
//  2. So the source is parsed again with Lean's own parser,
//     `Lean.Parser.testParseModule`, against the Init environment the compile
//     cached. It prints every parse error as `file:line:col: error: msg`.
//
// Adapted from @live-codes/lean-wasm's worker (MIT, github.com/live-codes/browser-lean),
// itself derived from cauli/lean4-wasm-in-browser (Apache-2.0). The boot sequence,
// the exports it calls and the IO result tag offset come from there. The runtime
// (lean.js, lean.wasm, the packed Init layer) is cauli's build of the cauli/lean4
// fork, mirrored into app/public/lean/ by scripts/fetch-lean.sh.
//
// Needs a cross-origin isolated page: the module imports a *shared* memory.

let base = "";
let ready = false;
let files = [];
const installed = new Set(); // library files in /lib/lean
let messages = null; // collected during a compile

const post = (msg) => self.postMessage(msg);

async function bytesOf(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url.slice(url.lastIndexOf("/") + 1)}: HTTP ${res.status}`);
  let bytes = new Uint8Array(await res.arrayBuffer());
  // Stored gzipped (Workers static assets cap files at 25 MiB; lean.wasm is 96 MiB raw)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
}

function mkdirp(FS, path) {
  let cur = "";
  for (const part of path.split("/").filter(Boolean)) {
    cur += "/" + part;
    try {
      FS.mkdir(cur);
    } catch {}
  }
}

function writeLib(FS, name, data) {
  installed.add(name);
  const full = "/lib/lean/" + name;
  mkdirp(FS, full.slice(0, full.lastIndexOf("/")));
  FS.writeFile(full, data);
}

// A library layer ships as gzipped packs; the manifest has each file's offset.
// each(name, data) gets every file, one pack at a time.
async function loadPacks(name, label, each) {
  const manifest = await (await fetch(`${base}/${name}-layer.json`)).json();
  for (const [i, pack] of manifest.packs.entries()) {
    post({ type: "progress", text: `${label} ${i + 1}/${manifest.packs.length}` });
    const bytes = await bytesOf(`${base}/${name}-lib/${pack.file}`);
    if (bytes.length !== pack.bytes) throw new Error(`${pack.file}: got ${bytes.length} bytes, expected ${pack.bytes}`);
    for (const e of pack.entries) each(e.path, bytes.subarray(e.offset, e.offset + e.bytes));
  }
}

async function loadInit() {
  const out = [];
  await loadPacks("core", "Lean library", (name, data) => out.push({ name, data }));
  return out;
}


// Lean grows its memory as needed (booting Init and checking a card fits in
// 128 MB), so start small. A shared memory reserves its whole maximum up front,
// which phones may refuse, so step the maximum down (the module allows ≤ 65536 pages).
function sharedMemory() {
  const mb = 256;
  for (const maxMb of [4096, 2048, 1024]) {
    try {
      return { memory: new WebAssembly.Memory({ initial: (mb << 20) / 65536, maximum: Math.min(65536, (maxMb << 20) / 65536), shared: true }), bytes: mb << 20 };
    } catch {}
  }
  return null;
}

const NOISE = /^\s*\[(WASM DEBUG|DEBUG|IFRAME|PROFILE|PWORKER|COMPILE|SNAPSHOT|MEM)|^mainModule\? =|^- \/lib\/lean\/|^wasm streaming compile failed|^falling back to ArrayBuffer/;

// The runtime prints each Lean message as a JSON line on stdout.
function onLine(text, stream) {
  if (parseLines) return void parseLines.push(text);
  if (NOISE.test(text)) return;
  if (!messages) return console.log("[lean]", text);
  let msg = null;
  if (text.trimStart().startsWith("{")) {
    try {
      msg = JSON.parse(text);
    } catch {}
  }
  if (msg?.severity) {
    const data = msg.data;
    const body = typeof data === "string" ? data : (data?.msg ?? data?.message ?? JSON.stringify(data));
    messages.push({
      severity: msg.severity,
      text: String(body).replace(/\u001b\[[0-9;]*m/g, ""),
      line: msg.pos?.line,
      col: msg.pos?.column,
      endLine: msg.endPos?.line,
      endCol: msg.endPos?.column,
    });
  } else if (text.trim()) {
    messages.push({ severity: stream === "stdout" ? "information" : "error", text: text.trim() });
  }
}

async function boot() {
  files = await loadInit();
  const mem = sharedMemory();
  if (!mem) throw new Error("couldn't allocate shared WebAssembly memory");
  post({ type: "progress", text: "Lean runtime" });
  const js = URL.createObjectURL(new Blob([await (await fetch(`${base}/lean.js`)).text()], { type: "text/javascript" }));
  const wasm = URL.createObjectURL(new Blob([await bytesOf(`${base}/lean.wasm.gz`)], { type: "application/wasm" }));
  post({ type: "progress", text: "importing Init" });

  self.Module = {
    wasmMemory: mem.memory,
    INITIAL_MEMORY: mem.bytes,
    // pthread sub-workers load the same blobs
    locateFile: (path) => (path.endsWith(".wasm") ? wasm : `${base}/${path}`),
    mainScriptUrlOrBlob: js,
    print: (t) => onLine(t, "stdout"),
    printErr: (t) => onLine(t, "stderr"),
    noInitialRun: true,
    noExitRuntime: true,
    onExit: (code) => console.warn("[lean] runtime exit", code),
    preRun: [
      () => {
        const FS = Module.FS;
        Module.ENV.LEAN_PATH = "/lib/lean";
        // Lean finds its library relative to its binary, nominally in /bin
        for (const d of ["/bin", "/lib", "/lib/lean", "/workspace"]) mkdirp(FS, d);
        for (const f of files) writeLib(FS, f.name, f.data);
        files = [];
        FS.chdir("/workspace");
      },
    ],
    onRuntimeInitialized() {
      try {
        Module._lean_initialize_runtime_module();
        Module._lean_initialize();
        Module._lean_io_mark_end_initialization();
        Module._lean_init_task_manager?.();
        Module._lean_enable_initializer_execution?.();
        if (!ioOk(Module._lean_init_search_path())) throw new Error("lean_init_search_path failed");
        saveStreams();
        ready = true;
        post({ type: "ready" });
      } catch (e) {
        post({ type: "error", text: "Lean init failed: " + (e?.message ?? e) });
      }
    },
    onAbort: (what) => {
      ready = false;
      post({ type: "error", text: "Lean aborted: " + (what ?? "unknown") });
    },
  };
  importScripts(js);
}

// An IO result's constructor tag sits at byte 7: 0 is ok.
const ioOk = (res) => (Module.getValue(res + 7, "i8") & 0xff) === 0;

function leanString(s) {
  const p = Module.stringToNewUTF8(s);
  const o = Module._lean_mk_string(p);
  Module._free(p);
  return o;
}

// stdin/stdout/stderr as Emscripten opened them at boot. Generating equation
// lemmas for a definition of yours (`simp [f]`, `unfold f`, `rw [f]`) runs a
// task on a pthread, and when it finishes, the runtime's exit path closes the
// standard file descriptors behind Lean's back. The next compile then dies on
// its first write ("bad file descriptor"). So each check first puts them back.
let stdStreams = null;
function saveStreams() {
  stdStreams = [0, 1, 2].map((fd) => Module.FS.streams[fd]);
}
function repairStreams() {
  if (!stdStreams) return;
  stdStreams.forEach((stream, fd) => {
    if (stream && Module.FS.streams[fd] !== stream) {
      stream.fd = fd;
      Module.FS.streams[fd] = stream;
    }
  });
}

function compile(code) {
  if (!ready) return { ok: false, error: "Lean isn't running" };
  repairStreams();
  messages = [];
  try {
    const res = Module._lean_wasm_compile(leanString(code), leanString("/workspace/Card.lean"));
    if (!ioOk(res)) {
      // Lean's own description of the failure, printed to stderr
      parseLines = [];
      try {
        Module._lean_io_result_show_error(res);
      } catch {}
      let text = parseLines.filter((l) => l.trim()).join("\n");
      parseLines = null;
      try {
        // EStateM.Result.error e _: the IO.Error at +8; a Lean String's bytes at +20
        const err = i32(res + 8);
        retain(err);
        text = Module.UTF8ToString(Module._lean_io_error_to_string(err) + 20) || text;
      } catch {}
      messages.push({ severity: "error", text: text || "Lean stopped with an internal error", internal: true });
    }
    return { ok: true, messages };
  } catch (e) {
    return { ok: false, error: e?.message ?? String(e) };
  } finally {
    messages = null;
  }
}

// ---------- parse errors (pass 2) ----------
// Calls into the module's exports directly with Lean's boxed calling
// convention: every argument a lean_object*, scalars boxed as (n << 1) | 1.
const box = (n) => ((n << 1) | 1) >>> 0;
const i32 = (p) => Module.getValue(p, "i32");
let parseLines = null;
let parseBroken = false;

// The Environment `lean_wasm_compile` imported and cached: the first entry of
// the private `wasmEnvCache : IO.Ref (Array (Array Name × Environment))`.
// Object layout (lean.h, wasm32): 8-byte header, then fields; a Ref's value at
// +8; an Array's size at +8 and its data from +16; a pair's fields at +8, +12.
function cachedEnv() {
  const cell = self.wasmExports?.l___private_Lean_Shell_0__Lean_wasmEnvCache;
  if (cell == null) return 0;
  const arr = i32(i32(typeof cell === "number" ? cell : cell.value) + 8);
  return arr && i32(arr + 8) > 0 ? i32(i32(arr + 16) + 12) : 0;
}

// testParseModule takes ownership of the environment, so take a reference
// for it first. A negative count marks a multi-threaded object, counted down.
function retain(o) {
  const rc = i32(o);
  if (rc !== 0) Module.setValue(o, rc > 0 ? rc + 1 : rc - 1, "i32");
}

const PARSE_FILE = "Card.lean";
function parseErrors(code) {
  if (parseBroken || typeof Module._l_Lean_Parser_testParseModule___boxed !== "function") return [];
  const env = cachedEnv();
  if (!env) return [];
  retain(env);
  repairStreams();
  parseLines = [];
  try {
    const res = Module._l_Lean_Parser_testParseModule___boxed(env, leanString(PARSE_FILE), leanString(code), box(0));
    if (ioOk(res)) return [];
    const out = [];
    const head = new RegExp(`^${PARSE_FILE.replace(".", "\\.")}:(\\d+):(\\d+): (error|warning): (.*)$`);
    for (const line of parseLines) {
      const m = line.match(head);
      if (m) out.push({ severity: m[3], text: m[4], line: +m[1], col: +m[2], parse: true });
      else if (out.length && line.trim()) out[out.length - 1].text += "\n" + line;
    }
    return out;
  } catch (e) {
    // Never risk the compiler for the sake of the second pass.
    parseBroken = true;
    console.warn("[lean] parse pass disabled:", e?.message ?? e);
    return [];
  } finally {
    parseLines = null;
  }
}

function check(code) {
  const res = compile(code);
  if (!res.ok) return res;
  const seen = new Set(res.messages.filter((m) => m.severity === "error").map((m) => `${m.line}:${m.text}`));
  const parse = parseErrors(code).filter((m) => !seen.has(`${m.line}:${m.text}`));
  return { ok: true, messages: [...parse, ...res.messages] };
}

self.onmessage = async ({ data }) => {
  if (data.type === "start") {
    base = data.base.replace(/\/$/, "");
    try {
      await boot();
    } catch (e) {
      post({ type: "error", text: e?.message ?? String(e) });
    }
  } else if (data.type === "compile") {
    post({ type: "result", id: data.id, ...compile(data.code) });
  } else if (data.type === "check") {
    post({ type: "result", id: data.id, ...check(data.code) });
  }
};
