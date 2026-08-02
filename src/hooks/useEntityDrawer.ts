"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import type { EntityType } from "@/components/entities/EntityLink";

export interface DrawerState {
  drawerType: EntityType | null;
  drawerId: string | null;
}

export function useEntityDrawer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const drawerType = (searchParams.get("drawer") as EntityType | null) ?? null;
  const drawerId = searchParams.get("did") ?? null;

  const openDrawer = useCallback(
    (type: EntityType, id: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("drawer", type);
      params.set("did", id);
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams]
  );

  const closeDrawer = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("drawer");
    params.delete("did");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, searchParams]);

  return {
    drawerType,
    drawerId,
    openDrawer,
    closeDrawer,
    isOpen: drawerType !== null && drawerId !== null,
  };
}
