## What this changes

<!-- One or two sentences, from the user's point of view. Link the issue: Closes #123 -->

## How I tested it

<!-- Commands you ran, and what you checked by hand. -->

## Screenshots

<!-- For UI changes. Placeholder content only, or blurred with discreet mode. -->

## Checklist

- [ ] Keeps library files read-only, transcodes only for playback, and adds no new outside calls
- [ ] Tests added or updated
- [ ] `npm run build`, `npm run lint` and `npm test` pass for `apps/web`
- [ ] `tsc` and `npm test` pass for `apps/server`
- [ ] New non-GET routes are listed as owner-only or profile routes
- [ ] New endpoints that return media use `library/visibility.ts`
- [ ] Schema changes come with a generated migration
- [ ] New source files have the license header
- [ ] No real media, filenames or performer data anywhere in the change
