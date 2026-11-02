/**
 * Which album the user just left, so the albums page can name that card's
 * photos for the view transition back and the stack folds up again.
 *
 * Module state rather than router state: it only has to survive one
 * navigation, and the breadcrumb that triggers it is not a place to carry a
 * payload.
 */
export const albumTransition: { returningId: number | null } = { returningId: null };
