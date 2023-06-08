// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license.

const cp = require('child_process');
const fse = require('fs-extra');
const path = require('path');

const server_dir = path.resolve('build-server-for-java');
if (!fse.existsSync(server_dir)) {
    cp.execSync('git clone https://github.com/microsoft/build-server-for-java.git', {stdio:[0,1,2]} );
}

cp.execSync(gradlew() + ' build -x test', {cwd:server_dir, stdio:[0,1,2]} );
cp.execSync(gradlew() + ' copyRuntimeLibs', {cwd:server_dir, stdio:[0,1,2]} );

copy(path.join(server_dir, 'server/build/libs'), path.resolve('jdtls.ext/com.microsoft.buildserver.adapter/bsp'), (file) => {
    return file.endsWith('.jar');
});

copy(path.join(server_dir, 'server/build/runtime-libs'), path.resolve('jdtls.ext/com.microsoft.buildserver.adapter/bsp/libs'), (file) => {
    return file.endsWith('.jar');
});

fse.removeSync(server_dir);

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

function gradlew() {
    return isWin()?"gradlew.bat":"./gradlew";
}