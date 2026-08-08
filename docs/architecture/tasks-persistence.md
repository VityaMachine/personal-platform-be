# Tasks Persistence Architecture

Status: Draft / Evolving

This document translates the approved Tasks domain model into a persistence and transaction design.

Authoritative domain sources:

- `docs/architecture/platform-core.md`
- `docs/architecture/tasks-domain.md`

This document is a technical persistence specification. It does not implement the Tasks module, define the final REST API, or override domain behavior. If persistence design exposes a domain contradiction, implementation must stop and the issue must return to Domain Design.

---

## 1. Scope

Tasks Core persistence includes:

- `TaskCategory`
- `Task`
- `TaskSpace`
- `Subtask`
- `WorkSession`
- `TaskReminder`
- `TaskActivity`

Recurring persistence is domain-approved but postponed from the first implementation phase:

- `TaskSeries`
- `TaskSeriesSpace`
- `TaskSeriesReminder`

The initial persistence design must support the approved non-recurring Tasks Core without adding recurrence tables to the first migration.

---

## 2. TaskCategory

The Tasks module uses the resource-specific model name `TaskCategory`.

A universal `Category` model must not be introduced for Tasks v1.

### 2.1 Conceptual Fields

```text
TaskCategory
  id
  spaceId
  name
  normalizedName
  color
  isDefault
  position
  createdAt
  updatedAt
```

### 2.2 Rules

- A TaskCategory belongs to exactly one Space.
- Every Space must have exactly one default TaskCategory.
- The default initial name is `General`.
- The default TaskCategory may be renamed.
- The default TaskCategory cannot be deleted while it remains default.
- TaskCategory uses hard delete, not soft delete.
- A referenced TaskCategory cannot be deleted until referencing TaskSpaces are reassigned.
- `position` is an integer greater than or equal to `0`.
- `position` is not unique.
- Display ordering is `position`, then `createdAt`, then `id`.
- Names are case-insensitively unique inside one Space.
- `normalizedName` stores the normalized comparison value.

Example:

```text
name = "  Home  "
normalizedName = "home"
```

### 2.3 Database Constraints and Indexes

The database should enforce:

- `UNIQUE(spaceId, normalizedName)`
- at most one default TaskCategory per Space using a PostgreSQL partial unique index on `spaceId` where `isDefault = true`
- `position >= 0`
- foreign key from `TaskCategory.spaceId` to `Space.id`

The rule "every Space has at least one default TaskCategory" is an application lifecycle invariant. It is not fully expressible with the simple partial unique index alone.

### 2.4 Space Relation

Space requires a relation to TaskCategory.

Conceptually:

```text
Space
  -> TaskCategory[]
```

This relation supports default category backfill, Space creation integration, category management, and validation that each Space has exactly one default TaskCategory.

---

## 3. Task

Task is the global business entity. It is not owned by one Space and must not contain Space-specific fields directly.

### 3.1 Conceptual Fields

```text
Task
  id
  title
  description?
  status
  priority
  createdByUserId?
  completionMode?
  completedAt?
  completedByUserId?
  postponedAt?
  postponedUntil?
  archivedAt?
  deletedAt?
  startAt?
  dueAt?
  deadlineAt?
  estimatedDurationMinutes?
  createdAt
  updatedAt
```

### 3.2 TaskStatus

Persisted `TaskStatus` values:

- `TODO`
- `IN_PROGRESS`
- `POSTPONED`
- `DONE`
- `CANCELED`

`ARCHIVED` is not persisted as a `TaskStatus`.

Archive is represented by:

```text
archivedAt DateTime?
```

Soft delete is represented by:

```text
deletedAt DateTime?
```

Archive and soft delete do not replace Task status. They are lifecycle markers layered on top of the current status.

### 3.3 TaskPriority

Persisted `TaskPriority` values:

- `LOW`
- `MEDIUM`
- `HIGH`
- `URGENT`

Default priority:

```text
LOW
```

### 3.4 TaskCompletionMode

Persisted `TaskCompletionMode` values:

- `ALL_SUBTASKS`
- `MANUAL`

`completionMode` is nullable for unfinished Tasks.

### 3.5 Explicit Non-Fields

Task must not include:

- `spaceId` directly on Task
- `categoryId` directly on Task
- `assigneeUserId`
- execution `startedAt`
- stored `actualDuration`

Task access is resolved through TaskSpace and Space. Actual duration is derived from Subtask WorkSessions.

### 3.6 User Attribution

`createdByUserId` is nullable historical attribution only.

