# Cadre

Cadre is a Claude Code plugin that runs a team of agents on a software repo. An orchestrator owns the outcome and gives the work to helpers in fixed roles, under the rules of each repo.

## The plugin

**Cadre**:
The plugin. Its name means a small trained core that leads and trains others.
_Avoid_: orchestrator (as the name of the plugin), the plugin

**Core**:
The general part of cadre, with no facts of any one organization or person.
_Avoid_: base plugin, generic version

**Skill pack**:
A plugin of SDLC skills that the role cards use, such as `mattpocock-skills` or `superpowers`.
_Avoid_: skill set, toolset

**Capability**:
A kind of work that a role card asks for, such as `test-first` or `code-review`. The charter maps it to a skill: a `skill_pack` preset, plus overrides.
_Avoid_: skill (when the kind of work is meant)

**Standard grants**:
The five ledger rows that setup proposes for a new orchestrator: create branches and worktrees, start helpers, push branches (never the default branch), open pull requests (no auto-merge), and edit and comment on issues. Each is reversible. Merge, release, paid evals, and settings are never in the set.
_Avoid_: default permissions, allowlist

**Preset**:
A data file of default answers for setup that a plugin ships. A human can change every answer in it.
_Avoid_: profile, lock

## Agents

**Orchestrator**:
An agent that owns the outcome of a piece of work, gives tickets to helpers, and verifies what they return.
_Avoid_: lead, manager, coordinator

**Helper**:
An agent that does one ticket for an orchestrator and stops.
_Avoid_: worker, subagent (when the role is meant)

**Role card**:
The agent definition of one helper role, such as `coder` or `reviewer`. It names capabilities, not skills.
_Avoid_: agent, persona

**Peer**:
Another orchestrator that works in the same repo or on the same goal.
_Avoid_: teammate (that is a native agent-teams term)

## Repo and state

**Tracker**:
The place where a team lists its work items, such as GitHub Issues or Azure DevOps Boards.
_Avoid_: board, backlog, issue system

**Charter**:
The committed file in a repo that states how cadre works there: tracker, owners, merge rules, skill pack, guards, and actions that only a human may do.
_Avoid_: config, profile, settings file

**Personal file**:
A file in the user folder of one person that holds that person's preferences, or a charter for a repo that the person does not own.
_Avoid_: user config, local charter

**Orchestrator issue**:
The tracker item that holds one orchestrator: its purpose, repos, ledger, and holder. Its assignee is the owner.
_Avoid_: handoff note, roster entry

**Owner**:
The one human to whom an orchestrator issue is assigned. Only the owner grants a ledger row.
_Avoid_: holder (that is a session), user

**Holder**:
The one session that acts as an orchestrator at a given time, as the orchestrator issue records it.
_Avoid_: owner (that is the human), lock

**Host id**:
A random 32-character id of one machine, kept in the cadre user folder, that the orchestrator issue records as the host of the holder. It holds no fact about the machine or its user.
_Avoid_: host name, device name, machine id

**Checkpoint**:
A new comment on an orchestrator issue, with the first line `cadre-checkpoint v1 <time>`, that records decisions, what waits for the human, and the next steps.
_Avoid_: handoff, snapshot

**Ledger**:
The record of the permissions that the human gave to one orchestrator.
_Avoid_: grants list, allowlist

**One-way step**:
An action that a new commit cannot undo, such as a merge, a deploy, a delete, or a message to a person outside the work.
_Avoid_: destructive action, irreversible step

**Guard**:
A hook on a push or a merge. It asks the human for the orchestrator. It always refuses a helper. The charter can switch it off or allow it for the orchestrator only. A branch policy on the host is a second guard.
_Avoid_: rule (when enforcement is meant), safeguard
