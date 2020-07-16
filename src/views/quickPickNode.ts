import { QuickPickItem } from "vscode";

export class QuickPickNode implements QuickPickItem {

    public label: string;
    public description: string;

    constructor(_label: string, _description: string) {
        this.label = _label;
        this.description = _description;
    }

}
