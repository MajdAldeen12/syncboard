/**
 * Board roles and what each may do.
 *
 * This is the single place the permission matrix is defined. Server code
 * resolves a user's role for a board and asks `can` before acting. The
 * client may call it too, but only to hide controls: it is never the check.
 */

export const ROLES = ["owner", "editor", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ACTIONS = [
  "board:read",
  "board:edit",
  "board:delete",
  "members:manage",
  "links:manage",
] as const;
export type Action = (typeof ACTIONS)[number];

const GRANTS: Record<Role, ReadonlySet<Action>> = {
  viewer: new Set<Action>(["board:read"]),
  editor: new Set<Action>(["board:read", "board:edit"]),
  owner: new Set<Action>(ACTIONS),
};

/**
 * Whether `role` may perform `action`. A missing or unrecognised role is
 * denied, so a caller that fails to resolve a role fails closed.
 */
export function can(role: Role | null | undefined, action: Action): boolean {
  if (role == null || !Object.hasOwn(GRANTS, role)) return false;
  return GRANTS[role].has(action);
}
