// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as assert from "assert";
import * as fse from "fs-extra";
import { platform, tmpdir } from "os";
import * as path from "path";
import * as seleniumWebdriver from "selenium-webdriver";
import { ActivityBar, By,   InputBox, ModalDialog, SideBarView, StatusBar, TextEditor, TreeItem, VSBrowser, ViewSection, Workbench } from "vscode-extension-tester";
import { sleep } from "../util";

// tslint:disable: only-arrow-functions
const newProjectName = "helloworld";
const testFolder = path.join(__dirname, "..", "..", "..", "test");
const mavenProjectPath = path.join(testFolder, "maven");
const invisibleProjectPath = path.join(testFolder, "invisible");

// async function pauseInPipeline(timeInMs: number): Promise<void> {
//     if (process.env.GITHUB_ACTIONS) {
//         return sleep(timeInMs);
//     } else {
//         return Promise.resolve();
//     }
// }

describe("Command Tests", function() {

    this.timeout(2 * 60 * 1000 /*ms*/);
    const mavenProjectTmpFolders: string[] = [];
    let currentProjectPath: string | undefined;

    function createTmpProjectFolder(projectName: string) {
        const tmpFolder = fse.mkdtempSync(path.join(tmpdir(), 'vscode-java-dependency-ui-test'));
        // Keep the folder name.
        const projectFolder = path.join(tmpFolder, projectName);
        fse.mkdirSync(projectFolder);
        mavenProjectTmpFolders.push(tmpFolder);
        return projectFolder;
    }

    async function openProject(projectPath: string) {
        const projectFolder = createTmpProjectFolder(path.basename(projectPath));
        // Copy to avoid restoring after each test run to revert changes done during the test.
        fse.copySync(projectPath, projectFolder);
        await VSBrowser.instance.openResources(projectFolder);
        currentProjectPath = projectFolder;
        await ensureExplorerIsOpen();
    }

    async function waitForLanguageServerReady() {
        const statusBar = new StatusBar();
        while (true) {
            const language = await statusBar.getCurrentLanguage();
            if (language === 'Java') {
                break;
            }
        }
        while (true) {
            try {
                const languageStatus = await statusBar.findElement(By.xpath('//*[@id="status.languageStatus"]'));
                await languageStatus.click();
                await languageStatus.findElement(By.xpath(`//div[contains(@class, 'context-view')]//div[contains(@class, 'hover-language-status')]//span[contains(@class, 'codicon-thumbsup')]`));
                break;
            } catch (e) {
                await sleep(100);
            }
        }
    }

    before(async function() {
        await openProject(mavenProjectPath);
        await openFile('App.java');
        await waitForLanguageServerReady();
    });

    after(async function() {
        mavenProjectTmpFolders.forEach(mavenProjectTmpFolder => {
            fse.rmSync(mavenProjectTmpFolder, {force: true, recursive: true});
        });
    });


    it("Test javaProjectExplorer.focus", async function() {
        await new Workbench().executeCommand("javaProjectExplorer.focus");
        const section = await new SideBarView().getContent().getSection("Java Projects");
        assert.ok(section.isExpanded(), `Section "Java Projects" should be expanded`);
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.linkWithFolderExplorer", async function() {
        await openFile('App.java');
        await sleep(1000);
        const [, section] = await expandInJavaProjects('my-app');
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        assert.ok(await packageNode.isExpanded(), `Package node "com.mycompany.app" should be expanded`);
        const classNode = await section.findItem("App") as TreeItem;
        assert.ok(await classNode.isDisplayed(), `Class node "App" should be revealed`);
        await packageNode.collapse();
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.unLinkWithFolderExplorer", async function() {
        const [, section] = await expandInJavaProjects('my-app');
        await section.click();
        let moreActions = await section.moreActions();
        const desynchronize = await moreActions!.getItem("Unlink with Editor");
        await desynchronize!.click();
        await openFile('App.java');
        await sleep(1000);
        const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
        assert.ok(!await packageNode.isExpanded(), `Package "com.mycompany.app" should not be expanded`);
        moreActions = await section.moreActions();
        const link = await moreActions!.getItem("Link with Editor");
        await link!.click();
    });

    it("Test java.view.package.newJavaClass", async function() {
        let inputBox = await createJavaResource();
        const javaClassQuickPick  = await inputBox.findQuickPick("Java Class");
        await javaClassQuickPick!.click();
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
        assert.ok(await fse.pathExists(path.join(currentProjectPath!, "src", "main", "java", "App2.java")), `"App2.java" should be created in correct path`);
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.newPackage", async function() {
        // The current UI test framework doesn't support mac title bar and context menus.
        // See: https://github.com/redhat-developer/vscode-extension-tester#requirements
        // So we dismiss some UI tests on mac.
        let inputBox = await createJavaResource();
        const packageQuickPick = await inputBox.findQuickPick('Package');
        await packageQuickPick!.click();
        const quickPick = await inputBox.findQuickPick("src/main/java");
        assert.ok(quickPick, `"src/main/java" should be found in quickpick items`);
        await quickPick!.click();
        inputBox = await InputBox.create();
        await inputBox.setText("com.mycompany.app2");
        await inputBox.confirm();
        await sleep(1000);
        assert.ok(await fse.pathExists(path.join(currentProjectPath!, "src", "main", "java", "com", "mycompany", "app2")), `New package should be created in correct path`);
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.revealInProjectExplorer", async function() {
        // Make sure App.java is not currently revealed in Java Projects
        const section = await new SideBarView().getContent().getSection("Java Projects");
        const item = await section.findItem("my-app") as TreeItem;
        await item.collapse();
        const [fileSection, fileNode] = await openAppJavaSourceCode();
        await fileNode.openContextMenu();
        // menu.getItem(label) does not work. I did not investigate this further.
        // This is a global selector on purpose. The context-menu is located near the root node.
        const revealItem = await fileNode.findElement(By.xpath(`//div[contains(@class, 'context-view')]//a[@role='menuitem' and span[contains(text(), 'Reveal in Java Project Explorer')]]`));
        // const revealItem = await menu.getItem("Reveal in Java Project Explorer");
        assert.ok(revealItem, `Item "Reveal in Java Project Explorer" should be found in context menu`);
        await revealItem!.click();
        const classNode = await section.findItem("App") as TreeItem;
        assert.ok(await classNode.isDisplayed(), `Class Node "App" should be revealed`);
        await fileSection.collapse();
    });

    (platform() === "darwin" ? it.skip : it)("Test java.view.package.renameFile", async function() {
        // Collapse file section to make sure that the AppToRename tree item fits in the current viewport.
        // .findItem will only find tree items in the current viewport.
        await collapseFileSection();
        const section = await expandMainCodeInJavaProjects();
        const classNode = await section.findItem("AppToRename") as TreeItem;
        assert.ok(classNode, `AppToRename.java should be found`);
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
        // Collapse file section to make sure that the AppToRename tree item fits in the current viewport.
        // .findItem will only find tree items in the current viewport.
        await collapseFileSection();
        const section = await expandMainCodeInJavaProjects();
        const classNode = await section.findItem("AppToDelete") as TreeItem;
        await classNode.click();
        const menu = await classNode.openContextMenu();
        let deleteItem = await menu.getItem("Delete");
        // Not sure why sometimes one is visible and other times the other.
        if (deleteItem === undefined) {
            deleteItem = await menu.getItem("Delete Permanently");
        }
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
        assert.ok(!await fse.pathExists(path.join(currentProjectPath!, "src", "main", "java", "AppToDelete.java")), `The source file "AppToDelete.java" should be deleted`);
    });

    it("Test change to invisible project", async function() {
        await openProject(invisibleProjectPath);
        await sleep(1000);
        await openFile('App.java');
        await waitForLanguageServerReady();
        const fileSections = await new SideBarView().getContent().getSections();
        await fileSections[0].collapse();
        await new Workbench().executeCommand("javaProjectExplorer.focus");
    });

    it("Test java.project.addLibraries", async function() {
        // tslint:disable-next-line:prefer-const
        let [referencedItem, section] = await expandInJavaProjects('invisible', 'Referenced Libraries');
        await referencedItem.click();
        await clickActionButton(referencedItem, `Add Jar Libraries to Project Classpath...`);
        const input = await InputBox.create();
        await input.setText(path.join(invisibleProjectPath, "libSource", "simple.jar"));
        await input.confirm();
        await sleep(5000);
        referencedItem = await section.findItem("Referenced Libraries") as TreeItem;
        await referencedItem.expand();
        let simpleItem = await section.findItem("simple.jar") as TreeItem;
        assert.ok(simpleItem, `Library "simple.jar" should be found`);
        await simpleItem.click();
        await clickActionButton(simpleItem, 'Remove from Project Classpath');
        await sleep(5000);
        simpleItem = await section.findItem("simple.jar") as TreeItem;
        assert.ok(!simpleItem, `Library "simple.jar" should not be found`);
    });

    it("Test java.project.addLibraryFolders", async function() {
        // tslint:disable-next-line:prefer-const
        let [referencedItem, section] = await expandInJavaProjects('invisible', 'Referenced Libraries');
        await referencedItem.click();
        const button = await getActionButton(referencedItem, `Add Jar Libraries to Project Classpath...`);
        await button.getDriver().actions()
            // .mouseMove(buttons[0])
            .keyDown(seleniumWebdriver.Key.ALT)
            .click(button)
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
        const projectFolder = createTmpProjectFolder("newProject");
        await fse.ensureDir(projectFolder);
        await new Workbench().executeCommand("java.project.create");
        let inputBox = await InputBox.create();
        const picks = await inputBox.getQuickPicks();
        assert.equal("No build tools", await picks[0].getLabel());
        await picks[0].select();
        await sleep(3000);
        inputBox = await InputBox.create();
        await inputBox.setText(projectFolder);
        await inputBox.confirm();
        await sleep(3000);
        inputBox = await InputBox.create();
        await inputBox.setText(newProjectName);
        await inputBox.confirm();
        await sleep(5000);
        assert.ok(await fse.pathExists(path.join(projectFolder, newProjectName, "src", "App.java")), `The template source file should be created`);
        assert.ok(await fse.pathExists(path.join(projectFolder, newProjectName, "README.md")), `The template README file should be created`);
    });


});

