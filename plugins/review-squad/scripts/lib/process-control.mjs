import {spawn as nodeSpawn} from "node:child_process";
import process from "node:process";

const DEFAULT_GRACE_MS = 5_000;
const POLL_MS = 25;

export const processGroupsSupported = process.platform !== "win32";

function isChildExited(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

function processGroupExists(pgid, signalFn = process.kill) {
  if (!processGroupsSupported || !Number.isInteger(pgid)) return null;
  try {
    signalFn(-pgid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForTreeExit(child, {pgid, timeoutMs, signalFn = process.kill} = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    const childExited = isChildExited(child) || !child.pid;
    const groupExists = processGroupExists(pgid, signalFn);
    const groupExited = groupExists === null ? null : !groupExists;
    if (childExited && groupExists !== true) {
      return {confirmed: true, child_exit_confirmed: true, process_group_exit_confirmed: groupExited, code: child.exitCode, signal: child.signalCode};
    }
    if (Date.now() >= deadline) {
      return {confirmed: false, child_exit_confirmed: childExited, process_group_exit_confirmed: groupExited, code: child.exitCode, signal: child.signalCode};
    }
    await sleep(Math.min(POLL_MS, Math.max(1, deadline - Date.now())));
  } while (true);
}

export async function classifyDirectChildClose(child, {
  pgid = child.reviewSquadProcess?.pgid ?? null,
  descendantDrainMs = DEFAULT_GRACE_MS,
  signalFn = process.kill
} = {}) {
  const descendantsPresentAtClose = processGroupExists(pgid, signalFn) === true;
  if (!descendantsPresentAtClose) {
    return {
      confirmed: true,
      child_exit_confirmed: true,
      process_group_exit_confirmed: processGroupsSupported && Number.isInteger(pgid) ? true : null,
      descendants_present_at_direct_child_close: false,
      descendants_drained_naturally: false,
      descendant_drain_grace_ms: descendantDrainMs,
      code: child.exitCode,
      signal: child.signalCode
    };
  }
  const exit = await waitForTreeExit(child, {pgid, timeoutMs: descendantDrainMs, signalFn});
  return {
    ...exit,
    descendants_present_at_direct_child_close: true,
    descendants_drained_naturally: exit.confirmed,
    descendant_drain_grace_ms: descendantDrainMs
  };
}

function recoveryGuidance(pid, pgid) {
  const commands = [];
  if (processGroupsSupported && Number.isInteger(pgid)) commands.push(`kill -KILL -- -${pgid}`);
  if (Number.isInteger(pid)) commands.push(`kill -KILL ${pid}`);
  return commands;
}

function recordSignal(evidence, {phase, signal, target, id, status, error}) {
  evidence.signal_attempts.push({phase, signal, target, id, status, error: error ? {name: error.name, code: error.code ?? null, message: error.message} : null});
}

function signalTree(child, signal, phase, evidence, {pgid, signalFn = process.kill} = {}) {
  if (processGroupsSupported && Number.isInteger(pgid)) {
    try {
      signalFn(-pgid, signal);
      recordSignal(evidence, {phase, signal, target: "process_group", id: pgid, status: "sent"});
      return true;
    } catch (error) {
      recordSignal(evidence, {phase, signal, target: "process_group", id: pgid, status: error?.code === "ESRCH" ? "already_absent" : "failed", error});
      if (error?.code === "ESRCH" && isChildExited(child)) return true;
    }
  }
  try {
    const sent = child.pid ? child.kill(signal) : false;
    recordSignal(evidence, {phase, signal, target: "direct_child", id: child.pid ?? null, status: sent ? "sent" : "not_sent"});
    return sent;
  } catch (error) {
    recordSignal(evidence, {phase, signal, target: "direct_child", id: child.pid ?? null, status: "failed", error});
    return false;
  }
}

export function spawnManagedProcess(command, args, {cwd, env, stdio = ["pipe", "pipe", "pipe"], spawnImpl = nodeSpawn} = {}) {
  const useProcessGroup = processGroupsSupported && spawnImpl === nodeSpawn;
  const child = spawnImpl(command, args, {cwd, env, stdio, detached: useProcessGroup});
  child.reviewSquadProcess = {
    pid: child.pid ?? null,
    pgid: useProcessGroup ? child.pid ?? null : null,
    process_group_supported: useProcessGroup
  };
  return child;
}

export async function boundedShutdown(child, {
  closeStdin = true,
  gracefulMs = DEFAULT_GRACE_MS,
  termMs = DEFAULT_GRACE_MS,
  killMs = DEFAULT_GRACE_MS,
  signalFn = process.kill
} = {}) {
  const pid = child.reviewSquadProcess?.pid ?? child.pid ?? null;
  const pgid = child.reviewSquadProcess?.pgid ?? null;
  const evidence = {
    pid,
    pgid,
    process_group_supported: processGroupsSupported && Number.isInteger(pgid),
    stdin_close: {attempted: false, status: "not_applicable", error: null},
    graceful_wait_ms: gracefulMs,
    term_wait_ms: termMs,
    kill_wait_ms: killMs,
    signal_attempts: [],
    sigterm_sent: false,
    sigkill_sent: false,
    child_exit_confirmed: false,
    process_group_exit_confirmed: null,
    exit_confirmed: false,
    exit_code: child.exitCode,
    exit_signal: child.signalCode,
    leaked_process: null
  };
  if (closeStdin && child.stdin && !child.stdin.destroyed && !child.stdin.writableEnded) {
    evidence.stdin_close.attempted = true;
    try {
      child.stdin.end();
      evidence.stdin_close.status = "closed";
    } catch (error) {
      evidence.stdin_close.status = "failed";
      evidence.stdin_close.error = {name: error.name, code: error.code ?? null, message: error.message};
    }
  }
  let exit = await waitForTreeExit(child, {pgid, timeoutMs: gracefulMs, signalFn});
  if (!exit.confirmed) {
    evidence.sigterm_sent = signalTree(child, "SIGTERM", "term", evidence, {pgid, signalFn});
    exit = await waitForTreeExit(child, {pgid, timeoutMs: termMs, signalFn});
  }
  if (!exit.confirmed) {
    evidence.sigkill_sent = signalTree(child, "SIGKILL", "kill", evidence, {pgid, signalFn});
    exit = await waitForTreeExit(child, {pgid, timeoutMs: killMs, signalFn});
  }
  evidence.child_exit_confirmed = exit.child_exit_confirmed;
  evidence.process_group_exit_confirmed = exit.process_group_exit_confirmed;
  evidence.exit_confirmed = exit.confirmed;
  evidence.exit_code = exit.code;
  evidence.exit_signal = exit.signal;
  if (!exit.confirmed) {
    evidence.leaked_process = {
      status: "leaked_process_failure",
      pid,
      pgid,
      child_exit_confirmed: exit.child_exit_confirmed,
      process_group_exit_confirmed: exit.process_group_exit_confirmed,
      recovery_commands: recoveryGuidance(pid, pgid),
      warning: "Do not remove scratch data or perform subsequent mutation until the process tree is confirmed absent."
    };
  }
  return evidence;
}

export function parseJsonl(text, {source = "JSONL"} = {}) {
  const events = [];
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch (cause) {
      const error = new Error(`${source} contains malformed or truncated JSON at line ${index + 1}: ${cause.message}`);
      error.diagnostic = {kind: "invalid_jsonl", source, line_number: index + 1, line: line.slice(0, 1_000)};
      throw error;
    }
  }
  return events;
}

function parseEmbeddedJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function findApiError(value) {
  const parsed = parseEmbeddedJson(value);
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.error && typeof parsed.error === "object" && (parsed.error.code || parsed.error.message)) return parsed.error;
  for (const child of Object.values(parsed)) {
    const found = findApiError(child);
    if (found) return found;
  }
  return null;
}

export function createCodexJsonlFailureMonitor({source = "Codex JSONL"} = {}) {
  let buffer = "";
  let completed = false;
  return (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === "turn.completed") completed = true;
      if (!completed && (event.type === "error" || event.type === "turn.failed")) {
        const apiError = findApiError(event);
        const diagnostic = apiError ? {
          kind: "codex_api_error",
          source,
          event_type: event.type,
          code: apiError.code ?? null,
          message: apiError.message ?? null,
          error_type: apiError.type ?? null,
          param: apiError.param ?? null
        } : {
          kind: "codex_jsonl_failure",
          source,
          event_type: event.type,
          message: typeof event.error?.message === "string" ? event.error.message : typeof event.message === "string" ? event.message : null
        };
        const error = new Error(diagnostic.code ? `${diagnostic.code}: ${diagnostic.message}` : `${source} reported ${event.type}`);
        error.diagnostic = diagnostic;
        throw error;
      }
    }
  };
}

