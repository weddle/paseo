# OMP agent coordination

OMP agents talk to each other over a facility OMP calls IRC, driven by its `hub` tool. Paseo
renders both: inbound messages become `irc_message` timeline cards, and `hub` invocations become
tool rows that name the operation, its target, and its outcome.

## The adapter reads `details`

**Rule: read OMP's structured payload. Parsing rendered text requires a comment naming the field
that does not exist.**

Every OMP tool result may carry a `details` object beside its human-readable `content`, and OMP
conversation messages carry typed flags. The rendered text is a _projection_ of that data, not the
source of it. This adapter was first written the other way around — regex-parsing prose to
reconstruct facts that arrived typed on the same object — and the cost was real: cards that broke
on wording changes, and a job table that was discarded because the prose summary was hard to parse.

What is actually typed, measured against live sessions:

| Fact                          | Structured source                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| hub operation                 | `details.op`                                                                           |
| send recipients and outcomes  | `details.receipts[] = { to, outcome, error? }`                                         |
| a delivered message           | `details.waited = { from, to, body, id, ts, replyTo? }`                                |
| a batch of delivered messages | `details.inbox[]`                                                                      |
| background jobs               | `details.jobs[] = { id, type, status, label, durationMs, resolvedModel?, errorText? }` |
| "this is parent steering"     | `steering: true` and `attribution: "agent"` on the message                             |
| eval code and output          | `details.cells[] = { title, code, language, output, status }`                          |

Genuinely untyped, and the only places parsing is legitimate: the **sender name and body** of a
parent steering message, and the `<irc>` peer envelope, both of which OMP injects into the model's
context as prose. Everything else has a field.

Existing regex parsers are retained as fallbacks for OMP builds that omit `details`, behind an
explicit branch. Do not delete them; do not reach for them first.

## Inbound IRC arrives at least seven different ways

This is the part that costs time. Which transport fires depends on whether the receiving agent was
**interrupted**, was **deliberately waiting**, or is being **relayed to**, so a change that works in
one test can look completely broken in the next. This table was verified against OMP's own source
(`vendor/oh-my-pi`), not inferred from usage — three of these had never appeared in 672 local
sessions.

| Transport                        | Wire shape                                                                | Structured source                               | Handled by                        |
| -------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------- |
| Peer interrupt                   | `<irc>…</irc>` message frame                                              | none — the envelope is the data                 | `mapOmpIrcEnvelopeToTimelineItem` |
| Parent → subagent interrupt      | plain prose ending in a `Parent IRC message:` label                       | `steering` / `attribution` flags on the message | `mapParentSteeringEnvelope`       |
| `hub wait` / `hub inbox` result  | `[<id>] <sender> (reply to <id>): <body>`, delivered as a **tool result** | `details.waited` / `details.inbox`              | `mapOmpHubDeliveredMessages`      |
| `custom_message` `irc:incoming`  | `<irc>` envelope in `content`                                             | `details.{id,from,message,replyTo}`             | `mapIncomingIrcDetails`           |
| `custom_message` `irc:autoreply` | prose                                                                     | `details.{to,body,replyTo}`                     | **nothing yet**                   |
| `custom_message` `irc:relay`     | prose                                                                     | `details.{from,to,body}`                        | **nothing yet**                   |
| live `irc_message` RPC event     | `CustomMessage`, no entry envelope                                        | the event payload itself                        | **nothing yet**                   |

Sources: `irc-bridge.ts:113-126` (incoming), `:185-190` (autoreply), `irc/bus.ts:365-371` (relay),
`agent-session-events.ts:13-64` (the live event).

The handled ones live in `packages/server/src/server/agent/providers/omp/irc-message.ts`. The first
two come from OMP's own prompt templates (`prompts/system/irc-incoming.md` and
`prompts/steering/parent-irc.md`); the `hub` one is a tool return value and never passes through a
message frame at all.

