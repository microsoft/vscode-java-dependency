// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

import { CancellationTokenSource, commands, CustomExecution, Event, EventEmitter, Pseudoterminal, Task,
    TaskDefinition, TaskGroup, TaskProvider, TaskRevealKind, TaskScope, Uri, workspace, WorkspaceFolder } from "vscode";
import { Jdtls } from "../../java/jdtls";
import * as path from "path";
import { checkErrorsReportedByJavaExtension } from "../../build";
import { Commands } from "../../commands";

/**
 * A task provider to provide Java build task support.
 */
export class BuildTaskProvider implements TaskProvider {

    public static readonly type = "java (build)";

    // tslint:disable-next-line: no-invalid-template-strings
    public static readonly workspace = "${workspace}";
    public static readonly defaultTaskName = "Build Workspace";

    async provideTasks(): Promise<Task[]> {
        const folders: readonly WorkspaceFolder[] = workspace.workspaceFolders || [];
        if (!folders.length) {
            return [];
        }
        const defaultTaskDefinition = {
            type: BuildTaskProvider.type,
            paths: [ BuildTaskProvider.workspace ],
            isFullBuild: true,
        };
        const defaultTask = new Task(
            defaultTaskDefinition,
            TaskScope.Workspace,
            BuildTaskProvider.defaultTaskName,
            BuildTaskProvider.type,
            new CustomExecution(async (resolvedDefinition: IBuildTaskDefinition): Promise<Pseudoterminal> => {
                return new BuildTaskTerminal(resolvedDefinition, TaskScope.Workspace);
            }),
        );
        defaultTask.detail = "$(tools) Build all the Java projects in workspace.";
        defaultTask.group = TaskGroup.Build;
        defaultTask.presentationOptions = {
            reveal: TaskRevealKind.Never,
            clear: true,
        };
        return [defaultTask];
    }

    async resolveTask(task: Task): Promise<Task | undefined> {
        const taskDefinition = task.definition as IBuildTaskDefinition;
        if (!taskDefinition.paths?.length) {
            taskDefinition.paths = [ BuildTaskProvider.workspace ];
        } else {
            taskDefinition.paths = taskDefinition.paths
                .map(p => p.trim())
                .filter(Boolean);
            task.definition = taskDefinition;
        }
        task.execution = new CustomExecution(async (resolvedDefinition: IBuildTaskDefinition): Promise<Pseudoterminal> => {
            return new BuildTaskTerminal(resolvedDefinition, task.scope ?? TaskScope.Workspace);
        });
        task.presentationOptions = {
            reveal: TaskRevealKind.Never,
            clear: true,
        };
        return task;
    }
}

class BuildTaskTerminal implements Pseudoterminal {

    private cancellationTokenSource: CancellationTokenSource;

    constructor(private readonly definition: IBuildTaskDefinition,
                private readonly scope: WorkspaceFolder | TaskScope.Global | TaskScope.Workspace) {
        this.cancellationTokenSource =  new CancellationTokenSource();
    }

    writeEmitter = new EventEmitter<string>();
    closeEmitter = new EventEmitter<number>();

    onDidWrite: Event<string> = this.writeEmitter.event;
    onDidClose: Event<number> = this.closeEmitter.event;

    async open(): Promise<void> {
        // TODO: consider change to terminal name via changeNameEmitter.
        // see: https://github.com/microsoft/vscode/issues/154146

        if (this.definition.paths.length === 1 &&
                this.definition.paths[0] === BuildTaskProvider.workspace) {
            await this.buildWorkspace();
        } else {
            await this.buildProjects();
        }
        this.writeEmitter.fire('Task complete.\r\n');
        this.closeEmitter.fire(0);
    }

    close(): void {
        this.cancellationTokenSource.cancel();
        this.cancellationTokenSource.dispose();
    }

    async buildWorkspace(): Promise<void> {
        this.writeEmitter.fire("Building all the Java projects in workspace...\r\n\r\n");
        try {
            await commands.executeCommand(Commands.COMPILE_WORKSPACE, this.definition.isFullBuild, this.cancellationTokenSource.token);
        } catch (e) {
            if (checkErrorsReportedByJavaExtension()) {
                commands.executeCommand(Commands.WORKBENCH_VIEW_PROBLEMS);
                this.writeEmitter.fire("Errors found when building the workspace.\r\n\r\n");
            } else {
                this.writeEmitter.fire("Errors occur when building the workspace:\r\n");
                this.writeEmitter.fire(`${e}\r\n\r\n`);
            }
        }
    }

