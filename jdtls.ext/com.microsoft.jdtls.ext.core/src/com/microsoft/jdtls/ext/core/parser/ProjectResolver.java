package com.microsoft.jdtls.ext.core.parser;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;

import com.microsoft.jdtls.ext.core.JdtlsExtActivator;

public class ProjectResolver {
    
    // Constants for dependency info keys
    private static final String KEY_BUILD_TOOL = "buildTool";
    private static final String KEY_PROJECT_NAME = "projectName";
    private static final String KEY_PROJECT_LOCATION = "projectLocation";
    private static final String KEY_JAVA_VERSION = "javaVersion";
    private static final String KEY_SOURCE_COMPATIBILITY = "sourceCompatibility";
    private static final String KEY_TARGET_COMPATIBILITY = "targetCompatibility";
    private static final String KEY_MODULE_NAME = "moduleName";
    private static final String KEY_TOTAL_LIBRARIES = "totalLibraries";
    private static final String KEY_TOTAL_PROJECT_REFS = "totalProjectReferences";
    private static final String KEY_JRE_CONTAINER_PATH = "jreContainerPath";
    private static final String KEY_JRE_CONTAINER = "jreContainer";
    
    public static class DependencyInfo {
        public String key;
        public String value;

        public DependencyInfo(String key, String value) {
            this.key = key;
            this.value = value;
        }
    }
    
    /**
     * Resolve project dependencies information including JDK version.
     * Supports both single projects and multi-module aggregator projects.
     * 
     * @param projectUri The project URI
     * @param monitor Progress monitor for cancellation support
     * @return List of DependencyInfo containing key-value pairs of project information
     */
    public static List<DependencyInfo> resolveProjectDependencies(String projectUri, IProgressMonitor monitor) {
        List<DependencyInfo> result = new ArrayList<>();
        
        try {
            IPath projectPath = ResourceUtils.canonicalFilePathFromURI(projectUri);
            
            // Find the project
            IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
            IProject project = findProjectByPath(root, projectPath);
            
            if (project == null || !project.isAccessible()) {
                return result;
            }
            
            IJavaProject javaProject = JavaCore.create(project);
            // Check if this is a Java project
            if (javaProject == null || !javaProject.exists()) {
                // Not a Java project - might be an aggregator/parent project
                // Try to find Java sub-projects under this path
                JdtlsExtActivator.logInfo("Not a Java project: " + project.getName() + 
                    ", checking for sub-projects");
                return resolveAggregatorProjectDependencies(root, projectPath, monitor);
            }
            
            // Add basic project information
            addBasicProjectInfo(result, project, javaProject);
            
            // Get classpath entries (dependencies)
            processClasspathEntries(result, javaProject, monitor);
            
            // Add build tool info by checking for build files
            detectBuildTool(result, project);
            
        } catch (Exception e) {
            JdtlsExtActivator.logException("Error in resolveProjectDependencies", e);
        }
        
        return result;
    }

