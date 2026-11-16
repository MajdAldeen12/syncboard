# 0002: Presence against Durable Object hibernation

- **Date:** 2026-11-16
- **Status:** accepted
- **Milestone:** M4

## Question

Presence (who is on a board, their cursors) travels as Yjs awareness messages. The awareness protocol renews every client's state on a timer, every 15 seconds, and drops a state that has not been renewed for 30. A board room must hibernate while idle to stay inside the Workers free plan (see 0001). Three things had to be found out:

1. Do idle tabs keep the room awake, and how often is it woken?
2. Does presence survive the room hibernating and waking?
3. What does cursor traffic cost in billed messages?

## What was tested

Versions: `y-partyserver` 2.2.0, `partyserver` 0.5.10, `y-protocols` 1.0.7, `wrangler` 4.161.0 (workerd 1.20261110.1), Yjs 13.6.33, local `wrangler dev`.

The real `BoardRoom`, wrapped for the test in a subclass that logs every construction, connection, message and close. Node clients using `y-partyserver/provider`, each with a presence state set, counting every WebSocket message they send and receive. Five scenarios, each run before and after the changes below:

- **Idle:** two clients connected, nothing done for 60 s.
- **Echo:** three clients; one changes its cursor 10 times.
- **Newcomer:** two clients idle for 20 s, so the room hibernates; a third connects.
- **Tab closed:** three clients idle for 20 s; one client's process is killed.
- **Tab closed, room awake:** the same without the idle wait.

## Result

### 1. Idle tabs do not wake the room

| Measured over 60 s idle, two clients          | Result                                                        |
| --------------------------------------------- | ------------------------------------------------------------- |
| Messages sent by either client                | 0                                                             |
| Messages received by either client            | 0                                                             |
| Times the room was constructed                | 0 (next construction was for the clients closing, 63 s later) |
| Presence still shown on both sides afterwards | yes                                                           |

The renewal timer never runs. Both `y-partyserver`'s provider and its server call `clearInterval(awareness._checkInterval)`, and the provider sends only on the awareness `change` event, which does not fire for a renewal. So an idle board costs nothing, and nothing had to be fixed here.

The other side of that: with no renewals there is no timeout either. A state stays until someone removes it. The server is the only thing that can say a person has gone.

### 2. Presence did not survive hibernation

`y-partyserver` keeps the awareness states in the room's memory. A room that wakes up starts with none.

| Scenario                           | Before                                                                | After                                      |
| ---------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Newcomer after a wake-up           | sees only itself; sees a person only once that person moves           | sees everyone at once                      |
| Tab closed while the room sleeps   | still shown to the others 5 s later, and for good (nothing times out) | gone for the others within the 5 s checked |
| Tab closed while the room is awake | removed                                                               | removed                                    |

In the "tab closed" runs the server log shows the room constructed anew with three sockets attached and the close arriving with code 1006, so the room really was asleep.

### 3. Every cursor move came back from every other client

The provider sends on every awareness change it sees, whoever the change is about. A state it has just received from the server is sent straight back. The server then passed each message on to every connection, the sender included, without checking whether it said anything new.

| 10 cursor moves, three clients | Server received | Each client received |
| ------------------------------ | --------------- | -------------------- |
| Before                         | 30              | 30                   |
| Room changed, stock client     | 30              | 10 (the mover: 0)    |
| Room and client changed        | 10              | 10 (the mover: 0)    |

With N clients on a board, one move cost N billed messages and N × N deliveries.

## Decision

**The room relays presence itself, and keeps each connection's latest state with the connection.** `apps/sync/src/presence-relay.ts` holds the rules as plain functions; `BoardRoom` applies them in `onConnect`, `onMessage` and `onClose`. Awareness messages no longer reach `y-partyserver`'s handler; document messages still do.

- Each connection's last state (client id, clock, JSON text) is stored in its WebSocket attachment through `connection.setState`. Attachments survive hibernation, are free, and hold up to 16,384 bytes; a state is accepted up to 1,024.
- A newcomer is sent the stored states of every other connection.
- When a connection closes, for whatever reason, the others are sent a goodbye for its client at the stored clock. Browsers remove a state only for a goodbye at exactly the clock they hold, so a tab that has already reconnected on a new connection (higher clock) is not removed by its old connection closing.
- A connection speaks for one client, the first it announces. Entries about other clients are dropped, and so are entries that are not newer than what is stored. That stops echoes at the room and means one client cannot move or remove another's cursor. It is hygiene, not security: a client can still say anything about itself.
- Whether a connection may write the document is never asked for presence. Viewers (M5) will be read-only and still show up.

**The browser sends only what it says about itself.** `board-session.ts` passes the provider's awareness changes through `ownChanges` from `packages/core/src/presence`. This relies on the provider's `_awarenessUpdateHandler` field, so `y-partyserver` stays pinned and a browser test counts the messages an idle observer sends (it must be none).

**No renewal timer is added back.** It would wake the room every 15 seconds per open tab.

### Alternatives not taken

- **Restore the 15 s renewals and the 30 s timeout.** Fixes ghosts without server changes, but every open tab would wake the room four times a minute and each wake keeps it in memory for about ten seconds. Idle boards would use the duration allowance.
- **Ask clients to announce themselves again after a wake.** Costs one billed message per connection per wake, leaves a gap in which a newcomer sees nobody, and still gives the room no clock for the connection whose closing woke it.
- **Keep presence in Durable Object storage.** Storage writes at cursor speed, for data that is worthless once the socket is gone.

## What this means for the free plan

- **Duration:** an idle board is asleep. A board is awake while someone moves a pointer over it or edits, plus about ten seconds. The allowance is about 28 hours of awake rooms a day across all boards.
- **Requests:** incoming WebSocket messages are billed 20 to 1 against 100,000 requests a day, so 2,000,000 messages. A moving pointer sends at most 15 a second (see the throttle in `packages/core/src/presence`), 54,000 an hour. That is about 37 hours of pointer movement a day across all users. Before the echo was removed it was 37 hours divided by the number of people on the board.
- A cursor move after ten idle seconds wakes the room like an edit does, and every wake is an `onLoad` (see 0001).

## Not covered

- **Cloudflare's network.** Nothing is deployed until M5. Repeat the scenarios there, in particular how quickly a client that vanishes without closing (network lost, laptop lid shut) is reported to the room. Locally a killed process is reported at once. Until a close is reported that person stays on screen, because nothing times out.
- **A tab the browser has frozen or discarded** without closing its socket.
- **Read-only connections.** There is no viewer role until M5; add a test then that a viewer's presence is relayed.
