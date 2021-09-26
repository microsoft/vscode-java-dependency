// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fse from "fs-extra";
import { platform } from "os";
import * as path from "path";
import * as seleniumWebdriver from "selenium-webdriver";
import { EditorView, InputBox, ModalDialog, SideBarView, TextEditor, TreeItem, VSBrowser, Workbench } from "vscode-extension-tester";
import { sleep } from "../util";

// tslint:disable: only-arrow-functions
const newProjectName = "helloworld";
const testFolder = path.join(__dirname, "..", "..", "..", "test");
const mavenProjectPath = path.join(testFolder, "maven");
const invisibleProjectPath = path.join(testFolder, "invisible");
const targetPath = path.join(testFolder, "newProject");

describe("Command Tests", function() {

    let browser: VSBrowser;
    this.timeout(2 * 60 * 1000 /*ms*/);

    before(async function() {
        browser = VSBrowser.instance;
        sleep(5000);
    });

    beforeEach(async function() {
        await sleep(5000);
    });

    it("Test open maven project", async function() {
        await browser.openResources(mavenProjectPath);
        // Close welcome editors
        let editorView = new EditorView();
        let editorGroups = await editorView.getEditorGroups();
        for (const editorGroup of editorGroups) {
            await editorGroup.closeAllEditors();
        }
        const settingsEditor = await new Workbench().openSettings();
        const refreshSetting = await settingsEditor.findSetting("Auto Refresh", "Java", "Dependency");
        await refreshSetting.setValue(true);
        const viewSetting = await settingsEditor.findSetting("Package Presentation", "Java", "Dependency");
        await viewSetting.setValue("flat");
        // Close setting editor
        editorView = new EditorView();
        editorGroups = await editorView.getEditorGroups();
        for (const editorGroup of editorGroups) {
            await editorGroup.closeAllEditors();
        }
        await sleep(1000);
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].collapse();
        await sleep(60 * 1000 /*ms*/);
    });

    it("Test javaProjectExplorer.focus", async function() {
        await new Workbench().executeCommand("javaProjectExplorer.focus");
        const section = await new SideBarView().getContent().getSection("Java Projects");
        assert.ok(section.isExpanded(), `Section "Java Projects" should be expanded`);
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.linkWithFolderExplorer", async function() {
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].expand();
        const srcNode = await fileSections[0].findItem("src") as TreeItem;
        await srcNode.expand();
        const folderNode = await fileSections[0].findItem("main") as TreeItem;
        await folderNode.expand();
        const subFolderNode = await fileSections[0].findItem("app") as TreeItem;
        await subFolderNode.expand();
        const fileNode = await fileSections[0].findItem("App.java") as TreeItem;
        await fileNode.click();
        await sleep(1000);
        await fileSections[0].collapse();
        const section = await new SideBarView().getContent().getSection("Java Projects");
        await section.expand();
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        assert.ok(await packageNode.isExpanded(), `Package node "com.mycompany.app" should be expanded`);
        const classNode = await section.findItem("App") as TreeItem;
        assert.ok(await classNode.isDisplayed(), `Class node "App" should be revealed`);
        await packageNode.collapse();
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.unLinkWithFolderExplorer", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const moreActions = await section.moreActions();
        const desynchronize = await moreActions?.getItem("Desynchronize with Editor");
        await desynchronize?.click();
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].expand();
        const fileNode = await fileSections[0].findItem("App.java") as TreeItem;
        await fileNode.click();
        await sleep(1000);
        await fileSections[0].collapse();
        await section.expand();
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        assert.ok(!await packageNode.isExpanded(), `Package "com.mycompany.app" should not be expanded`);
    });

    it("Test java.view.package.newJavaClass", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const item = await section.findItem("my-app") as TreeItem;
        assert.ok(item, `Project "my-app" should be found`);
        await item.click();
        const button = await item.getActionButton("New Java Class");
        assert.ok(button, `Button "New Java Class" should be found`);
        await button!.click();
        let inputBox = await InputBox.create();
        assert.ok(await inputBox.getPlaceHolder() === "Choose a source folder", `InputBox "Choose a source folder" should appear`);
        const quickPick = await inputBox.findQuickPick("src/main/java");
        assert.ok(quickPick, `Quickpick item "src/main/java" should be found`);
        await quickPick!.click();
        inputBox = await InputBox.create();
        assert.ok(await inputBox.getPlaceHolder() === "Input the class name", `InputBox "Input the class name" should appear`);
        await inputBox.setText("App2");
        await inputBox.confirm();
        await sleep(1000);
        const editor = new TextEditor();
        await editor.save();
        assert.ok(await editor.getTitle() === "App2.java", `Editor's title should be "App2.java"`);
        assert.ok(await fse.pathExists(path.join(mavenProjectPath, "src", "main", "java", "App2.java")), `"App2.java" should be created in correct path`);
        await fse.remove(path.join(mavenProjectPath, "src", "main", "java", "App2.java"));
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.newPackage", async function() {
        // The current UI test framework doesn't support mac title bar and context menus.
        // See: https://github.com/redhat-developer/vscode-extension-tester#requirements
        // So we dismiss some UI tests on mac.
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const item = await section.findItem("my-app") as TreeItem;
        await item.click();
        const contextMenu = await item.openContextMenu();
        const newPackageItem = await contextMenu.getItem("New Package");
        assert.ok(newPackageItem, `"New Package" should be found in context menu`);
        await newPackageItem!.click();
        let inputBox = await InputBox.create();
        const quickPick = await inputBox.findQuickPick("src/main/java");
        assert.ok(quickPick, `"src/main/java" should be found in quickpick items`);
        await quickPick!.click();
        inputBox = await InputBox.create();
        await inputBox.setText("com.mycompany.app2");
        await inputBox.confirm();
        await sleep(1000);
        assert.ok(await fse.pathExists(path.join(mavenProjectPath, "src", "main", "java", "com", "mycompany", "app2")), `New package should be created in correct path`);
        await fse.remove(path.join(mavenProjectPath, "src", "main", "java", "com", "mycompany", "app2"));
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.revealInProjectExplorer", async function() {
        const fileExplorerSections = await new SideBarView().getContent().getSections();
        await fileExplorerSections[0].expand();
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        await packageNode.click();
        await packageNode.collapse();
        const srcNode = await fileExplorerSections[0].findItem("src") as TreeItem;
        await srcNode.expand();
        const folderNode = await fileExplorerSections[0].findItem("main") as TreeItem;
        await folderNode.expand();
        const fileNode = await fileExplorerSections[0].findItem("App.java") as TreeItem;
        const menu = await fileNode.openContextMenu();
        const revealItem = await menu.getItem("Reveal in Java Project Explorer");
        assert.ok(revealItem, `Item "Reveal in Java Project Explorer" should be found in context menu`);
        await revealItem!.click();
        const classNode = await section.findItem("App") as TreeItem;
        assert.ok(await classNode.isDisplayed(), `Class Node "App" should be revealed`);
        await fileExplorerSections[0].collapse();
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.renameFile", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        await section.click();
        const classNode = await section.findItem("AppToRename") as TreeItem;
        await classNode.click();
        const menu = await classNode.openContextMenu();
        const renameItem = await menu.getItem("Rename");
        assert.ok(renameItem, `"Rename" item should be found`);
        await renameItem!.click();
        const inputBox = await InputBox.create();
        await inputBox.setText("AppRenamed");
        await inputBox.confirm();
        await sleep(1000);
        const dialog = new ModalDialog();
        const buttons = await dialog.getButtons();
        for (const button of buttons) {
            if (await button.getText() === "OK") {
                await button.click();
                break;
            }
        }
        await sleep(5000);
        const editor = new TextEditor();
        await editor.save();
        assert.ok(await editor.getTitle() === "AppRenamed.java", `Editor's title should be "AppRenamed.java"`);
        assert.ok(await section.findItem("AppRenamed"), `Item in Java Project section should be "AppRenamed"`);
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.moveFileToTrash", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const classNode = await section.findItem("AppToDelete") as TreeItem;
        await classNode.click();
        const menu = await classNode.openContextMenu();
        const deleteItem = await menu.getItem("Delete");
        assert.ok(deleteItem, `"Delete" item should be found`);
        await deleteItem!.click();
        const dialog = new ModalDialog();
        const buttons = await dialog.getButtons();
        for (const button of buttons) {
            if (await button.getText() === "Move to Recycle Bin") {
                await button.click();
                break;
            }
        }
        await sleep(1000);
        assert.ok(!await fse.pathExists(path.join(mavenProjectPath, "src", "main", "java", "AppToDelete.java")), `The source file "AppToDelete.java" should be deleted`);
    });

    it("Test change to invisible project", async function() {
        await browser.openResources(invisibleProjectPath);
        await sleep(1000);
        const fileExplorerSections = await new SideBarView().getContent().getSections();
        const folderNode = await fileExplorerSections[0].findItem("src") as TreeItem;
        await folderNode.expand();
        const fileNode = await fileExplorerSections[0].findItem("App.java") as TreeItem;
        await fileNode.click();
        await sleep(60 * 1000 /*ms*/);
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].collapse();
        await new Workbench().executeCommand("javaProjectExplorer.focus");
    });

    it("Test java.project.addLibraries", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const projectItem = await section.findItem("invisible") as TreeItem;
        await projectItem.expand();
        await sleep(1000);
        let referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.click();
        const buttons = await referencedItem.getActionButtons();
        await buttons[0].click();
        const input = await InputBox.create();
        await input.setText(path.join(invisibleProjectPath, "libSource", "simple.jar"));
        await input.confirm();
        await sleep(5000);
        referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.expand();
        const simpleItem = await section.findItem("simple.jar") as TreeItem;
        assert.ok(simpleItem, `Library "simple.jar" should be found`);
        await simpleItem.click();
        const libraryButtons = await simpleItem.getActionButtons();
        await libraryButtons[0].click();
        await sleep(5000);
    });

    it("Test java.project.addLibraryFolders", async function() {
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const projectItem = await section.findItem("invisible") as TreeItem;
        await projectItem.expand();
        await sleep(1000);
        let referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.click();
        const buttons = await referencedItem.getActionButtons();
        await buttons[0].getDriver().actions()
            .mouseMove(buttons[0])
            .keyDown(seleniumWebdriver.Key.ALT)
            .click(buttons[0])
            .keyUp(seleniumWebdriver.Key.ALT)
            .perform();
        await sleep(5000);
        const input = await InputBox.create();
        await input.setText(path.join(invisibleProjectPath, "libSource"));
        await input.confirm();
        await sleep(5000);
        referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.expand();
        assert.ok(await section.findItem("simple.jar"), `Library "simple.jar" should be found`);
    });

    it("Test java.project.create", async function() {
        await fse.ensureDir(targetPath);
        await new Workbench().executeCommand("java.project.create");
        let inputBox = await InputBox.create();
        const picks = await inputBox.getQuickPicks();
        for (const quickPick of picks) {
            if (await quickPick.getLabel() === "No build tools") {
                await quickPick.click();
            }
        }
        await sleep(3000);
        inputBox = await InputBox.create();
        await inputBox.setText(targetPath);
        await inputBox.confirm();
        await sleep(3000);
        inputBox = await InputBox.create();
        await inputBox.setText(newProjectName);
        await inputBox.confirm();
        await sleep(5000);
        assert.ok(await fse.pathExists(path.join(targetPath, newProjectName, "src", "App.java")), `The template source file should be created`);
        assert.ok(await fse.pathExists(path.join(targetPath, newProjectName, "README.md")), `The template README file should be created`);
    });
});
