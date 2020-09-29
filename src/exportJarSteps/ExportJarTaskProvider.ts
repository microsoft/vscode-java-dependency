// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CustomExecution, Event, EventEmitter, Pseudoterminal, Task, TaskDefinition, TaskProvider, TaskRevealKind, TerminalDimensions, workspace } from "vscode";
import { createJarFile } from "../exportJarFileCommand";
import { IStepMetadata } from "./IStepMetadata";

export class ExportJarTaskProvider implements TaskProvider {

    public static exportJarType: string = "exportjar";

    public static getTask(stepMetadata: IStepMetadata): Task {
        const targetPathSetting: string = workspace.getConfiguration("java.dependency.exportjar").get<string>("defaultTargetFolder");
        const defaultDefinition: IExportJarTaskDefinition = {
            type: ExportJarTaskProvider.exportJarType,
            targetPath: targetPathSetting,
            elements: [],
            mainMethod: undefined,
        };
        const task: Task = new Task(defaultDefinition, stepMetadata.workspaceFolder, "DEFAULT_EXPORT", ExportJarTaskProvider.exportJarType,
            new CustomExecution(async (resolvedDefinition: TaskDefinition): Promise<Pseudoterminal> => {
                return new ExportJarTaskTerminal(resolvedDefinition, stepMetadata);
            }));
        task.presentationOptions.reveal = TaskRevealKind.Never;
        return task;
    }

    public async resolveTask(_task: Task): Promise<Task> {
        return _task;
    }

    public async provideTasks(): Promise<Task[]> {
        return [];
    }

}

class ExportJarTaskTerminal implements Pseudoterminal {

    public writeEmitter = new EventEmitter<string>();
    public closeEmitter = new EventEmitter<void>();

    public onDidWrite: Event<string> = this.writeEmitter.event;
    public onDidClose?: Event<void> = this.closeEmitter.event;
    
    private stepMetadata: IStepMetadata;

    constructor(exportJarTaskDefinition: IExportJarTaskDefinition, stepMetadata: IStepMetadata) {
        this.stepMetadata = stepMetadata;
        this.stepMetadata.mainMethod = exportJarTaskDefinition.mainMethod;
        this.stepMetadata.outputPath = exportJarTaskDefinition.targetPath;
        this.stepMetadata.elements = exportJarTaskDefinition.elements;
    }
    
    public async open(initialDimensions: TerminalDimensions | undefined): Promise<void> {
        await createJarFile(this.stepMetadata);
        this.closeEmitter.fire();
    }

    public close(): void {

    }
}

interface IExportJarTaskDefinition extends TaskDefinition {
    elements?: string[];
    mainMethod?: string;
    targetPath?: string;
}
