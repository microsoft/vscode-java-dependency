// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { Uri } from "vscode";
import { ContainerNode, FileNode, FolderNode, INodeData, NodeKind, PackageNode, PackageRootKind,
    PackageRootNode, PrimaryTypeNode, ProjectNode, TypeKind, WorkspaceNode } from "../../extension.bundle";

// tslint:disable: only-arrow-functions
// tslint:disable: no-object-literal-type-assertion

/**
 * This suite is to test the context value of different nodes in the explorer,
 * Users can register their commands to the nodes by writing RegExp to match the metadata.
 * More details, please see: https://github.com/microsoft/vscode-java-dependency/wiki/Register-Command-onto-the-Nodes-of-Project-View
 */
suite("Context Value Tests", () => {

    test("test workspace node", async function() {
        assert.ok(/java:workspaceFolder(?=.*?\b\+uri\b)/.test((await workspace.getTreeItem()).contextValue || ""));
    });

    test("test Maven project node", async function() {
        assert.ok(/java:project(?=.*?\b\+java\b)(?=.*?\b\+maven\b)(?=.*?\b\+uri\b)/.test((await mavenProject.getTreeItem()).contextValue || ""));
    });

    test("test Gradle project node", async function() {
        assert.ok(/java:project(?=.*?\b\+java\b)(?=.*?\b\+gradle\b)(?=.*?\b\+uri\b)/.test((await gradleProject.getTreeItem()).contextValue || ""));
    });

    test("test unmanaged folder node", async function() {
        assert.ok(/java:project(?=.*?\b\+java\b)(?=.*?\b\+unmanagedFolder\b)(?=.*?\b\+uri\b)/
                .test((await unmanagedFolder.getTreeItem()).contextValue || ""));
    });

    test("test JRE container node", async function() {
        assert.ok(/java:container(?=.*?\b\+jre\b)(?=.*?\b\+uri\b)/.test((await jreContainer.getTreeItem()).contextValue || ""));
    });

    test("test Maven container node", async function() {
        assert.ok(/java:container(?=.*?\b\+maven\b)(?=.*?\b\+uri\b)/.test((await mavenContainer.getTreeItem()).contextValue || ""));
    });

    test("test Gradle container node", async function() {
        assert.ok(/java:container(?=.*?\b\+gradle\b)(?=.*?\b\+uri\b)/.test((await gradleContainer.getTreeItem()).contextValue || ""));
    });

    test("test Referenced Libraries container node", async function() {
        assert.ok(/java:container(?=.*?\b\+referencedLibrary\b)(?=.*?\b\+uri\b)/
            .test((await referencedLibrariesContainer.getTreeItem()).contextValue || ""));
    });

    test("test source root node", async function() {
        assert.ok(/java:packageRoot(?=.*?\b\+source\b)(?=.*?\b\+uri\b)/.test((await sourceRoot.getTreeItem()).contextValue || ""));
    });

    test("test test-source root node", async function() {
        assert.ok(/java:packageRoot(?=.*?\b\+source\b)(?=.*?\b\+uri\b)(?=.*?\b\+test\b)/
            .test((await testSourceRoot.getTreeItem()).contextValue || ""));
    });

    test("test resource root node", async function() {
        assert.ok(/java:packageRoot(?=.*?\b\+resource\b)(?=.*?\b\+uri\b)/.test((await resourceRoot.getTreeItem()).contextValue || ""));
    });

    test("test dependency jar node", async function() {
        assert.ok(/java:jar(?=.*?\b\+uri\b)/.test((await dependencyJar.getTreeItem()).contextValue || ""));
    });

    test("test referenced library jar node", async function() {
        assert.ok(/java:jar(?=.*?\b\+referencedLibrary\b)(?=.*?\b\+uri\b)/.test((await referencedLibraryJar.getTreeItem()).contextValue || ""));
    });

    test("test source package node", async function() {
        assert.ok(/java:package(?=.*?\b\+source\b)(?=.*?\b\+uri\b)/.test((await sourcePackage.getTreeItem()).contextValue || ""));
    });

    test("test source(test) package node", async function() {
        assert.ok(/java:package(?=.*?\b\+source\b)(?=.*?\b\+test\b)(?=.*?\b\+uri\b)/
            .test((await testSourcePackage.getTreeItem()).contextValue || ""));
    });

    test("test binary package node", async function() {
        assert.ok(/java:package(?=.*?\b\+binary\b)(?=.*?\b\+uri\b)/.test((await binaryPackage.getTreeItem()).contextValue || ""));
    });

    test("test file node", async function() {
        assert.ok(/java:file(?=.*?\b\+uri\b)/.test((await file.getTreeItem()).contextValue || ""));
    });

    test("test class type node", async function() {
        assert.ok(/java:type(?=.*?\b\+class\b)(?=.*?\b\+uri\b)/.test((await classType.getTreeItem()).contextValue || ""));
    });

    test("test test-class type node", async function() {
        assert.ok(/java:type(?=.*?\b\+class\b)(?=.*?\b\+test\b)(?=.*?\b\+uri\b)/.test((await testClassType.getTreeItem()).contextValue || ""));
    });

    test("test enum type node", async function() {
        assert.ok(/java:type(?=.*?\b\+enum\b)(?=.*?\b\+uri\b)/.test((await enumType.getTreeItem()).contextValue || ""));
    });

    test("test interface type node", async function() {
        assert.ok(/java:type(?=.*?\b\+interface\b)(?=.*?\b\+uri\b)/.test((await interfaceType.getTreeItem()).contextValue || ""));
    });

    test("test folder node", async function() {
        assert.ok(/java:folder(?=.*?\b\+uri\b)/.test((await folder.getTreeItem()).contextValue || ""));
    });
});

