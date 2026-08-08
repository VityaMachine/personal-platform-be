# Personal Platform Core Architecture

## 1. Document Status

**Status: Draft / Evolving**

This is a living architecture document.

It describes the platform's current architectural direction and domain understanding. It is not a final or immutable product specification.

- The document describes the current view of the architecture.
- It may change during development as new knowledge, scenarios, and constraints emerge.
- Changes to concepts should be deliberate and documented.
- Code and documentation should both reflect the current domain model.
- This is not a framework-specific or database-specific specification.
- Early decisions may be revisited after real usage scenarios provide better evidence.
- Resource-specific domain specifications may refine general Platform Core principles for a particular Resource type.

The status applies to the current understanding rather than to a final product version.

Where a dedicated domain specification exists, that document is the more specific source of truth for that Resource domain.

---

## 2. Architectural Direction

The intended architectural progression is:

Identity  
→ Spaces and Membership  
→ Business Resources  
→ Presentation and Aggregation

- **Auth and Identity** establish who the User is and identify the actor performing an action.
- **Spaces and Membership** establish the context in which access, organization, and collaboration occur.
- **Business Resources** contain the actual domain data and behavior.
- **Presentation and Aggregation** capabilities such as Dashboard, Calendar, Timeline, and Smart Views expose useful views across Resources. They do not own the underlying business data.

The platform should evolve from domain requirements rather than from premature universal abstractions.

---

## 3. Core Concepts

### User

A User:

- represents a digital identity;
- is an actor for actions performed in the system;
- is not a universal container for business data;
- may create Resources;
- may perform work on Resources;
- may receive access to Resources through Space membership;
- receives a Personal Space named `Personal` as part of the registration transaction.

Resource creation and Resource access are separate concerns.

A User who created a Resource does not automatically retain permanent access to it if the Resource domain defines access through Spaces and the User later loses all valid access paths.

### Space

A Space:

- is a context for access, organization, and collaboration;
- is not necessarily the exclusive owner of a Resource;
- may reference Resources that are also available in other Spaces;
- can be a Personal Space, which is the User's private baseline Space;
- may later have Shared, Family, Team, or other domain-relevant types.

The current Space persistence foundation supports:

- `PERSONAL`
- `SHARED`

Each Space has one primary lifecycle owner.

Deleting that User is restricted while the owned Space exists.

> **Space is a context for a Resource, not necessarily the exclusive parent or owner of that Resource.**

### SpaceMember

A SpaceMember:

- connects a User to a Space;
- defines the User's role within that Space;
- provides the foundation for access policy;
- exists for a Personal Space, where the lifecycle owner has the `OWNER` role.

The persistence model currently supports the roles:

- `OWNER`
- `ADMIN`
- `MEMBER`
- `VIEWER`

The final permission mappings for these roles are not yet defined.

The database currently enforces at most one primary `OWNER` membership per Space.

Deleting a User is restricted while that User still has a Space membership.

Deleting a Space cascades to its memberships.

### Resource

Resource is a general architectural concept.

It is not necessarily:

- a universal table;
- a universal entity;
- a base class;
- a polymorphic persistence model.

Examples may include:

- Task;
- Goal;
- Note;
- ShoppingList;
- CalendarEvent;
- finance-related entities;
- health-related entities.

A Resource type defines its own domain rules.

Not every Resource type must:

- support multiple Spaces;
- use the same access model;
- expose the same Space-specific metadata;
- support collaboration;
- use the same lifecycle.

Private or sensitive Resources may require stricter access and sharing behavior.

A universal polymorphic Resource table should not be introduced prematurely.

Concrete domain requirements should drive persistence, association, lifecycle, and access models.

---

## 4. Resource and Space Relationships

The main platform principle is:

> A Business Resource may be associated with one or more Spaces when its domain rules permit it.

The association model must be defined by the Resource domain.

For Tasks, the approved relationship is:

Task  
↔ TaskSpace  
↔ Space

The dedicated Tasks specification is:

`docs/architecture/tasks-domain.md`

For Task:

