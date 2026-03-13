export {
  resolveFailoverPreference,
  parseFailoverConfig,
  DEFAULT_FAILOVER_CONFIG,
  type FailoverPreference,
  type FailoverConfig,
} from "./failover-config.js";

export {
  createFailoverRouter,
  type FailoverRouter,
  type FailoverRouterDeps,
  type FailoverDecision,
  type FailoverAction,
  type EvaluateFailoverParams,
} from "./failover-router.js";

export {
  createFailoverNotifier,
  type FailoverNotifier,
  type FailoverNotifierDeps,
  type FailoverNotification,
} from "./failover-notifier.js";
