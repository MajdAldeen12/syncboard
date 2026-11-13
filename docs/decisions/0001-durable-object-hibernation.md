# 0001: Durable Object hibernation with y-partyserver

- **Date:** 2026-11-13
- **Status:** accepted
- **Milestone:** M3, stage 1

## Question

The Workers free plan allows about 28 hours of awake Durable Object time a day across all boards (13,000 GB-s). A board room that stays in memory for as long as a tab is open would use that up with one or two idle tabs. The room therefore has to hibernate while idle. Three things had to hold for `y-partyserver` to be usable:

1. Does it work with `static options = { hibernate: true }`?
2. Is the document reloaded correctly when the object wakes?
3. Do pending saves finish before the object hibernates?

## What was tested

Versions: `y-partyserver` 2.2.0, `partyserver` 0.5.10, `wrangler` 4.161.0 (workerd 1.20261110.1), Yjs 13.6.33, local `wrangler dev`.

A room that stores its document in Durable Object storage in `onSave` and reads it back in `onLoad`, with a log line carrying the time the instance was constructed. A Node client using `y-partyserver/provider` then:

1. connected (A), wrote a value, waited 4 s;
2. stayed idle for 25 s;
3. wrote a second value and connected a second client (B) at once;
4. wrote a third value and stayed idle for 25 s without waiting for a save;
5. disconnected A and B, waited 25 s, connected a third client (C).

## Result

All three hold.

| Step | Server log                                                                | Meaning                                                                                                   |
| ---- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1    | `onLoad` stored 0 bytes, then `onSave` 22 bytes                           | First save came from the 2 s debounce                                                                     |
| 3    | `onLoad` on a **new instance**, stored 22 bytes, 1 connection             | The object had hibernated. A's socket survived, and the document was reloaded before A's edit was applied |
| 3    | B received both values                                                    | The edit that woke the object was not lost                                                                |
| 4    | `onSave` 49 bytes on the same instance, with no further traffic           | The pending save ran before the object slept                                                              |
| 5    | `onLoad` on a new instance, 2 connections                                 | Closing sockets also wakes the object                                                                     |
| 5    | `onLoad` on a fourth instance, 0 connections; C received all three values | A cold room serves what was stored                                                                        |

The object was evicted within the 25 s idle windows each time (Cloudflare documents about 10 s).

## What this means for the design

- **Hibernation is on** for `BoardRoom`.
- **Every wake costs one `onLoad`.** That includes wakes caused only by a socket closing. If `onLoad` went straight to Supabase, every burst of activity after ten idle seconds would be a Postgres query. Stage 2 should keep the snapshot in Durable Object storage as the working copy and write through to Supabase, reading Supabase only when the object has no local copy. This is a recommendation to confirm in the stage 2 spike, not yet a decision.
- **y-partyserver does not save when a room empties**, although its README says it does. It only saves on the debounce (2 s after the last change, at most 10 s after the first). That is enough: the timer keeps the object awake, so the last change is always saved before it sleeps.
- **Up to 10 s of changes can be lost on the server** if the process dies inside the debounce window. Clients still hold those changes, and on reconnect the server asks for what it is missing, so they are sent again.
- **`onLoad` has no error handling in y-partyserver.** An exception propagates out of `onStart`. The room must catch it itself to apply the rule "never serve an empty document after a failed load".

## Not covered

- Behaviour on Cloudflare's network. The sync server is not deployed until M5; repeat the idle test there before the demo opens.
- Awareness (cursors, presence) across hibernation. That is M4.
- Postgres access from the Durable Object. That is the stage 2 spike.
