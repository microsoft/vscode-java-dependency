// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ProgressLocation, QuickInputButtons, window } from "vscode";
import { GenerateSettings } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { ExportSteps, IStep } from "./IStep";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveMainMethodStep implements IStep {

    private static getName(data: MainMethodInfo) {
        return data.name.substring(data.name.lastIndexOf(".") + 1);
    }

    public exportStep;

    constructor() {
        this.exportStep = ExportSteps.ResolveMainMethod;
    }

    public async execute(lastStep: IStep | undefined, generateSettings: GenerateSettings): Promise<ExportSteps> {
        return await this.resolveMainMethod(lastStep, generateSettings) ? ExportSteps.GenerateJar : lastStep.exportStep;
    }

    private async resolveMainMethod(lastStep: IStep | undefined, generateSettings: GenerateSettings): Promise<boolean> {
        const mainMethods: MainMethodInfo[] = await window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Resolving main classes...",
            cancellable: true,
        }, (progress, token) => {
            return new Promise<MainMethodInfo[] | undefined>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                resolve(await Jdtls.getMainMethod(generateSettings.workspaceUri.toString()));
            });
        });
        if (mainMethods === undefined || mainMethods.length === 0) {
            generateSettings.selectedMainMethod = "";
            return true;
        }
        const pickItems: IJarQuickPickItem[] = [];
        for (const mainMethod of mainMethods) {
            pickItems.push({
                label: ResolveMainMethodStep.getName(mainMethod),
                description: mainMethod.name,
            });
        }
        const noMainClassItem: IJarQuickPickItem = {
            label: "<without main class>",
        };
        pickItems.push(noMainClassItem);
        return new Promise<boolean>(async (resolve, reject) => {
            const pickBox = createPickBox("Export Jar : Determine main class", "Select the main class", pickItems, lastStep !== undefined);
            pickBox.onDidTriggerButton((item) => {
                if (item === QuickInputButtons.Back) {
                    resolve(false);
                    pickBox.dispose();
                }
            });
            pickBox.onDidAccept(() => {
                generateSettings.selectedMainMethod = pickBox.selectedItems[0].description;
                resolve(true);
                pickBox.dispose();
            });
            pickBox.onDidHide(() => {
                reject();
                pickBox.dispose();
            });
            pickBox.show();
        });
    }

}

export class MainMethodInfo {
    public name: string;
    public path: string;
}
