# Personal Platform Core Architecture

## 1. Document Status

**Status: Draft / Evolving**

This is a living architecture document. It describes the platform's current architectural direction and domain understanding; it is not a final or immutable product specification.

- The document describes the current view of the architecture.
- It may change during development as new knowledge, scenarios, and constraints emerge.
- Changes to concepts should be deliberate and documented.
- Code and documentation should both reflect the current domain model.
- This is not a framework-specific or database-specific specification.
- Early decisions may be revisited after real usage scenarios provide better evidence.

The status applies to the current understanding rather than to a final product version.

## 2. Architectural Direction

The intended architectural progression is:

```text
Identity
  → Spaces and Membership
  → Business Resources
  → Presentation and Aggregation
```

- **Auth and Identity** establish who the User is and identify the actor performing an action.
- **Spaces and Membership** establish the context in which access, organization, and collaboration occur.
- **Business Resources** contain the actual domain data and behavior.
- **Presentation and Aggregation** capabilities such as Dashboard, Calendar, and Timeline expose useful views across Resources. They do not own the underlying business data.

## 3. Core Concepts

### User

A User:

- represents a digital identity;
- is an actor for actions performed in the system;
- is not a universal container for business data;
- receives a Personal Space named `Personal` as part of the registration transaction.

### Space

A Space:

- is a context for access, organization, and collaboration;
- is not necessarily the exclusive owner of a Resource;
- may reference Resources that are also available in other Spaces;
- can be a Personal Space, which is the User's private baseline space;
- may later have Shared, Family, Team, or other domain-relevant types.

The Space and SpaceMember persistence foundation currently supports `PERSONAL` and `SHARED`
Space types. Each Space has one primary lifecycle owner. Deleting that User is restricted while
the owned Space exists.

> **Space is a context for a resource, not necessarily the exclusive parent of that resource.**

### SpaceMember

A SpaceMember:

- connects a User to a Space;
- defines the User's role within that Space;
- provides the foundation for a future access policy;
- exists for a Personal Space, where the lifecycle owner has the `OWNER` role.

Potential future roles include:

- `OWNER`
- `ADMIN`
- `MEMBER`
- `VIEWER`

The persistence model supports these roles and enforces at most one primary `OWNER` membership per
Space. Their final permission mappings are not yet fixed. Deleting a User is restricted while that
User has a Space membership; deleting a Space cascades to its memberships.

### Resource

Resource is a general architectural concept, not necessarily a universal table, entity, or base class.

Examples may include:

- Task
- Goal
- Note
- ShoppingList
- CalendarEvent
- finance-related entities
- health-related entities

Resource types are not required to share one access model or to support association with multiple Spaces. Multi-space support is determined by the domain rules of each Resource type. Private or sensitive data may require stricter access and sharing constraints.

A universal polymorphic Resource table should not be introduced prematurely. Concrete domain requirements should drive the persistence and association model.

## 4. Resource and Space Relationships

The main principle is:

> A Business Resource may be associated with one or more Spaces when its domain rules permit it.

For Task, the current decision is:

```text
Task
  ↔ TaskSpace
  ↔ Space
```

- A Task exists as one instance.
- Adding a Task to another Space does not create a copy.
- TaskSpace represents the many-to-many association between Task and Space.
- The global state of a Task is shared by all associated Spaces.
- Changes to a Task and its Subtasks are visible in every associated Space.
- TaskSpace may later hold space-specific metadata.
- Explicit Resource-specific join entities, such as TaskSpace or GoalSpace, are preferred over a premature universal polymorphic association.

Example:

**Task:** "Clean the house"

**Spaces:**

- Personal Space
- Family Space

This is one Task available in two Spaces, not two synchronized copies.

## 5. Global State and Space-Specific State

Task properties that may be global include:

- title;
- description;
- status;
- subtasks;
- completion state;
- shared scheduling data.

TaskSpace properties that may be space-specific include:

- `addedByUserId`;
- `addedAt`;
- pinned state;
- space-specific ordering;
- space-specific category;
- space-specific visibility configuration.

The final field set and the boundary between global and space-specific state will be determined during Task implementation.

## 6. Identity, Attribution and Completion

The model should distinguish:

- **creator** — the User who created a Resource;
- **assignee** — the User expected or authorized to carry out work;
- **actor** — the User currently performing an operation;
- **completedBy User** — the User who actually completed an item.

The future Task model may include:

- `createdByUserId`;
- `assigneeUserId`;
- completion information.

For a Subtask:

- `completedByUserId` should reference the User who actually completed it;
- `completedAt` should record when it was completed;
- completing it changes the single global state of that Subtask;
- the result is immediately visible in every Space associated with its Task.

Example:

**Task:** "Clean the house"  
**Subtask:** "Vacuum the kitchen"

If a member of the Family Space completes the Subtask:

- the Subtask becomes completed;
- `completedByUserId` references that User;
- the change is visible in both Family Space and Personal Space;
- no separate Subtask copy is created.

A parent Task may automatically complete after all active Subtasks are complete, but this is not yet a final rule. Exact completion rules must be decided during Task design. Where several Users contribute to a Task, a single `completedByUserId` on the parent Task may be insufficient or semantically inaccurate.

## 7. Access Model

The current access concept is:

```text
Actor
  → Space Membership
  → Role / Permission
  → Resource association
  → Allowed action
```

- Access must not be determined only by `resource.createdByUserId`.
- A User may gain access to a Resource through membership in an associated Space.
- The backend must verify that the Resource is actually associated with the Space used as context.
- The backend must verify the User's membership in that Space.
- The backend must verify permission for the specific operation.
- Read and write permissions may differ.
- The exact permission model is not yet approved.