async function collapseFileSection() {
    const fileSections = await new SideBarView().getContent().getSections();
    await fileSections[0].collapse();
}

async function expandMainCodeInJavaProjects() {
    const section = await new SideBarView().getContent().getSection("Java Projects");
    await section.click();
    const appNode = await section.findItem("my-app") as TreeItem;
    await appNode.expand();
    const srcFolderNode = await section.findItem('src/main/java') as TreeItem;
    await srcFolderNode.expand();
    const packageNode = await section.findItem("com.mycompany.app") as TreeItem;
    await packageNode.expand();
    return section;
}

async function expandInJavaProjects(label: string, ...otherLabels: string[]): Promise<[TreeItem, ViewSection]> {
    // Collapse file section to make sure that the AppToRename tree item fits in the current viewport.
    // .findItem will only find tree items in the current viewport.
    await collapseFileSection();
    const section = await new SideBarView().getContent().getSection("Java Projects");
    await section.click();
    let lastNode = await section.findItem(label) as TreeItem;
    await lastNode.expand();
    for (const otherLabel of otherLabels) {
        lastNode = await section.findItem(otherLabel) as TreeItem;
        await lastNode.expand();
    }
    return [lastNode, section];
}

async function openFile(filename: string) {
    await new Workbench().executeCommand('workbench.action.quickOpen');
    const fileInputBox = await InputBox.create();
    await fileInputBox.setText(filename);
    await fileInputBox.confirm();
}

