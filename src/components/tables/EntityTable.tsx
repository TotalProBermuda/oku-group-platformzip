"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

export interface EntityColumn<T = any> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  render: (row: T, index: number) => React.ReactNode;
}

interface EntityTableProps<T = any> {
  rows: T[];
  columns: EntityColumn<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  loading?: boolean;
  rowHighlight?: (row: T) => boolean;
  stickyHeader?: boolean;
}

type SortDir = "asc" | "desc" | null;

export default function EntityTable<T = any>({
  rows,
  columns,
  rowKey,
  onRowClick,
  emptyMessage = "No records found.",
  loading = false,
  rowHighlight,
  stickyHeader = false,
}: EntityTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const sorted = sortKey && sortDir
    ? [...rows].sort((a: any, b: any) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp =
          typeof av === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      })
    : rows;

  if (loading) {
    return (
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} style={{ width: col.width }}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key}>
                    <div
                      style={{
                        height: 14,
                        background: "var(--color-border-light)",
                        borderRadius: 4,
                        width: "70%",
                        animation: "pulse 1.5s ease-in-out infinite",
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead style={stickyHeader ? { position: "sticky", top: 0, zIndex: 10 } : {}}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  width: col.width,
                  cursor: col.sortable ? "pointer" : "default",
                  userSelect: "none",
                  whiteSpace: "nowrap",
                }}
                onClick={() => col.sortable && handleSort(col.key)}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {col.header}
                  {col.sortable && (
                    <span style={{ opacity: 0.5, display: "flex" }}>
                      {sortKey === col.key && sortDir === "asc" ? (
                        <ChevronUp size={12} />
                      ) : sortKey === col.key && sortDir === "desc" ? (
                        <ChevronDown size={12} />
                      ) : (
                        <ChevronsUpDown size={12} />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, idx) => {
            const highlight = rowHighlight?.(row);
            return (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                style={{
                  cursor: onRowClick ? "pointer" : "default",
                  background: highlight ? "var(--color-warning-bg)" : undefined,
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (onRowClick)
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      highlight ? "#fef8e7" : "var(--color-bg)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLTableRowElement).style.background =
                    highlight ? "var(--color-warning-bg)" : "";
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} style={{ width: col.width }}>
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                style={{
                  textAlign: "center",
                  padding: "40px 24px",
                  color: "var(--color-text-muted)",
                  fontSize: 14,
                }}
              >
                {emptyMessage}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