Each transport must be wired into **both** paths, or it will render in the parent pane and not the
subagent pane (or vice versa):

- live parent — `handleToolExecutionEnd` and `handleMessageEnd` in `agent.ts`
- subagents and replayed history — `OmpHistoryMapper` in `message-history.ts`, which feeds
  `OmpSubagentIndex`

A message can also arrive as any message role. Parent steering lands as `user`, peer envelopes have
appeared as both `custom` and `assistant`, so the history mapper hooks all three.

## Prose matching is deliberately shallow

Where prose must still be parsed — a steering message's sender and body — upstream owns the wording
and may reword it. Classification never depends on that wording: the typed `steering` and
`attribution` flags establish that a message _is_ parent steering, and extraction runs only on a
record already identified. When the flags are absent, the fallback anchors on the shortest
structural marker available — the `Parent IRC message:` label, not the sentence around it.

Every fallback degrades rather than drops:

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

## Coverage gaps

Verified against OMP source in 2026-07, cross-checked against 672 local sessions. Usage alone does
not reveal these — several surfaces below have never fired locally. Re-derive from
`vendor/oh-my-pi` rather than trusting this list after a major OMP release.

**Tools.** OMP registers 28 builtins (`tools/index.ts:357-389`) plus hidden `yield`/`goal`, plus
non-registry `advise`, `vibe_*`, `generate_image`, `tts`. Paseo maps twelve. Every unmapped tool
renders as a raw-JSON `unknown` card, and every one of them carries structured `details`.
Unmapped and **enabled by default**: `lsp`, `ast_edit`, `debug`, `ask`, `browser`, `advise`.
Unmapped and off or backend-gated: `ast_grep`, `github`, `inspect_image`, `computer`, `checkpoint`,
`memory_edit`, `retain`, `recall`, `reflect`, `learn`, `manage_skill`, `rewind`, `goal`, `vibe_*`,
`generate_image`, `tts`.

Tool names carry aliases (`builtin-names.ts:36-41`): `search` → `grep`, `find` → `glob`. Add
aliases to `OMP_TOOL_KIND_BY_NAME` rather than new schemas. Note `ls` in that table matches no OMP
tool at all — dead vocabulary, same as `find` was before its shape was corrected.

**Records that reach `visibleFallback`** and render as the literal text
`[<type>] Unsupported history record`: `compaction` (carries `summary`, `shortSummary`,
`tokensBefore`; this is upstream issue #2266), `ttsr_injection`, `service_tier_change`, and the
source-confirmed but locally unseen `branch_summary`, `label`, `mode_change`.

**Roles** Paseo does not handle: `developer`, `pythonExecution`, `hookMessage`, `fileMention`,
`branchSummary`, `compactionSummary`. `developer` is a live/replay divergence — `agent.ts` drops it
live at the `role !== "user"` guard, while replay renders it as noise.

**Content blocks** unhandled: `redactedThinking`, `fallback`, `anthropicServerTool`.

**Live events** unhandled: `turn_end`, `ttsr_triggered`, `todo_reminder`, `todo_auto_clear`,
`irc_message`, `thinking_level_changed`.

**`display: true` customTypes** rendering as prose rather than a typed card: `irc:autoreply`,
`irc:relay`, `async-result` (`{jobs}`), `lsp-late-diagnostic` (`{files}`), `skill-prompt`,
`collab-prompt`, `background-tan-dispatch`, `handoff`, `live-delegation`. The roughly thirty other
built-in customTypes default `display: false` and are correctly invisible.

## Paseo Hub is unrelated

Paseo has its own feature called Hub — an opt-in daemon-to-Hub connection for delegated execution
(`paseo hub connect`, `hub.management.*` / `hub.execution.*` RPCs). See [hub.md](hub.md). It shares
nothing with OMP's `hub` tool beyond the word. Keep user-facing labels for the OMP tool describing
agent coordination so the two never read as the same thing.
