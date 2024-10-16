# How to Contribute

We greatly appreciate contributions to the vscode-java-dependency project. Your efforts help us maintain and improve this extension. To ensure a smooth contribution process, please follow these guidelines.

## Setup Guide

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

3. **Run the Extension**:
   - Open the "Run and Debug" view in Visual Studio Code.
   - Run the "Run Extension" task.

4. **Attach to Plugin**:
   - Open the "Run and Debug" view in Visual Studio Code.
   - Run the "Attach to Plugin" task.
   - Note: This task is required only if you want to debug Java code [jdtls.ext](./jdtls.ext). It requires the [vscode-pde](https://marketplace.visualstudio.com/items?itemName=yaozheng.vscode-pde) extension to be installed.

Thank you for your contributions and support!