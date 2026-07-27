# OMP agent coordination

OMP agents talk to each other over a facility OMP calls IRC, driven by its `hub` tool. Paseo
renders both: inbound messages become `irc_message` timeline cards, and `hub` invocations become
tool rows that name the operation, its target, and its outcome.

## Inbound IRC arrives three different ways

This is the part that costs time. Which transport fires depends on whether the receiving agent was
**interrupted** or was **deliberately waiting**, so a change that works in one test can look
completely broken in the next.

| Transport                       | Wire shape                                                                | Where it is handled               |
| ------------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Peer interrupt                  | `<irc>…</irc>` message frame                                              | `mapOmpIrcEnvelopeToTimelineItem` |
| Parent → subagent interrupt     | plain prose ending in a `Parent IRC message:` label                       | `mapParentSteeringEnvelope`       |
| `hub wait` / `hub inbox` result | `[<id>] <sender> (reply to <id>): <body>`, delivered as a **tool result** | `mapOmpHubDeliveredMessages`      |

All three live in `packages/server/src/server/agent/providers/omp/irc-message.ts`. The first two
come from OMP's own prompt templates (`prompts/system/irc-incoming.md` and
`prompts/steering/parent-irc.md`); the third is the `hub` tool's return value and never passes
through a message frame at all.

Each transport must be wired into **both** paths, or it will render in the parent pane and not the
subagent pane (or vice versa):

- live parent — `handleToolExecutionEnd` and `handleMessageEnd` in `agent.ts`
- subagents and replayed history — `OmpHistoryMapper` in `message-history.ts`, which feeds
  `OmpSubagentIndex`

A message can also arrive as any message role. Parent steering lands as `user`, peer envelopes have
appeared as both `custom` and `assistant`, so the history mapper hooks all three.

## Prose matching is deliberately shallow

Upstream owns the wording of these templates and may reword it. Parsing therefore anchors on the
shortest structural marker available — the `Parent IRC message:` label, not the sentence around it —
and every fallback degrades rather than drops:

- an unrecognized sender attribution yields a generic `Parent agent`, not a dropped message
- OMP's trailing transport boilerplate is stripped only from the **end** of a body, so a wording
  change leaks visible extra text instead of eating real content

Never match on model names or provider ids here; nothing about this surface depends on them.

## Hub tool rows

`hub` does two unrelated jobs, both rendered by `buildToolCallDisplayModel`:

- **agent messaging** — `send`, `wait`, `inbox`, `list`, `jobs`, `cancel`
- **process supervision** — `start`, `stop`, `restart`, `logs`, `ps`, `describe`

Rows are tense-aware because a row is a live indicator while the call runs and a record once it
settles: `Waiting for agent activity` becomes `Waited for agent activity`. Anything that is not
`running` uses the settled tense, including `failed` and `canceled`.

Targets follow the house pattern already used by Read/Shell/Search — verb in `displayName`, subject
in `summary`, which also reproduces OMP's own phrasing (`tools/hub/launch.ts` prints
`Started <name>`, never `Started process <name>`). The exception is `send`, which names its
recipient inline because its summary is carrying the delivery outcome.

Delivery states (`injected`, `revived`, `woken`, `failed`) are OMP's vocabulary and are carried as
strings, not narrowed to an enum. A failure reason keeps only its first clause; OMP appends TUI
remediation hints that name commands a Paseo user cannot run.

## Why `metadata`, not a new detail type

The structured facts a `hub` row needs — operation, target, deliveries — ride on the timeline
item's optional `metadata`, populated by `buildOmpToolMetadata`.

`ToolCallDetailPayloadSchema` is a strict `z.discriminatedUnion("type", …)`. Adding a variant would
make **any client that does not know it fail to parse the whole timeline message**, which breaks the
protocol contract in the direction that matters: an old client talking to a new daemon. `metadata`
is already an optional record on the wire, so older clients simply fall back to the generic label.

Prefer `metadata` for anything a client needs in order to _present_ a tool call differently.

## Paseo Hub is unrelated

Paseo has its own feature called Hub — an opt-in daemon-to-Hub connection for delegated execution
(`paseo hub connect`, `hub.management.*` / `hub.execution.*` RPCs). See [hub.md](hub.md). It shares
nothing with OMP's `hub` tool beyond the word. Keep user-facing labels for the OMP tool describing
agent coordination so the two never read as the same thing.
