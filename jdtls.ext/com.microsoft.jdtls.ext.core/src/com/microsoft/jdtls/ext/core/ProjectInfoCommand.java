/*******************************************************************************
 * Copyright (c) 2025 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core;

import java.io.File;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.Path;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.launching.IVMInstall;
import org.eclipse.jdt.launching.JavaRuntime;

public class ProjectInfoCommand {

    /**
     * Get comprehensive project information including dependencies and build configuration.
     * Returns a Map containing key-value pairs of project information.
     *
     * @param arguments List containing project URI
     * @param monitor Progress monitor
     * @return Map containing all project details as key-value pairs
     */
    public static Map<String, Object> getProjectInfo(List<Object> arguments, IProgressMonitor monitor) {
        if (arguments == null || arguments.isEmpty()) {
            return null;
        }

        String projectUri = (String) arguments.get(0);
        IPath projectPath = getPathFromUri(projectUri);
        
        if (projectPath == null) {
            return null;
        }

        IProject project = findProject(projectPath);
        if (project == null || !project.isAccessible()) {
            return null;
        }

        IJavaProject javaProject = JavaCore.create(project);
        if (javaProject == null || !javaProject.exists()) {
            return null;
        }

        Map<String, Object> info = new HashMap<>();
        
        try {
            // Basic project info
            info.put("projectName", project.getName());
            info.put("projectPath", project.getLocation() != null ? project.getLocation().toOSString() : "");
            info.put("projectType", detectProjectType(project));

            // Java version and compliance settings
            populateJavaVersionInfo(javaProject, info);

            // Dependencies
            List<Map<String, String>> dependencies = new ArrayList<>();
            populateDependencies(javaProject, dependencies, monitor);
            info.put("dependencies", dependencies);

            // Source roots and output paths
            List<String> sourceRoots = new ArrayList<>();
            List<String> outputPaths = new ArrayList<>();
            populateSourceAndOutput(javaProject, sourceRoots, outputPaths);
            info.put("sourceRoots", sourceRoots);
            info.put("outputPaths", outputPaths);

            // Build tool version
            String buildToolVersion = detectBuildToolVersion(project, (String) info.get("projectType"));
            if (buildToolVersion != null) {
                info.put("buildToolVersion", buildToolVersion);
            }

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error getting project info", e);
        }

        return info;
    }

    private static IPath getPathFromUri(String uriString) {
        try {
            URI uri = URI.create(uriString);
            File file = new File(uri);
            return new Path(file.getAbsolutePath());
        } catch (Exception e) {
            // Try direct path
            return new Path(uriString);
        }
    }

    private static IProject findProject(IPath path) {
        IProject[] allProjects = ResourcesPlugin.getWorkspace().getRoot().getProjects();
        
        for (IProject project : allProjects) {
            if (!project.isAccessible() || project.getLocation() == null) {
                continue;
            }
            
            IPath projectLocation = project.getLocation();
            if (projectLocation.equals(path) || projectLocation.isPrefixOf(path) || path.isPrefixOf(projectLocation)) {
                return project;
            }
        }
        
        return null;
    }

    private static String detectProjectType(IProject project) {
        try {
            if (project.hasNature("org.eclipse.m2e.core.maven2Nature")) {
                return "Maven";
            } else if (project.hasNature("org.eclipse.buildship.core.gradleprojectnature")) {
                return "Gradle";
            }
        } catch (Exception e) {
            // Fallback to file detection
        }

        // Fallback to checking build files
        if (project.getFile("pom.xml").exists()) {
            return "Maven";
        } else if (project.getFile("build.gradle").exists() || project.getFile("build.gradle.kts").exists()) {
            return "Gradle";
        }

        return "Java";
    }

    private static void populateJavaVersionInfo(IJavaProject javaProject, Map<String, Object> info) throws JavaModelException {
        // Get Java compiler options
        Map<String, String> options = javaProject.getOptions(true);
        
        String complianceLevel = options.get(JavaCore.COMPILER_COMPLIANCE);
        String sourceLevel = options.get(JavaCore.COMPILER_SOURCE);
        String targetLevel = options.get(JavaCore.COMPILER_CODEGEN_TARGET_PLATFORM);
        
        info.put("complianceLevel", complianceLevel);
        info.put("sourceLevel", sourceLevel);
        info.put("targetLevel", targetLevel);

        // Get JVM information
        try {
            IVMInstall vmInstall = JavaRuntime.getVMInstall(javaProject);
            if (vmInstall != null) {
                String vmName = vmInstall.getName();
                String vmVersion = vmInstall.getVMInstallType().getName();
                String vmLocation = vmInstall.getInstallLocation() != null ? 
                    vmInstall.getInstallLocation().getAbsolutePath() : "";
                
                info.put("vmName", vmName);
                info.put("vmVersion", vmVersion);
                info.put("vmLocation", vmLocation);
                
                // Extract Java version from VM name or location
                if (vmName != null && vmName.contains("JavaSE-")) {
                    info.put("javaVersion", vmName.replace("JavaSE-", ""));
                } else if (sourceLevel != null) {
                    info.put("javaVersion", sourceLevel);
                }
            }
        } catch (Exception e) {
            // Use source level as fallback
            info.put("javaVersion", sourceLevel != null ? sourceLevel : "Unknown");
        }
    }

    private static void populateDependencies(IJavaProject javaProject, List<Map<String, String>> dependencies, IProgressMonitor monitor) 
            throws JavaModelException {
        
        Set<String> processedPaths = new HashSet<>();
        IClasspathEntry[] classpathEntries = javaProject.getResolvedClasspath(true);

        for (IClasspathEntry entry : classpathEntries) {
            if (monitor != null && monitor.isCanceled()) {
                break;
            }

            String path = entry.getPath().toOSString();
            
            // Avoid duplicates
            if (processedPaths.contains(path)) {
                continue;
            }
            processedPaths.add(path);

            switch (entry.getEntryKind()) {
                case IClasspathEntry.CPE_LIBRARY:
                    addLibraryDependency(entry, dependencies);
                    break;
                case IClasspathEntry.CPE_CONTAINER:
                    addContainerDependencies(javaProject, entry, dependencies, processedPaths);
                    break;
                case IClasspathEntry.CPE_PROJECT:
                    addProjectDependency(entry, dependencies);
                    break;
                case IClasspathEntry.CPE_VARIABLE:
                    addVariableDependency(entry, dependencies);
                    break;
                default:
                    break;
            }
        }
    }

    private static void addLibraryDependency(IClasspathEntry entry, List<Map<String, String>> dependencies) {
        IPath path = entry.getPath();
        String name = path.lastSegment();
        String fullPath = path.toOSString();

        Map<String, String> dep = new HashMap<>();
        dep.put("name", name);
        dep.put("path", fullPath);
        dep.put("type", "library");
        dep.put("scope", "compile");
        
        String version = extractVersionFromPath(fullPath);
        if (version != null) {
            dep.put("version", version);
        }
        
        dependencies.add(dep);
    }

    private static void addContainerDependencies(IJavaProject javaProject, IClasspathEntry entry, 
            List<Map<String, String>> dependencies, Set<String> processedPaths) {
        try {
            IClasspathEntry[] containerEntries = JavaCore.getClasspathContainer(entry.getPath(), javaProject)
                    .getClasspathEntries();
            
            for (IClasspathEntry containerEntry : containerEntries) {
                String path = containerEntry.getPath().toOSString();
                if (!processedPaths.contains(path)) {
                    processedPaths.add(path);
                    
                    IPath entryPath = containerEntry.getPath();
                    String name = entryPath.lastSegment();
                    
                    Map<String, String> dep = new HashMap<>();
                    dep.put("name", name);
                    dep.put("path", path);
                    dep.put("type", "container");
                    dep.put("scope", "compile");
                    
                    String version = extractVersionFromPath(path);
                    if (version != null) {
                        dep.put("version", version);
                    }
                    
                    dependencies.add(dep);
                }
            }
        } catch (Exception e) {
            // Skip if container cannot be resolved
        }
    }

    private static void addProjectDependency(IClasspathEntry entry, List<Map<String, String>> dependencies) {
        IPath path = entry.getPath();
        String name = path.lastSegment();
        
        Map<String, String> dep = new HashMap<>();
        dep.put("name", name);
        dep.put("path", path.toOSString());
        dep.put("type", "project");
        dep.put("scope", "compile");
        
        dependencies.add(dep);
    }

    private static void addVariableDependency(IClasspathEntry entry, List<Map<String, String>> dependencies) {
        IPath resolvedPath = JavaCore.getResolvedVariablePath(entry.getPath());
        if (resolvedPath != null) {
            String name = resolvedPath.lastSegment();
            String fullPath = resolvedPath.toOSString();
            
            Map<String, String> dep = new HashMap<>();
            dep.put("name", name);
            dep.put("path", fullPath);
            dep.put("type", "variable");
            dep.put("scope", "compile");
            
            String version = extractVersionFromPath(fullPath);
            if (version != null) {
                dep.put("version", version);
            }
            
            dependencies.add(dep);
        }
    }

    private static void populateSourceAndOutput(IJavaProject javaProject, List<String> sourceRoots, List<String> outputPaths) 
            throws JavaModelException {
        
        // Get source roots
        IClasspathEntry[] classpathEntries = javaProject.getRawClasspath();
        for (IClasspathEntry entry : classpathEntries) {
            if (entry.getEntryKind() == IClasspathEntry.CPE_SOURCE) {
                sourceRoots.add(entry.getPath().toOSString());
            }
        }

        // Get output location
        IPath outputLocation = javaProject.getOutputLocation();
        if (outputLocation != null) {
            outputPaths.add(outputLocation.toOSString());
        }
    }

    private static String extractVersionFromPath(String path) {
        if (StringUtils.isBlank(path)) {
            return null;
        }

        // Try to extract version from Maven-style path (.m2/repository/group/artifact/version/)
        if (path.contains(".m2") || path.contains("repository")) {
            String[] parts = path.replace('\\', '/').split("/");
            for (int i = 0; i < parts.length - 1; i++) {
                if (isVersionString(parts[i])) {
                    return parts[i];
                }
            }
        }

        // Try to extract version from filename (e.g., library-1.2.3.jar)
        String filename = new File(path).getName();
        if (filename.endsWith(".jar")) {
            filename = filename.substring(0, filename.length() - 4);
        }
        
        String[] parts = filename.split("-");
        for (int i = parts.length - 1; i >= 0; i--) {
            if (isVersionString(parts[i])) {
                return parts[i];
            }
        }

        return null;
    }

    private static boolean isVersionString(String str) {
        if (StringUtils.isBlank(str)) {
            return false;
        }
        // Check if string looks like a version (contains digits and dots/dashes)
        return str.matches(".*\\d+.*") && (str.contains(".") || str.matches("\\d+"));
    }

    private static String detectBuildToolVersion(IProject project, String projectType) {
        try {
            if ("Maven".equals(projectType)) {
                return detectMavenVersion(project);
            } else if ("Gradle".equals(projectType)) {
                return detectGradleVersion(project);
            }
        } catch (Exception e) {
            // Ignore and return null
        }
        return null;
    }

    private static String detectMavenVersion(IProject project) {
        // Try to read from .mvn/wrapper/maven-wrapper.properties
        File wrapperProps = new File(project.getLocation().toFile(), ".mvn/wrapper/maven-wrapper.properties");
        if (wrapperProps.exists()) {
            try {
                String content = new String(java.nio.file.Files.readAllBytes(wrapperProps.toPath()));
                String[] lines = content.split("\n");
                for (String line : lines) {
                    if (line.contains("distributionUrl") && line.contains("apache-maven")) {
                        int start = line.indexOf("apache-maven-") + 13;
                        int end = line.indexOf("-bin", start);
                        if (start > 13 && end > start) {
                            return line.substring(start, end);
                        }
                    }
                }
            } catch (Exception e) {
                // Ignore
            }
        }
        return "Unknown";
    }

    private static String detectGradleVersion(IProject project) {
        // Try to read from gradle/wrapper/gradle-wrapper.properties
        File wrapperProps = new File(project.getLocation().toFile(), "gradle/wrapper/gradle-wrapper.properties");
        if (wrapperProps.exists()) {
            try {
                String content = new String(java.nio.file.Files.readAllBytes(wrapperProps.toPath()));
                String[] lines = content.split("\n");
                for (String line : lines) {
                    if (line.contains("distributionUrl") && line.contains("gradle-")) {
                        int start = line.indexOf("gradle-") + 7;
                        int end = line.indexOf("-", start);
                        if (start > 7 && end > start) {
                            return line.substring(start, end);
                        }
                    }
                }
            } catch (Exception e) {
                // Ignore
            }
        }
        return "Unknown";
    }
}
