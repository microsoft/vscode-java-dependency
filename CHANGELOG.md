# Change Log
All notable changes to the "vscode-java-dependency" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## 0.12.0
### Added
- Support creating new packages and types. [#78](https://github.com/microsoft/vscode-java-dependency/issues/78)

### Changed
- Reduce unnecessary refreshes when editing a Java file. [#283](https://github.com/microsoft/vscode-java-dependency/issues/78)
- Adopt welcome view for Project explorer in LightWeight mode. [PR#300](https://github.com/microsoft/vscode-java-dependency/pull/300)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.12.0+is%3Aclosed)

## 0.11.0
### Added
- Export jar file from workspace folder. [PR#271](https://github.com/microsoft/vscode-java-dependency/pull/271)
- A unified entry to create new Java projects. [PR#276](https://github.com/microsoft/vscode-java-dependency/pull/276)
- Adopt APIs in LightWeight mode. [PR#272](https://github.com/microsoft/vscode-java-dependency/pull/272)

### Changed
- Extension is renamed to `Project Manager for Java`. [#248](https://github.com/microsoft/vscode-java-dependency/issues/248)

## 0.10.2
### Added
- Integrated the TAS client. [PR#260](https://github.com/microsoft/vscode-java-dependency/pull/260)

## 0.10.1
### Changed
- Update the `vscode-extension-telemetry-wrapper` to `0.8.0`.

## 0.10.0 - 2020-05-10
### Changed
- Migrate icons to [Codicons](https://microsoft.github.io/vscode-codicons/dist/codicon.html). [PR#241](https://github.com/microsoft/vscode-java-dependency/pull/241), [PR#242](https://github.com/microsoft/vscode-java-dependency/pull/242)
- The command `Create Java Project` now will allow users to create a Java project with Maven support (as long as the [Maven extension](https://marketplace.visualstudio.com/items?itemName=vscjava.vscode-maven) is installed) or a project without any build tools. [#199](https://github.com/microsoft/vscode-java-dependency/issues/199), [#249](https://github.com/microsoft/vscode-java-dependency/issues/249)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.10.0+is%3Aclosed)

## 0.9.0 - 2020-02-19
### Added
- A new entry in explorer to add Maven dependencies. [PR#230](https://github.com/microsoft/vscode-java-dependency/pull/230)

### Changed
- By default, the explorer won't show the members of the classes. If the users want to show them in the explorer, please set the setting `java.dependency.showMembers` to `true`. [PR#235](https://github.com/microsoft/vscode-java-dependency/pull/235)

## 0.8.0 - 2020-01-17
### Added
- Support managing referenced libraries in the dependency explorer. [#174](https://github.com/microsoft/vscode-java-dependency/issues/174)

## 0.7.0 - 2020-01-10
### Added
- Add `Collapse All` support in the `Java Dependencies` explorer. [PR#198](https://github.com/microsoft/vscode-java-dependency/pull/198)
- Add file path as description for external jar files in the `Java Dependencies` explorer. [PR#209](https://github.com/microsoft/vscode-java-dependency/pull/209)
- Add `Reveal in Explorer`, `Copy Path` and `Copy Relative Path` in the `Java Dependencies` explorer's right-click context menu. [#PR208](https://github.com/microsoft/vscode-java-dependency/pull/208)

### Updated
- Open newly created project in the current window when no workspace folder is opened. [#180](https://github.com/microsoft/vscode-java-dependency/issues/180)
- Update the icons in the navigation bar of the `Java Dependencies` explorer. [#197](https://github.com/microsoft/vscode-java-dependency/issues/197)

## 0.6.0 - 2019-10-16
### Updated:
- Fix: When edit java file, the dependency view failed to auto refresh because of uncaught NPE. [#176](https://github.com/microsoft/vscode-java-dependency/issues/176)
- Fix: Replace deprecated workspace.rootPath api with workspaceFolder. [PR#184](https://github.com/microsoft/vscode-java-dependency/pull/184)
- Fix: Click some tree node in the dependency view will throw icon not found error. [#161](https://github.com/microsoft/vscode-java-dependency/issues/161)
- Fix: Add multiple roots to VS Code and the dependency view didn't list the full projects. [#162](https://github.com/microsoft/vscode-java-dependency/issues/162)
- Enhancement: Apply debounce to the auto refresh mechanism to reduce the refresh frequency. [PR#183](https://github.com/microsoft/vscode-java-dependency/pull/183)

## 0.5.1 - 2019-6-18
### Updated:
- Fix telemetry issue.

## 0.5.0 - 2019-6-11
### Added
- Add sync settings for dependency viewer [PR#156](https://github.com/microsoft/vscode-java-dependency/pull/156)
### Updated:
- Update the project template [PR#154](https://github.com/microsoft/vscode-java-dependency/pull/154)

## 0.4.0 - 2019-3-26
## Added:
- Add sync command to synchronize/desynchronize dependency viewer selection with folder explorer [PR#140](https://github.com/Microsoft/vscode-java-dependency/pull/140).

## Updated:
- Update package view icons [PR#138](https://github.com/Microsoft/vscode-java-dependency/pull/138)
- Fix error when window.activeTextEditor is undefined [PR#136](https://github.com/Microsoft/vscode-java-dependency/pull/136).
- Fix NPE issue when opne a non java file [Issue#139](https://github.com/Microsoft/vscode-java-dependency/issues/139).

## 0.3.0 - 2018-12-21
## Added:
- Add the ability to show hierarchical package presentation  [#57](https://github.com/Microsoft/vscode-java-dependency/issues/57).
- Add Chinese localization [#134](https://github.com/Microsoft/vscode-java-dependency/issues/134).
- Add a "Referenced Libraries" tree node for referenced libraries [#14](https://github.com/Microsoft/vscode-java-dependency/issues/14).

### Updated
- Fix: No way to link a resource files back to the project explorer [#106](https://github.com/Microsoft/vscode-java-dependency/issues/106).
- Fix: The click on the the tree node will navigate to the start of comment [#124](https://github.com/Microsoft/vscode-java-dependency/issues/124).
- Fix: The link between dependency explorer and active editor does not work for JDK classes [#110](https://github.com/Microsoft/vscode-java-dependency/issues/110).
- Fix: Class file can't show the symbols in the dependency explorer [#35](https://github.com/Microsoft/vscode-java-dependency/issues/35).

## 0.2.0 - 2018-11-19
## Added:
- Add the support for resource files under resource source folders like src/main/resources.

### Updated
- Fix: The side bar keeps popping up when a new Java file opens. [#83](https://github.com/Microsoft/vscode-java-dependency/issues/83).
- Fix: No way to link a java class definition back to the project explorer. [#80](https://github.com/Microsoft/vscode-java-dependency/issues/80).

## 0.1.0 - 2018-10-19
### Added
- View Java source code in the flat package
- View Java project dependencies, supporting Eclipse/Maven/Gradle
- Create simple Java project
