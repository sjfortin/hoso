# Project skills

Hoso vendors two reviewed skills from [Matt Pocock’s skills](https://github.com/mattpocock/skills), pinned to commit [`59db609eb1e18aaf59b63284d0e52255aff0c63c`](https://github.com/mattpocock/skills/tree/59db609eb1e18aaf59b63284d0e52255aff0c63c). They live in `.agents/skills` and travel with the repository. Nothing was installed globally or added to Hoso’s runtime dependencies.

## Available here

- **codebase-design**: use when designing or simplifying the session module, its interface, and where responsibilities belong. Example: “Use $codebase-design to assess the session interface before adding a second backend.”
- **writing-for-agents**: use when creating project instructions, skills, or documents intended to guide future agent sessions. Example: “Use $writing-for-agents to improve Hoso’s project guidance.”

These are development instructions for an agent working in Hoso, not new capabilities for Hoso’s users. An agent launched in another project uses that project’s applicable skills.

Codex discovers repository skills from `.agents/skills` when launched inside the repository or its subdirectories. They should be available on the next turn; if they do not appear, start a new Codex session in this repo. See the [official skill discovery documentation](https://learn.chatgpt.com/docs/build-skills).

## Why project-local

This keeps the chosen versions reviewable and consistent for future Hoso sessions and collaborators. Global skills are better for personal workflows deliberately used across every project; we have not changed those settings. Avoid installing the same skills locally and through the full plugin, since duplicate names can appear in the skill selector.

The upstream collection also contains orchestration, issue-tracker, interviewing, testing, review, and prototype workflows. We did not install the entire collection. In particular, its current TDD skill requires user confirmation before testing each new interface, and its prototype skill includes a throwaway-branch commit workflow. Those are optional workflows to consider explicitly, rather than imposing them on Hoso’s current implementation work.

## Provenance and updates

`../.agents/skills/SOURCES.json` records the pinned commit, upstream paths, and SHA-256 hashes for the vendored files. `../.agents/skills/MATT-POCOCK-LICENSE.txt` preserves the upstream MIT license. Skill contents and reference files were copied unchanged using Codex’s skill-installer helper.

Updates are deliberate: review the desired upstream commit and both complete skill directories, compare them with the pinned copies, then replace the copies and refresh the hashes in `SOURCES.json`. Preserve any deliberate local adaptations and record them explicitly. Do not blindly install or auto-update the entire plugin as an update mechanism for this subset.

To add another reviewed skill, use the installer helper with an exact upstream path, pinned `--ref`, and `--dest .agents/skills`; then add a narrow `.gitignore` exception for that skill directory and update the provenance record. The helper refuses to overwrite an existing destination, so review updates separately rather than deleting installed skills automatically.
