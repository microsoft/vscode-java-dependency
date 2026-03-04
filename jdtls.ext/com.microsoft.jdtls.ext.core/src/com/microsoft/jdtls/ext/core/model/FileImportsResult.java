package com.microsoft.jdtls.ext.core.model;

import java.util.List;

/**
 * L0: Import list for a Java file.
 * Returns classified imports without expanding class details.
 */
public class FileImportsResult {

    public String file;                  // relative file path
    public List<ImportEntry> imports;
    public List<StaticImportEntry> staticImports;
    public String error;                 // null if success

    public static class ImportEntry {
        public String name;             // fully qualified name: "com.example.model.Order"
        public String kind;             // "class" | "interface" | "enum" | "annotation" | "unknown"
        public String source;           // "project" | "external" | "jdk"
        public String artifact;         // only for "external": "spring-context", null for others

        public ImportEntry() {}

        public ImportEntry(String name, String kind, String source, String artifact) {
            this.name = name;
            this.kind = kind;
            this.source = source;
            this.artifact = artifact;
        }
    }

    public static class StaticImportEntry {
        public String name;             // "org.junit.Assert.assertEquals"
        public String memberKind;       // "method" | "field" | "unknown"
        public String source;           // "project" | "external" | "jdk"

        public StaticImportEntry() {}

        public StaticImportEntry(String name, String memberKind, String source) {
            this.name = name;
            this.memberKind = memberKind;
            this.source = source;
        }
    }
}
