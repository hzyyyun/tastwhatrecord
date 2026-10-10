# Planner Data Schema v1

## Compatibility rules

- Existing field names, delete behavior, and types must not change.
- New fields are optional.
- Missing optional fields are filled in memory with the defaults below.
- Reading an old file does not rewrite it.
- `schemaVersion` is metadata. Missing values are treated as version 1.
- New fields must document their version and default value here.

## Datasets

`planner/data/config.json`

| Field | Type | Default |
|---|---|---|
| `timezone` | string | `Asia/Shanghai` |
| `weeklyCapacityHours` | number | `18` |
| `dailyDeepWorkHours` | number | `3` |
| `topTaskCount` | number | `3` |
| `radarDays` | number | `90` |
| `reviewCadence` | string | `weekly-sunday` |
| `defaultReviewDays` | number | `14` |
| `tavilyMonthlyQuota` | number | `1000` |
| `tavilyLowQuotaThreshold` | number | `50` |
| `schemaVersion` | number | `1` |

`planner/data/goals.json`: array of goal objects. Q0-Q5 are initial examples; IDs may use a custom prefix and sequential number.

| Field | Type | Default |
|---|---|---|
| `id` | string | required |
| `title` | string | required |
| `description` | string | `""` |
| `weight` | number | `3` |
| `status` | string | `active` |
| `schemaVersion` | number | `1` |

`planner/data/tasks.json`: array of task objects.

| Field | Type | Default |
|---|---|---|
| `id` | string | required |
| `parentId` | string | `Q0` |
| `parentTaskId` | string or null | `null` |
| `title` | string | required |
| `type` | string | `action` |
| `status` | string | `todo` |
| `bucket` | `A`, `B`, `C`, `D`, or null | derived |
| `priority` | number | `2` |
| `impact` | number | `3` |
| `dueAt` | ISO date or null | `null` |
| `reviewAt` | ISO date or null | `null` |
| `estimateMin` | number | `0` |
| `acceptance` | string | `""` |
| `preparationDays` | number or null | by task type |
| `raiseAt` | ISO date or null | derived from `dueAt - preparationDays` |
| `needsReplan` | boolean | `false` |
| `replanReason` | string | `""` |
| `unblockCondition` | string | `""` |
| `waitingFor` | string | `""` |
| `tags` | string array | `[]` |
| `sourceIds` | string array | `[]` |
| `schemaVersion` | number | `1` |

Default preparation periods:

| Task type | Days |
|---|---:|
| `action` | 14 |
| `research` | 14 |
| `decision` | 30 |
| `milestone` | 28 |
| `habit` | 0 |

Bucket derivation:

| Condition | Bucket |
|---|---|
| Explicit valid `bucket` | use it |
| `done` or `cancelled` | hidden |
| `blocked` | `C` |
| Has `waitingFor` | `B` |
| `raiseAt` is in the future | `D` |
| Otherwise | `A` |

`planner/data/sources.json`: array of source objects. Only sources explicitly added by the user are retained.

`planner/data/decisions.json`: array of decision objects with optional `sourceIds`, `schemaVersion`, and `updatedAt`.

`planner/data/schedule.json`: array of course objects stored separately from tasks.

`planner/data/last-import.json`: optional import receipt written by
`import-extraction`. It contains `sourceId`, `status`, `createdTaskIds`, and
`createdDecisionCount`; it is generated metadata and is not loaded as application
state.

| Field | Type | Default |
|---|---|---|
| `id` | string | required |
| `dayOfWeek` | number 1-7 | required |
| `periodStart` | number 1-15 | required |
| `periodEnd` | number 1-15 | must be >= `periodStart` |
| `title` | string | required |
| `location` | string | `""` |
| `startTime` | `HH:mm` or null | `null` |
| `endTime` | `HH:mm` or null | `null` |
| `teacher` | string | `""` |
| `weekRange` | string | `""` |
| `source` | `manual`, `text`, or `image` | `manual` |
| `schemaVersion` | number | `1` |
