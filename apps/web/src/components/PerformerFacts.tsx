import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EditDialog, SaveButton } from "./EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import {
  PERFORMER_GENDERS,
  savePerformerFacts,
  type PerformerDetail,
  type PerformerFacts as Facts,
  type PerformerGender,
} from "@/lib/performerApi";
import { invalidatePerformer } from "@/lib/invalidate";

function formatBirthdate(birthdate: string): string {
  // Built from the parts rather than parsed, so no time zone can move it a day.
  const [y, m, d] = birthdate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type Fact = { label: string; value: string };

/** The facts that are known, in reading order. */
function knownFacts(performer: PerformerDetail): Fact[] {
  const facts: (Fact | null)[] = [
    performer.birthdate ? { label: "Born", value: formatBirthdate(performer.birthdate) } : null,
    performer.gender ? { label: "Gender", value: PERFORMER_GENDERS[performer.gender] } : null,
    performer.country ? { label: "Country", value: performer.country } : null,
    performer.ethnicity ? { label: "Ethnicity", value: performer.ethnicity } : null,
    performer.heightCm ? { label: "Height", value: `${performer.heightCm} cm` } : null,
    performer.hairColor ? { label: "Hair", value: performer.hairColor } : null,
    performer.eyeColor ? { label: "Eyes", value: performer.eyeColor } : null,
  ];
  return facts.filter((fact): fact is Fact => fact !== null);
}

/**
 * "Inside left ankle (Cat), Navel" as separate items. Commas inside brackets
 * belong to one item, so a description is not cut in half.
 */
function splitList(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of text) {
    if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    if (char === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}

/**
 * A performer's profile facts as a short, centred spec sheet: each fact a
 * tiny spaced label over its value, laid out in a wrapping row with no
 * boxes around them. Tattoos and piercings follow as one line each. Only
 * what is known is shown; with nothing known, nothing at all.
 */
export function PerformerFacts({ performer }: { performer: PerformerDetail }) {
  const facts = knownFacts(performer);
  const empty = facts.length === 0 && !performer.tattoos && !performer.piercings;

  if (empty) return null;

  const tattoos = performer.tattoos ? splitList(performer.tattoos) : [];
  const piercings = performer.piercings ? splitList(performer.piercings) : [];

  return (
    <section aria-label="Details" className="flex flex-col items-center gap-3 text-center">
      {facts.length > 0 && (
        <dl className="flex flex-wrap justify-center gap-x-7 gap-y-3">
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col-reverse items-center gap-1">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
                {fact.label}
              </dt>
              <dd className="text-sm font-semibold text-white">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {(tattoos.length > 0 || piercings.length > 0) && (
        <div className="max-w-2xl space-y-1 text-sm text-foreground/80">
          {tattoos.length > 0 && (
            <p>
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
                Tattoos
              </span>
              {tattoos.join(" · ")}
            </p>
          )}
          {piercings.length > 0 && (
            <p>
              <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary">
                Piercings
              </span>
              {piercings.join(" · ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/** Every editable fact as the string an input holds. */
type Draft = Record<keyof Facts, string>;

function toDraft(performer: PerformerDetail): Draft {
  const text = (value: string | number | null) => (value === null ? "" : String(value));
  return {
    gender: text(performer.gender),
    birthdate: text(performer.birthdate),
    country: text(performer.country),
    ethnicity: text(performer.ethnicity),
    hairColor: text(performer.hairColor),
    eyeColor: text(performer.eyeColor),
    heightCm: text(performer.heightCm),
    measurements: text(performer.measurements),
    tattoos: text(performer.tattoos),
    piercings: text(performer.piercings),
    careerStart: text(performer.careerStart),
    careerEnd: text(performer.careerEnd),
  };
}

const NUMBER_FIELDS = new Set<keyof Facts>(["heightCm", "careerStart", "careerEnd"]);

/**
 * Only what changed, so saving an untouched form writes nothing and a field
 * edited elsewhere in the meantime is not overwritten with a stale copy.
 * Numbers that do not parse are sent as they are, and the server's 400 says
 * which one.
 */
function changes(before: Draft, after: Draft): Partial<Facts> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(after) as (keyof Draft)[]) {
    if (after[key].trim() === before[key].trim()) continue;
    const value = after[key].trim();
    if (NUMBER_FIELDS.has(key)) {
      patch[key] = value === "" ? null : Number(value);
    } else {
      patch[key] = value === "" ? null : value;
    }
  }
  return patch;
}

const FIELDS: { key: keyof Facts; label: string; placeholder?: string; type?: string }[] = [
  { key: "birthdate", label: "Birthdate", type: "date" },
  { key: "country", label: "Country" },
  { key: "ethnicity", label: "Ethnicity" },
  { key: "heightCm", label: "Height (cm)", type: "number" },
  { key: "measurements", label: "Measurements", placeholder: "34B-24-35" },
  { key: "hairColor", label: "Hair" },
  { key: "eyeColor", label: "Eyes" },
  { key: "careerStart", label: "Career from", type: "number", placeholder: "Year" },
  { key: "careerEnd", label: "Career to", type: "number", placeholder: "Year, or empty if active" },
  { key: "tattoos", label: "Tattoos" },
  { key: "piercings", label: "Piercings" },
];

export function PerformerFactsDialog({
  performer,
  onClose,
}: {
  performer: PerformerDetail;
  onClose: () => void;
}) {
  const [initial] = useState(() => toDraft(performer));
  const [draft, setDraft] = useState(initial);
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: () => savePerformerFacts(performer.id, changes(initial, draft)),
    onSuccess: () => {
      invalidatePerformer(queryClient, performer.id);
      onClose();
    },
  });

  const set = (key: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  const dirty = Object.keys(changes(initial, draft)).length > 0;

  return (
    <EditDialog
      title={
        <>
          Details for <span className="sensitive">{performer.name}</span>
        </>
      }
      onClose={onClose}
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">Gender</span>
          <select value={draft.gender} onChange={set("gender")} className={EDIT_INPUT}>
            <option value="">Not set</option>
            {(Object.keys(PERFORMER_GENDERS) as PerformerGender[]).map((gender) => (
              <option key={gender} value={gender}>
                {PERFORMER_GENDERS[gender]}
              </option>
            ))}
          </select>
        </label>
        {FIELDS.map((field) => (
          <label key={field.key} className="block space-y-1">
            <span className="text-xs text-muted-foreground">{field.label}</span>
            <input
              type={field.type ?? "text"}
              value={draft[field.key]}
              onChange={set(field.key)}
              placeholder={field.placeholder}
              className={EDIT_INPUT}
            />
          </label>
        ))}
      </div>

      {save.error && <p className="text-xs text-destructive">{save.error.message}</p>}

      <SaveButton onClick={() => save.mutate()} disabled={save.isPending || !dirty} />
    </EditDialog>
  );
}
