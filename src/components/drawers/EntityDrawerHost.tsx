"use client";

import { useState, useCallback } from "react";
import type { EntityType } from "@/components/entities/EntityLink";
import OrderDrawer from "./OrderDrawer";
import SeriesDrawer from "./SeriesDrawer";
import PayoutDrawer from "./PayoutDrawer";
import UserDrawer from "@/components/admin/UserDrawer";

interface DrawerFrame {
  type: EntityType;
  id: string;
}

interface EntityDrawerHostProps {
  drawerType: EntityType | null;
  drawerId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export default function EntityDrawerHost({
  drawerType,
  drawerId,
  onClose,
  onUpdated,
}: EntityDrawerHostProps) {
  const [stack, setStack] = useState<DrawerFrame[]>([]);

  const pushDrawer = useCallback((type: EntityType, id: string) => {
    setStack((prev) => [...prev, { type, id }]);
  }, []);

  const popDrawer = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const handleClose = useCallback(() => {
    if (stack.length > 0) {
      popDrawer();
    } else {
      onClose();
    }
  }, [stack.length, popDrawer, onClose]);

  const current: { type: EntityType; id: string } | null =
    stack.length > 0
      ? stack[stack.length - 1]
      : drawerType && drawerId
      ? { type: drawerType, id: drawerId }
      : null;

  if (!current) return null;

  const commonProps = {
    onUserOpen: (id: string) => pushDrawer("user", id),
    onOrderOpen: (id: string) => pushDrawer("order", id),
    onSeriesOpen: (id: string) => pushDrawer("series", id),
    onUpdated,
  };

  return (
    <>
      {current.type === "order" && (
        <OrderDrawer
          orderId={current.id}
          onClose={handleClose}
          onUserOpen={commonProps.onUserOpen}
          onSeriesOpen={commonProps.onSeriesOpen}
          onUpdated={onUpdated}
        />
      )}

      {current.type === "series" && (
        <SeriesDrawer
          seriesId={current.id}
          onClose={handleClose}
          onUserOpen={commonProps.onUserOpen}
          onOrderOpen={commonProps.onOrderOpen}
          onUpdated={onUpdated}
        />
      )}

      {current.type === "user" && (
        <UserDrawer
          userId={current.id}
          onClose={handleClose}
          onUserUpdated={() => onUpdated?.()}
        />
      )}

      {current.type === "ledger" && (
        <PayoutDrawer
          influencerId={current.id}
          onClose={handleClose}
          onUserOpen={commonProps.onUserOpen}
          onOrderOpen={commonProps.onOrderOpen}
        />
      )}
    </>
  );
}
