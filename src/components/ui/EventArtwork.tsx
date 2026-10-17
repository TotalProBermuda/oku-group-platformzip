"use client";

import { useState, type ImgHTMLAttributes } from "react";

/** Reset failed candidates immediately when the locale/artwork changes. */
export default function EventArtwork({ candidates, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { candidates: string[] }) {
  return <ArtworkAttempt key={JSON.stringify(candidates)} candidates={candidates} {...props} />;
}

function ArtworkAttempt({ candidates, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & { candidates: string[] }) {
  const [index, setIndex] = useState(0);
  if (!candidates[index]) return null;
  return <img {...props} src={candidates[index]} onError={() => setIndex(current => current + 1)} />;
}
