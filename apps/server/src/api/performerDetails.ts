import { performers } from "../db/schema.js";

/**
 * A performer's profile facts: the columns a PATCH may set beyond name, bio
 * and framing. Validation lives here so the route reads as a route.
 *
 * Bad values are rejected rather than clamped, unlike the framing sliders: a
 * height of 900 cm or a birthdate in 2090 is a typo in a fact, and quietly
 * storing some nearby value would make it a wrong fact nobody notices.
 */

export const PERFORMER_GENDERS = [
  "female",
  "male",
  "trans_female",
  "trans_male",
  "non_binary",
  "intersex",
] as const;

const TEXT_FIELDS = [
  "country",
  "ethnicity",
  "hairColor",
  "eyeColor",
  "measurements",
  "tattoos",
  "piercings",
] as const;

const MAX_TEXT = 500;

export type PerformerDetailsBody = {
  gender?: string | null;
  birthdate?: string | null;
  country?: string | null;
  ethnicity?: string | null;
  hairColor?: string | null;
  eyeColor?: string | null;
  heightCm?: number | null;
  measurements?: string | null;
  tattoos?: string | null;
  piercings?: string | null;
  careerStart?: number | null;
  careerEnd?: number | null;
};

type DetailValues = Pick<
  Partial<typeof performers.$inferInsert>,
  "gender" | "birthdate" | "heightCm" | "careerStart" | "careerEnd" | (typeof TEXT_FIELDS)[number]
>;

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A whole year in range, or null. */
function parseYear(value: unknown, field: string): Parsed<number | null> {
  if (value === null) return { ok: true, value: null };
  if (!Number.isInteger(value) || (value as number) < 1900 || (value as number) > 2100) {
    return { ok: false, error: `${field} must be a year between 1900 and 2100` };
  }
  return { ok: true, value: value as number };
}

/** A real calendar date, `YYYY-MM-DD`, not in the future. */
function parseBirthdate(value: unknown, today: string): Parsed<string | null> {
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false, error: "birthdate must be a date written YYYY-MM-DD" };
  }
  // Round-tripped so 2001-02-30 is refused rather than read as 2 March.
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { ok: false, error: "birthdate is not a real date" };
  }
  if (value < "1900-01-01" || value > today) {
    return { ok: false, error: "birthdate must be between 1900 and today" };
  }
  return { ok: true, value };
}

/**
 * The detail fields present in a PATCH body, validated. Fields the body does
 * not mention are left out, so a save of one field leaves the rest alone.
 * Empty text is stored as null, as the bio is: "cleared" and "never written"
 * are one state.
 */
export function parsePerformerDetails(
  body: PerformerDetailsBody,
  today = new Date().toISOString().slice(0, 10),
): Parsed<DetailValues> {
  const values: DetailValues = {};

  if (body.gender !== undefined) {
    if (body.gender !== null && !PERFORMER_GENDERS.includes(body.gender as never)) {
      return { ok: false, error: `gender must be one of ${PERFORMER_GENDERS.join(", ")}` };
    }
    values.gender = body.gender;
  }

  if (body.birthdate !== undefined) {
    const parsed = parseBirthdate(body.birthdate, today);
    if (!parsed.ok) return parsed;
    values.birthdate = parsed.value;
  }

  for (const field of TEXT_FIELDS) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (raw !== null && typeof raw !== "string") {
      return { ok: false, error: `${field} must be text` };
    }
    const trimmed = raw?.trim() ?? "";
    if (trimmed.length > MAX_TEXT) {
      return { ok: false, error: `${field} must be at most ${MAX_TEXT} characters` };
    }
    values[field] = trimmed || null;
  }

  if (body.heightCm !== undefined) {
    const height = body.heightCm;
    if (height !== null && (!Number.isInteger(height) || height < 50 || height > 300)) {
      return { ok: false, error: "heightCm must be a whole number of centimetres, 50–300" };
    }
    values.heightCm = height;
  }

  for (const field of ["careerStart", "careerEnd"] as const) {
    if (body[field] === undefined) continue;
    const parsed = parseYear(body[field], field);
    if (!parsed.ok) return parsed;
    values[field] = parsed.value;
  }

  return { ok: true, value: values };
}

/**
 * Whole years between a birthdate and a later date, both `YYYY-MM-DD`; null
 * when either is missing or the date comes first, which is a data mistake
 * rather than a negative age.
 */
export function ageOn(birthdate: string | null, on: string | null): number | null {
  if (!birthdate || !on || on < birthdate) return null;
  const [by, bm, bd] = birthdate.split("-").map(Number);
  const [y, m, d] = on.split("-").map(Number);
  const hadBirthday = m > bm || (m === bm && d >= bd);
  return y - by - (hadBirthday ? 0 : 1);
}
