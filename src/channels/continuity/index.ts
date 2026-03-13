export {
  createThreadRegistry,
  buildCanonicalThreadId,
  type ThreadRegistry,
  type ThreadRegistryOptions,
  type ConversationThread,
  type ThreadReference,
  type RegisterThreadParams,
  type ThreadRegistrySnapshot,
} from "./thread-registry.js";

export {
  createIdentityLinker,
  type IdentityLinker,
  type ChannelIdentity,
  type LinkedIdentityGroup,
  type IdentityLinkMethod,
  type LinkIdentitiesParams,
} from "./identity-linker.js";

export {
  createContextBridge,
  type ContextBridge,
  type ContextBridgeDeps,
  type ContextBridgeOptions,
  type BridgedContext,
  type BridgedMessage,
  type BridgeReason,
  type BuildBridgeContextParams,
  type RecordMessageParams,
} from "./context-bridge.js";