- a Task exists as one global instance;
- adding a Task to another Space does not create a copy;
- TaskSpace represents the many-to-many association between Task and Space;
- Task global state is shared by all associated Spaces;
- Task and Subtask state changes are visible in every associated Space;
- TaskSpace contains Space-specific Task metadata;
- TaskSpace includes TaskCategory as an approved Space-specific concern;
- explicit Resource-specific join entities are preferred over premature universal polymorphic associations.

Example:

**Task:** `Clean the house`

**Spaces:**

- Personal Space
- Family Space

This is one Task available in two Spaces, not two synchronized copies.

Other Resource types may use different association models if their domain rules require them.

---

## 5. Global State and Space-Specific State

A Resource that participates in multiple Spaces must clearly distinguish:

- global Resource state;
- Space-specific contextual state.

For Tasks, the detailed boundary is defined in `tasks-domain.md`.

Examples of Task global state include:

- title;
- description;
- status;
- priority;
- planning;
- Subtasks;
- completion state;
- archive state;
- soft-delete state;
- recurrence relationship where applicable.

Examples of TaskSpace-specific state include:

- association metadata;
- `addedByUserId`;
- association time;
- TaskCategory;
- future Space-specific presentation or organization metadata when explicitly approved.

The same pattern may be reused for other Resource types only when justified by their domain.

A Resource-specific join entity should not be treated as a technical implementation detail if it carries domain meaning.

---

## 6. Identity, Attribution and Work

The platform must distinguish between identity and access concepts.

Relevant concepts may include:

- **creator** — the User who created a Resource;
- **actor** — the User performing a current operation;
- **worker** — the User currently performing work when the Resource domain supports execution tracking;
- **completedBy User** — the User who actually completed a specific unit of work;
- **member** — the User who has access through a Space;
- **lifecycle owner** — the User who owns a Space from a lifecycle perspective.

These concepts must not be conflated.

For Tasks specifically:

- Task does not have a permanent assignee;
- `createdByUserId` is historical attribution;
- Task access is not granted merely because a User created it;
- work is executed through Subtasks;
- a Subtask uses an exclusive active-worker model;
- the actual completing User is recorded from the real action;
- WorkSessions preserve per-User work attribution.

Example:

**Task:** `Clean the house`  
**Subtask:** `Vacuum the kitchen`

If a member of the Family Space works on and completes the Subtask:

- the Subtask state changes globally;
- the actual worker/completing User is recorded;
- the change is immediately visible through every Space associated with the Task;
- no duplicate Subtask is created.

Detailed Task completion, worker, and WorkSession semantics are defined by `tasks-domain.md`.

---

## 7. Access Model

The platform access concept is:

Actor  
→ Space Membership  
→ Role / Capability  
→ Resource association  
→ Allowed action

General principles:

- Access must not be determined only by `resource.createdByUserId`.
- A User may gain access to a Resource through membership in an associated Space.
- The backend must verify that the Resource is associated with the Space used as access context.
- The backend must verify the User's membership in that Space.
- The backend must verify the capability required for the specific operation.
- Read and write permissions may differ.
- The same User may have different capabilities in different Spaces.
- Resource-specific domains may define additional authorization conditions.

Operations over multi-Space Resources should normally execute in an explicit Space context.

Illustrative shape:

`PATCH /spaces/:spaceId/tasks/:taskId`

This illustrates access context only.

The final REST API shape is Technical Design and is not defined by this document.

The final role-to-capability matrix remains open.

---

## 8. Resource Removal and Deletion

The platform must distinguish:

- removing a Resource from a Space;
- archiving a Resource;
- soft deleting a Resource;
- permanently deleting a Resource.

These operations are not equivalent.

### Remove from Space

Removing a Resource from a Space means removing only that Resource-Space association.

The Resource remains available through other valid associations.

Resource-specific domains define whether the final association may be removed.

For Task:

- the final TaskSpace cannot be removed;
- a Task must retain at least one TaskSpace;
- removing Task from one Space does not delete the Task.

### Archive Resource

Archive is a Resource-domain lifecycle operation.

Its semantics depend on the Resource type.

For Task:

- archive is global;
- archive does not remove TaskSpace associations;
- archived Tasks remain discoverable through archive views.

### Soft Delete Resource

Soft delete preserves the business entity while removing it from normal active use.

For Task:

- soft delete does not physically remove the Task;
- TaskSpace associations are retained;
- historical context is retained;
- normal users no longer interact with the Task through the regular Tasks experience.

### Permanent Delete Resource

Permanent deletion is separate from soft delete and remains Resource-domain-specific.

Retention, audit, legal, privacy, and restoration concerns must be considered before permanent deletion semantics are defined.

The UI and API must not conflate:

- removal from Space;
- archive;
- soft delete;
- permanent deletion.

---

## 9. Space Deletion and Resource Associations

Deleting a Space must respect Resource associations.

A Space must not be deleted in a way that silently destroys required Resource context or violates Resource invariants.

For Task:

- a deletable Space may be deleted only when it has no remaining TaskSpace associations;
- active Tasks block deletion;
- archived Tasks block deletion;
- soft-deleted Tasks also block deletion while TaskSpace associations remain.

Resource associations must be intentionally resolved before Space deletion.

Personal Space cannot be independently deleted through normal Space deletion behavior.

Account deletion and Personal Space lifecycle remain separate platform-level concerns.

Other Resource types may define their own Space deletion restrictions.

---

## 10. Personal Space Lifecycle

The implemented registration flow is one atomic operation:

1. Create User.
2. Create Profile.
3. Create UserSettings.
4. Create EmailVerificationToken.
5. Create Personal Space named `Personal`.
6. Create SpaceMember with role `OWNER`.
7. Commit the transaction.

If any step fails, the entire operation is rolled back.

The Personal Space is created immediately during registration.

Email verification is not a prerequisite for Personal Space creation.

Current invariants:

- every registered User should have one primary Personal Space;
- a Personal Space must have its lifecycle owner;
- the lifecycle owner has the corresponding OWNER membership through the supported creation flows;
- deleting an owner or member User is restricted while related Space records exist;
- Personal Space is the default private collaboration/access context for the User;
- Personal Space cannot be independently deleted through normal Space deletion behavior.

Exact account deletion and Personal Space destruction rules remain future platform-level work.

---

## 11. Space-Owned Categories

Tasks introduced the first concrete Space-owned organizational Resource: TaskCategory.

TaskCategory is currently a Task-domain concept, but it establishes an important architectural example:

- contextual organization may belong to Space rather than to the global Resource;
- the same Resource may have different organizational metadata in different Spaces.

For Tasks:

- TaskCategory belongs to one Space;
- every Space has exactly one default TaskCategory;
- every TaskSpace has exactly one TaskCategory;
- the TaskCategory must belong to the same Space as the TaskSpace.

Future Resource domains must not automatically reuse TaskCategories unless their domain requirements explicitly justify it.

A universal cross-resource Category abstraction should not be introduced prematurely.

---

## 12. Business Resources as Integration Points

A Business Resource may participate in workflows involving other modules without absorbing those modules' domain state.

Example:

A future Task may represent:

`Pay electricity bill`

Completing that Task may trigger or enable a Finance workflow that creates a financial transaction.

This does not mean:

- FinanceTransaction becomes a Task;
- Task becomes a financial transaction;
- all domain reminders should become universal.

The Resource that represents the action should remain separate from the Resource that represents the resulting domain fact.

Cross-domain integrations should preserve domain boundaries.

---

## 13. Presentation Layer

### Dashboard

Dashboard aggregates data from Resources accessible to the User.

Dashboard does not own Resource state.

### Calendar

Calendar presents time-related Resources.

It does not necessarily own the underlying scheduling data.

A Task may appear in Calendar because it contains planning information without becoming a Calendar-owned Resource.

### Timeline

Timeline may become a centralized read model or aggregation view over events and history from different Resources.

### Smart Views

Resource-specific Smart Views may expose computed groupings.

Examples for Tasks include:

- Today;
- Upcoming;
- Overdue;
- Backlog;
- Completed;
- Archived.

These are presentation/query concepts rather than persisted Categories or owners of Resource data.

