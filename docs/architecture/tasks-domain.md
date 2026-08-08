# Tasks Domain Model

Status: Draft / Evolving

This document describes the approved domain model for the Tasks module of the Personal Platform.

It is an architecture specification for domain behavior, terminology, lifecycle rules, and invariants. It is not an implementation plan, database schema, REST API contract, or UI specification.

This document is intended to be the source of truth for the Tasks domain as implementation proceeds.

Business rules that have not yet been approved must not be inferred during implementation. They must remain explicitly marked as future work or open questions until a domain decision is made.

---

## 1. Vision

The Tasks module manages work in the Personal Platform.

A Task is the central work unit of the platform. It represents an item of work that may be created, planned, performed, tracked, postponed, completed, canceled, archived, and eventually soft-deleted.

Tasks are business resources.

They exist independently from presentation and aggregation layers such as Dashboard, Calendar, Timeline, Today, Upcoming, Overdue, Backlog, Completed, Archived, or future productivity views.

Those layers may expose, filter, group, aggregate, or visualize Tasks, but they do not own Task data and do not define Task behavior.

Tasks are also collaboration resources.

A Task may participate in one or more Spaces. A Space provides access, membership, collaboration, categorization, and contextual metadata.

A Task is not copied when it appears in multiple Spaces. It remains one global business entity whose global state is shared across every associated Space.

---

## 2. Design Principles

The Tasks domain follows these approved principles:

- Task is a global business entity.
- Task does not belong to one User.
- Task does not belong to a single Space.
- Task may exist in multiple Spaces.
- Task creator is historical attribution, not permanent ownership or permanent access.
- Space provides collaboration and access context.
- Access to a Task is resolved through a Space associated with that Task.
- TaskSpace is a domain relationship, not merely a technical join table.
- Task global state is shared across all associated Spaces.
- Space-specific Task metadata belongs to TaskSpace.
- TaskCategory belongs to Space.
- Every TaskSpace has exactly one TaskCategory.
- Reminder belongs to a User relative to a Task.
- Work is executed through Subtasks.
- WorkSessions are the source of truth for actual work duration.
- No Task-level WorkSession exists.
- The exclusive worker model exists only for Subtasks.
- TaskActivity represents immutable domain history.
- TaskSeries generates Tasks but is not itself a Task.
- Dashboard, Calendar, Timeline, and Smart Views are presentation or aggregation layers.
- Implementation must not invent business rules that are absent from the approved domain specification.

---

## 3. Domain Concepts

### 3.1 Task

Task is the central work unit and global business entity.

A Task contains shared work state including:

- identity;
- title and content;
- planning information;
- priority;
- status;
- completion behavior;
- lifecycle state;
- creator attribution;
- Subtasks;
- Space associations;
- reminders;
- activity history;
- recurrence association when applicable.

When a Task exists in multiple Spaces, it remains one Task.

Changes to global Task state are visible through every associated Space.

Task does not have a permanent assignee.

A User does not need to be a member of every Space associated with a Task in order to work with it. Access is established through a valid Space context in which the User has membership and the required capability.

### 3.2 Subtask

Subtask is a single-level executable work unit under a Task.

Subtasks are the units through which actual work is performed and tracked.

A Subtask may be:

- TODO;
- IN_PROGRESS;
- DONE.

Subtasks do not contain nested Subtasks.

A Subtask uses an exclusive worker model while it is IN_PROGRESS.

Only one User may actively work on the same Subtask at a time.

### 3.3 System-Generated Subtask

Every Task must always have at least one Subtask.

If a Task is created without user-defined Subtasks, the system automatically creates one system-generated Subtask whose title initially matches the Task title.

Its purpose is to provide an executable work unit without introducing Task-level WorkSessions.

A system-generated Subtask is normally hidden as a duplicate work item in simple UI when it is the only Subtask.

While the system-generated Subtask remains unused, changing the Task title also updates the system-generated Subtask title.

When the first user-created Subtask is added:

