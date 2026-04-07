package com.microsoft.jdtls.ext.core.model;

import java.util.List;

/**
 * L1: Detailed dependency information with query filtering.
 * AI calls this when it needs to investigate specific dependencies.
 */
public class DependencyDetailsResult {

    public List<DependencyEntry> dependencies;
    public String error;                 // null if success

    public static class DependencyEntry {
        public String groupId;           // "com.google.code.gson"
        public String artifactId;        // "gson"
        public String version;           // "2.10.1"
        public String scope;             // "compile" | "test" | "runtime" | "provided" | "system"
        public boolean isDirect;         // true = declared in pom.xml/build.gradle
        public String broughtBy;         // for transitive: "com.google.guava:guava:32.1.3-jre"
        public String jarFileName;       // "gson-2.10.1.jar"

        public DependencyEntry() {}

        public DependencyEntry(String groupId, String artifactId, String version,
                               String scope, boolean isDirect, String broughtBy,
                               String jarFileName) {
            this.groupId = groupId;
            this.artifactId = artifactId;
            this.version = version;
            this.scope = scope;
            this.isDirect = isDirect;
            this.broughtBy = broughtBy;
            this.jarFileName = jarFileName;
        }
    }
}