> **Presentation and aggregation layers do not own domain data.**

---

## 14. Domain Specifications

As the platform grows, major Resource domains should receive dedicated domain specifications.

The intended pattern is:

platform-core.md  
→ general platform principles

tasks-domain.md  
→ Tasks-specific business rules

future-domain.md  
→ future Resource-specific rules

A dedicated domain specification may refine a general Platform Core principle for its Resource.

The dedicated specification must not silently contradict Platform Core.

If a later domain decision changes an older Platform Core assumption:

1. the domain decision should be documented;
2. Platform Core should be updated;
3. stale open questions should be removed or marked as resolved.

Current dedicated domain specifications:

- `docs/architecture/tasks-domain.md`
- `docs/architecture/tasks-persistence.md`

---

## 15. Current Decisions

| Decision                                                                                                   | Status   | Rationale                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------- |
| Space is a context, not necessarily an exclusive Resource owner.                                           | Accepted | Resources may participate in multiple organizational or collaboration contexts.                     |
| Resource-specific domains decide whether multiple Spaces are supported.                                    | Accepted | Not every Resource should be forced into the same association model.                                |
| A Task may be associated with multiple Spaces.                                                             | Accepted | A single real-world Task may be relevant in multiple contexts.                                      |
| Multi-space Task associations must not create Task copies.                                                 | Accepted | Copies introduce synchronization problems and misrepresent one Task as multiple entities.           |
| Task global state is shared across associated Spaces.                                                      | Accepted | Every associated Space observes the same Task and Subtask state.                                    |
| TaskSpace is a domain relationship, not only a join table.                                                 | Accepted | It carries Space-specific contextual meaning such as TaskCategory.                                      |
| Task has no permanent assignee.                                                                            | Accepted | Actual execution is modeled through Subtasks, workers, and WorkSessions.                            |
| Task creator is historical attribution, not permanent access ownership.                                    | Accepted | Creation and authorization are separate concerns.                                                   |
| Subtask execution is attributed to the actual acting User.                                                 | Accepted | Work history should represent what actually occurred.                                               |
| Task completion semantics are defined in `tasks-domain.md`.                                                | Accepted | The dedicated Tasks specification contains the later, detailed decision.                            |
| Task final Space association cannot be removed.                                                            | Accepted | Task must always retain at least one Space context.                                                 |
| Soft-deleted Task retains TaskSpace associations.                                                          | Accepted | Historical context and future restoration must remain possible.                                     |
| Space with TaskSpace associations cannot be deleted.                                                       | Accepted | Space deletion must not destroy required Resource context.                                          |
| TaskCategories used by Tasks are Space-owned and TaskSpace-specific.                                           | Accepted | One Task may require different organization in different Spaces.                                    |
| Access is based on Space membership, capability, and Resource association.                                 | Accepted | Creator identity alone is insufficient for authorization.                                           |
| Dashboard, Calendar, Timeline, and Smart Views are presentation/aggregation layers.                        | Accepted | Domain data remains owned by Business Resources.                                                    |
| Space and SpaceMember persistence foundation is implemented.                                               | Accepted | Existing models establish lifecycle ownership and membership.                                       |
| Personal Space is created automatically during registration.                                               | Accepted | User, profile, settings, verification token, Space, and OWNER membership are committed atomically.  |
| Personal Space has default name `Personal`.                                                                | Accepted | Registration and backfill use one explicit initial name.                                            |
| A Space has one primary lifecycle owner.                                                                   | Accepted | `ownerId` records lifecycle ownership and current persistence permits at most one OWNER membership. |
| Owner and member User deletion is restricted while related Space records exist.                            | Accepted | Lifecycle ownership and membership must be resolved explicitly.                                     |
| Explicit Resource-specific join entities are preferred over a universal ResourceSpace table.               | Accepted | Explicit entities preserve domain meaning and Resource-specific behavior.                           |
| Universal abstractions should be introduced only after multiple independent domain scenarios justify them. | Accepted | Prevents premature abstraction and accidental coupling.                                             |
| Architecture documents are evolving.                                                                       | Accepted | Real implementation and usage may reveal better models.                                             |
| Exact Shared Space role-to-capability mapping.                                                             | Open     | Real collaboration use cases are still required.                                                    |
| Shared Space invitation lifecycle.                                                                         | Open     | Invitation behavior has not yet been designed.                                                      |

