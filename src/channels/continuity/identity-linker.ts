import { randomUUID } from "node:crypto";
import { createSubsystemLogger } from "../../logging/subsystem.js";
import type { ChannelId } from "../plugins/types.js";

const log = createSubsystemLogger("channels/continuity/identity-linker");

export type ChannelIdentity = {
  channel: ChannelId;
  userId: string;
  displayName?: string;
  username?: string;
  e164?: string;
  lastSeenAt: number;
};

export type LinkedIdentityGroup = {
  groupId: string;
  primaryName?: string;
  identities: ChannelIdentity[];
  linkedAt: number;
  lastActiveAt: number;
  linkMethod: IdentityLinkMethod;
};

export type IdentityLinkMethod = "manual" | "config" | "e164" | "username" | "verified";

export type IdentityLinker = {
  linkIdentities: (params: LinkIdentitiesParams) => LinkedIdentityGroup;
  registerIdentity: (identity: ChannelIdentity) => void;
  findGroup: (channel: ChannelId, userId: string) => LinkedIdentityGroup | undefined;
  getGroup: (groupId: string) => LinkedIdentityGroup | undefined;
  getLinkedIdentities: (channel: ChannelId, userId: string) => ChannelIdentity[];
  resolveIdentityOnChannel: (
    sourceChannel: ChannelId,
    sourceUserId: string,
    targetChannel: ChannelId,
  ) => ChannelIdentity | undefined;
  loadFromConfig: (identityLinks: Record<string, string[]>) => void;
  pruneStale: (maxAgeMs: number) => number;
  exportGroups: () => LinkedIdentityGroup[];
  /** Restore from persisted state (e.g. SQLite). Clears existing groups first. */
  restoreFromPersisted: (
    groups: Array<{
      groupId: string;
      primaryName?: string;
      linkMethod: IdentityLinkMethod;
      linkedAt: number;
      lastActiveAt: number;
    }>,
    links: Array<{
      groupId: string;
      channel: ChannelId;
      userId: string;
      displayName?: string;
      username?: string;
      e164?: string;
      lastSeenAt: number;
    }>,
  ) => void;
};

export type LinkIdentitiesParams = {
  identityA: { channel: ChannelId; userId: string };
  identityB: { channel: ChannelId; userId: string };
  method: IdentityLinkMethod;
};

function buildIdentityKey(channel: ChannelId, userId: string): string {
  return `${channel}:${userId}`.toLowerCase();
}

function generateGroupId(): string {
  return `ig-${randomUUID()}`;
}

function parseConfigIdentity(raw: string): { channel: ChannelId; userId: string } | undefined {
  const colonIdx = raw.indexOf(":");
  if (colonIdx <= 0 || colonIdx >= raw.length - 1) {
    return undefined;
  }
  const channel = raw.slice(0, colonIdx).trim().toLowerCase();
  const userId = raw.slice(colonIdx + 1).trim();
  if (!channel || !userId) {
    return undefined;
  }
  return { channel, userId };
}

