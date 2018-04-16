
export enum NodeKind {
    Workspace = 1,
    Project = 2,
    Container = 3,
    PackageRoot = 4,
    Package = 5,
    Classfile = 6,
    Folder = 7,
    File = 8
}

export interface INodeData {
    name: string;
    moduleName?: string;
    path?: string;
    uri?: string;
    kind: NodeKind;
    children?: INodeData[];
}