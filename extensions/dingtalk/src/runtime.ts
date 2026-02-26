import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

let _runtime: OpenClawPluginApi["runtime"] | undefined;

export function setDingTalkRuntime(runtime: OpenClawPluginApi["runtime"]): void {
  _runtime = runtime;
}

export function getDingTalkRuntime(): OpenClawPluginApi["runtime"] {
  if (!_runtime) {
    throw new Error("DingTalk runtime not initialized — call setDingTalkRuntime() first");
  }
  return _runtime;
}
