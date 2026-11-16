/** The client ids an awareness change is about, as the protocol reports them. */
export interface AwarenessChanges {
  readonly added: readonly number[];
  readonly updated: readonly number[];
  readonly removed: readonly number[];
}

/**
 * The part of an awareness change that is about this client. Null if none
 * of it is.
 *
 * A client should send out only what it says about itself. The provider in
 * y-partyserver 2.2.0 sends on every change it sees, including other
 * people's states it has just been handed by the server, so each cursor
 * move came back to the server once from every other client on the board.
 * Passing its changes through this stops that.
 */
export function ownChanges(
  changes: AwarenessChanges,
  clientId: number,
): { added: number[]; updated: number[]; removed: number[] } | null {
  const own = (ids: readonly number[]) => ids.filter((id) => id === clientId);
  const added = own(changes.added);
  const updated = own(changes.updated);
  const removed = own(changes.removed);

  if (added.length + updated.length + removed.length === 0) return null;
  return { added, updated, removed };
}