Some operations may need an explicit Space context, for example:

```http
PATCH /spaces/:spaceId/tasks/:taskId
```

This illustrates the access context only. The final REST API shape has not been decided.

## 8. Resource Removal and Deletion

### Remove from Space

- Only the association between a Resource and the specified Space is removed.
- The Resource and its state remain available through other associated Spaces.

### Delete Resource

- The business entity itself is deleted.
- The operation affects every associated Space.
- It requires a distinct permission rule.
- Behavior when the final association is removed remains to be defined.

The UI and API must not conflate removal from a Space with deletion of a Resource.

## 9. Personal Space Lifecycle

The implemented registration flow is one atomic operation:

1. Create User.
2. Create Profile.
3. Create UserSettings.
4. Create EmailVerificationToken.
5. Create a Personal Space named `Personal`.
6. Create SpaceMember with the `OWNER` role.
7. Commit the transaction.

If any step fails, the entire operation should be rolled back.

This foundation is implemented. The Personal Space is created immediately; email verification is
not a prerequisite.

- Every User should have one primary Personal Space.
- A Personal Space must not accidentally be left without an `OWNER`.
- The database restricts deletion of an owner or member User while the related Space records exist.
- Exact deletion rules for a User or Personal Space remain undefined.

## 10. Presentation Layer

### Dashboard

Dashboard aggregates data from Resources that are accessible to a User through Spaces.

### Calendar

Calendar presents time-related Resources and their events but does not necessarily own them.

### Timeline

Timeline may become a centralized read model or aggregation service for events produced by different Resources.

> **Presentation Layer does not own domain data.**

## 11. Current Decisions

| Decision | Status | Rationale |
| --- | --- | --- |
| Space is a context, not necessarily an exclusive Resource owner. | Accepted | Resources may need to participate in more than one organizational or collaboration context. |
| A Task may be associated with multiple Spaces. | Accepted | A single real-world Task may be relevant in multiple contexts. |
| Multi-space Task associations must not create Task copies. | Accepted | Copies introduce synchronization problems and misrepresent a single Task as several entities. |
| Task global state is shared across associated Spaces. | Accepted | Every Space should observe the same Task and Subtask state. |
| Subtask completion is attributed to the real acting User. | Accepted | Completion attribution should describe what actually happened. |
| Access must be based on membership and permissions, not only creator ownership. | Accepted | Creation and authorization are separate domain concerns. |
| Dashboard and Calendar are presentation and aggregation layers. | Accepted | Domain data remains owned by Resources. |
| Space and SpaceMember persistence foundation. | Accepted | The implemented models establish Space ownership and membership without introducing a public Spaces API. |
| Personal Space is created automatically during registration. | Accepted | User, profile, settings, verification token, Personal Space, and OWNER membership are committed atomically. |
| A Space has one primary lifecycle OWNER. | Accepted | `ownerId` records lifecycle ownership and the database permits at most one OWNER membership per Space. |
| Personal Space has the default name `Personal`. | Accepted | Registration and backfill use one explicit initial name. |
| Owner and member User deletion is restricted while related Space records exist. | Accepted | Lifecycle ownership or membership must be resolved explicitly before deleting a User. |
| Explicit Resource-specific join entities are currently preferred over a universal polymorphic ResourceSpace table. | Accepted | Explicit entities preserve domain meaning and allow Resource-specific rules and metadata. |
| The architecture document is evolving and may be revised. | Accepted | Implementation experience and real scenarios may reveal better models. |
| Exact Space roles and permission mappings. | Open | Concrete collaboration and authorization scenarios are still needed. |
| Automatic parent Task completion behavior. | Open | Task and Subtask completion semantics require dedicated design. |

## 12. Open Questions

The following questions are intentionally unresolved:

- What are the final Space roles and permissions?
- How should invitations to Shared Spaces work?
- Does every Resource type support multiple Spaces?
- What should the REST API shape be for operations requiring Space context?
- What are the exact Task and Subtask completion rules?
- What are the correct `completedBy` semantics for a parent Task?
- How should Resource ownership differ from Resource creation?
- What are the deletion and orphan-Resource behaviors?
- What activity and audit history is required?
- Which Task metadata belongs to TaskSpace?
- How should assignment work when a Task is associated with multiple Spaces?
- How are conflicts resolved when a User has different permissions in different associated Spaces?
- Which private fields remain visible when a Resource is shared?
- Can a Personal Space be renamed, archived, or deleted?

## 13. Initial Implementation Roadmap

The current sequence is:

1. Auth v1 — completed
2. Living Architecture Document — completed and evolving
3. Space and SpaceMember foundation — completed
4. Automatic Personal Space creation during registration — completed
5. Basic Space access policy
6. Task as the first Resource
7. TaskSpace many-to-many association
8. Subtask completion attribution
9. Shared Spaces and invitation flow
10. Calendar, Timeline, and Dashboard aggregation

This roadmap is also evolving and may change as implementation provides new evidence.

## 14. Change Process

1. Identify a new scenario, limitation, or contradiction.
2. Discuss the domain impact.
3. Update this architecture document or add an Architecture Decision Record (ADR).
4. Implement the change.
5. Add or update migrations and tests.
6. Verify that documentation and code describe the same model.

> **The document should guide development, but it must not prevent better decisions when new evidence appears.**

## 15. Non-Goals for This Document

This document does not currently define:

- the final Prisma schema;
- the final REST API;
- a complete permission matrix;
- frontend UX;
- notification implementation;
- audit log implementation;
- final database indexes;
- the final module folder structure;
- all future Resource types.
