import type { ChannelId } from "../plugins/types.js";
import type { FailoverAction } from "./failover-router.js";

export type FailoverNotification = {
  deliveryChannel: ChannelId;
  recipientId?: string;
  message: string;
  type: "failover" | "failback";
  affectedChannel: ChannelId;
};

export type FailoverNotifierDeps = {
  getChannelLabel: (channel: ChannelId) => string;
};

export type FailoverNotifier = {
  buildNotification: (action: FailoverAction) => FailoverNotification;
  formatMessage: (action: FailoverAction) => string;
};

function defaultChannelLabel(channel: ChannelId): string {
  return channel.charAt(0).toUpperCase() + channel.slice(1);
}

export function createFailoverNotifier(deps?: Partial<FailoverNotifierDeps>): FailoverNotifier {
  const getChannelLabel = deps?.getChannelLabel ?? defaultChannelLabel;

  function formatMessage(action: FailoverAction): string {
    const fromLabel = getChannelLabel(action.fromChannel);
    const toLabel = getChannelLabel(action.toChannel);

    if (action.type === "failover") {
      return (
        `${fromLabel} is currently unavailable. ` +
        `Your conversation is continuing here on ${toLabel}. ` +
        `Messages will be routed back to ${fromLabel} when it recovers.`
      );
    }

    return (
      `${toLabel} has recovered. ` +
      `Your conversation is moving back from ${fromLabel}. ` +
      `Future messages will be delivered on ${toLabel}.`
    );
  }

  function buildNotification(action: FailoverAction): FailoverNotification {
    return {
      deliveryChannel: action.toChannel,
      recipientId: action.targetUserId,
      message: formatMessage(action),
      type: action.type,
      affectedChannel: action.type === "failover" ? action.fromChannel : action.toChannel,
    };
  }

  return { buildNotification, formatMessage };
}
