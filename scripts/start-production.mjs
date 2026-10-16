import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Direct Node children: no npm/shell intermediary to swallow deployment signals. */
export function superviseProduction({
  worker = [process.execPath, ".translation-worker/translations.cjs"],
  web = [process.execPath, createRequire(import.meta.url).resolve("next/dist/bin/next"), "start", "-p", process.env.PORT || "5000"],
  startupTimeoutMs = 30_000,
  shutdownTimeoutMs = 30_000,
} = {}) {
  return new Promise((resolveExit) => {
    const children = new Set();
    let stopping = false;
    let exitCode = 0;
    let shutdownTimer;
    let startupTimer;
    const log = (message) => console.error(`[production] ${message}`);
    const signalGroup = (child, signal) => {
      try {
        if (process.platform === "win32") child.kill(signal);
        else process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") log("child signal delivery failed");
      }
    };
    const finish = () => {
      if (!stopping || children.size) return;
      clearTimeout(startupTimer);
      clearTimeout(shutdownTimer);
      process.off("SIGTERM", onTerm);
      process.off("SIGINT", onInt);
      resolveExit(exitCode);
    };
    const stop = (code, signal = "SIGTERM") => {
      if (stopping) return;
      stopping = true;
      exitCode = code;
      clearTimeout(startupTimer);
      for (const child of children) signalGroup(child, signal);
      shutdownTimer = setTimeout(() => {
        log("shutdown deadline reached; killing remaining children");
        exitCode = 1;
        for (const child of children) signalGroup(child, "SIGKILL");
      }, shutdownTimeoutMs);
      finish();
    };
    const onTerm = () => stop(0, "SIGTERM");
    const onInt = () => stop(0, "SIGINT");
    process.on("SIGTERM", onTerm);
    process.on("SIGINT", onInt);
    const launch = (label, command) => {
      const child = spawn(command[0], command.slice(1), {
        stdio: ["inherit", "inherit", "inherit", "ipc"],
        detached: process.platform !== "win32",
      });
      children.add(child);
      child.once("error", () => {
        log(`${label} could not start`);
        stop(1);
      });
      child.once("close", () => {
        children.delete(child);
        if (!stopping) {
          // Even an unexpected exit(0) is a failed production service.
          log(`${label} exited unexpectedly`);
          stop(1);
        }
        finish();
      });
      return child;
    };
    try {
      startupTimer = setTimeout(() => {
        log("translation worker readiness deadline reached");
        stop(1);
      }, startupTimeoutMs);
      const child = launch("translation worker", worker);
      const onReady = (message) => {
        if (message?.type !== "translation-worker-ready" || stopping) return;
        child.off("message", onReady);
        clearTimeout(startupTimer);
        log("translation worker ready; starting web");
        try { launch("web", web); }
        catch { log("web could not start"); stop(1); }
      };
      child.on("message", onReady);
    } catch {
      log("translation worker could not start");
      stop(1);
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  process.exitCode = await superviseProduction();
}