- if the system-generated Subtask has no meaningful execution history and no WorkSessions, it is removed and replaced by the user-created work breakdown;
- if the system-generated Subtask already contains WorkSessions or meaningful execution history, it must not be silently deleted;
- in that case it becomes or remains a normal historical/user-visible Subtask so that recorded work is preserved.

### 3.4 TaskSpace

TaskSpace represents the association between a Task and a Space.

TaskSpace is a domain entity in its own right.

It provides the contextual projection of a global Task into a Space.

TaskSpace contains Space-specific Task metadata.

The currently approved Space-specific metadata includes TaskCategory.

A Task may have multiple TaskSpace associations.

Each TaskSpace belongs to:

- exactly one Task;
- exactly one Space;
- exactly one TaskCategory belonging to that Space.

### 3.5 TaskCategory

TaskCategory is a Space-owned classification for Tasks.

TaskCategories are local to a Space.

The same global Task may therefore have different TaskCategories in different Spaces.

Every Space has exactly one default TaskCategory.

Each TaskSpace must always reference exactly one TaskCategory.

TaskCategories support at least:

- name;
- color;
- default designation.

Tags are not part of Tasks v1.

The approved domain/persistence entity name is `TaskCategory`; the shorter word “category” may still be used descriptively in product/UI language.

### 3.6 TaskReminder

TaskReminder represents a reminder owned by a User relative to a Task.

Reminders are personal even when the Task is shared.

Different Users may define different reminders for the same Task.

One User may define multiple reminders for the same Task.

### 3.7 WorkSession

WorkSession represents one concrete interval of actual work performed by a User on a Subtask.

WorkSession is the source of truth for actual work duration.

A WorkSession records attribution to the User who actually performed the work.

Task actual duration is derived from WorkSessions of all of its Subtasks.

### 3.8 TaskActivity

TaskActivity represents immutable history of meaningful domain events related to a Task.

TaskActivity is append-only.

Existing activity entries are never rewritten to represent later corrections.

Corrections create additional activity.

### 3.9 TaskSeries

TaskSeries represents a recurrence definition capable of generating concrete Task occurrences.

TaskSeries is not itself a Task.

Every generated occurrence is an ordinary Task with its own lifecycle and state.

Recurrence remains part of the approved domain model but its implementation is intentionally postponed to a later Tasks implementation phase.

### 3.10 TaskSeriesSpace

TaskSeriesSpace represents a target Space configuration for a TaskSeries.

A TaskSeries is not itself an active work resource inside a Space, but it must know in which Spaces generated occurrences should exist.

TaskSeriesSpace therefore defines the Space projection used when generating occurrences.

It includes the target Space and the TaskCategory to be used for generated TaskSpace associations.

### 3.11 TaskSeriesReminder

TaskSeriesReminder represents a User-specific reminder rule associated with a TaskSeries.

Generated occurrences may receive TaskReminder instances derived from the series reminder configuration.

A User must retain access through at least one target Space of the TaskSeries for the corresponding series reminder to remain active.

If the User loses access to all target Spaces of the series, the User's series reminder is deactivated.

---

## 4. Domain Relationships

Conceptually:

    Task
      -> Subtasks
          -> WorkSessions

    Task
      -> TaskSpaces
          -> Space
          -> TaskCategory

    Task
      -> TaskReminders
          -> User

    Task
      -> TaskActivity

    TaskSeries
      -> Task occurrences

    TaskSeries
      -> TaskSeriesSpaces
          -> Space
          -> TaskCategory

    TaskSeries
      -> TaskSeriesReminders
          -> User

A Task has one or more Subtasks.

Subtasks contain the executable work state.

WorkSessions record actual work performed on Subtasks.

A Task is associated with one or more Spaces through TaskSpace.

A TaskSpace references exactly one TaskCategory owned by the same Space.

TaskReminder belongs to a User relative to a Task.

TaskSeries generates ordinary Tasks and uses TaskSeriesSpace to define the target Spaces and Categories for generated occurrences.

---

## 5. Task Lifecycle

The high-level Task lifecycle includes:

    Creation
        ->
    Planning
        ->
    Work
        ->
    DONE or CANCELED
        ->
    Archive
        ->
    Soft Delete

