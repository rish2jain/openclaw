/**
 * Career data persistence — lazy singleton that loads from / saves to
 * ~/.openclaw/career/ JSON files.
 *
 * All MCP career tool handlers share the same CareerContext instance.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { createModeManager, type ModeManager } from "./agent/mode.js";
import { createJobStore, type JobStore } from "./jobs/store.js";
import { createNetworkGraph, type NetworkGraph } from "./network/types.js";
import { createOutreachPipeline, type OutreachPipeline } from "./outreach/pipeline.js";
import { createProfileStore, type ProfileStore } from "./profile/store.js";

const log = createSubsystemLogger("career/persistence");

export type CareerContext = {
  profileStore: ProfileStore;
  jobStore: JobStore;
  networkGraph: NetworkGraph;
  outreachPipeline: OutreachPipeline;
  modeManager: ModeManager;
  save: () => Promise<void>;
};

const CAREER_DIR = join(homedir(), ".openclaw", "career");

function ensureDir(): void {
  if (!existsSync(CAREER_DIR)) {
    mkdirSync(CAREER_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filename: string): T | null {
  const filePath = join(CAREER_DIR, filename);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (err) {
    log.warn(`failed to read ${filename}: ${String(err)}`);
    return null;
  }
}

function writeJsonFile(filename: string, data: unknown): void {
  ensureDir();
  writeFileSync(join(CAREER_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
}

let _instance: CareerContext | undefined;

/** Serializes save() calls so concurrent invocations do not interleave writes. */
let _saveLock: Promise<void> = Promise.resolve();

/**
 * Get the shared CareerContext singleton. Lazy-loads from disk on first call.
 */
export async function getCareerContext(): Promise<CareerContext> {
  if (_instance) {
    return _instance;
  }

  ensureDir();

  const profileStore = createProfileStore();
  const jobStore = createJobStore();
  const networkGraph = createNetworkGraph();
  const outreachPipeline = createOutreachPipeline();
  const modeManager = createModeManager();

  // Load persisted data synchronously.
  const profileData = readJsonFile("profile.json");
  const jobData = readJsonFile<{ listings: unknown[]; searches: unknown[] }>("jobs.json");
  const networkData = readJsonFile<{
    persons: Array<{ id: string; [k: string]: unknown }>;
    edges: unknown[];
  }>("network.json");
  const outreachData = readJsonFile<unknown[]>("outreach.json");

  if (profileData) {
    try {
      profileStore.fromJSON(profileData as Parameters<ProfileStore["fromJSON"]>[0]);
    } catch (err) {
      log.warn(`failed to restore profile: ${String(err)}`);
    }
  }

  if (jobData) {
    try {
      jobStore.fromJSON(jobData as Parameters<JobStore["fromJSON"]>[0]);
    } catch (err) {
      log.warn(`failed to restore jobs: ${String(err)}`);
    }
  }

  if (networkData) {
    try {
      if (Array.isArray(networkData.persons)) {
        for (const p of networkData.persons) {
          networkGraph.addPerson(p as Parameters<NetworkGraph["addPerson"]>[0]);
        }
      }
      if (Array.isArray(networkData.edges)) {
        for (const e of networkData.edges) {
          networkGraph.addEdge(e as Parameters<NetworkGraph["addEdge"]>[0]);
        }
      }
    } catch (err) {
      log.warn(`failed to restore network: ${String(err)}`);
    }
  }

  if (outreachData && Array.isArray(outreachData)) {
    try {
      outreachPipeline.fromJSON(outreachData as Parameters<OutreachPipeline["fromJSON"]>[0]);
    } catch (err) {
      log.warn(`failed to restore outreach: ${String(err)}`);
    }
  }

  async function save(): Promise<void> {
    const previous = _saveLock;
    let release!: () => void;
    _saveLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      writeJsonFile("profile.json", profileStore.toJSON());
      writeJsonFile("jobs.json", jobStore.toJSON());
      writeJsonFile("network.json", {
        persons: Array.from(networkGraph.persons.values()),
        edges: networkGraph.edges,
      });
      writeJsonFile("outreach.json", outreachPipeline.toJSON());
    } catch (err) {
      log.error(`failed to save career data: ${String(err)}`);
      throw err;
    } finally {
      release();
    }
  }

  _instance = { profileStore, jobStore, networkGraph, outreachPipeline, modeManager, save };
  return _instance;
}
