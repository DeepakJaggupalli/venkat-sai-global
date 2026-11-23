"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js (scope "/") on public pages when phone job alerts are configured, so the browser keeps the
 * worker that receives alerts up to date. The worker caches nothing (public/sw.js).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const register = () => void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    if ("requestIdleCallback" in window) {
      const handle = window.requestIdleCallback(register, { timeout: 5000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(register, 2000);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