POSTPONED is a temporary lifecycle state from which work may later resume.

Restore and permanent physical deletion are future lifecycle operations.

### 5.1 Creation

A Task is created as a global business entity.

At creation it must receive at least one TaskSpace association.

The Task cannot exist without a Space context.

The initial TaskSpace receives:

- the target Space;
- an explicit TaskCategory when provided;
- otherwise the default TaskCategory of that Space.

A Task created without explicit Subtasks receives a system-generated Subtask.

### 5.2 Planning

Task planning may include:

- start;
- due;
- deadline;
- priority;
- estimated duration.

Planning data may change during the Task lifecycle.

Planning changes may affect reminders, Smart Views, overdue state, and recurrence behavior.

### 5.3 Work

Actual work is performed through Subtasks.

Starting work on a Subtask opens a WorkSession.

The User who starts the Subtask becomes the active worker for that Subtask.

Only one active worker may exist for a particular Subtask.

Different Users may work concurrently on different Subtasks of the same Task.

### 5.4 Completion

A Task may become DONE:

- automatically through Subtask completion;
- manually through explicit Task completion.

The two completion paths have different semantics and must remain distinguishable.

### 5.5 Cancellation

A Task may be explicitly canceled when the work is no longer intended to be completed.

Cancellation preserves the Task as business history.

Cancellation is not deletion.

### 5.6 Archive

Archive removes finished work from the normal active working set while preserving it as accessible historical work.

A User can later find archived Tasks through the archive.

Archive is distinct from deletion.

### 5.7 Soft Delete

Deletion is logical rather than immediate physical deletion.

A soft-deleted Task is no longer available through normal Task views or normal Task interaction.

The Task remains physically stored.

Its TaskSpace associations and historical context are retained.

Normal users do not access deleted Tasks through the regular Tasks experience.

Future restore and retention behavior will be designed separately.

### 5.8 Permanent Delete

Permanent physical deletion is future work.

It is intentionally distinct from:

- removing Task from one Space;
- archiving;
- canceling;
- soft deletion.

---

## 6. Task Status Model

The approved Task statuses are:

- TODO
- IN_PROGRESS
- POSTPONED
- DONE
- CANCELED

Archive is not a Task status. It is a global lifecycle marker layered on top of an eligible final status and is represented conceptually by `archivedAt`.

### 6.1 TODO

TODO represents work that exists but has not yet entered active execution.

### 6.2 IN_PROGRESS

IN_PROGRESS represents a Task for which work has started.

A Task may enter IN_PROGRESS manually even when no Subtask is currently being worked on.

A Task may also enter IN_PROGRESS automatically because of Subtask activity.

If a Task is TODO and a Subtask becomes IN_PROGRESS or DONE, the Task becomes IN_PROGRESS unless the Subtask completion simultaneously satisfies automatic completion.

If a Task is POSTPONED and work begins on a Subtask, the Task becomes IN_PROGRESS.

Subtask changes may promote Task state into IN_PROGRESS, but they do not perform a complete recalculation of Task status after every Subtask state change.

For example, if a Task was manually moved to IN_PROGRESS, pausing its only active Subtask does not automatically return the Task to TODO.

Likewise, when at least one Subtask has already been completed while other Subtasks remain unfinished, the parent Task remains IN_PROGRESS.

### 6.3 POSTPONED

POSTPONED represents valid work intentionally deferred for later.

Postponement does not require a new start or due date.

A Task may therefore exist in POSTPONED without a known resume date.

If postponement contains planning metadata such as postponedAt or postponedUntil, those values represent the active postponement state.

When the Task leaves POSTPONED because work resumes:

- postponedAt is cleared;
- postponedUntil is cleared;
- the historical postponement remains represented through TaskActivity.

### 6.4 DONE

DONE represents completed work.

A Task may become DONE automatically or manually.

### 6.5 CANCELED

CANCELED represents work that remains historically meaningful but is no longer intended to be completed.

A canceled Task is not deleted.

### 6.6 Archive State

Archive represents finished or canceled work intentionally moved out of the normal working set.

