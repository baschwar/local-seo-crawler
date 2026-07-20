import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SidecarMessage } from "./types.js";

type Listener = (message: SidecarMessage) => void;
const listeners = new Set<Listener>();
let initialization: Promise<void> | undefined;

function inTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function initializeBridge(): Promise<void> {
  if (!inTauri()) return;
  initialization ??= listen<unknown>("sidecar-event", (event) => {
    const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
    listeners.forEach((listener) => listener(payload as SidecarMessage));
  }).then(() => undefined);
  await initialization;
}

export function onSidecarMessage(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function sendSidecarMessage(type: string, payload: unknown): Promise<string> {
  const id = crypto.randomUUID();
  const message: SidecarMessage = { id, type, timestamp: new Date().toISOString(), payload };
  if (!inTauri()) {
    window.dispatchEvent(new CustomEvent("seo-auditor:sidecar", { detail: message }));
    throw new Error("Desktop commands require the Tauri application. Run `pnpm --filter @seo-auditor/desktop dev`.");
  }
  await invoke("send_sidecar_message", { message: JSON.stringify(message) });
  return id;
}

export async function pickProjectFile(): Promise<string | null> {
  if (!inTauri()) throw new Error("Opening a project requires the Tauri desktop application.");
  return invoke<string | null>("pick_project_file");
}

export async function latestSidecarEvent(): Promise<SidecarMessage | null> {
  if (!inTauri()) return null;
  return invoke<SidecarMessage | null>("latest_sidecar_event");
}
