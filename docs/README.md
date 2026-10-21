# ADO Board Item Agentic Yeoman documentation

The `ado-board-agentic-assistant` extension ("ADO Board Item Agentic Yeoman") is a private Azure DevOps extension. It turns state changes on release Issues on the `dflat-websites` board into the release branch, the next Issue, the pull request and the release record for the `professional` website.

| Page | What it covers |
|---|---|
| [Release workflow](release-workflow.md) | How a release moves through To Do → Doing → Done, and who does what at each step |
| [Architecture](architecture.md) | The extension's contributions, source files and how they share one set of release actions |
| [Development](development.md) | Installing, building, packaging and publishing the extension |
| [Configuration](configuration.md) | Names, conventions and settings the extension depends on |
| [Troubleshooting](troubleshooting.md) | What each failure message means and how to recover |

The design and the build plan are in [`board-release-plan.md`](../board-release-plan.md).
