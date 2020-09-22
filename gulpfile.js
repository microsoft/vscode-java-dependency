'use strict';
const gulp = require('gulp');
const gulp_tslint = require('gulp-tslint');
const cp = require('child_process');

const server_dir = './jdtls.ext';

gulp.task('tslint', () => {
    return gulp.src(['**/*.ts', '!**/*.d.ts', '!node_modules/**'])
      .pipe(gulp_tslint())
      .pipe(gulp_tslint.report());
});

gulp.task('build_server', ()=>
{
  cp.execSync(mvnw()+ ' clean package', {cwd:server_dir, stdio:[0,1,2]} );
  
  return gulp.src([
      server_dir + '/com.microsoft.jdtls.ext.core/target/com.microsoft.jdtls.ext.core*.jar',
      server_dir + '/com.microsoft.jdtls.ext.activator/target/com.microsoft.jdtls.ext.activator*.jar',
    ])
    .pipe(gulp.dest('./server'))
});


function isWin() {
    return /^win/.test(process.platform);
}

function isMac() {
    return /^darwin/.test(process.platform);
}

function isLinux() {
    return /^linux/.test(process.platform);
}

function mvnw() {
    return isWin()?"mvnw.cmd":"./mvnw";
}