    /**
     * Resolve dependencies for an aggregator/parent project by finding and processing all Java sub-projects.
     * This handles multi-module Maven/Gradle projects where the parent is not a Java project itself.
     * Returns aggregated information useful for AI context (Java version, common dependencies, build tool).
     * 
     * @param root The workspace root
     * @param parentPath The path of the parent/aggregator project
     * @param monitor Progress monitor
     * @return Aggregated dependency information from all sub-projects
     */
    private static List<DependencyInfo> resolveAggregatorProjectDependencies(
            IWorkspaceRoot root, IPath parentPath, IProgressMonitor monitor) {
        
        List<DependencyInfo> result = new ArrayList<>();
        List<IJavaProject> javaProjects = new ArrayList<>();
        
        // Find all Java projects under the parent path
        IProject[] allProjects = root.getProjects();
        for (IProject p : allProjects) {
            if (p.getLocation() != null && parentPath.isPrefixOf(p.getLocation())) {
                try {
                    if (p.isAccessible() && p.hasNature(JavaCore.NATURE_ID)) {
                        IJavaProject jp = JavaCore.create(p);
                        if (jp != null && jp.exists()) {
                            javaProjects.add(jp);
                        }
                    }
                } catch (CoreException e) {
                    // Skip this project
                }
            }
        }
        
        if (javaProjects.isEmpty()) {
            JdtlsExtActivator.logInfo("No Java sub-projects found under: " + parentPath.toOSString());
            return result;
        }
        
        JdtlsExtActivator.logInfo("Found " + javaProjects.size() + 
            " Java sub-project(s) under: " + parentPath.toOSString());
        
        // Mark as aggregator project
        result.add(new DependencyInfo("aggregatorProject", "true"));
        result.add(new DependencyInfo("totalSubProjects", String.valueOf(javaProjects.size())));
        
        // Collect sub-project names for reference
        StringBuilder projectNames = new StringBuilder();
        for (int i = 0; i < javaProjects.size(); i++) {
            if (i > 0) projectNames.append(", ");
            projectNames.append(javaProjects.get(i).getProject().getName());
        }
        result.add(new DependencyInfo("subProjectNames", projectNames.toString()));
        
        // Determine the primary/representative Java version (most common or highest)
        String primaryJavaVersion = determinePrimaryJavaVersion(javaProjects);
        if (primaryJavaVersion != null) {
            result.add(new DependencyInfo(KEY_JAVA_VERSION, primaryJavaVersion));
        }
        
        // Collect all unique libraries across sub-projects (top 10 most common)
        Map<String, Integer> libraryFrequency = collectLibraryFrequency(javaProjects, monitor);
        addTopLibraries(result, libraryFrequency, 10);
        
        // Detect build tool from parent directory
        IProject parentProject = findProjectByPath(root, parentPath);
        if (parentProject != null) {
            detectBuildTool(result, parentProject);
        }
        
        // Get JRE container info from first sub-project (usually consistent across modules)
        if (!javaProjects.isEmpty()) {
            extractJreInfo(result, javaProjects.get(0));
        }
        
        return result;
    }
    
    /**
     * Determine the primary Java version from all sub-projects.
     * Returns the most common version, or the highest if there's a tie.
     */
    private static String determinePrimaryJavaVersion(List<IJavaProject> javaProjects) {
        Map<String, Integer> versionCount = new ConcurrentHashMap<>();
        
        for (IJavaProject jp : javaProjects) {
            String version = jp.getOption(JavaCore.COMPILER_COMPLIANCE, true);
            if (version != null) {
                versionCount.put(version, versionCount.getOrDefault(version, 0) + 1);
            }
        }
        
        if (versionCount.isEmpty()) {
            return null;
        }
        
        // Find most common version (or highest if tie)
        return versionCount.entrySet().stream()
            .max((e1, e2) -> {
                int countCompare = Integer.compare(e1.getValue(), e2.getValue());
                if (countCompare != 0) return countCompare;
                // If same count, prefer higher version
                return e1.getKey().compareTo(e2.getKey());
            })
            .map(Map.Entry::getKey)
            .orElse(null);
    }
    
    /**
     * Collect frequency of all libraries across sub-projects.
     * Returns a map of library name to frequency count.
     */
    private static Map<String, Integer> collectLibraryFrequency(
            List<IJavaProject> javaProjects, IProgressMonitor monitor) {
        
        Map<String, Integer> libraryFrequency = new ConcurrentHashMap<>();
        
        for (IJavaProject jp : javaProjects) {
            if (monitor.isCanceled()) {
                break;
            }
            
            try {
                IClasspathEntry[] entries = jp.getResolvedClasspath(true);
                for (IClasspathEntry entry : entries) {
                    if (entry.getEntryKind() == IClasspathEntry.CPE_LIBRARY) {
                        IPath libPath = entry.getPath();
                        if (libPath != null) {
                            String libName = libPath.lastSegment();
                            libraryFrequency.put(libName, 
                                libraryFrequency.getOrDefault(libName, 0) + 1);
                        }
                    }
                }
            } catch (JavaModelException e) {
                // Skip this project
            }
        }
        
        return libraryFrequency;
    }
    