Archive is global Task lifecycle state rather than Space-specific state, but it does not replace `DONE` or `CANCELED`. An archived Task retains its final Task status and is marked separately by `archivedAt`.

---

## 7. Completion Model

Task completion supports two conceptual completion modes:

- ALL_SUBTASKS
- MANUAL

The persistence representation is intentionally deferred to Technical Design.

### 7.1 Automatic Completion

When all active Subtasks are DONE, the parent Task automatically becomes DONE.

The completion is attributed to the automatic Subtask completion path.

Conceptually:

    completionMode = ALL_SUBTASKS

If a Task that was automatically completed through all Subtasks later has a Subtask reopened, the parent Task returns to IN_PROGRESS.

### 7.2 Manual Completion

A User with the required capability may explicitly complete the Task even when not all Subtasks are DONE.

Conceptually:

    completionMode = MANUAL

Manual completion is an explicit override.

Subsequent ordinary Subtask state changes do not automatically reopen a manually completed Task.

### 7.3 Manual Completion with Active Work

Manual completion must be atomic.

If active Subtask WorkSessions exist:

- all active WorkSessions are closed;
- all IN_PROGRESS Subtasks are returned to TODO;
- already DONE Subtasks remain DONE;
- Task becomes DONE;
- completion is marked as manual;
- applicable future reminders are canceled;
- TaskActivity records the operation.

The User does not need to manually pause every active Subtask before completing the Task.

---

## 8. Cancellation Rules

Canceling a Task is atomic.

When a Task is canceled:

- all active Subtask WorkSessions are closed;
- all IN_PROGRESS Subtasks return to TODO;
- DONE Subtasks remain DONE;
- Task becomes CANCELED;
- applicable future reminders are canceled;
- TaskActivity records the cancellation.

A canceled Task remains part of business history.

---

## 9. Archive Rules

A Task may be archived only from an eligible final state.

The approved archive model treats DONE and CANCELED as archiveable states.

Archiving does not delete Task data.

Archived Tasks remain discoverable through the archive.

TaskSpace associations are retained.

A Task must not remain with an active WorkSession when archived.

Archiving must preserve the existing final Task status (`DONE` or `CANCELED`) and set the archive marker atomically. Any archive operation must preserve the no-active-WorkSession invariant.

---

## 10. Soft Delete Rules

Soft deletion hides a Task from normal use while preserving its data.

Soft delete must preserve TaskSpace associations.

Soft deletion must not leave active work behind.

If active WorkSessions exist, deletion must atomically close them before completing the lifecycle operation.

IN_PROGRESS Subtasks are returned to TODO.

Applicable future reminders are canceled or deactivated.

TaskActivity records the deletion.

A soft-deleted Task is not considered physically removed from the database.

Restore behavior is future work.

---

## 11. Planning Model

Task planning supports:

- start;
- due;
- deadline.

The internal scheduling model uses precise datetimes.

The user experience may allow a User to select only a calendar date.

When a date is provided without an explicit time, the end of that selected calendar day is represented by the next date at 00:00 in the User's timezone.

Example:

    User selects:
    2026-08-05

    User timezone:
    Europe/Kyiv

    Overdue boundary:
    2026-08-06 00:00 Europe/Kyiv

The boundary is converted to and stored as an absolute datetime.

The platform does not currently require a separate Task timezone.

The User's timezone at the point where a date-only value is resolved provides the calendar context.

Once resolved, the stored value represents an absolute moment and does not move merely because another User views the Task from another timezone.

Exact persistence representation is Technical Design.

---

## 12. Subtask Execution Model

Subtasks have the statuses:

- TODO
- IN_PROGRESS
- DONE

### 12.1 Start

When User A starts a TODO Subtask:

- Subtask becomes IN_PROGRESS;
- User A becomes the active worker;
- a WorkSession begins;
- the parent Task may become IN_PROGRESS.

If another User attempts to start the same Subtask while it is already IN_PROGRESS, the operation is rejected.

### 12.2 Pause

When the active worker pauses the Subtask:

- the active WorkSession is closed;
- Subtask returns to TODO;
- the active worker lock is released.

Paused time is not counted as actual work.

