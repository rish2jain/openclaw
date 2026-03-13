export {
  evaluateHealthLevel,
  isOperational,
  healthLevelSeverity,
  compareHealthLevels,
  DEFAULT_HEALTH_THRESHOLDS,
  type ChannelHealthLevel,
  type ChannelHealthMetrics,
  type ChannelHealthEvent,
  type HealthThresholds,
} from "./health-status.js";

export {
  createHealthMonitor,
  type HealthMonitor,
  type HealthMonitorDeps,
  type HealthMonitorOptions,
  type RecordDeliveryParams,
  type RecordConnectivityParams,
} from "./health-monitor.js";

export {
  createHealthReporter,
  type HealthReporter,
  type ChannelHealthReport,
  type HealthSummary,
} from "./health-reporter.js";
