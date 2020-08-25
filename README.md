# Project Manager for Java

> Manage Java projects in Visual Studio Code

[![Travis CI](https://travis-ci.org/Microsoft/vscode-java-dependency.svg?branch=master)](https://travis-ci.org/Microsoft/vscode-java-dependency)

## Overview

A lightweight extension to provide additional Java project explorer features. It works with [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) to provide the following features:

* Project View

![project-view](https://raw.githubusercontent.com/Microsoft/vscode-java-dependency/master/images/project-explorer.png)

* Create Java Projects

![create project](https://raw.githubusercontent.com/Microsoft/vscode-java-dependency/master/images/create-project.png)

* Export Jar
> Note: For Spring Boot projects, please use the build tool to build the executable jar, for example: `mvn package`.

![export jar](https://raw.githubusercontent.com/Microsoft/vscode-java-dependency/master/images/export-jar.png)

## Requirements

- JDK (version 11 or later)
- VS Code (version 1.44.0 or later)
- [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) (version 0.32.0 or later)


## Settings

| Setting Name | Description | Default Value |
|---|---|---|
| `java.dependency.showMembers` | Specify whether to show the members in the Java Projects explorer. | `false` |
| `java.dependency.syncWithFolderExplorer` | Specify whether to sync the folder with Java Projects explorer when browsing files.  | `true` |
| `java.dependency.autoRefresh` | Specify whether to automatically sync the change from editor to the Java Projects explorer. | `true` |
| `java.dependency.refreshDelay` | The delay time (ms) the auto refresh is invoked when changes are detected. | `2000ms` |
| `java.dependency.packagePresentation` | Specify how to display the package. Supported values are: `flat`, `hierarchical`.| `flat` |

## Contribution

### Build
* Prerequirement
    - Node.js
    - Java SDK 11 or above

* Go to root folder:
```
npm install -g gulp
npm install
gulp build_server
```

## Telemetry
VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=528096&clcid=0x409) to learn more. If you don't wish to send usage data to Microsoft, you can set the `telemetry.enableTelemetry` setting to `false`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).


---

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
