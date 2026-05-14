const fs = require("fs");

const packageJsonPath = "./package.json";
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath).toString());
packageJson.preview = false;

fs.writeFileSync("./package.stable.json", `${JSON.stringify(packageJson, null, 2)}\n`);
