/**
 * StashDB lookups, for filling in a performer's facts.
 *
 * The one place this app talks to the internet for metadata, which is why it
 * is opt-in: nothing here runs until `STASHDB_API_KEY` is set, and
 * nothing is stored from a lookup until they pick a match and apply it.
 */

const ENDPOINT = "https://stashdb.org/graphql";
const TIMEOUT_MS = 15_000;

export class StashDbError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 502,
  ) {
    super(message);
  }
}

/**
 * The key comes from the environment, not the database or the UI: it is a
 * credential, and a database row would put it in every backup. Read on each
 * call rather than cached, so it is the one place to look.
 */
export function getStashDbKey(): string | null {
  const apiKey = process.env.STASHDB_API_KEY?.trim();
  return apiKey ? apiKey : null;
}

/** A performer as StashDB returns it, only the fields asked for below. */
type RawPerformer = {
  id: string;
  name: string;
  disambiguation: string | null;
  gender: string | null;
  birth_date: string | null;
  country: string | null;
  ethnicity: string | null;
  eye_color: string | null;
  hair_color: string | null;
  height: number | null;
  band_size: number | null;
  cup_size: string | null;
  waist_size: number | null;
  hip_size: number | null;
  career_start_year: number | null;
  career_end_year: number | null;
  tattoos: { location: string; description: string | null }[] | null;
  piercings: { location: string; description: string | null }[] | null;
};

/** A match, shaped like the facts this app stores. Null is "StashDB does not know". */
export type StashDbPerformer = {
  id: string;
  name: string;
  disambiguation: string | null;
  url: string;
  gender: string | null;
  birthdate: string | null;
  country: string | null;
  ethnicity: string | null;
  hairColor: string | null;
  eyeColor: string | null;
  heightCm: number | null;
  measurements: string | null;
  tattoos: string | null;
  piercings: string | null;
  careerStart: number | null;
  careerEnd: number | null;
};

const GENDERS: Record<string, string> = {
  FEMALE: "female",
  MALE: "male",
  TRANSGENDER_FEMALE: "trans_female",
  TRANSGENDER_MALE: "trans_male",
  NON_BINARY: "non_binary",
  INTERSEX: "intersex",
};

/** "BLACK" -> "Black", "MIDDLE_EASTERN" -> "Middle eastern". */
function words(value: string | null): string | null {
  if (!value) return null;
  const text = value.replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function bodyMods(mods: RawPerformer["tattoos"]): string | null {
  if (!mods || mods.length === 0) return null;
  return mods
    .map((m) => (m.description ? `${m.location} (${m.description})` : m.location))
    .join(", ");
}

export function mapPerformer(raw: RawPerformer): StashDbPerformer {
  const hasSize =
    raw.band_size != null && raw.cup_size && raw.waist_size != null && raw.hip_size != null;
  return {
    id: raw.id,
    name: raw.name,
    disambiguation: raw.disambiguation,
    url: `https://stashdb.org/performers/${raw.id}`,
    gender: raw.gender ? (GENDERS[raw.gender] ?? null) : null,
    // StashDB allows a bare year or year-month; a full date is what the
    // birthdate column holds, so anything shorter is left unknown rather than
    // padded into a day nobody stated.
    birthdate: raw.birth_date && /^\d{4}-\d{2}-\d{2}$/.test(raw.birth_date) ? raw.birth_date : null,
    country: countryName(raw.country),
    ethnicity: words(raw.ethnicity),
    hairColor: words(raw.hair_color),
    eyeColor: words(raw.eye_color),
    heightCm: raw.height,
    measurements: hasSize ? `${raw.band_size}${raw.cup_size}-${raw.waist_size}-${raw.hip_size}` : null,
    tattoos: bodyMods(raw.tattoos),
    piercings: bodyMods(raw.piercings),
    careerStart: raw.career_start_year,
    careerEnd: raw.career_end_year,
  };
}

const SEARCH = `query ($term: String!, $limit: Int) {
  searchPerformer(term: $term, limit: $limit) {
    id name disambiguation gender birth_date country ethnicity eye_color hair_color
    height band_size cup_size waist_size hip_size career_start_year career_end_year
    tattoos { location description }
    piercings { location description }
  }
}`;

/** One GraphQL request, with the failures a person can act on turned into messages. */
async function stashDbQuery<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ApiKey: apiKey },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new StashDbError("Could not reach StashDB. Check your internet connection.", 502);
  }
  if (res.status === 401 || res.status === 403) {
    throw new StashDbError("StashDB rejected the API key.", 400);
  }
  if (!res.ok) throw new StashDbError(`StashDB answered with an error (${res.status}).`, 502);

  const body = (await res.json().catch(() => null)) as { data?: T } | null;
  if (!body?.data) {
    throw new StashDbError("StashDB sent an answer this app could not read.", 502);
  }
  return body.data;
}

export async function searchStashDbPerformers(
  apiKey: string,
  term: string,
  limit = 8,
): Promise<StashDbPerformer[]> {
  const data = await stashDbQuery<{ searchPerformer?: RawPerformer[] }>(apiKey, SEARCH, {
    term,
    limit,
  });
  if (!data.searchPerformer) {
    throw new StashDbError("StashDB sent an answer this app could not read.", 502);
  }
  return data.searchPerformer.map(mapPerformer);
}

/** A scene as StashDB returns it, only the fields asked for below. */
type RawScene = {
  id: string;
  title: string | null;
  details: string | null;
  date: string | null;
  studio: { name: string } | null;
  performers: { performer: { name: string; disambiguation: string | null; gender: string | null } }[];
  tags: { name: string }[];
};

/** A scene match. Names only: what exists in the library is decided by the route. */
export type StashDbScene = {
  id: string;
  title: string | null;
  details: string | null;
  date: string | null;
  url: string;
  studio: string | null;
  performers: string[];
  tags: string[];
};

/**
 * Whether a scene's performer is listed in the results: only those StashDB
 * marks FEMALE. Anyone else is left out, including performers whose gender
 * StashDB does not know.
 */
export function isListedPerformer(gender: string | null): boolean {
  return gender === "FEMALE";
}

export function mapScene(raw: RawScene): StashDbScene {
  return {
    id: raw.id,
    title: raw.title,
    details: raw.details,
    date: raw.date,
    url: `https://stashdb.org/scenes/${raw.id}`,
    studio: raw.studio?.name ?? null,
    performers: raw.performers
      .filter((entry) => isListedPerformer(entry.performer.gender))
      .map((entry) => entry.performer.name),
    tags: raw.tags.map((tag) => tag.name),
  };
}

const SEARCH_SCENE = `query ($term: String!, $limit: Int) {
  searchScene(term: $term, limit: $limit) {
    id title details date
    studio { name }
    performers { performer { name disambiguation gender } }
    tags { name }
  }
}`;

export async function searchStashDbScenes(
  apiKey: string,
  term: string,
  limit = 8,
): Promise<StashDbScene[]> {
  const data = await stashDbQuery<{ searchScene?: RawScene[] }>(apiKey, SEARCH_SCENE, {
    term,
    limit,
  });
  if (!data.searchScene) {
    throw new StashDbError("StashDB sent an answer this app could not read.", 502);
  }
  return data.searchScene.map(mapScene);
}
