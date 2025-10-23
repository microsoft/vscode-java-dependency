package com.microsoft.jdtls.ext.core.parser;

import java.util.ArrayList;
import java.util.List;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
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
            if (javaProject == null || !javaProject.exists()) {
                return result;
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
     */
    private static void processLibraryEntry(List<DependencyInfo> result, IClasspathEntry entry, int libCount) {
        IPath libPath = entry.getPath();
        if (libPath != null) {
            result.add(new DependencyInfo("library_" + libCount, 
                libPath.lastSegment() + " (" + libPath.toOSString() + ")"));
        }
    }
    
    /**
     * Process a project reference classpath entry.
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
            result.add(new DependencyInfo(KEY_JRE_CONTAINER_PATH, containerPath));
            try {
                String vmInstallName = JavaRuntime.getVMInstallName(entry.getPath());
                addIfNotNull(result, KEY_JRE_CONTAINER, vmInstallName);
            } catch (Exception e) {
                // Ignore if unable to get VM install name
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