    async buildProjects(): Promise<void> {
        // tslint:disable-next-line: prefer-const
        let [includedPaths, excludedPaths, invalidPaths] = categorizePaths(this.definition.paths, this.scope);
        if (invalidPaths.length) {
            this.printList("Following paths are invalid, please provide absolute paths instead:", invalidPaths);
            return;
        }

        const projectUris: string[] = await Jdtls.getProjectUris();
        const projectPaths: string[] = projectUris
            .map(uri => Uri.parse(uri).fsPath)
            .filter(p => path.basename(p) !== "jdt.ls-java-project");
        [includedPaths, invalidPaths] = getFinalPaths(includedPaths, excludedPaths, projectPaths);

        if (invalidPaths.length) {
            this.printList("Following paths are skipped due to not matching any project root path:", invalidPaths);
        }

        if (includedPaths.length === 0 || this.cancellationTokenSource.token.isCancellationRequested) {
            return;
        }

        this.printList("Building following projects:", includedPaths);
        const uris: Uri[] = includedPaths.map(p => Uri.file(p));
        try {
            const res = await commands.executeCommand(Commands.BUILD_PROJECT, uris, this.definition.isFullBuild,
                this.cancellationTokenSource.token);
            if (res === Jdtls.CompileWorkspaceStatus.Witherror && checkErrorsReportedByJavaExtension()) {
                commands.executeCommand(Commands.WORKBENCH_VIEW_PROBLEMS);
            }
        } catch (e) {
            this.writeEmitter.fire(`Error occurs when building the workspace: ${e}\r\n`);
        }
    }

    private printList(title: string, list: string[]) {
        this.writeEmitter.fire(`${title}\r\n`);
        for (const l of list) {
            this.writeEmitter.fire(`  ${l}\r\n`);
        }
        this.writeEmitter.fire("\r\n");
    }
}

/**
 * Categorize the paths into three categories, and return the categories in an array.
 * @param paths paths in the task definition.
 * @param scope scope of the task
 * @returns {Array} [included paths, excluded paths, invalid paths].
 */
export function categorizePaths(paths: string[], scope: WorkspaceFolder | TaskScope.Global | TaskScope.Workspace): string[][] {
    const includes = [];
    const excludes = [];
    const invalid = [];
    for (const p of paths) {
        let actualPath = p;
        const isNegative: boolean = p.startsWith("!");
        if (isNegative) {
            actualPath = trimNegativeSign(actualPath);
        }

        if (actualPath === BuildTaskProvider.workspace || path.isAbsolute(actualPath)) {
            if (isNegative) {
                excludes.push(actualPath);
            } else {
                includes.push(actualPath);
            }
            continue;
        }

        // global tasks are not supported now.
        if (scope === TaskScope.Global) {
            invalid.push(p);
            continue;
        }

        let folder: WorkspaceFolder | undefined;
        if (scope === TaskScope.Workspace) {
            // cannot recover the absolute path
            if (!workspace.workspaceFolders || workspace.workspaceFolders.length > 1) {
                invalid.push(p);
            } else {
                folder = workspace.workspaceFolders[0];
            }
        }

        if (!folder) {
            continue;
        }

        const resolvedPath = path.join(folder.uri.fsPath, actualPath);
        if (isNegative) {
            excludes.push(resolvedPath);
        } else {
            includes.push(resolvedPath);
        }
    }
    return [includes, excludes, invalid];
}

function trimNegativeSign(negativePath: string) {
    let idx = 0;
    for (; idx < negativePath.length; idx++) {
        if (negativePath.charAt(idx) !== "!") {
            break;
        }
    }
    return negativePath.substring(idx);
}

/**
 * Get the final paths which will be passed to the build projects command.
 * @param includes included paths.
 * @param excludes excluded paths.
 * @param projectPaths paths of all the projects.
 * @returns {Array} [ final paths, invalid paths ].
 */
export function getFinalPaths(includes: string[], excludes: string[], projectPaths: string[]): string[][] {
    if (includes.includes(BuildTaskProvider.workspace)) {
        includes = projectPaths;
    }

    includes = includes.filter(p => {
        return !excludes.some(excludePath => path.relative(excludePath, p) === "");
    });

    const result: string[] = [];
    const invalid: string[] = [];
    for (const p of includes) {
        const valid = projectPaths.some(projectPath => path.relative(projectPath, p) === "");
        if (valid) {
            result.push(p);
        } else {
            invalid.push(p);
        }
    }
    return [result, invalid];
}

interface IBuildTaskDefinition extends TaskDefinition {
    /**
     * The root paths of the projects to be built.
     */
    paths: string[];
    /**
     * Whether this is a full build or not.
     */
    isFullBuild: boolean;
}
