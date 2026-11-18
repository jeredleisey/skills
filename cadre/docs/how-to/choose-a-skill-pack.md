# Choose a skill pack

A skill pack is a plugin of skills for software development, such as test first and code review. The role cards load its skills. See [role cards](../reference/role-cards.md#the-skill-map).

1. Pick a pack. [The skill map](../reference/role-cards.md#the-skill-map) shows the skill of each pack for each capability. `none` means that the card uses its built-in method.

2. Install the pack. Type the commands in Claude Code.
    - `mattpocock-skills`: `/plugin install mattpocock-skills@claude-plugins-official`
    - `superpowers`: `/plugin install superpowers@claude-plugins-official`
    - `agent-skills`: `/plugin marketplace add https://github.com/addyosmani/agent-skills.git`, then `/plugin install agent-skills@addy-agent-skills`

    In VS Code, type `/plugins` to open **Manage plugins**. For `agent-skills`, open the **Marketplaces** tab and add `https://github.com/addyosmani/agent-skills.git`. Then open the **Plugins** tab and install the pack.

3. Run `claude plugin list`. The pack must show in the list.
4. Set the pack. Use one of these ways.
    - Run `/cadre:setup`. With one pack installed, setup proposes it. With two or more, setup asks you to choose.
    - Or open `docs/agents/cadre-charter.md` and set `skill_pack: agent-skills` in the front matter. The values are `mattpocock-skills`, `superpowers`, `agent-skills`, and `none`.
5. To override one capability, add `capabilities` to the front matter. For example, `capabilities: [debugging=none]` makes the tester use its built-in debugging method. A skill with `disable-model-invocation: true` cannot be in the map.
6. Check the result. In the repo root, run `node "<plugin root>/scripts/skill-map.mjs" coder`. Each line is `<capability> <skill>`. Run it again for `reviewer`, `researcher`, and `tester`.

See [the charter](../reference/charter.md#front-matter).
