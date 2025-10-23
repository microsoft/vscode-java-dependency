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
        // Add project name
        result.add(new DependencyInfo("projectName", project.getName()));
        
        // Add project location
        if (project.getLocation() != null) {
            result.add(new DependencyInfo("projectLocation", project.getLocation().toOSString()));
        }
        
        // Add JDK version
        String javaVersion = javaProject.getOption(JavaCore.COMPILER_COMPLIANCE, true);
        if (javaVersion != null) {
            result.add(new DependencyInfo("javaVersion", javaVersion));
        }
        
        // Add source compatibility
        String sourceCompliance = javaProject.getOption(JavaCore.COMPILER_SOURCE, true);
        if (sourceCompliance != null) {
            result.add(new DependencyInfo("sourceCompatibility", sourceCompliance));
        }
        
        // Add target compatibility
        String targetCompliance = javaProject.getOption(JavaCore.COMPILER_CODEGEN_TARGET_PLATFORM, true);
        if (targetCompliance != null) {
            result.add(new DependencyInfo("targetCompatibility", targetCompliance));
        }
        
        // Add module name if it's a modular project
        String moduleName = getModuleName(javaProject);
        if (moduleName != null) {
            result.add(new DependencyInfo("moduleName", moduleName));
        }
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
            result.add(new DependencyInfo("totalLibraries", String.valueOf(libCount)));
            result.add(new DependencyInfo("totalProjectReferences", String.valueOf(projectRefCount)));
            
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
            String libName = libPath.lastSegment();
            result.add(new DependencyInfo("library_" + libCount, 
                libName + " (" + libPath.toOSString() + ")"));
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
            result.add(new DependencyInfo("jreContainerPath", containerPath));
            // Try to extract JRE name from container path
            try {
                IPath containerIPath = entry.getPath();
                String vmInstallName = JavaRuntime.getVMInstallName(containerIPath);
                if (vmInstallName != null) {
                    result.add(new DependencyInfo("jreContainer", vmInstallName));
                }
            } catch (Exception e) {
                // Ignore if unable to get VM install name
            }
        } else if (containerPath.contains("MAVEN")) {
            result.add(new DependencyInfo("buildTool", "Maven"));
        } else if (containerPath.contains("GRADLE")) {
            result.add(new DependencyInfo("buildTool", "Gradle"));
        }
    }
    
    /**
     * Detect build tool by checking for build configuration files.
     */
    private static void detectBuildTool(List<DependencyInfo> result, IProject project) {
        if (project.getFile("pom.xml").exists()) {
            result.add(new DependencyInfo("buildTool", "Maven"));
        } else if (project.getFile("build.gradle").exists() || project.getFile("build.gradle.kts").exists()) {
            result.add(new DependencyInfo("buildTool", "Gradle"));
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
            return module == null ? null : module.getElementName();
        } catch (Exception e) {
            return null;
        }
    }
}
