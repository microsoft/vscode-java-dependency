// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import { Uri } from "vscode";
import { ContainerNode, FileNode, FolderNode, INodeData, NodeKind, PackageNode, PackageRootKind,
    PackageRootNode, PrimaryTypeNode, ProjectNode, TypeKind, WorkspaceNode } from "../../extension.bundle";

// tslint:disable: only-arrow-functions
// tslint:disable: no-object-literal-type-assertion
suite("Context Value Tests", () => {

    test("test workspace node", async function() {
        assert.equal((await workspace.getTreeItem()).contextValue, "java:workspaceFolder+uri");
    });

    test("test Maven project node", async function() {
        assert.equal((await mavenProject.getTreeItem()).contextValue, "java:project+java+maven+uri");
    });

    test("test Gradle project node", async function() {
        assert.equal((await gradleProject.getTreeItem()).contextValue, "java:project+java+gradle+uri");
    });

    test("test JRE container node", async function() {
        assert.equal((await jreContainer.getTreeItem()).contextValue, "java:container+jre+uri");
    });

    test("test Maven container node", async function() {
        assert.equal((await mavenContainer.getTreeItem()).contextValue, "java:container+maven+uri");
    });

    test("test Gradle container node", async function() {
        assert.equal((await gradleContainer.getTreeItem()).contextValue, "java:container+gradle+uri");
    });

    test("test Referenced Libraries container node", async function() {
        assert.equal((await referencedLibrariesContainer.getTreeItem()).contextValue, "java:container+referencedLibrary+uri");
    });

    test("test source root node", async function() {
        assert.equal((await sourceRoot.getTreeItem()).contextValue, "java:packageRoot+source+uri");
    });

    test("test resource root node", async function() {
        assert.equal((await resourceRoot.getTreeItem()).contextValue, "java:packageRoot+resource+uri");
    });

    test("test dependency jar node", async function() {
        assert.equal((await dependencyJar.getTreeItem()).contextValue, "java:jar+uri");
    });

    test("test referenced library jar node", async function() {
        assert.equal((await referencedLibraryJar.getTreeItem()).contextValue, "java:jar+referencedLibrary+uri");
    });

    test("test source package node", async function() {
        assert.equal((await sourcePackage.getTreeItem()).contextValue, "java:package+source+uri");
    });

    test("test binary package node", async function() {
        assert.equal((await binaryPackage.getTreeItem()).contextValue, "java:package+binary+uri");
    });

    test("test file node", async function() {
        assert.equal((await file.getTreeItem()).contextValue, "java:file+uri");
    });

    test("test class type node", async function() {
        assert.equal((await classType.getTreeItem()).contextValue, "java:type+class+uri");
    });

    test("test enum type node", async function() {
        assert.equal((await enumType.getTreeItem()).contextValue, "java:type+enum+uri");
    });

    test("test interface type node", async function() {
        assert.equal((await interfaceType.getTreeItem()).contextValue, "java:type+interface+uri");
    });

    test("test folder node", async function() {
        assert.equal((await folder.getTreeItem()).contextValue, "java:folder+uri");
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
}, sourcePackage);

const enumType: PrimaryTypeNode = new PrimaryTypeNode({
    name: "LanguageServerMode",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PrimaryType,
    metaData: {
        TypeKind: TypeKind.Enum,
    },
}, sourcePackage);

const interfaceType: PrimaryTypeNode = new PrimaryTypeNode({
    name: "Controller",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.PrimaryType,
    metaData: {
        TypeKind: TypeKind.Interface,
    },
}, sourcePackage);

const folder: FolderNode = new FolderNode({
    name: "static",
    uri: Uri.file(__dirname).toString(),
    kind: NodeKind.Package,
}, resourceRoot, mavenProject, resourceRoot);