    /**
     * Add top N most common libraries to result.
     */
    private static void addTopLibraries(List<DependencyInfo> result, 
            Map<String, Integer> libraryFrequency, int topN) {
        
        if (libraryFrequency.isEmpty()) {
            result.add(new DependencyInfo(KEY_TOTAL_LIBRARIES, "0"));
            return;
        }
        
        // Sort by frequency (descending) and take top N
        List<Map.Entry<String, Integer>> topLibs = libraryFrequency.entrySet().stream()
            .sorted((e1, e2) -> Integer.compare(e2.getValue(), e1.getValue()))
            .limit(topN)
            .collect(java.util.stream.Collectors.toList());
        
        result.add(new DependencyInfo(KEY_TOTAL_LIBRARIES, 
            String.valueOf(libraryFrequency.size())));
        
        // Add top common libraries
        int index = 1;
        for (Map.Entry<String, Integer> entry : topLibs) {
            result.add(new DependencyInfo("commonLibrary_" + index, 
                entry.getKey() + " (used in " + entry.getValue() + " modules)"));
            index++;
        }
    }
    
    /**
     * Extract JRE container information from a Java project.
     */
    private static void extractJreInfo(List<DependencyInfo> result, IJavaProject javaProject) {
        try {
            IClasspathEntry[] entries = javaProject.getResolvedClasspath(true);
            for (IClasspathEntry entry : entries) {
                if (entry.getEntryKind() == IClasspathEntry.CPE_CONTAINER) {
                    String containerPath = entry.getPath().toString();
                    if (containerPath.contains("JRE_CONTAINER")) {
                        try {
                            String vmInstallName = JavaRuntime.getVMInstallName(entry.getPath());
                            addIfNotNull(result, KEY_JRE_CONTAINER, vmInstallName);
                            return;
                        } catch (Exception e) {
                            // Fallback: extract from path
                            if (containerPath.contains("JavaSE-")) {
                                int startIdx = containerPath.lastIndexOf("JavaSE-");
                                String version = containerPath.substring(startIdx);
                                if (version.contains("/")) {
                                    version = version.substring(0, version.indexOf("/"));
                                }
                                result.add(new DependencyInfo(KEY_JRE_CONTAINER, version));
                                return;
                            }
                        }
                    }
                }
            }
        } catch (JavaModelException e) {
            // Ignore
        }
    }
    
    /**
     * Find project by path from all projects in workspace.
     */
    private static IProject findProjectByPath(IWorkspaceRoot root, IPath projectPath) {
        IProject[] allProjects = root.getProjects();
        for (IProject p : allProjects) {
            if (p.getLocation() != null && p.getLocation().equals(projectPath)) {
                return p;
            }
        }
        return null;
    }
    
    /**
     * Add basic project information including name, location, and Java version settings.
     */
    private static void addBasicProjectInfo(List<DependencyInfo> result, IProject project, IJavaProject javaProject) {
        result.add(new DependencyInfo(KEY_PROJECT_NAME, project.getName()));
        
        addIfNotNull(result, KEY_PROJECT_LOCATION, 
            project.getLocation() != null ? project.getLocation().toOSString() : null);
        
        addIfNotNull(result, KEY_JAVA_VERSION, 
            javaProject.getOption(JavaCore.COMPILER_COMPLIANCE, true));
        
        addIfNotNull(result, KEY_SOURCE_COMPATIBILITY, 
            javaProject.getOption(JavaCore.COMPILER_SOURCE, true));
        
        addIfNotNull(result, KEY_TARGET_COMPATIBILITY, 
            javaProject.getOption(JavaCore.COMPILER_CODEGEN_TARGET_PLATFORM, true));
        
        addIfNotNull(result, KEY_MODULE_NAME, getModuleName(javaProject));
    }
    
    /**
     * Process classpath entries to extract library and project reference information.
     */
    private static void processClasspathEntries(List<DependencyInfo> result, IJavaProject javaProject, IProgressMonitor monitor) {
        try {
            IClasspathEntry[] classpathEntries = javaProject.getResolvedClasspath(true);
            int libCount = 0;
            int projectRefCount = 0;
            
            for (IClasspathEntry entry : classpathEntries) {
                if (monitor.isCanceled()) {
                    break;
                }
                
                switch (entry.getEntryKind()) {
                    case IClasspathEntry.CPE_LIBRARY:
                        libCount++;
                        processLibraryEntry(result, entry, libCount);
                        break;
                    case IClasspathEntry.CPE_PROJECT:
                        projectRefCount++;
                        processProjectEntry(result, entry, projectRefCount);
                        break;
                    case IClasspathEntry.CPE_CONTAINER:
                        processContainerEntry(result, entry);
                        break;
                }
            }
            
            // Add summary counts
            result.add(new DependencyInfo(KEY_TOTAL_LIBRARIES, String.valueOf(libCount)));
            result.add(new DependencyInfo(KEY_TOTAL_PROJECT_REFS, String.valueOf(projectRefCount)));
            
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error getting classpath entries", e);
        }
    }
    
