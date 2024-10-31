# Change Log
All notable changes to the "vscode-java-dependency" extension will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## 0.24.1
* Graal Cloud Native Launcher extension renamed. by @dbalek in https://github.com/microsoft/vscode-java-dependency/pull/849
* ux - display maven and gradle dependencies with pattern 'groupId:artifactId:version ' by @mamilic in https://github.com/microsoft/vscode-java-dependency/pull/859

## New Contributors
* @mamilic made their first contribution in https://github.com/microsoft/vscode-java-dependency/pull/859

## 0.24.0
* feat - Support adding new package from file explorer by @jdneo in https://github.com/microsoft/vscode-java-dependency/pull/845

## 0.23.7
* fix - Creates file watcher with trailing slash causes problems for other extensions by @testforstephen in https://github.com/microsoft/vscode-java-dependency/pull/829
* fix - Micronaut® Launch extension renamed. by @dbalek in https://github.com/microsoft/vscode-java-dependency/pull/831

## 0.23.6
### Fixed
- Referenced Libraries container should be immutable for build tool projects. [PR#826](https://github.com/microsoft/vscode-java-dependency/pull/826)

## 0.23.5
### Added
- Add 'New Java File' menu to File Explorer. [PR#820](https://github.com/microsoft/vscode-java-dependency/pull/820).

### Changed
- Adjust the existing File Explorer menu order. [PR#820](https://github.com/microsoft/vscode-java-dependency/pull/820).

## 0.23.4
### Added
- Contribute 'New Java Project...' command to `File` > `New File...` and File Explorer menus. [PR#809](https://github.com/microsoft/vscode-java-dependency/pull/809)

## 0.23.3
### Added
- Register the project delete event. [PR#802](https://github.com/microsoft/vscode-java-dependency/pull/802)

### Changed
- Improve the user experience of creating Java files. [PR#801](https://github.com/microsoft/vscode-java-dependency/pull/801), [PR#800](https://github.com/microsoft/vscode-java-dependency/pull/800).

## 0.23.2
### Fixed
- Improve wording in Java Projects view. [PR#785](https://github.com/microsoft/vscode-java-dependency/pull/785)
- Support showing Gradle sub-menu for projects imported by Gradle build server. [PR#786](https://github.com/microsoft/vscode-java-dependency/pull/786)
- Update extension names in creating Java projects menu. [PR#790](https://github.com/microsoft/vscode-java-dependency/pull/790), contributed by [@dbalek](https://github.com/dbalek)
- Maven multi-module project doesn't correctly open modules. [#766](https://github.com/microsoft/vscode-java-dependency/issues/766), contributed by [@fvclaus](https://github.com/fvclaus)

## 0.23.1
### Removed
- Removed marketplace preview flag. [PR#780](https://github.com/microsoft/vscode-java-dependency/pull/780)

## 0.23.0
### Added
- Support creating Micronaut projects. [#713](https://github.com/microsoft/vscode-java-dependency/issues/713), contributed by [@dbalek](https://github.com/dbalek)
- Support creating Craal Cloud Native projects. [PR#765](https://github.com/microsoft/vscode-java-dependency/pull/765), contributed by [@dbalek](https://github.com/dbalek)

### Fixed
- Fix spelling mistake in welcome view. [PR#760](https://github.com/microsoft/vscode-java-dependency/pull/760), contributed by [@jeremyfiel](https://github.com/jeremyfiel)
- Cannot open file explorer from welcome view. [#770](https://github.com/microsoft/vscode-java-dependency/issues/770)

## 0.22.0
### Added
- Display non-Java files in Java Projects explorer. [#145](https://github.com/microsoft/vscode-java-dependency/issues/145)
- Show non-Java projects in the Java Projects explorer. [#736](https://github.com/microsoft/vscode-java-dependency/issues/736)
- Introduce a setting: `java.project.explorer.showNonJavaResources` to control whether non-Java resources show in Java Projects explorer. [#751](https://github.com/microsoft/vscode-java-dependency/issues/751)
- Support creating files and folders in Java Projects explorer. [#598](https://github.com/microsoft/vscode-java-dependency/issues/598)
- Apply file decorators to project level. [#481](https://github.com/microsoft/vscode-java-dependency/issues/481)
- Give more hints about the project import status. [#580](https://github.com/microsoft/vscode-java-dependency/issues/580)

### Changed
- Improve workflow of creating resources from Java Projects explorer. [PR#741](https://github.com/microsoft/vscode-java-dependency/pull/741), [PR#754](https://github.com/microsoft/vscode-java-dependency/pull/754)

### Fixed
- Apply `files.exclude` to Java Projects explorer. [#214](https://github.com/microsoft/vscode-java-dependency/issues/214)
- Empty packages will not appear sometimes. [#600](https://github.com/microsoft/vscode-java-dependency/issues/600)
- Show Java files which does not have a primary type in the Java Projects explorer. [#748](https://github.com/microsoft/vscode-java-dependency/issues/748)

## 0.21.2
### Fixed
- Improve the output of exporting jar tasks. [#699](https://github.com/microsoft/vscode-java-dependency/issues/699)
- Open build tasks action is blocked. [#720](https://github.com/microsoft/vscode-java-dependency/issues/720)

## 0.21.1
### Changed
- Scan two levels of directories for activation indicators. [PR#681](https://github.com/microsoft/vscode-java-dependency/pull/681)
- Remove the `ASKUSER` option when specify the output path of exporting jar task. To make the extension asks for the output path when exporting jars, simply leave it empty. [#676](https://github.com/microsoft/vscode-java-dependency/issues/676)
### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.21.1+is%3Aclosed)

## 0.21.0
### Added
- Add sub-menu for Maven and Gradle projects in Java Project explorer. [PR#664](https://github.com/microsoft/vscode-java-dependency/pull/664)
- Add Rebuild commands into context menu. [PR#663](https://github.com/microsoft/vscode-java-dependency/pull/663)
- Support `Run Build Task...` in the `Terminal` menu. [PR#660](https://github.com/microsoft/vscode-java-dependency/pull/660)
- Show `Reload Java Project` shortcut in editor title area on demand. [PR#671](https://github.com/microsoft/vscode-java-dependency/pull/671)
- Add `zh-tw` locale. [PR#669](https://github.com/microsoft/vscode-java-dependency/pull/669), contributed by [@MuTsunTsai](https://github.com/MuTsunTsai)

### Changed
- Rename the task type `java`, which is used for exporting jar files, to `java (buildArtifact)`. [#665](https://github.com/microsoft/vscode-java-dependency/issues/665)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.21.0+is%3Aclosed)

## 0.20.0
### Added
- Support Support drag and drop for Java Project explorer. [#613](https://github.com/microsoft/vscode-java-dependency/issues/613)

### Changed
- Move the `Rebuild Workspace` action to navigation bar. [#619](https://github.com/microsoft/vscode-java-dependency/issues/619)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.20.0+is%3Aclosed)

## 0.19.1
### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.19.1+is%3Aclosed)

## 0.19.0
### Added
- Support creating new JavaFX project via Maven archetype. [PR#581](https://github.com/microsoft/vscode-java-dependency/pull/581)
- Support creating new Gradle project. [PR#583](https://github.com/microsoft/vscode-java-dependency/pull/583)

### Changed
- Now you can simply leave the setting `java.project.exportJar.targetPath` empty when you want to specify the location of exported jar manually. [PR#575](https://github.com/microsoft/vscode-java-dependency/pull/575)
- Add the `java.project.referencedLibraries` setting by default when creating an unmanaged folder project. [PR#584](https://github.com/microsoft/vscode-java-dependency/pull/584)

## 0.18.9
### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.9+is%3Aclosed)

## 0.18.8
### Changed
- Adopt the new `folder-library` icon. [PR#545](https://github.com/microsoft/vscode-java-dependency/pull/545)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.8+is%3Aclosed)

## 0.18.7
### Added
- Support creating new Java class from `File` > `New File...`. [PR#533](https://github.com/microsoft/vscode-java-dependency/pull/533)

## 0.18.6

### Changed
- Set the output path to `bin` by default when creating projects without build tools. [#523](https://github.com/microsoft/vscode-java-dependency/issues/523)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.6+is%3Aclosed)

## 0.18.5
### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.5+is%3Aclosed)

## 0.18.4
### Added
- Show reports when exporting jar. [#374](https://github.com/microsoft/vscode-java-dependency/issues/374)
### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.4+is%3Aclosed)

## 0.18.3
### Added
- Add new unmanaged folder metadata for the project node. [PR#479](https://github.com/microsoft/vscode-java-dependency/pull/479)
### Changed
- Rename sorting group `9_sync` to `9_configuration`. [PR#480](https://github.com/microsoft/vscode-java-dependency/pull/480)

## 0.18.2

### Changed
- Update dependencies. [PR#470](https://github.com/microsoft/vscode-java-dependency/pull/470)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.2+is%3Aclosed)

## 0.18.1
### Added
- Add welcome view in Java Project explorer when there is no Java projects in the workspace. [PR#461](https://github.com/microsoft/vscode-java-dependency/pull/461)

### Changed
- Apply the new extension icon. [PR#462](https://github.com/microsoft/vscode-java-dependency/pull/462)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.1+is%3Aclosed)

## 0.18.0
### Added
- Adopt the resource URI API to the Java Project explorer. [PR#453](https://github.com/microsoft/vscode-java-dependency/pull/453)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.18.0+is%3Aclosed)

## 0.17.0
### Added
- Add contextual title and icon for `Java Project` explorer. [#396](https://github.com/microsoft/vscode-java-dependency/issues/396)
- Allow adding library folders into the `Referenced Libraries` on Windows and Linux (Press `Alt` or `Shift` to toggle out the button). [PR#434](https://github.com/microsoft/vscode-java-dependency/pull/434)
- Add test metadata to the nodes which are under test source paths. [PR#437](https://github.com/microsoft/vscode-java-dependency/pull/437)

### Changed
- Opening files from the `Java Project` explorer now has the same experience as the `File` explorer. [PR#426](https://github.com/microsoft/vscode-java-dependency/pull/426)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.17.0+is%3Aclosed)

## 0.16.0
### Added
- Add `Update Project` command into the project node in explorer. [PR#391](https://github.com/microsoft/vscode-java-dependency/pull/391)
- Add more default keyboard shortcuts for the explorer commands. [PR#393](https://github.com/microsoft/vscode-java-dependency/pull/393)

### Changed
- Change the command name `Reveal in Java Projects` to `Reveal in Java Projects Explorer`. [PR#395](https://github.com/microsoft/vscode-java-dependency/pull/395)
- Do not show the `Java Project` explorer in non-Java workspace. [#372](https://github.com/microsoft/vscode-java-dependency/issues/372)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.16.0+is%3Aclosed)

## 0.15.0
### Added
- Support exporting jar with custom task. [PR#350](https://github.com/microsoft/vscode-java-dependency/pull/350)
- Add `rename` into the view context menu. [PR#353](https://github.com/microsoft/vscode-java-dependency/pull/353)
- Add context value for folder nodes in the Java Projects explorer. [PR#365](https://github.com/microsoft/vscode-java-dependency/pull/365)

### Changed
- Update the icon of exporting jar. [PR#360](https://github.com/microsoft/vscode-java-dependency/pull/360)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.15.0+is%3Aclosed)

## 0.14.0
### Added
- Add a new setting `java.project.exportJar.targetPath` to specify target path when exporting jar. [#330](https://github.com/microsoft/vscode-java-dependency/issues/330)
- Add delete action into the Project explorer's context menu. [PR#343](https://github.com/microsoft/vscode-java-dependency/pull/343)
- Can trigger `New Java Class` and `New Package` actions from the project nodes in the Project explorer. [PR#335](https://github.com/microsoft/vscode-java-dependency/pull/335)
- Can reveal the Project explorer from the Java source file. [PR#327](https://github.com/microsoft/vscode-java-dependency/pull/327)
- Can reveal the Project explorer from the editor context menu. [PR#332](https://github.com/microsoft/vscode-java-dependency/pull/332)
- Add inline buttons for `New Java Class` in the Project explorer. [PR#331](https://github.com/microsoft/vscode-java-dependency/pull/331)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.14.0+is%3Aclosed)

## 0.13.0
### Added
- Add overflow menu and the shortcut for `Build Workspace` and `Clean Workspace` commands. [PR#308](https://github.com/microsoft/vscode-java-dependency/pull/308)

### Changed
- Refined the context value of the nodes in the `Java Projects` explorer. [PR#311](https://github.com/microsoft/vscode-java-dependency/pull/311). For more details about how to register commands onto the nodes, see the [wiki page](https://github.com/microsoft/vscode-java-dependency/wiki/Register-Command-onto-the-Nodes-of-Project-View).
- The default package will not show in the explorer any more. [#313](https://github.com/microsoft/vscode-java-dependency/issues/313)
- Improve the explorer layout for `No build tools` projects. [PR#312](https://github.com/microsoft/vscode-java-dependency/pull/312), [PR#210](https://github.com/microsoft/vscode-java-dependency/pull/210)
- Improve the description for `No build tools` option when creating new projects. [PR#314](https://github.com/microsoft/vscode-java-dependency/pull/314)

### Fixed
- [Bugs fixed](https://github.com/microsoft/vscode-java-dependency/issues?q=is%3Aissue+label%3Abug+milestone%3A0.13.0+is%3Aclosed)

## 0.12.0
### Added
- Support creating new packages and types. [#78](https://github.com/microsoft/vscode-java-dependency/issues/78)

### Changed
- Reduce unnecessary refreshes when editing a Java file. [#283](https://github.com/microsoft/vscode-java-dependency/issues/283)
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
