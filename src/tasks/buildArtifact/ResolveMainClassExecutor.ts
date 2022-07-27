// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import * as _ from "lodash";
import { Disposable, ProgressLocation, QuickInputButtons, QuickPickItem, window } from "vscode";
import { Jdtls } from "../../java/jdtls";
import { IExportJarStepExecutor } from "./IExportJarStepExecutor";
import { IStepMetadata } from "./IStepMetadata";
import { createPickBox, ExportJarMessages, ExportJarStep } from "./utility";

export class ResolveMainClassExecutor implements IExportJarStepExecutor {

    private static getName(data: IMainClassInfo) {
        return data.name.substring(data.name.lastIndexOf(".") + 1);
    }

    private readonly currentStep: ExportJarStep = ExportJarStep.ResolveMainClass;

    public async execute(stepMetadata: IStepMetadata): Promise<boolean> {
        if (stepMetadata.mainClass !== undefined) {
            return true;
        }
        return this.resolveMainClass(stepMetadata);
    }

    private async resolveMainClass(stepMetadata: IStepMetadata): Promise<boolean> {
        const mainClasses: IMainClassInfo[] | undefined = await window.withProgress({
            location: ProgressLocation.Window,
            title: "Exporting Jar : Resolving main classes...",
            cancellable: true,
        }, (_progress, token) => {
            return new Promise<IMainClassInfo[]>(async (resolve, reject) => {
                token.onCancellationRequested(() => {
                    return reject();
                });
                if (!stepMetadata.workspaceFolder) {
                    return reject(new Error(ExportJarMessages.fieldUndefinedMessage(ExportJarMessages.Field.WORKSPACEFOLDER, this.currentStep)));
                }
                resolve(await Jdtls.getMainClasses(stepMetadata.workspaceFolder.uri.toString()));
            });
        });
        if (_.isEmpty(mainClasses)) {
            stepMetadata.mainClass = "";
            return true;
        }
        const pickItems: QuickPickItem[] = [];
        for (const mainClass of mainClasses) {
            pickItems.push({
                label: ResolveMainClassExecutor.getName(mainClass),
                description: mainClass.name,
            });
        }
        const noMainClassItem: QuickPickItem = {
            label: "<without main class>",
            description: "",
        };
        pickItems.push(noMainClassItem);
        const disposables: Disposable[] = [];
        let result: boolean = false;
        try {
            result = await new Promise<boolean>(async (resolve, reject) => {
                const pickBox = createPickBox<QuickPickItem>("Export Jar : Determine main class", "Select the main class",
                    pickItems, stepMetadata.steps.length > 0);
                disposables.push(
                    pickBox.onDidTriggerButton((item) => {
                        if (item === QuickInputButtons.Back) {
                            return resolve(false);
                        }
                    }),
                    pickBox.onDidAccept(() => {
                        if (_.isEmpty(pickBox.selectedItems)) {
                            return;
                        }
                        stepMetadata.mainClass = pickBox.selectedItems[0].description;
                        stepMetadata.steps.push(ExportJarStep.ResolveMainClass);
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

export interface IMainClassInfo {
    name: string;
    path: string;
}
