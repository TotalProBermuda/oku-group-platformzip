"use client";

import { useEffect, useState, type CSSProperties, type ImgHTMLAttributes } from "react";
import EventArtwork from "@/components/ui/EventArtwork";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  desktopCandidates: string[];
  mobileCandidates: string[];
  mobileFit?: "contain" | "cover";
};

/** Selects a purpose-designed mobile asset on narrow screens and keeps the existing
 * desktop artwork on larger screens. Each selected list retains normal URL fallbacks.
 */
export default function ResponsiveEventArtwork({ desktopCandidates, mobileCandidates, mobileFit = "contain", style, ...props }: Props) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  const responsiveStyle: CSSProperties = isMobile
    ? { width: "100%", height: "auto", maxHeight: "none", objectFit: mobileFit, ...style }
    : { width: "100%", maxHeight: 300, objectFit: "cover", ...style };
  return <EventArtwork candidates={isMobile ? mobileCandidates : desktopCandidates} {...props} style={responsiveStyle} />;
}
