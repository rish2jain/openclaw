/**
 * Career data persistence — lazy singleton that loads from / saves to
 * ~/.openclaw/career/ JSON files.
 *
 * All MCP career tool handlers share the same CareerContext instance.
 */

import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { createModeManager, type ModeManager } from "./agent/mode.js";
import { createCompanyTracker, type CompanyTracker } from "./intel/company-tracker.js";
import { createJobStore, type JobStore } from "./jobs/store.js";
import { createInteractionTracker, type InteractionTracker } from "./network/tracker.js";
import { createNetworkGraph, type NetworkGraph } from "./network/types.js";
import { createOutreachPipeline, type OutreachPipeline } from "./outreach/pipeline.js";
import { createProfileStore, type ProfileStore } from "./profile/store.js";

const log = createSubsystemLogger("career/persistence");

export type CareerContext = {
  profileStore: ProfileStore;
  jobStore: JobStore;
  networkGraph: NetworkGraph;
  outreachPipeline: OutreachPipeline;
  companyTracker: CompanyTracker;
  interactionTracker: InteractionTracker;
  modeManager: ModeManager;
  save: () => Promise<void>;
};

const CAREER_DIR = join(homedir(), ".openclaw", "career");

async function ensureDir(): Promise<void> {
  try {
    await access(CAREER_DIR);
  } catch {
    await mkdir(CAREER_DIR, { recursive: true });
  }
}

async function readJsonFile<T>(filename: string): Promise<T | null> {
  const filePath = join(CAREER_DIR, filename);
  try {
    await access(filePath);
  } catch {
    return null;
  }
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    log.warn(`failed to read ${filename}: ${String(err)}`);
    return null;
  }
}

async function writeJsonFile(filename: string, data: unknown): Promise<void> {
  await ensureDir();
  const filePath = join(CAREER_DIR, filename);
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, filePath);
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

  await ensureDir();

  const profileStore = createProfileStore();
  const jobStore = createJobStore();
  const networkGraph = createNetworkGraph();
  const outreachPipeline = createOutreachPipeline();
  const companyTracker = createCompanyTracker();
  const interactionTracker = createInteractionTracker();
  const modeManager = createModeManager();

  // Load persisted data from disk.
  const [profileData, jobData, networkData, outreachData, intelData, interactionData] =
    await Promise.all([
      readJsonFile("profile.json"),
      readJsonFile<{ listings: unknown[]; searches: unknown[] }>("jobs.json"),
      readJsonFile<{
        persons: Array<{ id: string; [k: string]: unknown }>;
        edges: unknown[];
      }>("network.json"),
      readJsonFile<unknown[]>("outreach.json"),
      readJsonFile<Parameters<CompanyTracker["fromJSON"]>[0]>("intel.json"),
      readJsonFile<Parameters<InteractionTracker["fromJSON"]>[0]>("interactions.json"),
    ]);

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

  if (intelData) {
    try {
      companyTracker.fromJSON(intelData);
    } catch (err) {
      log.warn(`failed to restore company intel: ${String(err)}`);
    }
  }

  if (interactionData) {
    try {
      interactionTracker.fromJSON(interactionData);
    } catch (err) {
      log.warn(`failed to restore interactions: ${String(err)}`);
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
      await writeJsonFile("profile.json", profileStore.toJSON());
      await writeJsonFile("jobs.json", jobStore.toJSON());
      await writeJsonFile("network.json", {
        persons: Array.from(networkGraph.persons.values()),
        edges: networkGraph.edges,
      });
      await writeJsonFile("outreach.json", outreachPipeline.toJSON());
      await writeJsonFile("intel.json", companyTracker.toJSON());
      await writeJsonFile("interactions.json", interactionTracker.toJSON());
    } catch (err) {
      log.error(`failed to save career data: ${String(err)}`);
      throw err;
    } finally {
      release();
    }
  }

  _instance = {
    profileStore,
    jobStore,
    networkGraph,
    outreachPipeline,
    companyTracker,
    interactionTracker,
    modeManager,
    save,
  };
  return _instance;
}
