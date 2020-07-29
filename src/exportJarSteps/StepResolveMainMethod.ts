// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { ProgressLocation, QuickInputButtons, window } from "vscode";
import { StepMetadata, steps } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { IStep } from "./IStep";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class StepResolveMainMethod implements IStep {

    private static getName(data: MainMethodInfo) {
        return data.name.substring(data.name.lastIndexOf(".") + 1);
    }

    public async execute(stepMetadata: StepMetadata): Promise<IStep> {
        if (await this.resolveMainMethod(stepMetadata) === true) {
            steps.currentStep += 1;
        } else {
            steps.currentStep -= 1;
        }
        return steps.stepsList[steps.currentStep];
    }

    private async resolveMainMethod(stepMetadata: StepMetadata): Promise<boolean> {
        const mainMethods: MainMethodInfo[] = await window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Resolving main classes...",
            cancellable: true,
        }, (progress, token) => {
            return new Promise<MainMethodInfo[] | undefined>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                resolve(await Jdtls.getMainMethod(stepMetadata.workspaceUri.toString()));
            });
        });
        if (mainMethods === undefined || mainMethods.length === 0) {
            stepMetadata.selectedMainMethod = "";
            return true;
        }
        const pickItems: IJarQuickPickItem[] = [];
        for (const mainMethod of mainMethods) {
            pickItems.push({
                label: StepResolveMainMethod.getName(mainMethod),
                description: mainMethod.name,
            });
        }
        const noMainClassItem: IJarQuickPickItem = {
            label: "<without main class>",
        };
        pickItems.push(noMainClassItem);
        return new Promise<boolean>(async (resolve, reject) => {
            const pickBox = createPickBox("Export Jar : Determine main class", "Select the main class",
                pickItems, stepMetadata.isPickedWorkspace);
            pickBox.onDidTriggerButton((item) => {
                if (item === QuickInputButtons.Back) {
                    resolve(false);
                    pickBox.dispose();
                }
            });
            pickBox.onDidAccept(() => {
                stepMetadata.selectedMainMethod = pickBox.selectedItems[0].description;
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
