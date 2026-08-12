

import { DATA_DIR } from "@main/utils/constants";
import { IpcMainInvokeEvent, shell } from "electron";
import { appendFile, mkdir, readFile, stat, unlink, writeFile } from "fs/promises";
import path from "path";

import { PresenceLogEntry } from "../types";

const LOG_DIR_NAMES = ["ActivityTrackerLogs", "StalkerLogs"] as const;

/** Primary dir for NEW writes (stable). Cached after first resolve. */
let primaryLogsDir: string | null = null;

/**
 * Prefer ActivityTrackerLogs for new writes, but if only StalkerLogs exists
 * (legacy installs), keep writing there so we don't split one client across two folders.
 */
async function getPrimaryLogsDir(): Promise<string> {
    if (primaryLogsDir) return primaryLogsDir;

    const stalker = path.join(DATA_DIR, "StalkerLogs");
    const activity = path.join(DATA_DIR, "ActivityTrackerLogs");

    let hasStalker = false;
    let hasActivity = false;
    try {
        hasStalker = (await stat(stalker)).isDirectory();
    } catch { /* missing */ }
    try {
        hasActivity = (await stat(activity)).isDirectory();
    } catch { /* missing */ }

    // Legacy: only StalkerLogs → keep using it
    if (hasStalker && !hasActivity) {
        primaryLogsDir = stalker;
    } else {
        // Default / both exist → ActivityTrackerLogs
        primaryLogsDir = activity;
    }

    await mkdir(primaryLogsDir, { recursive: true });
    return primaryLogsDir;
}

/** Sibling client data roots (Equicord ↔ equibop) for read-only merge recovery. */
function siblingDataRoots(): string[] {
    try {
        const parent = path.dirname(DATA_DIR);
        const base = path.basename(DATA_DIR).toLowerCase();
        const names =
            base === "equicord" ? ["equibop", "Vencord", "vesktop"]
                : base === "equibop" ? ["Equicord", "Vencord", "vesktop"]
                    : base === "vencord" ? ["Equicord", "equibop", "vesktop"]
                        : [];
        return names.map(n => path.join(parent, n));
    } catch {
        return [];
    }
}

/** All directories that may contain `{userId}.jsonl` — primary + legacy + sibling clients. */
async function getReadableLogDirs(): Promise<string[]> {
    const dirs: string[] = [];
    const seen = new Set<string>();

    const push = async (dir: string) => {
        if (seen.has(dir)) return;
        try {
            if ((await stat(dir)).isDirectory()) {
                seen.add(dir);
                dirs.push(dir);
            }
        } catch { /* skip */ }
    };

    // Current DATA_DIR first
    for (const name of LOG_DIR_NAMES) {
        await push(path.join(DATA_DIR, name));
    }

    // Sibling clients (read-only recovery)
    for (const root of siblingDataRoots()) {
        for (const name of LOG_DIR_NAMES) {
            await push(path.join(root, name));
        }
    }

    // Ensure primary exists for writers
    const primary = await getPrimaryLogsDir();
    if (!seen.has(primary)) {
        dirs.unshift(primary);
    }

    return dirs;
}

function entryDedupeKey(log: PresenceLogEntry): string {
    return [
        log.userId ?? "",
        log.timestamp ?? 0,
        log.type ?? "",
        log.previousStatus ?? "",
        log.currentStatus ?? "",
        log.activitySummary ?? "",
    ].join("|");
}

async function readLogsFromFile(filePath: string): Promise<PresenceLogEntry[]> {
    try {
        const content = await readFile(filePath, "utf-8");
        const lines = content.trim().split("\n").filter(line => line.trim());
        const out: PresenceLogEntry[] = [];
        for (const line of lines) {
            try {
                out.push(JSON.parse(line) as PresenceLogEntry);
            } catch {
                // skip corrupt line — never wipe the file over one bad row
            }
        }
        return out;
    } catch {
        return [];
    }
}

