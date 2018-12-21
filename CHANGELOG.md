# Change Log
All notable changes to the "vscode-java-dependency" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

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
