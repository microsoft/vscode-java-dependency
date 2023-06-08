import {DocumentLink, DocumentLinkProvider, ProviderResult, Range, TextDocument, Uri } from "vscode";

export class GradleOutputLinkProvider implements DocumentLinkProvider {
    provideDocumentLinks(document: TextDocument): ProviderResult<DocumentLink[]> {
        const links: DocumentLink[] = [];
        const content = document.getText();
        let searchPosition = 0;
        const lines = content.split(/\r?\n/g);
        for (const line of lines) {
            const match = line.match(/(.*\.java):(\d+)/);
            if (match) {
                const startOffset = content.indexOf(match[0], searchPosition);
                const start = document.positionAt(startOffset);
                const endOffset = startOffset + match[0].length;
                const end = document.positionAt(endOffset);
                searchPosition += endOffset;

                const file = match[1];
                const line = parseInt(match[2]);
                const uri = Uri.file(file).with({ fragment: `L${line}` });
                links.push(new DocumentLink(new Range(start, end), uri));
            }
        }
        return links;
    }
}