- It does not grant access.
- Future physical User deletion should allow `SET NULL`.

`completedByUserId` is nullable historical attribution.

- Future physical User deletion should allow `SET NULL`.
- A permanent database check requiring `completedByUserId` for manual completion must not be used, because `SET NULL` after future User deletion must remain possible.

### 3.7 Completion Semantics

For Tasks where `status != DONE`, the normal lifecycle state is:

```text
completedAt = null
completionMode = null
completedByUserId = null
```

Manual completion flow sets:

```text
status = DONE
completionMode = MANUAL
completedAt = current completion time
completedByUserId = actor
```

All-subtasks completion flow sets:

```text
status = DONE
completionMode = ALL_SUBTASKS
completedAt = current completion time
completedByUserId = null
```

This consistency is primarily an application invariant verified by tests rather than a permanent database CHECK that would conflict with nullable attribution.

### 3.8 Estimated Duration

`Task.estimatedDurationMinutes` is a nullable integer.

Effective Task estimate:

```text
if Task.estimatedDurationMinutes != null:
    use Task.estimatedDurationMinutes
else:
    use sum(Subtask.estimatedDurationMinutes)
```

Actual duration is not stored on Task.

### 3.9 Planning

Task planning fields:

```text
startAt DateTime?
dueAt DateTime?
deadlineAt DateTime?
```

All planning fields are nullable.

Database temporal checks should enforce, whenever relevant values exist:

```text
startAt <= dueAt
dueAt <= deadlineAt
startAt <= deadlineAt
```

Date-only UX behavior is resolved before persistence into absolute datetime values, as defined in the Tasks domain model.

### 3.10 Postponement

Task postponement fields:

```text
postponedAt DateTime?
postponedUntil DateTime?
```

Database temporal checks:

```text
postponedUntil IS NULL OR postponedAt IS NOT NULL
```

and:

```text
postponedAt IS NULL
OR postponedUntil IS NULL
OR postponedAt <= postponedUntil
```

Exact `Task.status` and postponement-field consistency remains an application invariant.

---

## 4. Subtask

Subtask is the executable work unit under Task.

### 4.1 SubtaskStatus

Persisted `SubtaskStatus` values:

- `TODO`
- `IN_PROGRESS`
- `DONE`

Subtask does not support `POSTPONED`, `CANCELED`, `ARCHIVED`, or soft delete in the initial design.

### 4.2 Conceptual Fields

```text
Subtask
  id
  taskId
  title
  status
  position
  isSystemGenerated
  estimatedDurationMinutes?
  completedAt?
  completedByUserId?
  createdAt
  updatedAt
```

### 4.3 Rules

- Every Task always has at least one Subtask.
- Hierarchy is single-level.
- Nested Subtasks are not supported.
- `position` is an integer greater than or equal to `0`.
- Do not use `UNIQUE(taskId, position)`.
- Stable sorting may use `position`, then `createdAt`, then `id`.

### 4.4 System-Generated Subtask

A system-generated Subtask is created automatically when a Task has no explicit Subtasks.

Rules:

- `title` initially equals Task title.
- `isSystemGenerated = true`.
- An unused generated Subtask title follows Task title.
- If the first user-created Subtask is added and the generated Subtask has no meaningful history or WorkSessions, remove the generated Subtask.
- If the generated Subtask already has WorkSessions or meaningful execution history, do not silently delete it.
- A used generated Subtask must be preserved as a normal historical/user-visible Subtask.

### 4.5 User Attribution and Active Worker

`completedByUserId` is nullable historical attribution.

- Future physical User deletion may `SET NULL`.
- Completion application flow sets the actual completing actor.

Do not store `activeWorkerUserId` on Subtask.

The active worker is derived from the active WorkSession:

```text
WorkSession where subtaskId = Subtask.id and endedAt IS NULL
```

Do not store execution `startedAt` on Subtask.

---

## 5. WorkSession

WorkSession records actual work performed by a User on a Subtask.

### 5.1 Conceptual Fields

```text
WorkSession
  id
  subtaskId
  userId
  startedAt
  endedAt?
  createdAt
```

### 5.2 Rules

- WorkSession belongs only to Subtask.
- No Task-level WorkSession exists.
- `userId` identifies the actual worker.
- An active session means `endedAt IS NULL`.
- Do not store duration as a mutable field.
- Duration is derived from `endedAt - startedAt`.
- Subtask actual duration is the sum of its WorkSessions.
- Task actual duration is the sum of WorkSession durations across all Subtasks.