### 12.3 Resume

Resume is conceptually:

    TODO
      -> Start

A User may start the Subtask again after it has been paused.

The new execution interval is represented by a new active WorkSession according to the final persistence design.

### 12.4 Complete

Only the User who is currently the active worker may normally complete an IN_PROGRESS Subtask.

Completion:

- closes the active WorkSession;
- changes Subtask to DONE;
- records the actual actor;
- may update the parent Task;
- may automatically complete the parent Task when all Subtasks are DONE.

Administrative force-release or equivalent recovery capability is future permission behavior.

### 12.5 Transfer of Work

Tasks v1 does not define a direct transfer operation.

To transfer a Subtask:

    User A -> Pause
    User B -> Start

This preserves unambiguous WorkSession attribution.

### 12.6 Loss of Access During Active Work

If the active worker loses the Space access that allowed the work to be performed:

- the active WorkSession is closed;
- the Subtask returns to TODO;
- the exclusive worker lock is released.

The previous WorkSession remains part of actual historical work.

---

## 13. Work Sessions and Time Tracking

WorkSession is the source of truth for actual work duration.

All WorkSessions belong to Subtasks.

No Task-level WorkSession exists.

### 13.1 Actual Duration

Subtask actual duration is the sum of its completed WorkSessions.

Task actual duration is the sum of WorkSessions across all of its Subtasks.

Conceptually:

    Task actual duration
    =
    sum(Subtask WorkSession durations)

### 13.2 Per-User Contribution

Each WorkSession is attributed to the User who performed the work.

Therefore per-user contribution to a Task can be calculated from WorkSessions.

A User does not need to be the permanent assignee of a Task because Tasks do not use permanent assignment.

### 13.3 Manual Correction

Manual correction of tracked time is part of the domain direction, but the exact correction mechanism remains future work.

Any correction mechanism must preserve historical truth and must not replace WorkSessions with an unrelated mutable duration counter.

---

## 14. TaskCategories

TaskCategory belongs to exactly one Space.

Every TaskSpace has exactly one TaskCategory from its own Space.

The same Task may therefore appear as:

    Personal Space
    -> TaskCategory: Home

    Family Space
    -> TaskCategory: Chores

without duplicating the Task.

### 14.1 Default TaskCategory

Every Space has exactly one default TaskCategory.

The initial default TaskCategory may use a generic name such as `General`, but the name itself does not carry special domain semantics.

Default behavior is represented explicitly.

When creating TaskSpace:

    taskCategory supplied
    -> validate TaskCategory belongs to target Space
    -> use supplied TaskCategory

    taskCategory omitted
    -> use target Space default TaskCategory

### 14.2 TaskCategory Lifecycle

The default TaskCategory cannot simply be deleted while it remains the Space default.

Before deleting a TaskCategory referenced by TaskSpaces, those TaskSpaces must be reassigned to another valid TaskCategory.

A Space must continue to have exactly one default TaskCategory.

### 14.3 Smart Views

The following are not Categories:

- Today;
- Upcoming;
- Overdue;
- Backlog;
- Completed;
- Archived.

They are computed Smart Views over Task state and planning information.

Tags are not part of Tasks v1.

The approved domain/persistence entity name is `TaskCategory`; the shorter word “category” may still be used descriptively in product/UI language.

---

## 15. Space Integration

A Task may exist in multiple Spaces simultaneously.

Adding a Task to another Space creates another TaskSpace association.

It does not copy the Task.

Global state remains shared.

For example, completing a Subtask changes the same Task regardless of which associated Space the User used to access it.

### 15.1 Context-Scoped Operations

Task operations occur in a specific Space context.

Authorization must validate:

- acting User;
- requested Space;
- membership in that Space;
- required capability;
- Task association with that Space.

A User does not need membership in every Space associated with the Task.

Membership in one valid associated Space with the required capability is sufficient for an operation performed through that context.

### 15.2 Adding Task to Another Space

Adding a Task to another Space requires authorization according to the relevant source and target Space capabilities.

The target TaskSpace receives:

- target Space;
- target TaskCategory when explicitly provided;
- otherwise target Space default TaskCategory.

