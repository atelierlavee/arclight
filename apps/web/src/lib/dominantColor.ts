import { useEffect, useState } from "react";
import { useAppearance } from "./appearance";

// Sampling a tiny copy is enough to find the overall colour and keeps the
// work to a few hundred pixels rather than two million.
const SAMPLE_SIZE = 24;

// Pixels outside these bands are shadow, blown highlight, or effectively
// grey — none of them say anything about the image's colour.
const MIN_LIGHTNESS = 0.15;
const MAX_LIGHTNESS = 0.9;
const MIN_SATURATION = 0.18;

// What the accent is finally rendered at. Clamping rather than using the
// source values is deliberate: a muted brown poster still yields a legible
// accent on a near-black background instead of disappearing into it.
const ACCENT_SATURATION = 72;
const ACCENT_LIGHTNESS = 66;

const HUE_BUCKETS = 24;

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;

  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);

  let hue: number;
  if (max === rn) hue = ((gn - bn) / delta + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) hue = ((bn - rn) / delta + 2) / 6;
  else hue = ((rn - gn) / delta + 4) / 6;

  return [hue * 360, saturation, lightness];
}

/**
 * The dominant vivid hue of an image, as an `hsl(...)` string, or null when
 * the image is essentially greyscale.
 *
 * Hues are bucketed and weighted by saturation, so a small vivid area beats
 * a large muddy one — which is usually what the eye picks out anyway.
 */
export function dominantAccent(image: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);

  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    // Only happens if the image is cross-origin. Ours are same-origin, but a
    // tainted canvas throws rather than returning anything, so guard it.
    return null;
  }

  const weights = new Array<number>(HUE_BUCKETS).fill(0);
  const hueSums = new Array<number>(HUE_BUCKETS).fill(0);

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue; // transparent
    const [hue, saturation, lightness] = rgbToHsl(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (lightness < MIN_LIGHTNESS || lightness > MAX_LIGHTNESS) continue;
    if (saturation < MIN_SATURATION) continue;

    const bucket = Math.min(HUE_BUCKETS - 1, Math.floor((hue / 360) * HUE_BUCKETS));
    weights[bucket] += saturation;
    hueSums[bucket] += hue * saturation;
  }

  let best = -1;
  let bestWeight = 0;
  for (let i = 0; i < HUE_BUCKETS; i++) {
    if (weights[i] > bestWeight) {
      bestWeight = weights[i];
      best = i;
    }
  }

  if (best === -1 || bestWeight === 0) return null;

  const hue = Math.round(hueSums[best] / weights[best]);
  return `hsl(${hue} ${ACCENT_SATURATION}% ${ACCENT_LIGHTNESS}%)`;
}

/**
 * Accent for an image URL, or null while loading or if it's greyscale.
 *
 * Always null in discreet mode: the image is blurred, but a page tinted the
 * colour of what is on it still says something about what that is.
 */
export function useAccentColor(imageSrc: string | null): string | null {
  const { discreet } = useAppearance();
  const src = discreet ? null : imageSrc;
  const [accent, setAccent] = useState<string | null>(null);

  useEffect(() => {
    setAccent(null);
    if (!src) return;

    let cancelled = false;
    const image = new Image();
    // Same-origin, so this only matters if the URL ever becomes absolute.
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!cancelled) setAccent(dominantAccent(image));
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return accent;
}
