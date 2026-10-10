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

Thank you for your contributions and support!