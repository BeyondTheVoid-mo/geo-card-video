import { spawn } from "child_process";

export function run(cmd, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? 120000;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err = (err + chunk).slice(-8000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ out, err });
        return;
      }
      const failure = new Error(
        `${cmd} 失败${signal ? `（${signal}）` : `，退出码 ${code}`}\n${err}`.trim(),
      );
      failure.code = code;
      failure.stderr = err;
      failure.stdout = out;
      reject(failure);
    });
  });
}