### 5.3 Exclusive Worker Guarantee

The database must protect against concurrent Start requests.

Use a PostgreSQL partial unique index conceptually equivalent to:

```sql
UNIQUE (subtaskId)
WHERE endedAt IS NULL
```

This enforces one active WorkSession per Subtask and therefore one active worker per Subtask.

### 5.4 Temporal Constraint

The database should enforce:

```text
endedAt IS NULL OR endedAt >= startedAt
```

### 5.5 User Deletion

`WorkSession.userId` is historical work attribution.

Final permanent User deletion semantics are a technical/domain dependency on the platform account-deletion policy. The design must not silently erase or misattribute historical work. Until the platform policy is approved, the exact foreign key behavior for `WorkSession.userId` is Open / Technical Design Pending.

---

## 6. TaskSpace

TaskSpace is the Space-specific relationship between Task and Space. It is a domain entity, not only a join table.

### 6.1 Conceptual Fields

```text
TaskSpace
  id
  taskId
  spaceId
  taskCategoryId
  addedByUserId?
  createdAt
  updatedAt
```

### 6.2 Rules

- A Task may exist in multiple Spaces.
- `UNIQUE(taskId, spaceId)` is required.
- Every TaskSpace has exactly one TaskCategory.
- The TaskCategory must belong to the same Space as TaskSpace.
- `addedByUserId` is nullable historical attribution.
- Future physical User deletion may `SET NULL` for `addedByUserId`.
- Soft-deleting Task does not remove TaskSpace.

### 6.3 Category and Space Integrity

Category/Space integrity must be protected by the database.

Conceptual design:

```text
TaskCategory:
  UNIQUE(id, spaceId)

TaskSpace:
  (taskCategoryId, spaceId)
    -> TaskCategory(id, spaceId)
```

This prevents assigning a TaskCategory from another Space to a TaskSpace.

The exact Prisma representation of this composite relation is Open / Technical Design Pending.

### 6.4 Delete Behavior

Permanent Task delete:

```text
Task -> TaskSpace ON DELETE CASCADE
```

Space delete:

```text
TaskSpace relation must RESTRICT deletion while association exists
```

TaskCategory delete:

```text
RESTRICT while TaskSpace references it
```

The final TaskSpace cannot be removed. This is an application/domain invariant requiring transactional protection against concurrent removals.

---

## 7. TaskReminder

TaskReminder is personal reminder configuration for one User relative to one Task.

### 7.1 Conceptual Fields

```text
TaskReminder
  id
  taskId
  userId
  type
  offsetMinutes?
  repeatIntervalMinutes?
  isActive
  nextTriggerAt?
  createdAt
  updatedAt
```

### 7.2 TaskReminderType

Persisted reminder types:

- `AT_START`
- `AT_DUE`
- `BEFORE_START`
- `BEFORE_DUE`
- `AFTER_OVERDUE`

### 7.3 Rules

- Reminder belongs to one User and one Task.
- A User may have multiple reminders for the same Task.
- Multiple reminders of the same type are allowed.
- Do not use `UNIQUE(taskId, userId, type)`.

`offsetMinutes`:

- used for relative reminders;
- `AT_START` and `AT_DUE` normally have null offset;
- `BEFORE_START`, `BEFORE_DUE`, and `AFTER_OVERDUE` may use offset.

`repeatIntervalMinutes`:

- nullable;
- `null` means one-time reminder;
- integer interval supports simple repeated reminders;
- complex calendar-based reminder recurrence is future work.

`nextTriggerAt`:

- persisted materialized scheduling state;
- source rule remains `type + offset + repeat`;
- scheduler should query active reminders efficiently;
- may be null even when `isActive = true` if the required Task planning anchor does not yet exist.

`isActive`:

- explicit Boolean;
- default `true`;
- active state must not be inferred only from `nextTriggerAt`.

### 7.4 Lifecycle Deactivation

When Task reaches lifecycle states where reminders no longer apply, future reminder scheduling should be deactivated:

- `status = DONE`
- `status = CANCELED`
- `archivedAt != null`
- `deletedAt != null`

Deactivation:

```text
isActive = false
nextTriggerAt = null
```

Reminders are not physically deleted during normal Task lifecycle.

Reactivation behavior after reopening is Open / Technical Design Pending.

### 7.5 Delete Behavior

Permanent User delete:

```text
TaskReminder may CASCADE with User because it is personal configuration,
subject to final account-deletion design.
```

Permanent Task delete:

