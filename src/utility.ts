import * as child_process from "child_process";
import * as findJavaHome from "find-java-home";
import * as fse from "fs-extra";
import * as path from "path";
import { Uri, window, workspace, WorkspaceFolder } from "vscode";
import * as xml2js from "xml2js";

export class Utility {

    public static isThenable<T>(obj: any): obj is Thenable<T> {
        return obj && typeof (<Thenable<any>>obj).then === "function";
    }

    public static checkJavaVersion(javaHome: string): Promise<number> {
        return new Promise((resolve, reject) => {
            child_process.execFile(javaHome + "/bin/java", ["-version"], {}, (error, stdout, stderr) => {
                const javaVersion: number = this.parseMajorVersion(stderr);
                if (javaVersion < 8) {
                    this.openJDKDownload(reject, "Java 8 or more recent is required to run. Please download and install a recent JDK");
                } else {
                    resolve(javaVersion);
                }
            });
        });
    }

    public static checkJavaRuntime(): Promise<string> {
        const isWindows = process.platform.indexOf("win") === 0;
        const JAVAC_FILENAME = "javac" + (isWindows ? ".exe" : "");
        return new Promise(async (resolve, reject) => {
            let source: string;
            let javaHome: string = this.readJavaConfig();
            if (javaHome) {
                source = "The java.home variable defined in VS Code settings";
            } else {
                javaHome = process.env.JDK_HOME;
                if (javaHome) {
                    source = "The JDK_HOME environment variable";
                } else {
                    javaHome = process.env.JAVA_HOME;
                    source = "The JAVA_HOME environment variable";
                }
            }
            if (javaHome) {
                if (!await fse.pathExists(javaHome)) {
                    this.openJDKDownload(reject, source + " points to a missing folder");
                }
                if (!await fse.pathExists(path.resolve(javaHome, "bin", JAVAC_FILENAME))) {
                    this.openJDKDownload(reject, source + " does not point to a JDK.");
                }
                return resolve(javaHome);
            }
            // No settings, let"s try to detect as last resort.
            findJavaHome((err, home) => {
                if (err) {
                    this.openJDKDownload(reject, "Java runtime could not be located");
                } else {
                    resolve(home);
                }
            });
        });
    }

    public static async parseXml(xml: string): Promise<any> {
        return new Promise((resolve: (obj: {}) => void, reject: (e: Error) => void): void => {
            xml2js.parseString(xml, { explicitArray: true }, (err: Error, res: {}) => {
                if (err) {
                    return reject(err);
                }
                return resolve(res);
            });
        });
    }

    public static getDefaultWorkspaceFolder(): WorkspaceFolder | undefined {
        const workspaceFolders: WorkspaceFolder[] | undefined = workspace.workspaceFolders;
        if (workspaceFolders === undefined) {
            return undefined;
        }
        if (workspaceFolders.length === 1) {
            return workspaceFolders[0];
        }
        if (window.activeTextEditor) {
            const activeWorkspaceFolder: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(window.activeTextEditor.document.uri);
            return activeWorkspaceFolder;
        }
        return undefined;
    }

    private static openJDKDownload(reject, cause) {
        let jdkUrl = "http://developers.redhat.com/products/openjdk/overview/?from=vscode";
        if (process.platform === "darwin") {
            jdkUrl = "http://www.oracle.com/technetwork/java/javase/downloads/index.html";
        }
        reject({
            message: cause,
            label: "Get Java Development Kit",
            openUrl: Uri.parse(jdkUrl),
            replaceClose: false,
        });
    }

    private static parseMajorVersion(content: string) {
        let regexp = /version "(.*)"/g;
        let match = regexp.exec(content);
        if (!match) {
            return 0;
        }
        let version = match[1];
        // Ignore "1." prefix for legacy Java versions
        if (version.startsWith("1.")) {
            version = version.substring(2);
        }
        // look into the interesting bits now
        regexp = /\d+/g;
        match = regexp.exec(version);
        let javaVersion = 0;
        if (match) {
            // tslint:disable-next-line:radix
            javaVersion = parseInt(match[0]);
        }
        return javaVersion;
    }

    private static readJavaConfig() {
        const config = workspace.getConfiguration();
        return config.get<string>("java.home", null);
    }
}
