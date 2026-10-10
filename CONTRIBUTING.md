# How to Contribute

We greatly appreciate contributions to the vscode-java-dependency project. Your efforts help us maintain and improve this extension. To ensure a smooth contribution process, please follow these guidelines.

## Prerequisites
- [JDK](https://www.oracle.com/java/technologies/downloads/?er=221886)
- [Node.JS](https://nodejs.org/en/)
- [VSCode](https://code.visualstudio.com/)

## Build and Run

To set up the vscode-java-dependency project, follow these steps:

1. **Build the Server JAR**:
   - The server JAR (Java application) is located in the [jdtls.ext](./jdtls.ext) directory.
   - Run the following command to build the server:
     ```shell
     npm run build-server
     ```

2. **Install Dependencies**:
   - Execute the following command to install the necessary dependencies:
     ```shell
     npm install
     ```

3. **Run/Debug the Extension**:
   - Open the "Run and Debug" view in Visual Studio Code.
   - Run the "Run Extension" task.

4. **Attach to Plugin[Debug Java]**:
   - Prerequisite: Ensure that the extension is activated, meaning the Java process is already launched. This is required for the task to run properly.
   - Open the "Run and Debug" view in Visual Studio Code.
   - Run the "Attach to Plugin" task.
   - Note: This task is required only if you want to debug Java code [jdtls.ext](./jdtls.ext). It requires the [vscode-pde](https://marketplace.visualstudio.com/items?itemName=yaozheng.vscode-pde) extension to be installed.

## Java LSP Tool Contract Tests

After installing dependencies, run `npm run test-lsp-tools` for the isolated navigation-tool suite. It compiles TypeScript and starts a separate VS Code test host; no Java server build, Java project, or signed-in Copilot session is required. Set `VSCODE_EXECUTABLE_PATH` to reuse an existing VS Code executable instead of downloading one.

These tests exercise the tool implementations with real VS Code URI, range, error and tool-result types, but mock providers, workspace membership, readiness and telemetry. They cover output contracts, URI handoff, error classification, retry behavior and truncation. They do not validate live JDT search coverage, indexing completeness, Native/CLI reader integration or token savings. The suite also runs as part of `npm test`.

`lmTool.findSymbol` records `initialQueryDurationMs` and `retryQueryDurationMs` separately from total `durationMs`. These measure client-observed provider calls, not internal JDT phases; retry duration is zero when no retry occurs. No query text, source paths or symbol names are added to these events.

## IssueLens Team-Memory Queue

The existing [team-memory workflow](.github/workflows/team-memory-post-merge.yml)
only dispatches requests for ordinary pushes to this repository's default branch.
It retains the source opt-in `ISSUELENS_TEAM_MEMORY_ENABLED == 'true'` and rejects
created, deleted, or forced pushes and mismatched workflow/head SHAs. The
[Java Pack coordinator](https://github.com/microsoft/vscode-java-pack/blob/main/.github/workflows/team-memory-coordinator.yml)
on `main` owns the shared wiki queue, source validation, IssueLens invocation, and
final maintenance validation; the source workflow does not invoke the agent.

Before merging while the existing source opt-in is `true`, configure these
rollout prerequisites. Merging switches the caller to queue dispatch immediately;
it does not configure credentials or change either repository's live opt-in.

- In this repository, provide variable `ISSUELENS_DISPATCH_APP_CLIENT_ID` and
  secret `ISSUELENS_DISPATCH_APP_PRIVATE_KEY` for a dedicated dispatch GitHub App
  installed only on `microsoft/vscode-java-pack`, with **Contents: read** and
  **Actions: write**. These are proposed caller setup names, not inherited central
  credentials. The pinned token action uses `client-id`; its installation token
  is explicitly limited to Java Pack and these two permissions and is revoked
  at job completion. The source
  `GITHUB_TOKEN` cannot dispatch a workflow in another repository.
- In Java Pack, separately configure secrets
  `ISSUELENS_SOURCE_READ_APP_CLIENT_ID` and
  `ISSUELENS_SOURCE_READ_APP_PRIVATE_KEY` for the source-read App with
  **Actions: read**, **Contents: read**, and **Pull requests: read** access to
  `microsoft/vscode-java-dependency`. The coordinator must be enabled and retain
  this source in its allowlist. A successful Java Pack own-repository run does not
  establish readiness to read external sources.

Do not reuse the hosted IssueLens App key or the central source-read App key for
dispatch. Missing credentials are rollout prerequisites, not a reason to fall
back to direct agent invocation or broaden token permissions.

The request contains only five strings: source repository, workflow run ID,
attempt, requested ancestor (`push_before`), and run head (`push_after`).
The ancestor authorizes reconciliation; it is not attested original-event
provenance. Dispatch acceptance does not confirm queue admission or maintenance
completion. On an ambiguous dispatch failure, inspect the central workflow runs
before retrying; the dispatcher does not automatically retry.

For manual merged-PR maintenance, use **Run workflow** on Java Pack's
`team-memory-coordinator.yml`, with `source_repository` set to
`microsoft/vscode-java-dependency` and `pull_request_number` set to the merged PR.
Leave the automatic run/attempt and before/after inputs empty. There is no local
manual workflow or direct-invocation bypass.

Thank you for your contributions and support!