```text
TaskReminder CASCADE
```

Soft delete:

```text
no physical deletion
```

### 7.6 Indexes

Initial indexes:

- `taskId`
- `userId`
- scheduler-oriented index involving `isActive` and `nextTriggerAt`

Do not add uniqueness by reminder type.

---

## 8. TaskActivity

TaskActivity is immutable, append-only history for Task-domain events.

### 8.1 Conceptual Fields

```text
TaskActivity
  id
  taskId
  actorUserId?
  spaceId?
  subtaskId?
  type
  metadata?
  createdAt
```

There is no `updatedAt`.

### 8.2 Attribution and Relations

`taskId`:

- required;
- permanent Task deletion may cascade in the initial design;
- soft delete does not remove TaskActivity.

`actorUserId`:

- nullable;
- actual User for User-driven events;
- null for system-driven events;
- future User deletion may `SET NULL`.

`spaceId`:

- optional Space context;
- future Space deletion may `SET NULL`.

`subtaskId`:

- optional;
- future Subtask physical deletion may `SET NULL`.

### 8.3 Activity Type

Use an enum, but only for actually implemented use cases.

Initial categories/types may include:

- `TASK_CREATED`
- `TASK_UPDATED`
- `TASK_STATUS_CHANGED`
- `TASK_COMPLETED`
- `TASK_REOPENED`
- `TASK_POSTPONED`
- `TASK_CANCELED`
- `TASK_ARCHIVED`
- `TASK_UNARCHIVED`
- `TASK_DELETED`
- `TASK_ADDED_TO_SPACE`
- `TASK_REMOVED_FROM_SPACE`
- `TASK_CATEGORY_CHANGED`
- `SUBTASK_CREATED`
- `SUBTASK_UPDATED`
- `SUBTASK_STARTED`
- `SUBTASK_PAUSED`
- `SUBTASK_COMPLETED`
- `SUBTASK_REOPENED`
- `SUBTASK_REMOVED`
- `WORK_SESSION_CORRECTED`
- `REMINDER_CREATED`
- `REMINDER_UPDATED`
- `REMINDER_DEACTIVATED`

Do not prematurely define recurrence event types that are not implemented.

### 8.4 Metadata

`metadata` is nullable JSON.

Examples:

- from/to priority;
- old/new planning values;
- old/new TaskCategory IDs;
- historical labels when necessary.

`metadata` must not become the source of truth for current Task state.

### 8.5 Supported Operations

Do not create generic update/delete TaskActivity repository operations.

Normal supported behavior is:

- append activity;
- list Task activity.

### 8.6 Indexes

Initial indexes:

- `(taskId, createdAt)`
- `actorUserId`
- `spaceId`
- `subtaskId`
- `type`

---

## 9. Task Index Strategy

Initial Task indexes:

- `status`
- `priority`
- `createdByUserId`
- `startAt`
- `dueAt`
- `deadlineAt`
- `archivedAt`
- `deletedAt`

The first migration should not create every possible compound index preemptively.

Speculative partial active-task indexes should not be added unless a concrete API query pattern justifies them.

Future composite and partial indexes should be based on actual query patterns and query plans.

---

## 10. Transaction Boundaries

The following operations must be atomic from the persistence and domain perspective.

Exact PostgreSQL locking and Prisma transaction implementation is Open / Technical Design Pending where noted, but the invariants must be protected transactionally.

### 10.1 Task Creation

One transaction:

1. Authorize Space context.
2. Resolve explicit or default TaskCategory.
3. Create Task.
4. Create TaskSpace.
5. Create explicit Subtasks or system-generated Subtask.
6. Create `TASK_CREATED` TaskActivity.

No partial Task aggregate may remain if any step fails.

### 10.2 Start Subtask

One transaction:

1. Validate actor and Space access.
2. Validate Task association.
3. Validate Subtask.
4. Create active WorkSession.
5. Set Subtask `IN_PROGRESS`.
6. Promote parent Task to `IN_PROGRESS` when required.
7. Append activity.

The partial unique active-WorkSession index is final race-condition protection.

### 10.3 Pause Subtask

One transaction:

1. Close active WorkSession.
2. Set Subtask `TODO`.
3. Append activity.

Pausing a Subtask must not automatically return the parent Task to `TODO`.

### 10.4 Complete Subtask

One transaction:

1. Verify active worker is actor.
2. Close active WorkSession.
3. Set Subtask `DONE`.
4. Set `completedAt`.
5. Set `completedByUserId`.
6. Evaluate all Subtasks.
7. Possibly complete Task as `ALL_SUBTASKS`.
8. Append relevant activity.

