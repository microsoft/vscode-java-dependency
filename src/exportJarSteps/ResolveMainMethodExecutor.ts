// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Disposable, ProgressLocation, QuickInputButtons, window } from "vscode";
import { ExportJarStep } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveMainMethodExecutor implements IExportJarStepExecutor {

    private static getName(data: MainMethodInfo) {
        return data.name.substring(data.name.lastIndexOf(".") + 1);
    }

    public getNextStep(): ExportJarStep {
        return ExportJarStep.GenerateJar;
    }

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        if (await this.resolveMainMethod(stepMetadata)) {
            return this.getNextStep();
        }
        return stepMetadata.steps.pop();
    }

    private async resolveMainMethod(stepMetadata: IStepMetadata): Promise<boolean> {
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
                label: ResolveMainMethodExecutor.getName(mainMethod),
                description: mainMethod.name,
            });
        }
        const noMainClassItem: IJarQuickPickItem = {
            label: "<without main class>",
            description: "",
        };
        pickItems.push(noMainClassItem);
        const disposables: Disposable[] = [];
        let result: boolean = false;
        try {
            result = await new Promise<boolean>(async (resolve, reject) => {
                const pickBox = createPickBox("Export Jar : Determine main class", "Select the main class",
                    pickItems, stepMetadata.steps.length > 0);
                disposables.push(
                    pickBox.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            return resolve(false);
                        }
                    }),
                    pickBox.onDidAccept(() => {
                        stepMetadata.selectedMainMethod = pickBox.selectedItems[0].description;
                        stepMetadata.steps.push(ExportJarStep.ResolveMainMethod);
                        return resolve(true);
                    }),
                    pickBox.onDidHide(() => {
                        return reject();
                    }),
                );
                disposables.push(pickBox);
                pickBox.show();
            });
        } finally {
            for (const d of disposables) {
                d.dispose();
            }
        }
        return result;
    }
}

export class MainMethodInfo {
    public name: string;
    public path: string;
}
