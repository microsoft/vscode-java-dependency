const fs = require("fs");

const packageJsonPath = "./package.json";
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
packageJson.preview = false;

if (packageJson.contributes) {
    delete packageJson.contributes.languageModelTools;
    delete packageJson.contributes.chatSkills;
    delete packageJson.contributes.chatInstructions;

    if (packageJson.contributes.configuration && packageJson.contributes.configuration.properties) {
        delete packageJson.contributes.configuration.properties["vscode-java-dependency.enableLspTools"];
    }
}

fs.writeFileSync("./package.stable.json", `${JSON.stringify(packageJson, null, 2)}\n`);
