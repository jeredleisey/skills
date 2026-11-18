# Choose a skill pack

A skill pack is a plugin of SDLC skills. The role cards load its skills. See [role cards](../reference/role-cards.md#the-skill-map).

1. Pick a pack. The table shows the skill of each pack for each capability. `none` means that the card uses its built-in method.

    | Capability | `mattpocock-skills` | `superpowers` | `agent-skills` | `none` |
    | --- | --- | --- | --- | --- |
    | `test-first` | `mattpocock-skills:tdd` | `superpowers:test-driven-development` | `agent-skills:test-driven-development` | `none` |
    | `debugging` | `mattpocock-skills:diagnosing-bugs` | `superpowers:systematic-debugging` | `agent-skills:debugging-and-error-recovery` | `none` |
    | `code-review` | `mattpocock-skills:code-review` | `superpowers:requesting-code-review` | `agent-skills:code-review-and-quality` | `none` |
    | `research` | `mattpocock-skills:research` | `none` | `none` | `none` |
    | `design-vocabulary` | `mattpocock-skills:codebase-design` | `none` | `none` | `none` |
    | `verification` | `none` | `superpowers:verification-before-completion` | `none` | `none` |

2. Install the pack. Type the commands in Claude Code.
    - `mattpocock-skills`: `/plugin install mattpocock-skills@claude-plugins-official`
    - `superpowers`: `/plugin install superpowers@claude-plugins-official`
    - `agent-skills`: `/plugin marketplace add https://github.com/addyosmani/agent-skills.git`, then `/plugin install agent-skills@addy-agent-skills`

    In VS Code, type `/plugins`. Open the dialog, add the marketplace `https://github.com/addyosmani/agent-skills.git`, and install `agent-skills` from it.

3. Run `claude plugin list`. The pack must show in the list.
4. Set the pack. Use one of these ways.
    - Run `/cadre:setup`. With one pack installed, setup proposes it. With two or more, setup asks you to choose.
    - Or open `docs/agents/cadre-charter.md` and set `skill_pack: agent-skills` in the front matter. The values are `mattpocock-skills`, `superpowers`, `agent-skills`, and `none`.
5. To override one capability, add `capabilities` to the front matter. For example, `capabilities: [verification=superpowers:verification-before-completion]`. A skill with `disable-model-invocation: true` cannot be in the map.
6. Check the result. In the repo root, run `node "<plugin root>/scripts/skill-map.mjs" coder`. Each line is `<capability> <skill>`. Run it again for `reviewer`, `researcher`, and `tester`.

See [the charter](../reference/charter.md#front-matter).