---

## 16. Open Questions

The following platform-level questions are intentionally unresolved:

- What is the final Space role-to-capability matrix?
- How should invitations to Shared Spaces work?
- Which Resource types support multiple Spaces?
- What should the final REST API convention be for Space-context operations?
- How should conflicts be handled when a User has different capabilities in different associated Spaces?
- Which private or sensitive Resource fields remain visible when shared?
- Can a Personal Space be renamed?
- What is the complete account deletion lifecycle?
- How should Personal Space destruction behave during account deletion?
- Which future Resource types need Resource-specific Space projection entities?
- Which cross-domain integrations should be synchronous, event-driven, or workflow-driven?

Task-specific completion, assignment, WorkSession, TaskCategory, TaskSpace, archive, and soft-delete questions are no longer Platform Core open questions.

They are defined in `docs/architecture/tasks-domain.md`.

---

## 17. Initial Implementation Roadmap

The current platform sequence is:

1. Auth v1 — completed.
2. Living Platform Core architecture — completed and evolving.
3. Space and SpaceMember persistence foundation — completed.
4. Automatic Personal Space creation during registration — completed.
5. Tasks Domain Specification — completed and evolving.
6. Tasks Core Persistence Specification — completed and evolving.
7. Space-owned default TaskCategory foundation.
8. Tasks Core implementation.
9. TaskSpace and Space-context authorization through real Task use cases.
10. Subtask execution and WorkSession behavior.
11. Task lifecycle, reminders foundation, and activity foundation.
12. Shared Spaces and invitation flow.
13. Shared Space permission matrix validated against real Resource operations.
14. Recurring Tasks implementation.
15. Calendar, Timeline, Dashboard, and other aggregation layers.

The roadmap is evolving.

Implementation evidence may change sequencing without invalidating the architectural principles.

---

## 18. Change Process

The platform architecture change process is:

1. Identify a new scenario, limitation, contradiction, or missing rule.
2. Discuss the business/domain impact.
3. Perform architecture review when the change affects a major domain boundary.
4. Update the relevant domain specification.
5. Update Platform Core when the change affects general platform principles.
6. Perform Technical Design.
7. Implement the approved behavior.
8. Add or update migrations and automated tests.
9. Perform implementation review.
10. Perform manual verification where appropriate.
11. Confirm documentation and code describe the same current model.

Implementation must not silently define new business rules.

If implementation exposes a missing domain rule, the rule must first return to domain discussion.

> **Architecture documentation should guide development, but it must remain open to deliberate improvement when better evidence appears.**

---

## 19. Architecture Documentation Principles

Major domains should follow a consistent design process:

Vision  
↓  
Business Discussion  
↓  
Architecture Review  
↓  
Domain Specification  
↓  
Technical Design  
↓  
Implementation  
↓  
Review  
↓  
Manual Verification

Domain documents should normally include:

- Vision;
- Design Principles;
- Domain Concepts;
- Business Rules;
- Lifecycle;
- Invariants;
- Future Extensions;
- Out of Scope;
- Open Questions.

Technical implementation should realize approved domain behavior.

Technical implementation should not invent domain behavior merely because it simplifies code.

Universalization should normally occur only after multiple independent domain scenarios demonstrate the same real abstraction.

---

## 20. Non-Goals for This Document

This document does not define:

- the final Prisma schema;
- the final REST API;
- a complete permission matrix;
- frontend UX;
- final notification infrastructure;
- final audit log persistence;
- final database indexes;
- final module folder structure;
- every future Resource type;
- detailed Tasks lifecycle semantics;
- detailed recurrence behavior;
- detailed TaskReminder behavior;
- detailed WorkSession behavior.

Those concerns belong to Resource-specific domain specifications or later Technical Design.

For Tasks, the dedicated source of truth is:
