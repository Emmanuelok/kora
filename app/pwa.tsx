"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight, Check, RefreshCw, WifiOff, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type InstallState = { prompt: InstallPromptEvent | null; installed: boolean };
const initialInstallState: InstallState = { prompt: null, installed: false };
let installState = initialInstallState;
const installListeners = new Set<() => void>();
function setInstallState(next: InstallState) {
  installState = next;
  installListeners.forEach((listener) => listener());
}
function subscribeInstall(listener: () => void) {
  installListeners.add(listener);
  return () => { installListeners.delete(listener); };
}
function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
const getOnlineSnapshot = () => navigator.onLine;
const getOnlineServerSnapshot = () => true;
const getInstallSnapshot = () => installState;
const getInstallServerSnapshot = () => initialInstallState;

/** A deliberately quiet global lifecycle: install is offered only on /install. */
export default function PwaExperience() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
  const requestedUpdate = useRef(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () => {
      const installed = standalone.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setInstallState({ ...installState, installed });
    };
    const captureInstall = (event: Event) => {
      event.preventDefault();
      setInstallState({ prompt: event as InstallPromptEvent, installed: false });
    };
    const onInstalled = () => setInstallState({ prompt: null, installed: true });
    syncInstalled();
    standalone.addEventListener("change", syncInstalled);
    window.addEventListener("beforeinstallprompt", captureInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      standalone.removeEventListener("change", syncInstalled);
      window.removeEventListener("beforeinstallprompt", captureInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installing: ServiceWorker | null = null;
    const onControllerChange = () => {
      // Reload only the tab whose visitor explicitly requested the update.
      if (requestedUpdate.current) {
        window.location.reload();
      } else {
        // Another tab may have applied this update. Its former waiting worker is
        // now active; remove the stale action instead of waiting for a second change.
        setWaiting(null);
        setUpdating(false);
      }
    };
    const onStateChange = () => {
      if (!disposed && installing?.state === "installed" && navigator.serviceWorker.controller) setWaiting(installing);
    };
    const onUpdateFound = () => {
      installing?.removeEventListener("statechange", onStateChange);
      installing = registration?.installing || null;
      installing?.addEventListener("statechange", onStateChange);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((result) => {
      if (disposed) return;
      registration = result;
      if (result.waiting) setWaiting(result.waiting);
      result.addEventListener("updatefound", onUpdateFound);
      if (result.installing) onUpdateFound();
    }).catch(() => {
      // Browsing remains available when browser policy or connectivity prevents registration.
    });
    return () => {
      disposed = true;
      registration?.removeEventListener("updatefound", onUpdateFound);
      installing?.removeEventListener("statechange", onStateChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  useEffect(() => {
    const resetOfflineNotice = () => setOfflineDismissed(false);
    window.addEventListener("online", resetOfflineNotice);
    return () => window.removeEventListener("online", resetOfflineNotice);
  }, []);

  if (!online && !offlineDismissed) return (
    <aside className="kora-pwa-notice" aria-label="Connection status">
      <WifiOff size={22} aria-hidden="true" />
      <div role="status"><strong>You’re offline.</strong><p>Reconnect to browse, save items or send a request.</p></div>
      <button className="kora-pwa-close" aria-label="Dismiss connection notice" onClick={() => setOfflineDismissed(true)}><X size={18} /></button>
    </aside>
  );

  if (waiting) return (
    <aside className="kora-pwa-notice kora-pwa-update" aria-label="App update available">
      <RefreshCw size={22} aria-hidden="true" />
      <div><div role="status"><strong>A fresh Kora is ready.</strong><p>Finish any unsent forms before refreshing.</p></div><div className="kora-pwa-notice-actions"><button disabled={updating} onClick={() => {
        requestedUpdate.current = true;
        // The worker can finish activation in another tab just before this click.
        if (waiting.state === "activated" || waiting.state === "redundant") {
          window.location.reload();
          return;
        }
        setUpdating(true);
        waiting.postMessage({ type: "KORA_APPLY_UPDATE" });
      }}>{updating ? "Updating…" : "Update & reload"}</button><button disabled={updating} onClick={() => setWaiting(null)}>Later</button></div></div>
    </aside>
  );
  return null;
}

/** Uses the browser's one-time prompt only when the browser actually provides it. */
export function InstallAction() {
  const { prompt, installed } = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getInstallServerSnapshot);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function install() {
    if (!prompt || busy) return;
    setBusy(true);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setMessage(choice.outcome === "accepted" ? "Installation requested. Follow your browser’s confirmation, then look for Kora on your device." : "No problem. You can keep exploring in your browser or install later from its menu.");
    } catch {
      setMessage("Your browser couldn’t open the install prompt. Use the steps below to add Kora manually.");
    } finally {
      setInstallState({ ...installState, prompt: null });
      setBusy(false);
    }
  }
  return (
    <div className="kora-install-actions">
      {installed ? <Link className="kora-install-primary" href="/shop"><Check size={20} aria-hidden="true" />You’re ready. Explore Kora<ArrowUpRight size={20} aria-hidden="true" /></Link> : prompt ? <button className="kora-install-primary" onClick={install} disabled={busy}><ArrowDownToLine size={20} aria-hidden="true" />{busy ? "Opening your browser…" : "Add Kora to your device"}<ArrowUpRight size={20} aria-hidden="true" /></button> : <a className="kora-install-primary" href="#install-guide"><ArrowDownToLine size={20} aria-hidden="true" />See how to install<ArrowUpRight size={20} aria-hidden="true" /></a>}
      <p className="kora-install-action-note" role="status">{message || (installed ? "You’re using Kora as an app on this device." : "Free to add. No app-store download. No sign-in needed.")}</p>
    </div>
  );
}
