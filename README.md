# Java Dependency Viewer

[![Travis CI](https://travis-ci.org/Microsoft/vscode-java-dependency.svg?branch=master)](https://travis-ci.org/Microsoft/vscode-java-dependency)

## Overview

A lightweight extension to provide additional Java project explorer features. It works with [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) to provide the following features:

* Dependency viewer

![viewer](https://raw.githubusercontent.com/Microsoft/vscode-java-dependency/master/images/project-dependency.gif)

* Create simple Java Project

![create project](https://raw.githubusercontent.com/Microsoft/vscode-java-dependency/master/images/create-project.gif)

## Requirements

- JDK (version 1.8.0 or later)
- VS Code (version 1.28.0 or later)
- [Language Support for Java by Red Hat](https://marketplace.visualstudio.com/items?itemName=redhat.java) (version 0.32.0 or later)

## Contribution

### Build
* Prerequirement
    - Node.js
    - Java SDK 1.8.0 or above

* Go to root folder:
```
npm install -g gulp
npm install
gulp build_server
```

## Telemetry
VS Code collects usage data and sends it to Microsoft to help improve our products and services. Read our [privacy statement](https://go.microsoft.com/fwlink/?LinkID=528096&clcid=0x409) to learn more. If you don't wish to send usage data to Microsoft, you can set the `telemetry.enableTelemetry` setting to `false`. Learn more in our [FAQ](https://code.visualstudio.com/docs/supporting/faq#_how-to-disable-telemetry-reporting).
