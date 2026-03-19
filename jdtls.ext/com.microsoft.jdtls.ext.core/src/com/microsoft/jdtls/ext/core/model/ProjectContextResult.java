package com.microsoft.jdtls.ext.core.model;

/**
 * Structured result models for Java Context Tools.
 * These models are designed for AI consumption — small, structured, layered.
 * 
 * Design principles:
 * 1. Each result should serialize to < 200 tokens of JSON
 * 2. Use structured fields instead of freeform text
 * 3. Only include information the AI actually needs at this granularity level
 */

import java.util.List;

/**
 * L0: Project-level context overview.
 * First thing AI should request when entering a Java project.
 */
public class ProjectContextResult {

    public ProjectMeta project;
    public DependencySummary dependencies;
    public List<String> projectReferences;
    public String error; // null if success

    public static class ProjectMeta {
        public String name;
        public String buildTool;        // "Maven" | "Gradle" | "Unknown"
        public String javaVersion;      // compiler compliance level
        public String sourceLevel;
        public String targetLevel;
        public List<String> sourceRoots; // relative paths: ["src/main/java", "src/test/java"]
        public String moduleName;        // Java module name, null if not modular
    }

    public static class DependencySummary {
        public int total;
        public int directCount;
        public int transitiveCount;
        public List<String> direct;     // GAV strings: ["group:artifact:version", ...]
    }
}
