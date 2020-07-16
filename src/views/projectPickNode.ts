import { QuickPickNode } from "./quickPickNode";

export class ProjectPickNode extends QuickPickNode {

    public uri: string;

    constructor(_label: string, _description: string, _uri: string) {
        super(_label, _description);
        this.uri = _uri;
    }
}
