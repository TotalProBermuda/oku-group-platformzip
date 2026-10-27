"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type VenuePhoto = { src: string; alt: string };
type Venue = {
  href: string;
  title: string;
  category: string;
  description: string;
  cta: string;
  photos: VenuePhoto[];
};

const controls = {
  en: { previous: "Previous venue", next: "Next venue", pause: "Pause photo rotation", resume: "Resume photo rotation", slide: "Go to venue" },
  es: { previous: "Lugar anterior", next: "Lugar siguiente", pause: "Pausar rotación de fotos", resume: "Reanudar rotación de fotos", slide: "Ir al lugar" },
  pt: { previous: "Local anterior", next: "Próximo local", pause: "Pausar rotação de fotos", resume: "Retomar rotação de fotos", slide: "Ir para o local" },
} as const;

export default function VenueOrbit({
  label,
  locale,
  venues,
}: {
  label: string;
  locale: string;
  venues: Venue[];
}) {
  const [active, setActive] = useState(0);
  const [photoIndexes, setPhotoIndexes] = useState(() => venues.map(() => 0));
  const [paused, setPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const copy = controls[locale as keyof typeof controls] || controls.en;

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setPhotoIndexes((current) => current.map((index, venueIndex) => {
        const count = venues[venueIndex]?.photos.length || 1;
        return (index + 1) % count;
      }));
    }, 5200);
    return () => window.clearInterval(timer);
  }, [paused, venues]);

  const changeVenue = (direction: number) => {
    setActive((current) => (current + direction + venues.length) % venues.length);
  };

  return (
    <div
      className="venue-orbit"
      role="region"
      aria-label={label}
      aria-roledescription="carousel"
      onTouchStart={(event) => { touchStartX.current = event.changedTouches[0]?.screenX ?? null; }}
      onTouchEnd={(event) => {
        const start = touchStartX.current;
        const end = event.changedTouches[0]?.screenX;
        if (start !== null && end !== undefined && Math.abs(end - start) > 42) changeVenue(end < start ? 1 : -1);
        touchStartX.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") changeVenue(1);
        if (event.key === "ArrowLeft") changeVenue(-1);
      }}
    >
      <div className="venue-orbit-ring" aria-hidden="true" />
      {venues.map((venue, index) => {
        const position = (index - active + venues.length) % venues.length;
        const imageIndex = photoIndexes[index] % Math.max(venue.photos.length, 1);
        const photo = venue.photos[imageIndex];
        const positionClass = position === 0 ? "is-active" : position === 1 ? "is-right" : "is-left";
        return (
          <article className={`venue-orbit-card ${positionClass}`} key={venue.href} aria-hidden={position !== 0}>
            <Link
              href={venue.href}
              className="venue-orbit-card-link"
              tabIndex={position === 0 ? 0 : -1}
              aria-label={`${venue.title}: ${venue.cta}`}
            >
              <div className="venue-orbit-image">
                <Image
                  key={photo.src}
                  src={photo.src}
                  alt={photo.alt}
                  fill
                  sizes="(max-width: 700px) 78vw, 360px"
                  priority={index === active}
                  draggable={false}
                />
                <span className="venue-orbit-category">{venue.category}</span>
                <span className="venue-orbit-photo-count" aria-hidden="true">
                  {String(imageIndex + 1).padStart(2, "0")} / {String(venue.photos.length).padStart(2, "0")}
                </span>
              </div>
              <div className="venue-orbit-card-copy">
                <h3>{venue.title}</h3>
                <p>{venue.description}</p>
                <span className="venue-orbit-card-cta">{venue.cta} <span aria-hidden="true">→</span></span>
              </div>
            </Link>
          </article>
        );
      })}
      <div className="venue-orbit-controls">
        <button type="button" className="venue-orbit-arrow venue-orbit-prev" onClick={() => changeVenue(-1)} aria-label={copy.previous}>‹</button>
        <div className="venue-orbit-dots" aria-label={label}>
          {venues.map((venue, index) => (
            <button
              key={venue.href}
              type="button"
              className={index === active ? "is-active" : ""}
              aria-label={`${copy.slide} ${index + 1}: ${venue.title}`}
              aria-current={index === active ? "true" : undefined}
              onClick={() => setActive(index)}
            />
          ))}
        </div>
        <button type="button" className="venue-orbit-pause" onClick={() => setPaused((value) => !value)} aria-label={paused ? copy.resume : copy.pause}>
          {paused ? "▶" : "Ⅱ"}
        </button>
        <button type="button" className="venue-orbit-arrow venue-orbit-next" onClick={() => changeVenue(1)} aria-label={copy.next}>›</button>
      </div>
    </div>
  );
}