A TaskCategory from the source Space is never copied by identity into the target Space.

Even categories with the same name remain distinct Space-owned entities.

### 15.3 Removing Task from Space

Removing a Task from one Space removes only that TaskSpace association.

The Task remains available through other associated Spaces.

The final TaskSpace cannot be removed.

A Task must always retain at least one Space association unless the Task itself is undergoing an explicitly defined lifecycle operation that preserves domain invariants.

### 15.4 Soft-Deleted Tasks

Soft deletion does not remove TaskSpace associations.

This preserves:

- historical context;
- TaskCategory context;
- activity attribution;
- future restoration possibilities.

---

## 16. Space Deletion Interaction

Personal Space cannot be independently deleted through normal Space lifecycle operations.

For other deletable Space types, a Space may be deleted only when it has no remaining TaskSpace associations.

This rule considers associations belonging to:

- active Tasks;
- archived Tasks;
- soft-deleted Tasks.

A soft-deleted Task therefore still blocks deletion of a Space while its TaskSpace association exists.

Before deleting a Space, resource associations must be intentionally moved or otherwise resolved according to their domain lifecycle.

Account deletion and Personal Space lifecycle are separate platform-level concerns.

---

## 17. Recurring Tasks

TaskSeries defines recurring Task generation.

TaskSeries is not itself a Task.

Each generated occurrence is a real Task.

An occurrence has its own:

- Task identity;
- status;
- planning values;
- Subtasks;
- WorkSessions;
- TaskSpaces;
- reminders;
- activity history.

### 17.1 TaskSeriesSpace

TaskSeriesSpace defines where generated occurrences should live.

Conceptually it includes:

- TaskSeries;
- target Space;
- target TaskCategory;
- association attribution as required.

Generated occurrences use this configuration to create their TaskSpace associations.

### 17.2 Recurrence Change Scopes

The domain supports the conceptual scopes:

- Only this occurrence;
- This and following;
- Entire series.

The exact recurrence rule format and mutation algorithms remain future work.

### 17.3 Implementation Phasing

Recurrence belongs to the Tasks domain but is intentionally postponed from the first Tasks implementation phase.

The initial Tasks implementation should establish the core non-recurring Task model first.

Recurrence is implemented as a later phase without redesigning the core Task domain.

---

## 18. Reminders

TaskReminder belongs to:

- one User;
- one Task.

A User may have multiple reminders for the same Task.

Different Users may have different reminders for the same shared Task.

Reminder configuration is personal and does not modify global Task planning.

Reminders may depend on Task planning values.

When relevant planning values change, dependent reminders may require recalculation.

Applicable future reminders are canceled or deactivated when the Task enters a lifecycle state where they no longer apply, including soft deletion and other final lifecycle operations as defined by the domain.

Final reminder types and delivery channels remain future work.

### 18.1 TaskSeriesReminder

TaskSeriesReminder belongs to a User relative to a TaskSeries.

Series reminder rules may generate or configure TaskReminder behavior for concrete occurrences.

If the User loses access to every target Space of the TaskSeries, that User's TaskSeriesReminder is deactivated.

---

## 19. Priority

Task supports priority.

Priority is global Task state and is therefore shared across every Space associated with the Task.

The exact persistence representation and ordering of priority values belong to Technical Design, based on the already approved business model.

---

## 20. Backlog and Planning Views

A Task does not require a deadline at creation.

Tasks without scheduling information may remain in a backlog until planning becomes known.

Backlog is a computed view, not a persisted Task status or TaskCategory.

Other planning-oriented views such as Today, Upcoming, and Overdue are likewise computed from Task planning and lifecycle state.

---

## 21. Activity History

TaskActivity records immutable history for meaningful Task-domain events.

Conceptual activity categories include:

- creation;
- content changes;
- planning changes;
- priority changes;
- Task status transitions;
- completion;
- cancellation;
- postponement;
- archive;
- soft deletion;
- restoration;
- TaskSpace association changes;
- TaskCategory changes;
- Subtask changes;
- WorkSession events;
- reminder changes;
- recurrence events;
- actor attribution;
- permission-relevant administrative actions where required.

