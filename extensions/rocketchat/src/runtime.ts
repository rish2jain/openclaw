import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

let _runtime: OpenClawPluginApi["runtime"] | undefined;

export function setRocketChatRuntime(runtime: OpenClawPluginApi["runtime"]): void {
  _runtime = runtime;
}

export function getRocketChatRuntime(): OpenClawPluginApi["runtime"] {
  if (!_runtime) {
    throw new Error("Rocket.Chat runtime not initialized — call setRocketChatRuntime() first");
  }
  return _runtime;
}