// below are faked nodes only for test purpose
const workspace: WorkspaceNode = new WorkspaceNode({
    name: "workspace",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Workspace,
}, undefined);

const mavenProject: ProjectNode = new ProjectNode({
    name: "mavenProject",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Project,
    metaData: {
        NatureId: ["org.eclipse.jdt.core.javanature", "org.eclipse.m2e.core.maven2Nature"],
    },
}, workspace);

const gradleProject: ProjectNode = new ProjectNode({
    name: "gradleProject",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Project,
    metaData: {
        NatureId: ["org.eclipse.jdt.core.javanature", "org.eclipse.buildship.core.gradleprojectnature"],
    },
}, workspace);

const unmanagedFolder: ProjectNode = new ProjectNode({
    name: "unmanagedFolder",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Project,
    metaData: {
        NatureId: ["org.eclipse.jdt.core.javanature", "org.eclipse.jdt.ls.core.unmanagedFodler"],
    },
}, workspace);

const jreContainer: ContainerNode = new ContainerNode({
    name: "jreContainer",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Container,
    path: "org.eclipse.jdt.launching.JRE_CONTAINER/org.eclipse.jdt.internal.debug.ui.launcher.StandardVMType/JavaSE-11",
}, mavenProject, mavenProject);

const mavenContainer: ContainerNode = new ContainerNode({
    name: "mavenContainer",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Container,
    path: "org.eclipse.m2e.MAVEN2_CLASSPATH_CONTAINER",
}, mavenProject, mavenProject);

const gradleContainer: ContainerNode = new ContainerNode({
    name: "gradleContainer",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Container,
    path: "org.eclipse.buildship.core.gradleclasspathcontainer",
}, gradleProject, gradleProject);

const referencedLibrariesContainer: ContainerNode = new ContainerNode({
    name: "referencedLibrariesContainer",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Container,
    path: "REFERENCED_LIBRARIES_PATH",
}, mavenProject, mavenProject);

const sourceRoot: PackageRootNode = new PackageRootNode({
    name: "src/main/java",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PackageRoot,
    entryKind: PackageRootKind.K_SOURCE,
} as INodeData, mavenContainer, mavenProject);

const testSourceRoot: PackageRootNode = new PackageRootNode({
    name: "src/main/java",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PackageRoot,
    entryKind: PackageRootKind.K_SOURCE,
    metaData: {
        test: "true",
    },
} as INodeData, mavenContainer, mavenProject);

const resourceRoot: PackageRootNode = new PackageRootNode({
    name: "src/main/resources",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PackageRoot,
    entryKind: PackageRootKind.K_SOURCE,
} as INodeData, mavenContainer, mavenProject);

const dependencyJar: PackageRootNode = new PackageRootNode({
    name: "junit-4.12.jar",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PackageRoot,
    entryKind: PackageRootKind.K_BINARY,
} as INodeData, mavenContainer, mavenProject);

const referencedLibraryJar: PackageRootNode = new PackageRootNode({
    name: "junit-4.12.jar",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PackageRoot,
    entryKind: PackageRootKind.K_BINARY,
} as INodeData, referencedLibrariesContainer, mavenProject);

const sourcePackage: PackageNode = new PackageNode({
    name: "com.microsoft.java",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Package,
}, sourceRoot, mavenProject, sourceRoot);

const testSourcePackage: PackageNode = new PackageNode({
    name: "com.microsoft.java",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Package,
}, testSourceRoot, mavenProject, testSourceRoot);

const binaryPackage: PackageNode = new PackageNode({
    name: "junit",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Package,
}, dependencyJar, mavenProject, dependencyJar);

const file: FileNode = new FileNode({
    name: "config.txt",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.File,
}, sourcePackage);

const classType: PrimaryTypeNode = new PrimaryTypeNode({
    name: "App",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PrimaryType,
    metaData: {
        TypeKind: TypeKind.Class,
    },
}, sourcePackage, sourceRoot);

const testClassType: PrimaryTypeNode = new PrimaryTypeNode({
    name: "App",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PrimaryType,
    metaData: {
        TypeKind: TypeKind.Class,
    },
}, testSourcePackage, testSourceRoot);

const enumType: PrimaryTypeNode = new PrimaryTypeNode({
    name: "LanguageServerMode",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PrimaryType,
    metaData: {
        TypeKind: TypeKind.Enum,
    },
}, sourcePackage, sourceRoot);

const interfaceType: PrimaryTypeNode = new PrimaryTypeNode({
    name: "Controller",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PrimaryType,
    metaData: {
        TypeKind: TypeKind.Interface,
    },
}, sourcePackage, sourceRoot);

const folder: FolderNode = new FolderNode({
    name: "static",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Package,
}, resourceRoot, mavenProject, resourceRoot);