These are conceptual categories, not final persistence enums.

TaskActivity is immutable.

Corrections create new activity rather than rewriting historical entries.

The exact event taxonomy should evolve together with implemented use cases.

---

## 22. Permissions Assumptions

The Tasks domain assumes capability-based authorization through Spaces.

The final role-to-capability matrix is intentionally not defined in this document.

Conceptually, Task operations may require capabilities related to:

- reading Tasks;
- creating Tasks;
- updating Tasks;
- completing Tasks;
- deleting Tasks;
- managing Task Space associations;
- managing Categories;
- managing reminders;
- working on Subtasks;
- administrative Subtask release.

Exact capability names are Technical Design / Shared Spaces permission work.

The invariant is that authorization occurs through a concrete Space context rather than global Task ownership.

Personal Space OWNER is expected to possess the capabilities necessary to manage resources in the Personal Space.

---

## 23. Core Invariants

The Tasks domain must preserve the following invariants.

### Task and Space

- A Task always has at least one TaskSpace.
- The final TaskSpace cannot be removed.
- TaskSpace belongs to exactly one Task and one Space.
- TaskSpace has exactly one TaskCategory.
- TaskSpace TaskCategory belongs to the same Space.
- Soft-deleted Tasks retain TaskSpace associations.
- A Space with TaskSpace associations cannot be deleted.
- Personal Space cannot be independently deleted through normal Space deletion.

### TaskCategories

- Every Space has exactly one default TaskCategory.
- Every TaskSpace has exactly one TaskCategory.
- TaskCategory belongs to one Space.
- A TaskCategory from another Space cannot be assigned to TaskSpace.
- Deleting a TaskCategory must not leave TaskSpace without TaskCategory.

### Subtasks

- Every Task has at least one Subtask.
- Subtasks are single-level.
- Only one active worker may exist for a Subtask.
- A DONE Subtask cannot have an active WorkSession.
- A system-generated Subtask preserves the executable model for Tasks without explicit Subtasks.
- A used system-generated Subtask with work history must never be silently deleted.

### WorkSessions

- WorkSession belongs to a Subtask.
- No Task-level WorkSession exists.
- WorkSessions for one Subtask cannot represent concurrent active workers.
- Actual duration derives from WorkSessions.
- Work history remains attributable to the User who performed it.

### Lifecycle

- Manual completion must not leave active WorkSessions.
- Cancellation must not leave active WorkSessions.
- Soft deletion must not leave active WorkSessions.
- Archiving must not leave active WorkSessions.
- Manual completion does not falsely mark unfinished Subtasks DONE.
- Canceled Task remains historical data.
- Archived Task remains discoverable in archive.
- Soft-deleted Task is hidden from normal use but remains physically stored.

### Reminders and Activity

- Active reminders cannot remain applicable to a soft-deleted Task.
- TaskActivity is immutable.
- Historical corrections are additive rather than destructive.

### Recurrence

- TaskSeries is not a Task.
- Generated occurrences are ordinary Tasks.
- TaskSeriesSpace defines target Space context for occurrence generation.

---

## 24. Atomic Domain Operations

Some Task operations cross multiple domain entities and must behave atomically from the domain perspective.

These include at least:

### Manual Task Completion

    close active WorkSessions
    -> return IN_PROGRESS Subtasks to TODO
    -> preserve DONE Subtasks
    -> Task DONE / MANUAL
    -> cancel applicable future reminders
    -> append TaskActivity

### Task Cancellation

    close active WorkSessions
    -> return IN_PROGRESS Subtasks to TODO
    -> preserve DONE Subtasks
    -> Task CANCELED
    -> cancel applicable future reminders
    -> append TaskActivity

### Task Soft Delete

    close active WorkSessions
    -> return IN_PROGRESS Subtasks to TODO
    -> preserve TaskSpace associations
    -> deactivate applicable reminders
    -> mark Task deleted
    -> append TaskActivity

### Subtask Pause

    close active WorkSession
    -> Subtask TODO
    -> release active worker

