/**
 * libpq environment variables for pg_dump and psql, parsed from DATABASE_URL.
 *
 * The URL used to be passed as the first argument, which put the database
 * password in the process table — readable by any user on the box through
 * `ps` or /proc/<pid>/cmdline for as long as a multi-minute dump ran — and in
 * every execFile error message, which is surfaced in the UI and the activity
 * log. libpq reads the same settings from PG* variables, which are visible
 * only to the process's own user.
 *
 * Both client tools ignore any PG* variable that is not set, so only what the
 * URL actually specifies is emitted; anything else falls through to libpq's
 * defaults exactly as it would have with the URL.
 */
export function pgEnvFromUrl(databaseUrl: string): Record<string, string> {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid connection URL");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must be a postgres:// URL");
  }

  const env: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    if (value) env[key] = value;
  };

  // URL components are percent-encoded; libpq wants the literal values. A
  // password containing `@` or `/` has to be encoded to appear in a URL at
  // all, so skipping this would break exactly the strong passwords.
  set("PGHOST", decodeURIComponent(url.hostname).replace(/^\[(.*)\]$/, "$1"));
  set("PGPORT", url.port);
  set("PGUSER", decodeURIComponent(url.username));
  set("PGPASSWORD", decodeURIComponent(url.password));
  set("PGDATABASE", decodeURIComponent(url.pathname.replace(/^\//, "")));

  // The query-string options libpq URLs commonly carry. `host` here is how a
  // URL names a Unix socket directory, and overrides the authority part.
  const params: Record<string, string> = {
    host: "PGHOST",
    port: "PGPORT",
    user: "PGUSER",
    password: "PGPASSWORD",
    dbname: "PGDATABASE",
    sslmode: "PGSSLMODE",
    sslrootcert: "PGSSLROOTCERT",
    sslcert: "PGSSLCERT",
    sslkey: "PGSSLKEY",
    application_name: "PGAPPNAME",
    connect_timeout: "PGCONNECT_TIMEOUT",
    options: "PGOPTIONS",
  };
  for (const [param, variable] of Object.entries(params)) {
    set(variable, url.searchParams.get(param));
  }

  return env;
}

/**
 * The child environment for a pg client: ours, with the URL's settings laid
 * over it, plus any extras.
 *
 * Inherited PG* variables are kept for whatever the URL doesn't specify —
 * the same precedence libpq applied when the URL was an argument, so a
 * PGSSLMODE set on the container still applies.
 */
export function pgChildEnv(
  databaseUrl: string,
  extra: Record<string, string> = {}
): NodeJS.ProcessEnv {
  return { ...process.env, ...pgEnvFromUrl(databaseUrl), ...extra };
}