### 10.5 Manual Task Complete

One transaction:

1. Close all active Subtask WorkSessions.
2. Return `IN_PROGRESS` Subtasks to `TODO`.
3. Preserve `DONE` Subtasks.
4. Set Task `status = DONE`.
5. Set `completionMode = MANUAL`.
6. Set `completedAt`.
7. Set `completedByUserId = actor`.
8. Deactivate applicable future reminders.
9. Append activity.

### 10.6 Cancel Task

One transaction:

1. Close active WorkSessions.
2. Return `IN_PROGRESS` Subtasks to `TODO`.
3. Preserve `DONE` Subtasks.
4. Set Task `status = CANCELED`.
5. Deactivate applicable reminders.
6. Append activity.

### 10.7 Soft Delete Task

One transaction:

1. Close active WorkSessions.
2. Return `IN_PROGRESS` Subtasks to `TODO`.
3. Preserve TaskSpace associations.
4. Deactivate reminders.
5. Set `deletedAt`.
6. Append activity.

### 10.8 Add Task to Space

One transaction:

1. Authorize source context.
2. Authorize target Space.
3. Resolve target TaskCategory or target default TaskCategory.
4. Create TaskSpace.
5. Append activity.

### 10.9 Remove Task from Space

One transaction:

1. Verify association exists.
2. Ensure it is not the final TaskSpace.
3. Remove association.
4. Append activity.

Concurrency must not allow two concurrent removals to eliminate the final two TaskSpace associations.

The exact PostgreSQL locking strategy for final TaskSpace removal is Open / Technical Design Pending.

### 10.10 TaskCategory Deletion

TaskCategory deletion rules:

- reject if `isDefault = true`;
- reject if any TaskSpace references it;
- otherwise hard delete.

### 10.11 Space Deletion

Space deletion rules:

- reject if any TaskSpace references it;
- FK `RESTRICT` is final database protection.

---

## 11. Migration Strategy

The initial Tasks Core DDL migration should add:

- enums;
- `TaskCategory`;
- `Task`;
- `TaskSpace`;
- `Subtask`;
- `WorkSession`;
- `TaskReminder`;
- `TaskActivity`;
- foreign keys;
- indexes;
- CHECK constraints;
- partial unique indexes.

Recurring tables are not part of the first Tasks Core migration.

Existing Task data backfill is unnecessary because Tasks do not yet exist.

Existing Space data requires TaskCategory backfill.

Deployment sequence:

1. Apply DDL migration.
2. Run default TaskCategory backfill.
3. Run validation.
4. Activate/deploy application code that assumes every Space has a default TaskCategory.

---

## 12. Default TaskCategory Backfill

Backfill must operate over every existing Space, not every User.

### 12.1 Per-Space Behavior

If a default TaskCategory already exists:

- leave it unchanged;
- do not rename it to `General`.

If no default exists and a non-default category with `normalizedName = "general"` exists:

- promote that category to `isDefault = true`.

Otherwise create:

```text
name = "General"
normalizedName = "general"
isDefault = true
position = 0
```

### 12.2 Operational Requirements

Backfill must be:

- idempotent;
- transactional per Space;
- safe to rerun;
- protected by database constraints;
- able to continue processing other Spaces after one Space failure;
- able to return/report failures;
- able to produce non-zero CLI exit code when failures exist.

### 12.3 Code Organization Direction

Business/application backfill logic should live in `src`, not only in scripts.

Preferred conceptual structure:

```text
src/modules/tasks/...
  task-category.backfill.ts
```

A script entrypoint may exist only as a thin CLI adapter:

- create Prisma client;
- call `src` backfill function;
- print statistics;
- set exitCode;
- disconnect.

Scripts must not become a temporary location for production business logic.

### 12.4 Validation

Validation after backfill:

- Spaces without default TaskCategory = `0`;
- Spaces with more than one default TaskCategory = `0`;
- invalid or empty `normalizedName` = `0`;
- duplicate `normalizedName` inside one Space = `0`.

---

## 13. Space Creation Integration

After TaskCategory foundation is active, every new Space must receive a default TaskCategory atomically.

Future generic/Shared Space creation transaction conceptually creates:

1. Space.
2. OWNER SpaceMember.
3. Default TaskCategory `General`.

Existing registration aggregate must be extended so Personal Space creation also creates default TaskCategory atomically.

Registration aggregate conceptually becomes:

