import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { Portal } from "./Portal";
import { useFocusTrap } from "@/lib/useFocusTrap";

type Option = { value: string; label: string };

/**
 * Every condition the builder offers, and how each becomes the server's
 * shape. One table rather than a switch per concern, so adding a field is
 * one entry here instead of edits to the labels, the input and the encoder.
 *
 * Values are held as strings while editing — they come out of inputs and
 * selects — and only turned into numbers and booleans on the way out.
 */
type FieldSpec = {
  label: string;
  input: "text" | "number" | Option[];
  /** Shown after a number input, where the label reads as a sentence. */
  unit?: string;
  toApi: (value: string) => unknown;
};

const YES_NO: Option[] = [
  { value: "true", label: "yes" },
  { value: "false", label: "no" },
];

const FIELDS = {
  tags: {
    label: "tagged",
    input: "text",
    toApi: (value) => ({ field: "tags", op: "contains", value }),
  },
  itemType: {
    label: "type is",
    input: [
      { value: "video", label: "video" },
      { value: "photo", label: "photo" },
    ],
    toApi: (value) => ({ field: "itemType", op: "eq", value }),
  },
  title: {
    label: "title contains",
    input: "text",
    toApi: (value) => ({ field: "title", op: "contains", value }),
  },
  createdAt: {
    label: "added in the last",
    input: "number",
    unit: "days",
    toApi: (value) => ({ field: "createdAt", op: "within_last_days", value: Number(value) }),
  },
  rating: {
    label: "rated at least",
    input: [5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} star${n === 1 ? "" : "s"}` })),
    toApi: (value) => ({ field: "rating", op: "gte", value: Number(value) }),
  },
  favorite: {
    label: "favourite",
    input: YES_NO,
    toApi: (value) => ({ field: "favorite", op: "eq", value: value === "true" }),
  },
  watched: {
    label: "watched",
    input: YES_NO,
    toApi: (value) => ({ field: "watched", op: "eq", value: value === "true" }),
  },
  playCount: {
    label: "played at least",
    input: "number",
    unit: "times",
    toApi: (value) => ({ field: "playCount", op: "gte", value: Number(value) }),
  },
  longerThan: {
    label: "longer than",
    input: "number",
    unit: "min",
    toApi: (value) => ({ field: "durationMinutes", op: "gte", value: Number(value) }),
  },
  shorterThan: {
    label: "shorter than",
    input: "number",
    unit: "min",
    toApi: (value) => ({ field: "durationMinutes", op: "lte", value: Number(value) }),
  },
  lastWatched: {
    label: "not watched in",
    input: "number",
    unit: "days",
    toApi: (value) => ({ field: "lastWatched", op: "older_than_days", value: Number(value) }),
  },
} satisfies Record<string, FieldSpec>;

type ConditionField = keyof typeof FIELDS;

type ConditionRow = { field: ConditionField; value: string };

/**
 * Starting points for the lists people actually want, since a blank rule
 * builder makes you work out that "forgotten favourite" is favourite AND
 * played-but-not-lately. Each one only fills the form in; it can be edited
 * before saving like any other rule.
 */
const PRESETS: { name: string; op: "AND" | "OR"; conditions: ConditionRow[] }[] = [
  { name: "Top rated", op: "AND", conditions: [{ field: "rating", value: "4" }] },
  {
    name: "Forgotten favourites",
    op: "AND",
    conditions: [
      { field: "favorite", value: "true" },
      { field: "lastWatched", value: "90" },
    ],
  },
  { name: "Never watched", op: "AND", conditions: [{ field: "watched", value: "false" }] },
  { name: "Most replayed", op: "AND", conditions: [{ field: "playCount", value: "3" }] },
];

async function createCollection(body: unknown) {
  const res = await fetch("/api/collections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // The server names which condition it refused; say so rather than a
    // bare status code.
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error ?? `Failed to create collection: ${res.status}`);
  }
  return res.json();
}

export function CreateCollectionModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"manual" | "smart">("manual");
  const [ruleOp, setRuleOp] = useState<"AND" | "OR">("AND");
  const [conditions, setConditions] = useState<ConditionRow[]>([{ field: "tags", value: "" }]);
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef);

  const mutation = useMutation({
    mutationFn: createCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["collections"] });
      onClose();
    },
  });

  function submit() {
    if (!name.trim()) return;
    if (type === "manual") {
      mutation.mutate({ name, type: "manual" });
      return;
    }
    const validConditions = conditions.filter((c) => c.value.trim() !== "");
    mutation.mutate({
      name,
      type: "smart",
      smartRule: {
        op: ruleOp,
        conditions: validConditions.map((c) => FIELDS[c.field].toApi(c.value.trim())),
      },
    });
  }

  return (
    <Portal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
        onClick={onClose}
      >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-collection-title"
        className="w-full max-w-md space-y-4 rounded-lg bg-background p-5 text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="create-collection-title" className="text-sm font-semibold">New Collection</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Collection name"
          className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm"
        />

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setType("manual")}
            className={`rounded-md border border-border px-3 py-1 ${type === "manual" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Manual
          </button>
          <button
            type="button"
            onClick={() => setType("smart")}
            className={`rounded-md border border-border px-3 py-1 ${type === "smart" ? "bg-primary text-primary-foreground" : ""}`}
          >
            Smart
          </button>
        </div>

        {type === "smart" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => {
                    setRuleOp(preset.op);
                    setConditions(preset.conditions);
                    if (!name.trim()) setName(preset.name);
                  }}
                  className="rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              Match
              <select
                value={ruleOp}
                onChange={(e) => setRuleOp(e.target.value as "AND" | "OR")}
                className="rounded border border-border bg-transparent px-1"
              >
                <option value="AND">all</option>
                <option value="OR">any</option>
              </select>
              of the following:
            </div>

            {conditions.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={row.field}
                  onChange={(e) => {
                    const field = e.target.value as ConditionField;
                    setConditions(conditions.map((c, j) => (j === i ? { field, value: "" } : c)));
                  }}
                  className="rounded border border-border bg-transparent px-1 py-1 text-xs"
                >
                  {Object.entries(FIELDS).map(([field, spec]) => (
                    <option key={field} value={field}>
                      {spec.label}
                    </option>
                  ))}
                </select>
                <ConditionValue
                  spec={FIELDS[row.field]}
                  value={row.value}
                  onChange={(value) =>
                    setConditions(conditions.map((c, j) => (j === i ? { ...c, value } : c)))
                  }
                />
                <button
                  type="button"
                  onClick={() => setConditions(conditions.filter((_, j) => j !== i))}
                  aria-label="Remove condition"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setConditions([...conditions, { field: "tags", value: "" }])}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3" /> Add condition
            </button>
          </div>
        )}

        {mutation.error && (
          <p className="text-xs text-destructive">{mutation.error.message}</p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={mutation.isPending || !name.trim()}
          className="w-full rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
        >
          Create
          </button>
        </div>
      </div>
    </Portal>
  );
}

function ConditionValue({
  spec,
  value,
  onChange,
}: {
  spec: FieldSpec;
  value: string;
  onChange: (value: string) => void;
}) {
  if (Array.isArray(spec.input)) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs"
      >
        <option value="">select…</option>
        {spec.input.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span className="flex flex-1 items-center gap-1.5">
      <input
        value={value}
        type={spec.input}
        min={spec.input === "number" ? 1 : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 rounded border border-border bg-transparent px-2 py-1 text-xs"
      />
      {spec.unit && <span className="text-xs text-muted-foreground">{spec.unit}</span>}
    </span>
  );
}
