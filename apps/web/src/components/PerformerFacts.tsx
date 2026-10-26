import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { EditDialog, SaveButton } from "./EditDialog";
import { EDIT_INPUT } from "@/lib/editForm";
import {
  ageToday,
  PERFORMER_GENDERS,
  savePerformerFacts,
  type PerformerDetail,
  type PerformerFacts as Facts,
  type PerformerGender,
} from "@/lib/performerApi";
import { invalidatePerformer } from "@/lib/invalidate";
import { useIsOwner } from "@/lib/profile";

function formatBirthdate(birthdate: string): string {
  // Built from the parts rather than parsed, so no time zone can move it a day.
  const [y, m, d] = birthdate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** The facts that are known, as label and value, in reading order. */
function knownFacts(performer: PerformerDetail): [string, string][] {
  const rows: [string, string | null][] = [
    [
      "Age",
      performer.birthdate
        ? `${ageToday(performer.birthdate)} · born ${formatBirthdate(performer.birthdate)}`
        : null,
    ],
    ["Gender", performer.gender ? PERFORMER_GENDERS[performer.gender] : null],
    ["Country", performer.country],
    ["Ethnicity", performer.ethnicity],
    ["Height", performer.heightCm ? `${performer.heightCm} cm` : null],
    ["Measurements", performer.measurements],
    ["Hair", performer.hairColor],
    ["Eyes", performer.eyeColor],
    [
      "Career",
      performer.careerStart || performer.careerEnd
        ? `${performer.careerStart ?? "?"}–${performer.careerEnd ?? "present"}`
        : null,
    ],
    ["Tattoos", performer.tattoos],
    ["Piercings", performer.piercings],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== null);
}

/**
 * A performer's profile facts, under the stats strip.
 *
 * Only what is known is shown — a grid of "Hair: —" for a performer nobody
 * has filled in reads as a broken form. With nothing known, the owner gets a
 * single "Add details" link and everyone else gets nothing.
 */
export function PerformerFacts({ performer }: { performer: PerformerDetail }) {
  const [editing, setEditing] = useState(false);
  const isOwner = useIsOwner();
  const facts = knownFacts(performer);
  const empty = facts.length === 0;

  if (empty && !isOwner) return null;

  return (
    <div className="max-w-3xl space-y-3">
      {facts.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
              <dd className="truncate" title={value}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {isOwner && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Pencil className="size-3" />
          {empty ? "Add details" : "Edit details"}
        </button>
      )}

      {editing && <PerformerFactsDialog performer={performer} onClose={() => setEditing(false)} />}
    </div>
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

function PerformerFactsDialog({
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
