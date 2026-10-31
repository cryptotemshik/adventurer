"use client";

import { useEffect, useRef, useState } from "react";

/** Fetch JSON now and every `ms` while the tab is visible. */
export function usePolling<T>(url: string | null, ms: number, initial: T): [T, boolean, () => void] {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(false);
  const urlRef = useRef(url);
  urlRef.current = url;
  const tick = useRef<() => void>(() => {});
  tick.current = async () => {
    if (!urlRef.current) return;
    setLoading(true);
    try {
      const r = await fetch(urlRef.current, { cache: "no-store" });
      if (r.ok) setData(await r.json());
    } catch {
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void tick.current();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void tick.current();
    }, ms);
    const onVis = () => document.visibilityState === "visible" && void tick.current();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [url, ms]);
  return [data, loading, () => void tick.current()];
}