    /**
     * Process a library classpath entry.
     * Only returns the library file name without full path to reduce data size.
     */
    private static void processLibraryEntry(List<DependencyInfo> result, IClasspathEntry entry, int libCount) {
        IPath libPath = entry.getPath();
        if (libPath != null) {
            // Only keep the file name, remove the full path
            result.add(new DependencyInfo("library_" + libCount, libPath.lastSegment()));
        }
    }
    
    /**
     * Process a project reference classpath entry.
     * Simplified to only extract essential information.
     */
    private static void processProjectEntry(List<DependencyInfo> result, IClasspathEntry entry, int projectRefCount) {
        IPath projectRefPath = entry.getPath();
        if (projectRefPath != null) {
            result.add(new DependencyInfo("projectReference_" + projectRefCount, 
                projectRefPath.lastSegment()));
        }
    }
    
    /**
     * Process a container classpath entry (JRE, Maven, Gradle containers).
     */
    private static void processContainerEntry(List<DependencyInfo> result, IClasspathEntry entry) {
        String containerPath = entry.getPath().toString();
        
        if (containerPath.contains("JRE_CONTAINER")) {
            // Only extract the JRE version, not the full container path
            try {
                String vmInstallName = JavaRuntime.getVMInstallName(entry.getPath());
                addIfNotNull(result, KEY_JRE_CONTAINER, vmInstallName);
            } catch (Exception e) {
                // Fallback: try to extract version from path
                if (containerPath.contains("JavaSE-")) {
                    int startIdx = containerPath.lastIndexOf("JavaSE-");
                    String version = containerPath.substring(startIdx);
                    // Clean up any trailing characters
                    if (version.contains("/")) {
                        version = version.substring(0, version.indexOf("/"));
                    }
                    result.add(new DependencyInfo(KEY_JRE_CONTAINER, version));
                }
            }
        } else if (containerPath.contains("MAVEN")) {
            result.add(new DependencyInfo(KEY_BUILD_TOOL, "Maven"));
        } else if (containerPath.contains("GRADLE")) {
            result.add(new DependencyInfo(KEY_BUILD_TOOL, "Gradle"));
        }
    }
    
    /**
     * Detect build tool by checking for build configuration files.
     * Only adds if not already detected from classpath containers.
     */
    private static void detectBuildTool(List<DependencyInfo> result, IProject project) {
        // Check if buildTool already set from container
        if (hasBuildToolInfo(result)) {
            return;
        }
        
        if (project.getFile("pom.xml").exists()) {
            result.add(new DependencyInfo(KEY_BUILD_TOOL, "Maven"));
        } else if (project.getFile("build.gradle").exists() || project.getFile("build.gradle.kts").exists()) {
            result.add(new DependencyInfo(KEY_BUILD_TOOL, "Gradle"));
        }
    }
    
    /**
     * Get module name for a Java project.
     */
    private static String getModuleName(IJavaProject project) {
        if (project == null || !JavaRuntime.isModularProject(project)) {
            return null;
        }
        try {
            org.eclipse.jdt.core.IModuleDescription module = project.getModuleDescription();
            return module != null ? module.getElementName() : null;
        } catch (Exception e) {
            return null;
        }
    }
    
    /**
     * Helper method to add dependency info only if value is not null.
     */
    private static void addIfNotNull(List<DependencyInfo> result, String key, String value) {
        if (value != null) {
            result.add(new DependencyInfo(key, value));
        }
    }
    
    /**
     * Check if buildTool info is already present in result list.
     */
    private static boolean hasBuildToolInfo(List<DependencyInfo> result) {
        for (DependencyInfo info : result) {
            if (KEY_BUILD_TOOL.equals(info.key)) {
                return true;
            }
        }
        return false;
    }
}