export function runBoundedProcess(command, args, {
  cwd,
  env,
  timeoutMs,
  signal,
  stdin = null,
  stdio = ["pipe", "pipe", "pipe"],
  shutdown = {},
  spawnImpl = nodeSpawn,
  onSpawn,
  onStdout
} = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnManagedProcess(command, args, {cwd, env, stdio, spawnImpl});
    onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    let settled = false;
    let stopping = false;
    let timer;
    const started = process.hrtime.bigint();
    let closeResult = null;
    let resolveClose;
    const closed = new Promise((resolveClosed) => { resolveClose = resolveClosed; });

    const snapshot = (extra = {}) => ({
      command: [command, ...args],
      pid: child.reviewSquadProcess?.pid ?? child.pid ?? null,
      pgid: child.reviewSquadProcess?.pgid ?? null,
      code: child.exitCode,
      signal: child.signalCode,
      stdout,
      stderr,
      duration_ns: (process.hrtime.bigint() - started).toString(),
      ...extra
    });
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value);
    };
    const stop = async (reason, diagnostic) => {
      if (settled || stopping) return;
      stopping = true;
      const shutdownEvidence = await boundedShutdown(child, shutdown);
      if (!closeResult && shutdownEvidence.exit_confirmed) {
        await Promise.race([closed, new Promise((resolveWait) => setTimeout(resolveWait, shutdown.closeDrainMs ?? 1_000))]);
      }
      const finalDiagnostic = shutdownEvidence.exit_confirmed ? diagnostic : {kind: "leaked_process", trigger: diagnostic, leaked_process: shutdownEvidence.leaked_process};
      const result = snapshot({shutdown: shutdownEvidence, diagnostic: finalDiagnostic});
      const error = shutdownEvidence.exit_confirmed
        ? (reason instanceof Error ? reason : new Error(String(reason)))
        : new Error(`process tree exit could not be confirmed for pid=${result.pid} pgid=${result.pgid}`);
      error.result = result;
      finish(error);
    };
    const onAbort = () => void stop(signal.reason instanceof Error ? signal.reason : new Error("command aborted"), {kind: "aborted"});

    if (child.stdout) child.stdout.on("data", (chunk) => {
      stdout += chunk;
      try {
        onStdout?.(chunk, child);
      } catch (error) {
        void stop(error, error.diagnostic ?? {kind: "stdout_monitor_failure", message: error.message});
      }
    });
    if (child.stderr) child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => void stop(error, {kind: "process_error", message: error.message}));
    child.once("close", (code, exitSignal) => {
      closeResult = {code, signal: exitSignal};
      resolveClose(closeResult);
      if (stopping) return;
      clearTimeout(timer);
      const pgid = child.reviewSquadProcess?.pgid ?? null;
      void (async () => {
        const processTreeExit = await classifyDirectChildClose(child, {
          pgid,
          descendantDrainMs: shutdown.descendantDrainMs ?? shutdown.gracefulMs ?? DEFAULT_GRACE_MS,
          signalFn: shutdown.signalFn ?? process.kill
        });
        if (settled || stopping) return;
        if (!processTreeExit.confirmed) {
          void stop(new Error(`${command} direct child exited while descendants remained`), {
            kind: "descendants_survived_direct_child",
            descendant_exit_grace: processTreeExit
          });
          return;
        }
        const result = snapshot({code, signal: exitSignal, process_exit_confirmed: true, process_tree_exit: processTreeExit});
        if (code === 0) finish(null, result);
        else finish(Object.assign(new Error(`${command} exited ${code ?? exitSignal}`), {result}));
      })().catch((error) => void stop(error, {kind: "process_tree_classification_failure", message: error.message}));
    });
    if (signal?.aborted) void onAbort();
    else signal?.addEventListener("abort", onAbort, {once: true});
    if (Number.isFinite(timeoutMs)) timer = setTimeout(() => void stop(new Error(`${command} timed out after ${timeoutMs}ms`), {kind: "timeout", timeout_ms: timeoutMs}), timeoutMs);
    if (child.stdin && stdin !== null && !stopping) child.stdin.end(stdin);
    else if (child.stdin && stdio[0] === "ignore") child.stdin.end();
  });
}
