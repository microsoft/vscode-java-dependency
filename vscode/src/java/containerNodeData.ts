import { INodeData } from "./nodeData";

export enum ContainerEntryKind {
    /**
 * Entry kind constant describing a classpath entry identifying a
 * library. A library is a folder or JAR containing package
 * fragments consisting of pre-compiled binaries.
 */
    CPE_LIBRARY = 1,

    /**
     * Entry kind constant describing a classpath entry identifying a
     * required project.
     */
    CPE_PROJECT = 2,

    /**
     * Entry kind constant describing a classpath entry identifying a
     * folder containing package fragments with source code
     * to be compiled.
     */
    CPE_SOURCE = 3,

    /**
     * Entry kind constant describing a classpath entry defined using
     * a path that begins with a classpath variable reference.
     */
    CPE_VARIABLE = 4,

    /**
     * Entry kind constant describing a classpath entry representing
     * a name classpath container.
     *
     * @since 2.0
     */
    CPE_CONTAINER = 5
}

export interface IContainerNodeData extends INodeData {
    entryKind: ContainerEntryKind;
}
