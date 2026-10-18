# Resume an orchestrator

Use this when you start a new session, or a session ends, and you want to continue the same orchestrator.

1. Open Claude Code in the repo.
2. Type `/cadre:orchestrate`.
3. Say "resume as <name>". Use the name from the title of the orchestrator issue. Case does not matter.

To see the names first, ask "which orchestrators does this project have?". Cadre shows a table of Name, Owner, Purpose, and Holder.

The orchestrator then does these checks:

- **Owner.** Only the assignee resumes an orchestrator. Another user is refused and offered a new orchestrator.
- **Holder.** One session holds a name.
  - A free name is taken.
  - A name held by a live session on this machine is refused. You see its pid and folder.
  - A name held from another machine makes the orchestrator ask you first.
- **Closed.** A retired orchestrator asks you before it reopens.
- **Ledger.** Rows that the owner did not grant, and rows that ended with their session, are deleted and reported.

Then it reads the newest checkpoint and checks each next step against the tracker.

If a live session still holds the name by mistake, close that session. Then try again.
