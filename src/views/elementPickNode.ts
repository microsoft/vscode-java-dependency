import { QuickPickNode } from "./quickPickNode";

export class ElementPickNode extends QuickPickNode {

    public uri: string;
    public type: string;
    public picked: boolean;

    constructor(_label: string, _description: string, _uri: string, _type: string, _picked: boolean) {
        super(_label, _description);
        this.uri = _uri;
        this.type = _type;
        this.picked = _picked;
    }
}
