"use client";

import { useState, useRef, useCallback, useId } from "react";

type MediaType = "image" | "video" | "icon" | "any";

interface MediaUploadProps {
  value?: string;
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  accept?: string;
  maxSizeMB?: number;
  mediaType?: MediaType;
  aspectRatio?: "square" | "wide" | "portrait" | "free";
  dark?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const TYPE_ACCEPT: Record<MediaType, string> = {
  image: "image/jpeg,image/png,image/webp,image/gif,image/svg+xml",
  video: "video/mp4,video/webm,video/quicktime",
  icon:  "image/svg+xml,image/png,image/webp",
  any:   "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,video/mp4,video/webm,video/quicktime",
};

const TYPE_HINT: Record<MediaType, string> = {
  image: "JPG, PNG, WEBP, GIF or SVG",
  video: "MP4, WEBM or MOV",
  icon:  "SVG, PNG or WEBP (transparent preferred)",
  any:   "Images or video",
};

const ASPECT_RATIOS: Record<string, string> = {
  square:   "1 / 1",
  wide:     "16 / 9",
  portrait: "3 / 4",
  free:     "auto",
};

function isVideo(url: string) {
  return /\.(mp4|webm|mov|ogg)$/i.test(url) || url.includes("video/");
}

export default function MediaUpload({
  value,
  onChange,
  label,
  hint,
  accept,
  maxSizeMB = 10,
  mediaType = "image",
  aspectRatio = "wide",
  dark = false,
  disabled = false,
  compact = false,
}: MediaUploadProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const inputId = `media-upload-${uid.replace(/:/g, "")}`;

  const resolvedAccept = accept ?? TYPE_ACCEPT[mediaType];
  const resolvedHint   = hint   ?? TYPE_HINT[mediaType];

  const upload = useCallback(async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File must be under ${maxSizeMB} MB`);
      return;
    }

    setUploading(true);
    setProgress(5);
    setError(null);

    try {
      // Step 1: request presigned PUT URL
      const presignRes = await fetch("/api/v1/uploads", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
      });

      if (!presignRes.ok) {
        const d = await presignRes.json().catch(() => ({}));
        throw new Error(d.error ?? "Upload unavailable");
      }

      const { uploadUrl, mediaUrl } = await presignRes.json();
      setProgress(20);

      // Step 2: PUT directly to GCS
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(20 + Math.round((e.loaded / e.total) * 75));
        };
        xhr.onload = () => (xhr.status < 400 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
        xhr.onerror = () => reject(new Error("Network error during upload"));
        xhr.open("PUT", uploadUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      setProgress(100);
      onChange(mediaUrl);
    } catch (e: any) {
      setError(e.message ?? "Upload failed");
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 800);
    }
  }, [maxSizeMB, onChange]);

  const handleFiles = useCallback((files: FileList | null) => {
    if (files?.length) upload(files[0]);
  }, [upload]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (!disabled) handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const applyUrlInput = () => {
    if (urlInput.trim()) {
      onChange(urlInput.trim());
      setUrlInput("");
      setShowUrlInput(false);
    }
  };

  const bg     = dark ? "#1a1614" : "#fafaf9";
  const border  = dark ? "rgba(255,255,255,0.12)" : "#e5e0d8";
  const text    = dark ? "rgba(255,255,255,0.65)" : "#6b7280";
  const textSub = dark ? "rgba(255,255,255,0.35)" : "#9ca3af";
  const accent  = "#c41e3a";
  const activeBg = dark ? "rgba(196,30,58,0.08)" : "#fff9f9";

  const dragBorder = dragging ? accent : uploading ? "#d97706" : border;
  const dragBg     = dragging ? activeBg : bg;

  const ratio = ASPECT_RATIOS[aspectRatio] ?? "auto";
  const hasMedia = !!value;

  const containerHeight = compact ? 80 : aspectRatio === "free" ? "auto" : undefined;

  return (
    <div style={{ width: "100%" }}>
      {label && (
        <label htmlFor={inputId} style={{
          display: "block",
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: textSub,
          marginBottom: 8,
        }}>{label}</label>
      )}

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => !disabled && !uploading && inputRef.current?.click()}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: containerHeight ? undefined : ratio,
          height: typeof containerHeight === "number" ? containerHeight : containerHeight,
          minHeight: compact ? 80 : 120,
          border: `1.5px dashed ${dragBorder}`,
          borderRadius: 10,
          background: dragBg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          cursor: disabled ? "not-allowed" : uploading ? "wait" : "pointer",
          transition: "border-color 0.15s, background 0.15s",
          overflow: "hidden",
        }}
      >
        {/* Preview */}
        {hasMedia && !uploading && (
          <>
            {isVideo(value!) ? (
              <video
                src={value}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }}
                muted loop
              />
            ) : (
              <img
                src={value}
                alt="Media preview"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", borderRadius: 9 }}
              />
            )}
            {/* Overlay on hover */}
            <div style={{
              position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", borderRadius: 9,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              opacity: 0, transition: "opacity 0.2s",
            }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
            >
              <div style={{ color: "white", fontSize: 13, fontWeight: 600 }}>Click or drop to replace</div>
              <button
                onClick={(e) => { e.stopPropagation(); onChange(""); }}
                style={{ marginTop: 8, fontSize: 12, color: "rgba(255,255,255,0.7)", background: "none", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}
              >Remove</button>
            </div>
          </>
        )}

        {/* Upload state */}
        {!hasMedia && !uploading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: compact ? 4 : 8, padding: "16px 12px", textAlign: "center" }}>
            <svg width={compact ? 20 : 28} height={compact ? 20 : 28} viewBox="0 0 24 24" fill="none" stroke={dragging ? accent : textSub} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {!compact && (
              <>
                <span style={{ fontSize: 13, fontWeight: 600, color: text }}>
                  {dragging ? "Drop to upload" : "Drag & drop or click to upload"}
                </span>
                <span style={{ fontSize: 11, color: textSub }}>{resolvedHint} · Max {maxSizeMB} MB</span>
              </>
            )}
            {compact && <span style={{ fontSize: 11, color: textSub }}>Upload</span>}
          </div>
        )}

        {/* Progress bar */}
        {uploading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 20 }}>
            <div style={{ width: 180, height: 4, background: border, borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: accent, borderRadius: 2, transition: "width 0.2s" }} />
            </div>
            <span style={{ fontSize: 12, color: textSub }}>{progress < 100 ? `Uploading… ${progress}%` : "Processing…"}</span>
          </div>
        )}

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={resolvedAccept}
          style={{ display: "none" }}
          onChange={(e) => handleFiles(e.target.files)}
          disabled={disabled || uploading}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#dc2626", display: "flex", alignItems: "center", gap: 6 }}>
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          {error}
        </div>
      )}

      {/* Current URL display + paste URL option */}
      {!compact && (
        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
          {value && (
            <div style={{ flex: 1, fontSize: 11, color: textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              ✓ {value.replace("/api/v1/media/", "").split("/").pop()}
            </div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowUrlInput(!showUrlInput); }}
            style={{ fontSize: 11, color: textSub, background: "none", border: "none", cursor: "pointer", padding: 0, whiteSpace: "nowrap", textDecoration: "underline" }}
          >
            {showUrlInput ? "Cancel" : "Paste URL instead"}
          </button>
        </div>
      )}

      {showUrlInput && (
        <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…"
            style={{ flex: 1, padding: "8px 10px", border: `1px solid ${border}`, borderRadius: 7, fontSize: 13, background: bg, color: text }}
            onKeyDown={(e) => e.key === "Enter" && applyUrlInput()}
          />
          <button
            type="button"
            onClick={applyUrlInput}
            style={{ padding: "8px 14px", background: "#1a1614", color: "white", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