export async function openLogsFolder(_event: IpcMainInvokeEvent) {
    const logsDir = await getPrimaryLogsDir();
    await shell.openPath(logsDir);
}

export async function openLogFile(_event: IpcMainInvokeEvent, userId: string) {
    const logsDir = await getPrimaryLogsDir();
    const filePath = path.join(logsDir, `${userId}.jsonl`);
    const error = await shell.openPath(filePath);
    if (error) {
        await shell.openPath(logsDir);
    }
}

/**
 * Append one log line. Does NOT rewrite the whole file.
 * (Old rewrite-on-append + retention filter permanently ate history when reads
 * returned partial/empty or cutoff filtered aggressively.)
 * `cutoffMs` is ignored on write — retention is applied only when reading for the UI.
 */
export async function appendLog(
    _event: IpcMainInvokeEvent,
    userId: string,
    entry: PresenceLogEntry,
    _cutoffMs: number
) {
    const logsDir = await getPrimaryLogsDir();
    const filePath = path.join(logsDir, `${userId}.jsonl`);

    try {
        await mkdir(logsDir, { recursive: true });
        const line = JSON.stringify(entry) + "\n";
        await appendFile(filePath, line, "utf-8");
    } catch (e) {
        console.error("Failed to append log", e);
        throw e;
    }
}

/**
 * Load logs for a user from all known folders (legacy StalkerLogs + ActivityTrackerLogs
 * under this client and sibling Equicord/equibop roots). Deduped + newest-first.
 */
export async function readLogs(
    _event: IpcMainInvokeEvent,
    userId: string,
    cutoffMs?: number
): Promise<PresenceLogEntry[]> {
    const dirs = await getReadableLogDirs();
    const byKey = new Map<string, PresenceLogEntry>();

    for (const dir of dirs) {
        const filePath = path.join(dir, `${userId}.jsonl`);
        const logs = await readLogsFromFile(filePath);
        for (const log of logs) {
            if (cutoffMs && typeof log.timestamp === "number" && log.timestamp < cutoffMs) {
                continue;
            }
            const key = entryDedupeKey(log);
            if (!byKey.has(key)) byKey.set(key, log);
        }
    }

    const merged = Array.from(byKey.values());
    merged.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    return merged;
}

export async function deleteLogs(_event: IpcMainInvokeEvent, userId: string) {
    // Delete from every known dir so "Delete Logs" is complete
    const dirs = await getReadableLogDirs();
    for (const dir of dirs) {
        const filePath = path.join(dir, `${userId}.jsonl`);
        try {
            await unlink(filePath);
        } catch { /* missing ok */ }
    }
}

/** Optional: list which dirs were scanned (for debug / Open Logs UX). */
export async function listLogDirs(_event: IpcMainInvokeEvent): Promise<string[]> {
    return getReadableLogDirs();
}

/**
 * Intentional full write after a merge/import.
 * Reads existing history from all known dirs, merges with `entries`, writes once
 * to the primary log dir. Used only for import/migration — normal logging is
 * append-only via appendLog.
 */
export async function writeMergedLogs(
    _event: IpcMainInvokeEvent,
    userId: string,
    entries: PresenceLogEntry[]
): Promise<number> {
    const existing = await readLogs(_event, userId); // no cutoff — full history
    const byKey = new Map<string, PresenceLogEntry>();
    for (const log of [...(entries ?? []), ...existing]) {
        if (!log || typeof log.timestamp !== "number") continue;
        const key = entryDedupeKey(log);
        if (!byKey.has(key)) byKey.set(key, log);
    }
    const merged = Array.from(byKey.values());
    merged.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));

    const logsDir = await getPrimaryLogsDir();
    const filePath = path.join(logsDir, `${userId}.jsonl`);
    await mkdir(logsDir, { recursive: true });
    const content = merged.length
        ? merged.map(log => JSON.stringify(log)).join("\n") + "\n"
        : "";
    // writeFile is intentional here — import needs a single merged snapshot
    await writeFile(filePath, content, "utf-8");
    return merged.length;
}