1. User.
2. Profile.
3. UserSettings.
4. EmailVerificationToken.
5. Personal Space.
6. OWNER SpaceMember.
7. Default TaskCategory `General`.

Any failure must roll back the complete aggregate.

---

## 14. Backfill Automated Tests

Backfill must have automated integration coverage.

At minimum test:

- Space without TaskCategory creates `General`;
- second run creates no duplicate;
- existing default `General` remains unchanged;
- renamed existing default remains unchanged;
- existing non-default `General` with no default is promoted;
- multiple Spaces each receive one default;
- failure for one Space allows remaining Spaces to continue;
- failure count/result is reported;
- CLI/application result can produce failure exit semantics.

Database constraint tests should cover:

- duplicate default TaskCategory;
- duplicate `normalizedName` in the same Space;
- cross-Space TaskCategory/TaskSpace mismatch;
- duplicate TaskSpace;
- multiple active WorkSessions on one Subtask;
- invalid planning temporal order;
- invalid WorkSession where `endedAt < startedAt`.

---

## 15. Recurrence Future Persistence

The following models are domain-approved but postponed:

- `TaskSeries`
- `TaskSeriesSpace`
- `TaskSeriesReminder`

Approved direction:

- TaskSeries is not Task.
- TaskSeries generates concrete Tasks.
- TaskSeriesSpace defines target Space and TaskCategory for occurrences.
- TaskSeriesReminder is User-specific.
- Recurrence persistence is a later Tasks phase.

The first Tasks Core migration must not add recurrence tables.

Exact recurrence table fields, recurrence rule representation, generation scheduler, occurrence mutation behavior, and backfill strategy are Open / Technical Design Pending for the recurrence phase.

---

## 16. DB vs Application Invariants

Some invariants should be enforced by the database because they protect data integrity under concurrency, direct writes, or lifecycle mistakes. Other invariants belong to the application/domain layer because they require aggregate-level decisions, authorization context, multi-step transactions, or future policy decisions.

### 16.1 Database-Enforced Invariants

Database-enforced invariants:

- Unique TaskCategory normalized name per Space.
- At most one default TaskCategory per Space.
- TaskCategory belongs to the same Space as TaskSpace through composite FK.
- Unique `TaskSpace(taskId, spaceId)`.
- One active WorkSession per Subtask.
- Temporal planning constraints.
- WorkSession `endedAt >= startedAt`.
- `position >= 0` for ordered entities.
- Space delete is restricted while TaskSpace exists.
- TaskCategory delete is restricted while TaskSpace references it.

These belong in the database because they are structural integrity rules and must remain true even under concurrent requests.

### 16.2 Application/Domain Invariants

Application/domain invariants:

- Every Space has at least one default TaskCategory.
- Every Task always has at least one Subtask.
- Final TaskSpace cannot be removed.
- System-generated Subtask replacement behavior.
- Task lifecycle/status consistency.
- Reminder recalculation and deactivation behavior.
- Automatic vs manual completion semantics.
- Authorization through specific Space context.
- Atomic multi-entity lifecycle operations.
- Backfill continuation and reporting behavior.

These belong in the application/domain layer because they depend on lifecycle orchestration, authorization, multi-entity state transitions, or policies not fully representable as simple constraints.

---

## 17. Open Technical Questions

The following implementation details remain Open / Technical Design Pending:

- Exact PostgreSQL locking strategy for final TaskSpace removal.
- Exact Prisma representation of the composite TaskCategory/TaskSpace Space relation.
- Final account deletion semantics for `WorkSession.userId`.
- Final reminder reactivation behavior after Task reopen.
- Exact TaskActivity enum introduced in each implementation increment.
- Exact module-folder organization.
- Final scheduler implementation for TaskReminder.
- Final implementation representation of recurrence tables in the later recurrence phase.

These questions do not reopen approved domain decisions.

---

## 18. Relationship to Domain Documentation

Document responsibilities:

```text
platform-core.md
  -> defines general platform architecture

tasks-domain.md
  -> defines approved Tasks business/domain behavior

tasks-persistence.md
  -> defines how the approved Tasks domain is intended to be persisted safely
```

Persistence design must not override domain behavior.

If Technical Design exposes a domain contradiction, implementation must stop and the issue must return to Domain Design.

This document aligns persistence representation with the approved domain model: archive is an orthogonal lifecycle marker represented by `archivedAt`, while the persisted `TaskStatus` remains `TODO | IN_PROGRESS | POSTPONED | DONE | CANCELED`.

