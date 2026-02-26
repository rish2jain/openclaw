import type { ChannelPlugin, OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { rocketchatPlugin } from "./src/channel.js";
import { setRocketChatRuntime } from "./src/runtime.js";

const plugin = {
  id: "rocketchat",
  name: "Rocket.Chat",
  description: "Rocket.Chat open-source team messaging — webhooks and REST API",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setRocketChatRuntime(api.runtime);
    api.registerChannel({ plugin: rocketchatPlugin as ChannelPlugin });
  },
};

export default plugin;