### Subtask Complete

    close active WorkSession
    -> Subtask DONE
    -> record actual actor
    -> evaluate parent Task automatic completion
    -> append relevant activity

### Loss of Active Worker's Access

    close active WorkSession
    -> Subtask TODO
    -> release active worker

Exact database transaction boundaries belong to Technical Design, but externally observable domain behavior must preserve these atomic semantics.

---

## 25. Implementation Phasing

The approved domain is intentionally broader than the first implementation increment.

### Tasks Core

The first implementation should focus on the stable core:

- Task;
- Subtask;
- system-generated Subtask;
- TaskSpace;
- TaskCategory;
- Task status lifecycle;
- priority;
- planning;
- completion;
- postponement;
- cancellation;
- archive;
- soft delete;
- WorkSessions;
- actual duration;
- TaskReminder foundation;
- TaskActivity foundation;
- Space-based authorization.

### Later Tasks Phases

Later phases may add:

- recurrence execution;
- TaskSeries;
- TaskSeriesSpace;
- TaskSeriesReminder;
- advanced reminder behavior;
- restore workflow;
- permanent deletion;
- richer time corrections;
- advanced shared permission behavior.

Implementation phasing does not change the approved domain relationships.

---

## 26. Future Extensions

The following capabilities are intentionally deferred or require separate domain design:

- Tags;
- Attachments;
- Comments;
- Rich text;
- Task dependencies;
- Kanban;
- Gantt;
- AI planning;
- advanced recurrence execution;
- advanced reminder delivery;
- restore workflow;
- permanent deletion and retention;
- advanced time correction;
- final Shared Space permission matrix;
- administrative force-release behavior;
- account deletion resource lifecycle.

Future modules may integrate with Tasks.

For example, a future Finance workflow may use a Task to represent work such as paying a bill and create a financial transaction as a consequence of completing that work.

Such integrations do not make FinanceTransaction a Task and do not require a universal Reminder abstraction.

---

## 27. Out of Scope for Initial Tasks Implementation

The initial Tasks implementation intentionally does not require:

- Tags;
- Attachments;
- Comments;
- Rich text editor;
- Task dependencies;
- Kanban boards;
- Gantt charts;
- AI planning;
- nested Subtasks;
- multiple concurrent workers on one Subtask;
- direct Subtask transfer operation;
- Task-level WorkSessions;
- Space-specific Task archive;
- universal polymorphic Resource tables;
- universal ResourceSpace association;
- universal Reminder abstraction;
- final recurrence execution;
- final Shared Space role/capability matrix;
- frontend Dashboard implementation;
- frontend Calendar implementation;
- notification delivery infrastructure.

These exclusions are intentional scope decisions rather than missing domain behavior.

---

## 28. Open Questions

The following questions remain unresolved and must not be answered by implementation assumption:

- What is the final permission matrix for Task operations in Shared Spaces?
- What are the final TaskReminder types and delivery channels?
- What is the exact mechanism for manual WorkSession/time correction while preserving historical truth?
- What are the exact restore rules for soft-deleted Tasks?
- What are the permanent deletion, retention, and audit policies?
- What recurrence rule representation will be used?
- How will recurrence scheduling and occurrence backfill operate?
- Which additional TaskSpace metadata fields, if any, will be approved beyond TaskCategory and association metadata?
- What exact administrative capability will support force-release of a Subtask when recovery is required?

These questions are intentionally deferred.

They must be resolved through domain discussion before implementation introduces corresponding business behavior.

---

## 29. Relationship to Platform Core

This specification specializes the Platform Core resource model for Tasks.

The following Platform Core principles remain applicable:

- Space is an access and collaboration context rather than mandatory Resource ownership.
- One Resource may participate in multiple Spaces.
- Resource state remains global unless a field is explicitly defined as Space-specific.
- Access is derived from membership, capability, and Resource association.
- Dashboard, Calendar, and Timeline are presentation or aggregation layers.

`platform-core.md` defines general platform principles, while this document is the more specific source of truth for Tasks business behavior. The two documents should remain synchronized without duplicating the complete Tasks lifecycle specification in Platform Core.
