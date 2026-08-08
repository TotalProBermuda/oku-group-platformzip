"use client";
import { useEffect, useRef } from "react";

export function useAutoRefresh(callback: () => void, intervalMs: number) {
  const cbRef = useRef(callback);
  useEffect(() => { cbRef.current = callback; });
  useEffect(() => {
    const id = setInterval(() => cbRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}
