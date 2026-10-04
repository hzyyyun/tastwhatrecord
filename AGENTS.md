# Student Planner OS

This workspace is the user's external planning system. Treat `planner/` as the source of truth instead of relying on prior chat memory.

## Required behavior

1. Before planning work, read the files under `planner/data/`.
2. When the user provides chat logs, documents, screenshots, or images:
   - register the source with `node planner/bin/planner.mjs ingest <path>`;
   - inspect the source;
   - write a structured extraction JSON;
   - import it with `node planner/bin/planner.mjs import-extraction <json>`;
   - render the updated state.
3. Keep goals, milestones, actions, decisions, and habits linked through `parentId`.
4. Never create an unowned task. Every active task must connect to a configured mainline goal ID. Q0-Q5 are examples, not hardcoded limits.
5. When a parent task, milestone, or goal changes, run `replan` on it, inspect the marked subtree, and update child tasks before rendering.
6. Verify time-sensitive external facts with sources and record the verification date.
7. Prefer a short state brief over replaying the full conversation.
8. Update `planner/data/*.json`, never edit generated files by hand.
9. Run `npm test` and `node bin/planner.mjs render` after changing planning logic.
10. Keep `planner/data/*.json` backward compatible. New fields are optional and must be documented in `planner/schema/data-v1.md`.
11. Never generate, read, transmit, log, hardcode, or include an API Key in code, configuration, fixtures, generated files, or backups. Only the user may enter keys directly in the App UI; keys must remain in local encrypted storage.
