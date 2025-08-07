// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

const cp = require('child_process');
const fse = require('fs-extra');
const path = require('path');

const server_dir = path.resolve('jdtls.ext');

// Set JVM options to increase XML entity size limits
// JDK 24 contains changes to JAXP limits, see: https://bugs.openjdk.org/browse/JDK-8343022
const jvmOptions = [
    '-Djdk.xml.maxGeneralEntitySizeLimit=0',
    '-Djdk.xml.totalEntitySizeLimit=0'
].join(' ');

// Set MAVEN_OPTS environment variable with JVM options
const env = { ...process.env };
env.MAVEN_OPTS = env.MAVEN_OPTS ? env.MAVEN_OPTS + ' ' + jvmOptions : jvmOptions;

const mvnCommand = `${mvnw()} clean package`;
cp.execSync(mvnCommand, {cwd:server_dir, stdio:[0,1,2], env: env} );
copy(path.join(server_dir, 'com.microsoft.jdtls.ext.core/target'), path.resolve('server'), (file) => {
    return /^com.microsoft.jdtls.ext.core.*.jar$/.test(file);
});

function copy(sourceFolder, targetFolder, fileFilter) {
    const jars = fse.readdirSync(sourceFolder).filter(file => fileFilter(file));
    fse.ensureDirSync(targetFolder);
    for (const jar of jars) {
        fse.copyFileSync(path.join(sourceFolder, jar), path.join(targetFolder, path.basename(jar)));
    }
}

function isWin() {
    return /^win/.test(process.platform);
}

function mvnw() {
    return isWin()?"mvnw.cmd":"./mvnw";
}