async function openAppJavaSourceCode(): Promise<[ViewSection, TreeItem]> {
    const fileSections = await new SideBarView().getContent().getSections();
    await fileSections[0].expand();
    const srcNode = await fileSections[0].findItem("src") as TreeItem;
    await srcNode.expand();
    const folderNode = await fileSections[0].findItem("main") as TreeItem;
    await folderNode.expand();
    const subFolderNode = await fileSections[0].findItem("com") as TreeItem;
    await subFolderNode.expand();
    const appFolderNode = await fileSections[0].findItem("app") as TreeItem;
    await appFolderNode.expand();
    const fileNode = await fileSections[0].findItem("App.java") as TreeItem;
    await fileNode.click();
    return [fileSections[0], fileNode];
}

async function createJavaResource() {
    await collapseFileSection();
    const section = await new SideBarView().getContent().getSection("Java Projects");
    const item = await section.findItem("my-app") as TreeItem;
    assert.ok(item, `Project "my-app" should be found`);
    await item.click();
    await clickActionButton(item, 'New...');
    const inputBox = await InputBox.create();
    assert.ok(await inputBox.getPlaceHolder() === "Select resource type to create.",
        `InputBox "Select resource type to create" should appear.`);
    return inputBox;
}

async function clickActionButton(item: TreeItem, label: string) {
    const button = await getActionButton(item, label);
    await button.click();
}

async function getActionButton(item: TreeItem, label: string) {
    // Using item.getActionButton('New...') throws an error:
    // tslint:disable-next-line:max-line-length
    // "no such element: Unable to locate element: {\"method\":\"xpath\",\"selector\":\".//a[contains(@class, 'action-label') and @role='button' and @title='New...']\"}
    // This should be filled as an issue (I haven't find one).
    // The problem is the @title='New...' which should be @aria-label='New...' for vscode 1.77.0 (and probably above).
    return item.findElement(By.xpath(`.//a[contains(@class, 'action-label') and @role='button' and contains(@aria-label, '${label}')]`));
}

async function ensureExplorerIsOpen() {
    const control = await new ActivityBar().getViewControl('Explorer');
    if (control === undefined) {
        throw new Error(`Explorer control should not be null.`);
    }
    await control.openView();
}