export function createIdentityLinker(): IdentityLinker {
  const groups = new Map<string, LinkedIdentityGroup>();
  const identityToGroup = new Map<string, string>();

  function ensureIdentityInGroup(
    group: LinkedIdentityGroup,
    channel: ChannelId,
    userId: string,
  ): void {
    const key = buildIdentityKey(channel, userId);
    const existing = group.identities.find((i) => buildIdentityKey(i.channel, i.userId) === key);
    if (!existing) {
      const now = Date.now();
      group.identities.push({ channel, userId, lastSeenAt: now });
    }
    identityToGroup.set(key, group.groupId);
  }

  function registerIdentity(identity: ChannelIdentity): void {
    const key = buildIdentityKey(identity.channel, identity.userId);
    const existingGroupId = identityToGroup.get(key);

    if (existingGroupId) {
      const group = groups.get(existingGroupId);
      if (group) {
        const idx = group.identities.findIndex(
          (i) => i.channel === identity.channel && i.userId === identity.userId,
        );
        if (idx >= 0) {
          group.identities[idx] = identity;
        } else {
          group.identities.push(identity);
        }
        group.lastActiveAt = Math.max(group.lastActiveAt, identity.lastSeenAt);
        return;
      }
    }

    const groupId = generateGroupId();
    const group: LinkedIdentityGroup = {
      groupId,
      primaryName: identity.displayName,
      identities: [identity],
      linkedAt: identity.lastSeenAt,
      lastActiveAt: identity.lastSeenAt,
      linkMethod: "manual",
    };
    groups.set(groupId, group);
    identityToGroup.set(key, groupId);
  }

  function linkIdentities(params: LinkIdentitiesParams): LinkedIdentityGroup {
    const keyA = buildIdentityKey(params.identityA.channel, params.identityA.userId);
    const keyB = buildIdentityKey(params.identityB.channel, params.identityB.userId);
    const groupIdA = identityToGroup.get(keyA);
    const groupIdB = identityToGroup.get(keyB);
    const now = Date.now();

    if (groupIdA && groupIdB && groupIdA === groupIdB) {
      const group = groups.get(groupIdA);
      if (group) {
        group.lastActiveAt = now;
        return group;
      }
    }

    let targetGroup: LinkedIdentityGroup;

    if (groupIdA && groups.has(groupIdA)) {
      targetGroup = groups.get(groupIdA)!;
    } else if (groupIdB && groups.has(groupIdB)) {
      targetGroup = groups.get(groupIdB)!;
    } else {
      targetGroup = {
        groupId: generateGroupId(),
        identities: [],
        linkedAt: now,
        lastActiveAt: now,
        linkMethod: params.method,
      };
      groups.set(targetGroup.groupId, targetGroup);
    }

    ensureIdentityInGroup(targetGroup, params.identityA.channel, params.identityA.userId);
    ensureIdentityInGroup(targetGroup, params.identityB.channel, params.identityB.userId);

    if (groupIdB && groupIdB !== targetGroup.groupId) {
      const otherGroup = groups.get(groupIdB);
      if (otherGroup) {
        for (const identity of otherGroup.identities) {
          ensureIdentityInGroup(targetGroup, identity.channel, identity.userId);
        }
        groups.delete(groupIdB);
        targetGroup.lastActiveAt = Math.max(targetGroup.lastActiveAt, otherGroup.lastActiveAt);
      }
    }

    targetGroup.lastActiveAt = now;

    log.info("linked identities", {
      groupId: targetGroup.groupId,
      channelA: params.identityA.channel,
      channelB: params.identityB.channel,
      method: params.method,
      totalIdentities: targetGroup.identities.length,
    });

    return targetGroup;
  }

  function findGroup(channel: ChannelId, userId: string): LinkedIdentityGroup | undefined {
    const key = buildIdentityKey(channel, userId);
    const groupId = identityToGroup.get(key);
    if (!groupId) {
      return undefined;
    }
    return groups.get(groupId);
  }

  function getGroup(groupId: string): LinkedIdentityGroup | undefined {
    return groups.get(groupId);
  }

  function getLinkedIdentities(channel: ChannelId, userId: string): ChannelIdentity[] {
    const group = findGroup(channel, userId);
    if (!group) {
      return [];
    }
    return group.identities;
  }

  function resolveIdentityOnChannel(
    sourceChannel: ChannelId,
    sourceUserId: string,
    targetChannel: ChannelId,
  ): ChannelIdentity | undefined {
    const group = findGroup(sourceChannel, sourceUserId);
    if (!group) {
      return undefined;
    }
    return group.identities.find((i) => i.channel === targetChannel);
  }

  function loadFromConfig(identityLinks: Record<string, string[]>): void {
    for (const [canonical, linkedIds] of Object.entries(identityLinks)) {
      if (!Array.isArray(linkedIds) || linkedIds.length === 0) {
        continue;
      }
      const parsedCanonical = parseConfigIdentity(canonical);
      if (!parsedCanonical) {
        log.warn("invalid canonical identity in config", { canonical });
        continue;
      }
      for (const linkedId of linkedIds) {
        const parsed = parseConfigIdentity(linkedId);
        if (!parsed) {
          log.warn("invalid linked identity in config", { linkedId, canonical });
          continue;
        }
        linkIdentities({ identityA: parsedCanonical, identityB: parsed, method: "config" });
      }
    }
  }

  function pruneStale(maxAgeMs: number): number {
    const now = Date.now();
    const cutoff = now - maxAgeMs;
    let pruned = 0;
    for (const [groupId, group] of groups) {
      if (group.lastActiveAt < cutoff) {
        for (const identity of group.identities) {
          const key = buildIdentityKey(identity.channel, identity.userId);
          identityToGroup.delete(key);
        }
        groups.delete(groupId);
        pruned += 1;
      }
    }
    if (pruned > 0) {
      log.info("pruned stale identity groups", { pruned });
    }
    return pruned;
  }

  function exportGroups(): LinkedIdentityGroup[] {
    return Array.from(groups.values());
  }

  function restoreFromPersisted(
    persistedGroups: Array<{
      groupId: string;
      primaryName?: string;
      linkMethod: IdentityLinkMethod;
      linkedAt: number;
      lastActiveAt: number;
    }>,
    persistedLinks: Array<{
      groupId: string;
      channel: ChannelId;
      userId: string;
      displayName?: string;
      username?: string;
      e164?: string;
      lastSeenAt: number;
    }>,
  ): void {
    groups.clear();
    identityToGroup.clear();
    const linksByGroup = new Map<string, typeof persistedLinks>();
    for (const link of persistedLinks) {
      const list = linksByGroup.get(link.groupId) ?? [];
      list.push(link);
      linksByGroup.set(link.groupId, list);
    }
    for (const g of persistedGroups) {
      const linkList = linksByGroup.get(g.groupId) ?? [];
      const identities: ChannelIdentity[] = linkList.map((l) => ({
        channel: l.channel,
        userId: l.userId,
        displayName: l.displayName,
        username: l.username,
        e164: l.e164,
        lastSeenAt: l.lastSeenAt,
      }));
      const group: LinkedIdentityGroup = {
        groupId: g.groupId,
        primaryName: g.primaryName,
        identities,
        linkedAt: g.linkedAt,
        lastActiveAt: g.lastActiveAt,
        linkMethod: g.linkMethod,
      };
      groups.set(g.groupId, group);
      for (const ident of identities) {
        identityToGroup.set(buildIdentityKey(ident.channel, ident.userId), g.groupId);
      }
    }
  }

  return {
    linkIdentities,
    registerIdentity,
    findGroup,
    getGroup,
    getLinkedIdentities,
    resolveIdentityOnChannel,
    loadFromConfig,
    pruneStale,
    exportGroups,
    restoreFromPersisted,
  };
}
