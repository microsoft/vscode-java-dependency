// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { Disposable, ProgressLocation, QuickInputButtons, QuickPick, window } from "vscode";
import { ExportJarStep, IStepMetadata } from "../exportJarFileCommand";
import { Jdtls } from "../java/jdtls";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { createPickBox, IJarQuickPickItem } from "./utility";

export class ResolveMainMethodExecutor implements IExportJarStepExecutor {

    private static getName(data: MainMethodInfo) {
        return data.name.substring(data.name.lastIndexOf(".") + 1);
    }

    public async execute(stepMetadata: IStepMetadata): Promise<ExportJarStep> {
        if (await this.resolveMainMethod(stepMetadata)) {
            return ExportJarStep.GenerateJar;
        }
        return ExportJarStep.ResolveWorkspace;
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
        };
        pickItems.push(noMainClassItem);
        const disposables: Disposable[] = [];
        let pickBox: QuickPick<IJarQuickPickItem>;
        const result = await new Promise<boolean>(async (resolve, reject) => {
            pickBox = createPickBox("Export Jar : Determine main class", "Select the main class",
                pickItems, stepMetadata.isPickedWorkspace);
            disposables.push(
                pickBox.onDidTriggerButton((item) => {
                    if (item === QuickInputButtons.Back) {
                        return resolve(false);
                    }
                }),
                pickBox.onDidAccept(() => {
                    stepMetadata.selectedMainMethod = pickBox.selectedItems[0].description;
                    return resolve(true);
                }),
                pickBox.onDidHide(() => {
                    return reject();
                }),
            );
            pickBox.show();
        });
        for (const d of disposables) {
            d.dispose();
        }
        if (pickBox !== undefined) {
            pickBox.dispose();
        }
        return result;
    }

}

export class MainMethodInfo {
    public name: string;
    public path: string;
}
