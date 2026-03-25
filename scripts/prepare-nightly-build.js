const fs = require("fs");

const json = JSON.parse(fs.readFileSync("./package.json").toString());
const stableVersion = json.version.match(/(\d+)\.(\d+)\.(\d+)/);
if (!stableVersion) {
    throw new Error(`Invalid stable version: ${json.version}`);
}
const major = stableVersion[1];
const minor = stableVersion[2];

function prependZero(number) {
    if (number > 99) {
        throw new Error("Unexpected value to prepend with zero");
    }
    return `${number < 10 ? "0" : ""}${number}`;
}

const date = new Date();
const month = date.getMonth() + 1;
const day = date.getDate();
const hours = date.getHours();
const patch = `${date.getFullYear()}${prependZero(month)}${prependZero(day)}${prependZero(hours)}`;

const insiderPackageJson = Object.assign(json, {
    version: `${major}.${minor}.${patch}`,
    preview: true,
});

fs.writeFileSync("./package.insiders.json", `${JSON.stringify(insiderPackageJson, null, 2)}\n`);