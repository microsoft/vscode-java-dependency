/*******************************************************************************
 * Copyright (c) 2018 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core;

import static org.eclipse.jdt.internal.jarpackager.JarPackageUtil.writeArchive;
import static org.eclipse.jdt.internal.jarpackager.JarPackageUtil.writeFile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.jar.Attributes;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.zip.ZipFile;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IMarker;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IResourceVisitor;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.MultiStatus;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.core.runtime.Path;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.IModuleDescription;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.core.search.IJavaSearchConstants;
import org.eclipse.jdt.core.search.IJavaSearchScope;
import org.eclipse.jdt.core.search.SearchEngine;
import org.eclipse.jdt.core.search.SearchMatch;
import org.eclipse.jdt.core.search.SearchParticipant;
import org.eclipse.jdt.core.search.SearchPattern;
import org.eclipse.jdt.core.search.SearchRequestor;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.jdt.ls.core.internal.managers.ProjectsManager;
import org.eclipse.jdt.ls.core.internal.managers.UpdateClasspathJob;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences.ReferencedLibraries;
import org.eclipse.lsp4j.jsonrpc.json.adapters.CollectionTypeAdapter;
import org.eclipse.lsp4j.jsonrpc.json.adapters.EnumTypeAdapter;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.microsoft.jdtls.ext.core.model.PackageNode;

public final class ProjectCommand {

    private static String COMMAND_EXPORT_JAR_REPORT = "java.view.package.exportJarReport";

    private static class MainClassInfo {
        public String name;
        public String path;

        public MainClassInfo(String name, String path) {
            this.name = name;
            this.path = path;
        }
    }

    /**
     * ImportClassInfo - Conforms to Copilot CodeSnippet format
     * Used to provide Java class context information and JavaDoc to Copilot
     */
    private static class ImportClassInfo {
        public String uri;           // File URI (required)
        public String className;     // Human-readable class description with JavaDoc appended (required)

        public ImportClassInfo(String uri, String className) {
            this.uri = uri;
            this.className = className;
        }
    }

    private static class Classpath {
        public String source;
        public String destination;
        public boolean isArtifact;
    }

    private static final Gson gson = new GsonBuilder().registerTypeAdapterFactory(new CollectionTypeAdapter.Factory())
            .registerTypeAdapterFactory(new EnumTypeAdapter.Factory()).create();

    public static List<PackageNode> listProjects(List<Object> arguments, IProgressMonitor monitor) {
        String workspaceUri = (String) arguments.get(0);
        IPath workspaceFolderPath = ResourceUtils.canonicalFilePathFromURI(workspaceUri);

        IProject[] projects;
        boolean filterNonJava = false;
        if (arguments.size() > 1) {
            filterNonJava = (boolean) arguments.get(1);
        }
        if (!filterNonJava) {
            projects = ProjectUtils.getAllProjects();
        } else {
            projects = Arrays.stream(ProjectUtils.getJavaProjects())
                    .map(IJavaProject::getProject).toArray(IProject[]::new);
        }

        ArrayList<PackageNode> children = new ArrayList<>();
        for (IProject project : projects) {
            if (!project.isAccessible() || project.getLocation() == null) {
                continue;
            }

            // ignore default projects
            if (Objects.equals(project.getName(), ProjectsManager.DEFAULT_PROJECT_NAME)) {
                continue;
            }

            PackageNode projectNode = PackageNode.createNodeForProject(JavaCore.create(project));

            if (!workspaceFolderPath.isPrefixOf(project.getLocation())) {
                LinkedFolderVisitor visitor = new LinkedFolderVisitor(workspaceFolderPath);
                try {
                    project.accept(visitor, IResource.DEPTH_ONE, false);
                } catch (CoreException e) {
                    JdtlsExtActivator.log(e);
                    continue;
                }

                if (!visitor.isBelongsToWorkspace()) {
                    continue;
                }

                // set the folder name as the project name when the project location
                // is out of the workspace folder.
                projectNode.setDisplayName(workspaceFolderPath.lastSegment());
            }
            children.add(projectNode);
        }
        return children;
    }

    public static boolean refreshLibraries(List<Object> arguments, IProgressMonitor monitor) {
        String workspaceUri = (String) arguments.get(0);
        IPath workspacePath = ResourceUtils.canonicalFilePathFromURI(workspaceUri);
        String projectName = ProjectUtils.getWorkspaceInvisibleProjectName(workspacePath);
        IProject project = getWorkspaceRoot().getProject(projectName);
        try {
            ReferencedLibraries libraries = JavaLanguageServerPlugin.getPreferencesManager().getPreferences()
                    .getReferencedLibraries();
            UpdateClasspathJob.getInstance().updateClasspath(JavaCore.create(project), libraries);
            return true;
        } catch (Exception e) {
            JavaLanguageServerPlugin.logException("Exception occurred during waiting for classpath to be updated", e);
            return false;
        }
    }

    private static IWorkspaceRoot getWorkspaceRoot() {
        return ResourcesPlugin.getWorkspace().getRoot();
    }

    public static boolean exportJar(List<Object> arguments, IProgressMonitor monitor) {
        if (arguments.size() < 4) {
            return false;
        }
        String mainClass = gson.fromJson(gson.toJson(arguments.get(0)), String.class);
        Classpath[] classpaths = gson.fromJson(gson.toJson(arguments.get(1)), Classpath[].class);
        String destination = gson.fromJson(gson.toJson(arguments.get(2)), String.class);
        String terminalId = gson.fromJson(gson.toJson(arguments.get(3)), String.class);
        try {
            return exportJarExecution(mainClass, classpaths, destination, terminalId, monitor);
        } catch (OperationCanceledException e) {
            File jarFile = new File(destination);
            if (jarFile.exists()) {
                jarFile.delete();
            }
        }
        return false;
    }

    private static boolean exportJarExecution(String mainClass, Classpath[] classpaths, String destination,
            String terminalId, IProgressMonitor monitor) throws OperationCanceledException {
        Manifest manifest = new Manifest();
        manifest.getMainAttributes().put(Attributes.Name.MANIFEST_VERSION, "1.0");
        if (mainClass.length() > 0) {
            manifest.getMainAttributes().put(Attributes.Name.MAIN_CLASS, mainClass);
        }
        try (JarOutputStream target = new JarOutputStream(new FileOutputStream(destination), manifest)) {
            Set<String> directories = new HashSet<>();
            for (Classpath classpath : classpaths) {
                if (monitor.isCanceled()) {
                    return false;
                }
                if (classpath.isArtifact) {
                    MultiStatus resultStatus = writeArchive(new ZipFile(classpath.source),
                            /* areDirectoryEntriesIncluded = */true, /* isCompressed = */true, target, directories,
                            monitor);
                    int severity = resultStatus.getSeverity();
                    if (severity == IStatus.OK) {
                        java.nio.file.Path path = java.nio.file.Paths.get(classpath.source);
                        reportExportJarMessage(terminalId, IStatus.OK,
                                "Successfully extracted the file to the exported jar: "
                                        + path.getFileName().toString());
                        continue;
                    }
                    if (resultStatus.isMultiStatus()) {
                        for (IStatus childStatus : resultStatus.getChildren()) {
                            reportExportJarMessage(terminalId, severity, childStatus.getMessage());
                        }
                    } else {
                        reportExportJarMessage(terminalId, severity, resultStatus.getMessage());
                    }
                } else {
                    try {
                        writeFile(new File(classpath.source), new Path(classpath.destination), /*
                                                                                                * areDirectoryEntriesIncluded
                                                                                                * =
                                                                                                */true,
                                /* isCompressed = */true, target, directories);
                        reportExportJarMessage(terminalId, IStatus.OK,
                                "Successfully added the file to the exported jar: " + classpath.destination);
                    } catch (CoreException e) {
                        reportExportJarMessage(terminalId, IStatus.ERROR, e.getMessage());
                    }
                }
            }
        } catch (IOException e) {
            reportExportJarMessage(terminalId, IStatus.ERROR, e.getMessage());
            return false;
        }
        return true;
    }

    public static List<MainClassInfo> getMainClasses(List<Object> arguments, IProgressMonitor monitor)
            throws Exception {
        List<Object> args = new ArrayList<>(arguments);
        if (args.size() <= 1) {
            args.add(Boolean.TRUE);
        } else {
            args.set(1, Boolean.TRUE);
        }
        List<PackageNode> projectList = listProjects(args, monitor);
        if (projectList.size() == 0) {
            return Collections.emptyList();
        }
        final List<MainClassInfo> res = new ArrayList<>();
        List<IJavaProject> javaProjects = new ArrayList<>();
        for (PackageNode project : projectList) {
            IJavaProject javaProject = PackageCommand.getJavaProject(project.getUri());
            if (javaProject != null && javaProject.exists()) {
                javaProjects.add(javaProject);
            }
        }
        int includeMask = IJavaSearchScope.SOURCES;
        IJavaSearchScope scope = SearchEngine.createJavaSearchScope(javaProjects.toArray(new IJavaProject[0]),
                includeMask);
        SearchPattern pattern1 = SearchPattern.createPattern("main(String[]) void", IJavaSearchConstants.METHOD,
                IJavaSearchConstants.DECLARATIONS, SearchPattern.R_CASE_SENSITIVE | SearchPattern.R_EXACT_MATCH);
        SearchPattern pattern2 = SearchPattern.createPattern("main() void", IJavaSearchConstants.METHOD,
                IJavaSearchConstants.DECLARATIONS, SearchPattern.R_CASE_SENSITIVE | SearchPattern.R_EXACT_MATCH);
        SearchPattern pattern = SearchPattern.createOrPattern(pattern1, pattern2);
        SearchRequestor requestor = new SearchRequestor() {
            @Override
            public void acceptSearchMatch(SearchMatch match) {
                Object element = match.getElement();
                if (!(element instanceof IMethod)) {
                    return;
                }
                IMethod method = (IMethod) element;
                try {
                    if (!method.isMainMethod() || method.getResource() == null || method.getJavaProject() == null) {
                        return;
                    }
                    String mainClass = method.getDeclaringType().getFullyQualifiedName();
                    String filePath = "";
                    if (match.getResource() instanceof IFile) {
                        filePath = match.getResource().getLocation().toOSString();
                    }
                    res.add(new MainClassInfo(mainClass, filePath));
                } catch (JavaModelException e) {
                    // ignore
                }
            }
        };
        SearchEngine searchEngine = new SearchEngine();
        try {
            searchEngine.search(pattern, new SearchParticipant[] { SearchEngine.getDefaultSearchParticipant() }, scope,
                    requestor, monitor);
        } catch (CoreException e) {
            // ignore
        }
        return res;
    }

    public static String getModuleName(IJavaProject project) {
        if (project == null || !JavaRuntime.isModularProject(project)) {
            return null;
        }
        try {
            IModuleDescription module = project.getModuleDescription();
            return module == null ? null : module.getElementName();
        } catch (CoreException e) {
            return null;
        }
    }

    public static boolean checkImportStatus() {
        IProject[] projects = ProjectUtils.getAllProjects();
        boolean hasError = false;
        for (IProject project : projects) {
            if (ProjectsManager.DEFAULT_PROJECT_NAME.equals(project.getName())) {
                continue;
            }

            // if a Java project found, we think it as success import now.
            if (ProjectUtils.isJavaProject(project)) {
                return false;
            }

            try {
                int maxProblemSeverity = project.findMaxProblemSeverity(null, true, IResource.DEPTH_ONE);
                if (maxProblemSeverity == IMarker.SEVERITY_ERROR) {
                    hasError = true;
                    break;
                }
            } catch (CoreException e) {
                JdtlsExtActivator.log(e);
            }
        }

        return hasError;
    }

    public static List<ImportClassInfo> getImportClassContent(List<Object> arguments, IProgressMonitor monitor) {
        if (arguments == null || arguments.isEmpty()) {
            return Collections.emptyList();
        }

        try {
            String fileUri = (String) arguments.get(0);

            // Parse URI manually to avoid restricted API
            java.net.URI uri = new java.net.URI(fileUri);
            String filePath = uri.getPath();
            if (filePath == null) {
                return Collections.emptyList();
            }

            IPath path = new Path(filePath);

            // Get the file resource
            IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
            IFile file = root.getFileForLocation(path);
            if (file == null || !file.exists()) {
                return Collections.emptyList();
            }

            // Get the Java project
            IJavaProject javaProject = JavaCore.create(file.getProject());
            if (javaProject == null || !javaProject.exists()) {
                return Collections.emptyList();
            }

            // Find the compilation unit
            IJavaElement javaElement = JavaCore.create(file);
            if (!(javaElement instanceof org.eclipse.jdt.core.ICompilationUnit)) {
                return Collections.emptyList();
            }

            org.eclipse.jdt.core.ICompilationUnit compilationUnit = (org.eclipse.jdt.core.ICompilationUnit) javaElement;

            // Parse imports and resolve local project files
            List<ImportClassInfo> classInfoList = new ArrayList<>();

            // Get all imports from the compilation unit
            org.eclipse.jdt.core.IImportDeclaration[] imports = compilationUnit.getImports();
            Set<String> processedTypes = new HashSet<>();

            for (org.eclipse.jdt.core.IImportDeclaration importDecl : imports) {
                if (monitor.isCanceled()) {
                    break;
                }

                String importName = importDecl.getElementName();
                boolean isStatic = (importDecl.getFlags() & org.eclipse.jdt.core.Flags.AccStatic) != 0;
                
                if (isStatic) {
                    // Handle static imports
                    resolveStaticImport(javaProject, importName, classInfoList, processedTypes, monitor);
                } else if (importName.endsWith(".*")) {
                    // Handle package imports
                    String packageName = importName.substring(0, importName.length() - 2);
                    resolvePackageTypes(javaProject, packageName, classInfoList, processedTypes, monitor);
                } else {
                    // Handle single type imports
                    resolveSingleType(javaProject, importName, classInfoList, processedTypes, monitor);
                }
            }

            return classInfoList;

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error in resolveCopilotRequest", e);
            return Collections.emptyList();
        }
    }

    private static void resolveSingleType(IJavaProject javaProject, String typeName, List<ImportClassInfo> classInfoList,
            Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            if (processedTypes.contains(typeName)) {
                return;
            }
            processedTypes.add(typeName);

            // Extract package and simple name from the fully qualified type name
            int lastDotIndex = typeName.lastIndexOf('.');
            if (lastDotIndex == -1) {
                // Default package or invalid type name
                return;
            }
            
            String packageName = typeName.substring(0, lastDotIndex);
            String simpleName = typeName.substring(lastDotIndex + 1);
            
            // Strategy: Use JDT's global type resolution first (comprehensive), 
            // then fallback to manual package fragment traversal if needed
            
            // Primary path: Use JDT's findType which searches all sources and dependencies
            try {
                org.eclipse.jdt.core.IType type = javaProject.findType(typeName);
                if (type != null && type.exists()) {
                    // Found type - check if it's a source type we want to process
                    if (!type.isBinary()) {
                        // Source type found - extract information and return
                        extractTypeInfo(type, classInfoList, monitor);
                        return;
                    }
                    // Note: Binary types (from JARs/JRE) are intentionally ignored
                    // as they don't provide useful context for code completion
                }
            } catch (JavaModelException e) {
                JdtlsExtActivator.logException("Error in primary type search: " + typeName, e);
                // Continue to fallback method
            }
            
            // Fallback path: Manual search in local source package fragments
            // This is used when findType() doesn't return results or fails
            IPackageFragmentRoot[] packageRoots = javaProject.getPackageFragmentRoots();
            for (IPackageFragmentRoot packageRoot : packageRoots) {
                if (packageRoot.getKind() == IPackageFragmentRoot.K_SOURCE) {
                    org.eclipse.jdt.core.IPackageFragment packageFragment = packageRoot.getPackageFragment(packageName);
                    if (packageFragment != null && packageFragment.exists()) {
                        // Look for compilation unit with matching name
                        org.eclipse.jdt.core.ICompilationUnit cu = packageFragment.getCompilationUnit(simpleName + ".java");
                        if (cu != null && cu.exists() && cu.getResource() != null && cu.getResource().exists()) {
                            // Get primary type from compilation unit
                            org.eclipse.jdt.core.IType primaryType = cu.findPrimaryType();
                            if (primaryType != null && primaryType.exists() && 
                                typeName.equals(primaryType.getFullyQualifiedName())) {
                                // Found local project source type via fallback method
                                extractTypeInfo(primaryType, classInfoList, monitor);
                                return;
                            }
                            
                            // Also check for inner types in the compilation unit
                            org.eclipse.jdt.core.IType[] allTypes = cu.getAllTypes();
                            for (org.eclipse.jdt.core.IType type : allTypes) {
                                if (typeName.equals(type.getFullyQualifiedName())) {
                                    extractTypeInfo(type, classInfoList, monitor);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        } catch (JavaModelException e) {
            // Log but continue processing other types
            JdtlsExtActivator.logException("Error resolving type: " + typeName, e);
        }
    }

    private static void resolveStaticImport(IJavaProject javaProject, String staticImportName, List<ImportClassInfo> classInfoList,
            Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            if (staticImportName.endsWith(".*")) {
                // Static import of all static members from a class: import static MyClass.*;
                String className = staticImportName.substring(0, staticImportName.length() - 2);
                resolveStaticMembersFromClass(javaProject, className, classInfoList, processedTypes, monitor);
            } else {
                // Static import of specific member: import static MyClass.myMethod;
                int lastDotIndex = staticImportName.lastIndexOf('.');
                if (lastDotIndex > 0) {
                    String className = staticImportName.substring(0, lastDotIndex);
                    String memberName = staticImportName.substring(lastDotIndex + 1);
                    resolveStaticMemberFromClass(javaProject, className, memberName, classInfoList, processedTypes, monitor);
                }
            }
        } catch (Exception e) {
            JdtlsExtActivator.logException("Error resolving static import: " + staticImportName, e);
        }
    }

    private static void resolveStaticMembersFromClass(IJavaProject javaProject, String className, 
            List<ImportClassInfo> classInfoList, Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            // First resolve the class itself to get context information
            resolveSingleType(javaProject, className, classInfoList, processedTypes, monitor);
            
            // Find the type and extract its static members
            org.eclipse.jdt.core.IType type = javaProject.findType(className);
            if (type != null && type.exists() && !type.isBinary()) {
                StringBuilder description = new StringBuilder();
                description.append("Static Import: ").append(className).append(".*\n");
                description.append("All static members from ").append(className).append("\n\n");
                
                // Get static methods
                IMethod[] methods = type.getMethods();
                List<String> staticMethodSigs = new ArrayList<>();
                for (IMethod method : methods) {
                    int flags = method.getFlags();
                    if (org.eclipse.jdt.core.Flags.isStatic(flags) && org.eclipse.jdt.core.Flags.isPublic(flags)) {
                        if (staticMethodSigs.size() < 10) {
                            staticMethodSigs.add(generateMethodSignature(method));
                        }
                    }
                }
                
                // Get static fields
                org.eclipse.jdt.core.IField[] fields = type.getFields();
                List<String> staticFieldSigs = new ArrayList<>();
                for (org.eclipse.jdt.core.IField field : fields) {
                    int flags = field.getFlags();
                    if (org.eclipse.jdt.core.Flags.isStatic(flags) && org.eclipse.jdt.core.Flags.isPublic(flags)) {
                        if (staticFieldSigs.size() < 10) {
                            staticFieldSigs.add(generateFieldSignature(field));
                        }
                    }
                }
                
                if (!staticMethodSigs.isEmpty()) {
                    description.append("Static Methods:\n");
                    for (String sig : staticMethodSigs) {
                        description.append("  - ").append(sig).append("\n");
                    }
                    description.append("\n");
                }
                
                if (!staticFieldSigs.isEmpty()) {
                    description.append("Static Fields:\n");
                    for (String sig : staticFieldSigs) {
                        description.append("  - ").append(sig).append("\n");
                    }
                }
                
                String uri = getTypeUri(type);
                if (uri != null) {
                    classInfoList.add(new ImportClassInfo(uri, description.toString()));
                }
            }
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error resolving static members from: " + className, e);
        }
    }

    private static void resolveStaticMemberFromClass(IJavaProject javaProject, String className, String memberName,
            List<ImportClassInfo> classInfoList, Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            // First resolve the class itself
            resolveSingleType(javaProject, className, classInfoList, processedTypes, monitor);
            
            // Find the specific static member
            org.eclipse.jdt.core.IType type = javaProject.findType(className);
            if (type != null && type.exists() && !type.isBinary()) {
                StringBuilder description = new StringBuilder();
                description.append("Static Import: ").append(className).append(".").append(memberName).append("\n\n");
                
                boolean found = false;
                
                // Check if it's a method
                IMethod[] methods = type.getMethods();
                for (IMethod method : methods) {
                    if (method.getElementName().equals(memberName)) {
                        int flags = method.getFlags();
                        if (org.eclipse.jdt.core.Flags.isStatic(flags)) {
                            description.append("Static Method:\n");
                            description.append("  - ").append(generateMethodSignature(method)).append("\n");
                            found = true;
                            break;
                        }
                    }
                }
                
                // Check if it's a field
                if (!found) {
                    org.eclipse.jdt.core.IField[] fields = type.getFields();
                    for (org.eclipse.jdt.core.IField field : fields) {
                        if (field.getElementName().equals(memberName)) {
                            int flags = field.getFlags();
                            if (org.eclipse.jdt.core.Flags.isStatic(flags)) {
                                description.append("Static Field:\n");
                                description.append("  - ").append(generateFieldSignature(field)).append("\n");
                                found = true;
                                break;
                            }
                        }
                    }
                }
                
                if (found) {
                    String uri = getTypeUri(type);
                    if (uri != null) {
                        classInfoList.add(new ImportClassInfo(uri, description.toString()));
                    }
                }
            }
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error resolving static member: " + className + "." + memberName, e);
        }
    }

    private static void resolvePackageTypes(IJavaProject javaProject, String packageName, List<ImportClassInfo> classInfoList,
            Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            // Find all package fragments with this name
            IPackageFragmentRoot[] packageRoots = javaProject.getPackageFragmentRoots();
            for (IPackageFragmentRoot packageRoot : packageRoots) {
                if (packageRoot.getKind() == IPackageFragmentRoot.K_SOURCE) {
                    org.eclipse.jdt.core.IPackageFragment packageFragment = packageRoot.getPackageFragment(packageName);
                    if (packageFragment != null && packageFragment.exists()) {
                        // Get all compilation units in this package
                        org.eclipse.jdt.core.ICompilationUnit[] compilationUnits = packageFragment
                                .getCompilationUnits();
                        for (org.eclipse.jdt.core.ICompilationUnit cu : compilationUnits) {
                            // Get all types in the compilation unit
                            org.eclipse.jdt.core.IType[] types = cu.getAllTypes();
                            for (org.eclipse.jdt.core.IType type : types) {
                                String fullTypeName = type.getFullyQualifiedName();
                                if (!processedTypes.contains(fullTypeName)) {
                                    processedTypes.add(fullTypeName);
                                    extractTypeInfo(type, classInfoList, monitor);
                                }
                            }
                        }
                    }
                }
            }
        } catch (JavaModelException e) {
            // Log but continue processing
            JdtlsExtActivator.logException("Error resolving package: " + packageName, e);
        }
    }

    /**
     * Extract type information and generate ImportClassInfo conforming to Copilot CodeSnippet format
     * Also extracts JavaDoc if available and appends it to the class description
     * Improved version: generates human-readable class descriptions with integrated JavaDoc
     */
    private static void extractTypeInfo(org.eclipse.jdt.core.IType type, List<ImportClassInfo> classInfoList, 
            IProgressMonitor monitor) {
        try {
            // Get file URI
            String uri = getTypeUri(type);
            if (uri == null) {
                return;
            }
            
            // Generate human-readable class description
            String description = generateClassDescription(type);
            
            // Extract JavaDoc (MVP: class-level only) and append to description
            String javadoc = extractClassJavaDoc(type, monitor);
            if (javadoc != null && !javadoc.isEmpty()) {
                description = description + "\n" + javadoc;
            }
            
            // Create ImportClassInfo (conforms to Copilot CodeSnippet format)
            ImportClassInfo info = new ImportClassInfo(uri, description);
            classInfoList.add(info);
            
            // Recursively process nested types
            org.eclipse.jdt.core.IType[] nestedTypes = type.getTypes();
            for (org.eclipse.jdt.core.IType nestedType : nestedTypes) {
                extractTypeInfo(nestedType, classInfoList, monitor);
            }
            
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error extracting type info for: " + type.getElementName(), e);
        }
    }

    /**
     * Extract class-level JavaDoc and convert to plain text
     * Returns null if no JavaDoc is available
     * 
     * Note: For source types, extracts from source comments using getJavadocRange()
     *       For binary types (JARs), uses getAttachedJavadoc() which requires javadoc.jar
     */
    private static String extractClassJavaDoc(org.eclipse.jdt.core.IType type, IProgressMonitor monitor) {
        try {
            // For source types: Read JavaDoc directly from source comments
            if (!type.isBinary()) {
                org.eclipse.jdt.core.ISourceRange javadocRange = type.getJavadocRange();
                if (javadocRange != null) {
                    org.eclipse.jdt.core.ICompilationUnit cu = type.getCompilationUnit();
                    if (cu != null) {
                        String source = cu.getSource();
                        if (source != null) {
                            int offset = javadocRange.getOffset();
                            int length = javadocRange.getLength();
                            if (offset >= 0 && length > 0 && offset + length <= source.length()) {
                                String rawJavadoc = source.substring(offset, offset + length);
                                // Clean up JavaDoc comment markers
                                String cleanedJavadoc = cleanJavadocComment(rawJavadoc);
                                if (cleanedJavadoc != null && !cleanedJavadoc.trim().isEmpty()) {
                                    return cleanedJavadoc.trim();
                                }
                            }
                        }
                    }
                }
            } else {
                // For binary types: Try to get attached JavaDoc from javadoc.jar
                String htmlJavadoc = type.getAttachedJavadoc(monitor);
                if (htmlJavadoc != null && !htmlJavadoc.isEmpty()) {
                    // Convert HTML to plain text
                    String plainText = stripHtmlTags(htmlJavadoc);
                    if (plainText != null && !plainText.trim().isEmpty()) {
                        return plainText.trim();
                    }
                }
            }
        } catch (JavaModelException e) {
            // Silent fail - JavaDoc is optional
            JdtlsExtActivator.logException("Failed to extract JavaDoc for: " + type.getElementName(), e);
        }
        return null;
    }

    /**
     * Clean up raw JavaDoc comment by removing comment markers and asterisks
     * 
     * Converts raw JavaDoc comment text into clean readable text
     */
    private static String cleanJavadocComment(String rawJavadoc) {
        if (rawJavadoc == null || rawJavadoc.isEmpty()) {
            return "";
        }
        
        // Remove opening /** and closing */
        String cleaned = rawJavadoc;
        cleaned = cleaned.replaceFirst("^/\\*\\*", "");
        cleaned = cleaned.replaceFirst("\\*/$", "");
        
        // Split into lines and clean each line
        String[] lines = cleaned.split("\\r?\\n");
        StringBuilder result = new StringBuilder();
        
        for (String line : lines) {
            // Remove leading whitespace and asterisk
            String trimmed = line.trim();
            if (trimmed.startsWith("*")) {
                trimmed = trimmed.substring(1).trim();
            }
            
            // Skip empty lines at the beginning
            if (result.length() == 0 && trimmed.isEmpty()) {
                continue;
            }
            
            // Add line to result
            if (result.length() > 0 && !trimmed.isEmpty()) {
                result.append("\n");
            }
            result.append(trimmed);
        }
        
        return result.toString();
    }

    /**
     * Strip HTML tags and convert HTML entities to plain text
     * Preserves important structure like paragraphs, code blocks, and lists
     */
    private static String stripHtmlTags(String html) {
        if (html == null || html.isEmpty()) {
            return "";
        }
        
        // Preserve structure by converting HTML tags to newlines/formatting
        String text = html;
        
        // 1. Preserve code blocks - mark them for special handling
        text = text.replaceAll("(?i)<pre[^>]*>", "\n```\n");
        text = text.replaceAll("(?i)</pre>", "\n```\n");
        text = text.replaceAll("(?i)<code[^>]*>", "`");
        text = text.replaceAll("(?i)</code>", "`");
        
        // 2. Preserve paragraphs and line breaks
        text = text.replaceAll("(?i)<p[^>]*>", "\n\n");
        text = text.replaceAll("(?i)</p>", "");
        text = text.replaceAll("(?i)<br[^>]*>", "\n");
        text = text.replaceAll("(?i)<div[^>]*>", "\n");
        text = text.replaceAll("(?i)</div>", "\n");
        
        // 3. Preserve lists
        text = text.replaceAll("(?i)<ul[^>]*>", "\n");
        text = text.replaceAll("(?i)</ul>", "\n");
        text = text.replaceAll("(?i)<ol[^>]*>", "\n");
        text = text.replaceAll("(?i)</ol>", "\n");
        text = text.replaceAll("(?i)<li[^>]*>", "\n  • ");
        text = text.replaceAll("(?i)</li>", "");
        
        // 4. Preserve definition lists (used for @param, @return, etc.)
        text = text.replaceAll("(?i)<dl[^>]*>", "\n");
        text = text.replaceAll("(?i)</dl>", "\n");
        text = text.replaceAll("(?i)<dt[^>]*>", "\n");
        text = text.replaceAll("(?i)</dt>", ": ");
        text = text.replaceAll("(?i)<dd[^>]*>", "");
        text = text.replaceAll("(?i)</dd>", "\n");
        
        // 5. Handle headings
        text = text.replaceAll("(?i)<h[1-6][^>]*>", "\n\n");
        text = text.replaceAll("(?i)</h[1-6]>", "\n");
        
        // 6. Remove remaining HTML tags
        text = text.replaceAll("<[^>]+>", "");
        
        // 7. Convert HTML entities
        text = text.replace("&nbsp;", " ");
        text = text.replace("&lt;", "<");
        text = text.replace("&gt;", ">");
        text = text.replace("&amp;", "&");
        text = text.replace("&quot;", "\"");
        text = text.replace("&#39;", "'");
        text = text.replace("&apos;", "'");
        text = text.replace("&mdash;", "—");
        text = text.replace("&ndash;", "–");
        
        // 8. Clean up excessive whitespace while preserving intentional line breaks
        // Remove spaces at start/end of lines
        text = text.replaceAll("[ \\t]+\\n", "\n");
        text = text.replaceAll("\\n[ \\t]+", "\n");
        // Collapse multiple spaces within a line
        text = text.replaceAll("[ \\t]+", " ");
        // Limit consecutive newlines to maximum 2 (one blank line)
        text = text.replaceAll("\\n{3,}", "\n\n");
        
        text = text.trim();
        
        return text;
    }

    // Helper method: Get file URI/path for the type (instead of fully qualified class name)
    private static String getTypeUri(org.eclipse.jdt.core.IType type) {
        try {
            // Get the compilation unit that contains this type
            org.eclipse.jdt.core.ICompilationUnit compilationUnit = type.getCompilationUnit();
            if (compilationUnit != null) {
                // Get the underlying resource (file)
                org.eclipse.core.resources.IResource resource = compilationUnit.getUnderlyingResource();
                if (resource != null && resource instanceof org.eclipse.core.resources.IFile) {
                    org.eclipse.core.resources.IFile file = (org.eclipse.core.resources.IFile) resource;
                    // Get the file location as a file URI
                    java.net.URI fileUri = file.getLocationURI();
                    if (fileUri != null) {
                        return fileUri.toString();
                    }
                    
                    // Fallback: use workspace-relative path as URI
                    return file.getFullPath().toString();
                }
            }
            
            // Fallback: if we can't get file URI, return the fully qualified class name
            // This should rarely happen for source types
            return type.getFullyQualifiedName();
        } catch (Exception e) {
            JdtlsExtActivator.logException("Error getting file URI for type: " + type.getElementName(), e);
            // Fallback to class name in case of error
            try {
                return type.getFullyQualifiedName();
            } catch (Exception e2) {
                return null;
            }
        }
    }

    /**
     * Convert JDT type signature to human-readable format
     * 
     * Examples:
     * - QT; -> T
     * - QString; -> String
     * - I -> int, Z -> boolean
     * - [QString; -> String[]
     */
    private static String convertTypeSignature(String jdtSignature) {
        if (jdtSignature == null || jdtSignature.isEmpty()) {
            return "void";
        }

        // Handle array types
        int arrayDimensions = 0;
        while (jdtSignature.startsWith("[")) {
            arrayDimensions++;
            jdtSignature = jdtSignature.substring(1);
        }

        String baseType;

        // Handle type parameters and reference types (starts with Q)
        if (jdtSignature.startsWith("Q") && jdtSignature.endsWith(";")) {
            baseType = jdtSignature.substring(1, jdtSignature.length() - 1);
            baseType = baseType.replace('/', '.');
            
            // Simplify package name: java.util.List -> List
            if (baseType.contains(".")) {
                String[] parts = baseType.split("\\.");
                baseType = parts[parts.length - 1];
            }
        }
        // Handle fully qualified types (starts with L)
        else if (jdtSignature.startsWith("L") && jdtSignature.endsWith(";")) {
            baseType = jdtSignature.substring(1, jdtSignature.length() - 1);
            baseType = baseType.replace('/', '.');
            
            // Simplify package name
            if (baseType.contains(".")) {
                String[] parts = baseType.split("\\.");
                baseType = parts[parts.length - 1];
            }
        }
        // Handle primitive types
        else {
            switch (jdtSignature.charAt(0)) {
                case 'I': baseType = "int"; break;
                case 'Z': baseType = "boolean"; break;
                case 'V': baseType = "void"; break;
                case 'J': baseType = "long"; break;
                case 'F': baseType = "float"; break;
                case 'D': baseType = "double"; break;
                case 'B': baseType = "byte"; break;
                case 'C': baseType = "char"; break;
                case 'S': baseType = "short"; break;
                default: baseType = jdtSignature;
            }
        }

        // Add array markers
        for (int i = 0; i < arrayDimensions; i++) {
            baseType += "[]";
        }

        return baseType;
    }

    /**
     * Generate human-readable method signature
     * 
     * Example: public static <T> Result<T> success(T value)
     */
    private static String generateMethodSignature(IMethod method) {
        StringBuilder sb = new StringBuilder();
        
        try {
            // Access modifiers
            int flags = method.getFlags();
            if (org.eclipse.jdt.core.Flags.isPublic(flags)) {
                sb.append("public ");
            } else if (org.eclipse.jdt.core.Flags.isProtected(flags)) {
                sb.append("protected ");
            } else if (org.eclipse.jdt.core.Flags.isPrivate(flags)) {
                sb.append("private ");
            }
            
            // static/final/abstract modifiers
            if (org.eclipse.jdt.core.Flags.isStatic(flags)) {
                sb.append("static ");
            }
            if (org.eclipse.jdt.core.Flags.isFinal(flags)) {
                sb.append("final ");
            }
            if (org.eclipse.jdt.core.Flags.isAbstract(flags)) {
                sb.append("abstract ");
            }
            
            // Type parameters (if any)
            String[] typeParameters = method.getTypeParameterSignatures();
            if (typeParameters != null && typeParameters.length > 0) {
                sb.append("<");
                for (int i = 0; i < typeParameters.length; i++) {
                    if (i > 0) sb.append(", ");
                    sb.append(convertTypeSignature(typeParameters[i]));
                }
                sb.append("> ");
            }
            
            // Return type (constructors don't have return type)
            if (!method.isConstructor()) {
                String returnType = convertTypeSignature(method.getReturnType());
                sb.append(returnType).append(" ");
            }
            
            // Method name
            sb.append(method.getElementName()).append("(");
            
            // Parameter list
            String[] paramTypes = method.getParameterTypes();
            String[] paramNames = method.getParameterNames();
            for (int i = 0; i < paramTypes.length; i++) {
                if (i > 0) {
                    sb.append(", ");
                }
                sb.append(convertTypeSignature(paramTypes[i]));
                if (paramNames != null && i < paramNames.length) {
                    sb.append(" ").append(paramNames[i]);
                }
            }
            
            sb.append(")");
            
            // Exception declarations
            String[] exceptionTypes = method.getExceptionTypes();
            if (exceptionTypes != null && exceptionTypes.length > 0) {
                sb.append(" throws ");
                for (int i = 0; i < exceptionTypes.length; i++) {
                    if (i > 0) sb.append(", ");
                    sb.append(convertTypeSignature(exceptionTypes[i]));
                }
            }
            
        } catch (JavaModelException e) {
            return method.getElementName() + "(...)";
        }
        
        return sb.toString();
    }

    /**
     * Generate human-readable field signature
     * 
     * Example: private final String message
     */
    private static String generateFieldSignature(org.eclipse.jdt.core.IField field) {
        StringBuilder sb = new StringBuilder();
        
        try {
            // Access modifiers
            int flags = field.getFlags();
            if (org.eclipse.jdt.core.Flags.isPublic(flags)) {
                sb.append("public ");
            } else if (org.eclipse.jdt.core.Flags.isProtected(flags)) {
                sb.append("protected ");
            } else if (org.eclipse.jdt.core.Flags.isPrivate(flags)) {
                sb.append("private ");
            }
            
            // static/final modifiers
            if (org.eclipse.jdt.core.Flags.isStatic(flags)) {
                sb.append("static ");
            }
            if (org.eclipse.jdt.core.Flags.isFinal(flags)) {
                sb.append("final ");
            }
            
            // Type and name
            String fieldType = convertTypeSignature(field.getTypeSignature());
            sb.append(fieldType).append(" ").append(field.getElementName());
            
            // If it's a constant, try to get the initial value
            if (org.eclipse.jdt.core.Flags.isStatic(flags) && org.eclipse.jdt.core.Flags.isFinal(flags)) {
                Object constant = field.getConstant();
                if (constant != null) {
                    sb.append(" = ");
                    if (constant instanceof String) {
                        sb.append("\"").append(constant).append("\"");
                    } else {
                        sb.append(constant);
                    }
                }
            }
            
        } catch (JavaModelException e) {
            return field.getElementName();
        }
        
        return sb.toString();
    }

    /**
     * Generate complete class description (natural language format, similar to JavaDoc)
     */
    private static String generateClassDescription(org.eclipse.jdt.core.IType type) {
        StringBuilder description = new StringBuilder();
        
        try {
            String qualifiedName = type.getFullyQualifiedName();
            String simpleName = type.getElementName();
            
            // === 1. Title and signature ===
            description.append("Class: ").append(qualifiedName).append("\n");
            
            // Generate class signature
            StringBuilder signature = new StringBuilder();
            int flags = type.getFlags();
            
            if (org.eclipse.jdt.core.Flags.isPublic(flags)) signature.append("public ");
            if (org.eclipse.jdt.core.Flags.isAbstract(flags)) signature.append("abstract ");
            if (org.eclipse.jdt.core.Flags.isFinal(flags)) signature.append("final ");
            
            if (type.isInterface()) {
                signature.append("interface ");
            } else if (type.isEnum()) {
                signature.append("enum ");
            } else if (type.isAnnotation()) {
                signature.append("@interface ");
            } else {
                signature.append("class ");
            }
            
            signature.append(simpleName);
            
            // Type parameters
            String[] typeParams = type.getTypeParameterSignatures();
            if (typeParams != null && typeParams.length > 0) {
                signature.append("<");
                for (int i = 0; i < typeParams.length; i++) {
                    if (i > 0) signature.append(", ");
                    signature.append(convertTypeSignature(typeParams[i]));
                }
                signature.append(">");
            }
            
            // Inheritance relationship
            String superclass = type.getSuperclassName();
            if (superclass != null && !superclass.equals("Object") && !type.isInterface()) {
                signature.append(" extends ").append(superclass);
            }
            
            // Implemented interfaces
            String[] interfaces = type.getSuperInterfaceNames();
            if (interfaces != null && interfaces.length > 0) {
                if (type.isInterface()) {
                    signature.append(" extends ");
                } else {
                    signature.append(" implements ");
                }
                for (int i = 0; i < interfaces.length; i++) {
                    if (i > 0) signature.append(", ");
                    signature.append(interfaces[i]);
                }
            }
            
            description.append("Signature: ").append(signature).append("\n\n");
            
            // === 2. Constructors ===
            IMethod[] methods = type.getMethods();
            List<String> constructorSigs = new ArrayList<>();
            
            for (IMethod method : methods) {
                if (method.isConstructor()) {
                    constructorSigs.add(generateMethodSignature(method));
                }
            }
            
            if (!constructorSigs.isEmpty()) {
                description.append("Constructors:\n");
                for (String sig : constructorSigs) {
                    description.append("  - ").append(sig).append("\n");
                }
                description.append("\n");
            }
            
            // === 3. Public methods (limited to first 10) ===
            List<String> methodSigs = new ArrayList<>();
            int methodCount = 0;
            
            for (IMethod method : methods) {
                if (!method.isConstructor() && org.eclipse.jdt.core.Flags.isPublic(method.getFlags())) {
                    if (methodCount < 10) {
                        methodSigs.add(generateMethodSignature(method));
                        methodCount++;
                    } else {
                        break;
                    }
                }
            }
            
            if (!methodSigs.isEmpty()) {
                description.append("Methods:\n");
                for (String sig : methodSigs) {
                    description.append("  - ").append(sig).append("\n");
                }
                if (methodCount == 10 && methods.length > methodCount) {
                    description.append("  - ... (more methods available)\n");
                }
                description.append("\n");
            }
            
            // === 4. Public fields (limited to first 10) ===
            org.eclipse.jdt.core.IField[] fields = type.getFields();
            List<String> fieldSigs = new ArrayList<>();
            int fieldCount = 0;
            
            for (org.eclipse.jdt.core.IField field : fields) {
                if (org.eclipse.jdt.core.Flags.isPublic(field.getFlags()) && fieldCount < 10) {
                    fieldSigs.add(generateFieldSignature(field));
                    fieldCount++;
                }
            }
            
            if (!fieldSigs.isEmpty()) {
                description.append("Fields:\n");
                for (String sig : fieldSigs) {
                    description.append("  - ").append(sig).append("\n");
                }
            }
            
        } catch (JavaModelException e) {
            return "Error generating description for type: " + e.getMessage();
        }
        
        return description.toString();
    }

    // Helper method: Get method parameter types (deprecated - use generateMethodSignature instead)
    private static String getParameterTypes(IMethod method) {
        String[] paramTypes = method.getParameterTypes();
        if (paramTypes.length == 0) {
            return "()";
        }
        return "(" + String.join(",", paramTypes) + ")";
    }

    private static void reportExportJarMessage(String terminalId, int severity, String message) {
        if (StringUtils.isNotBlank(message) && StringUtils.isNotBlank(terminalId)) {
            String readableSeverity = getSeverityString(severity);
            JavaLanguageServerPlugin.getInstance().getClientConnection().executeClientCommand(COMMAND_EXPORT_JAR_REPORT,
                    terminalId, "[" + readableSeverity + "] " + message);
        }
    }

    private static String getSeverityString(int severity) {
        switch (severity) {
            case IStatus.INFO:
                return "INFO";
            case IStatus.WARNING:
                return "WARNING";
            case IStatus.ERROR:
                return "ERROR";
            case IStatus.CANCEL:
                return "CANCEL";
            case IStatus.OK:
                return "OK";
            default:
                return "UNKNOWN STATUS";
        }
    }

    private static final class LinkedFolderVisitor implements IResourceVisitor {

        private boolean belongsToWorkspace;

        private IPath workspaceFolderPath;

        public LinkedFolderVisitor(IPath workspaceFolderPath) {
            this.belongsToWorkspace = false;
            this.workspaceFolderPath = workspaceFolderPath;
        }

        @Override
        public boolean visit(IResource resource) throws CoreException {
            if (this.belongsToWorkspace) {
                return false;
            }

            if (!resource.exists()) {
                return false;
            }

            if (resource.isLinked()) {
                IPath realPath = resource.getLocation();
                if (workspaceFolderPath.isPrefixOf(realPath)) {
                    this.belongsToWorkspace = true;
                }
            }

            return true;
        }

        public boolean isBelongsToWorkspace() {
            return belongsToWorkspace;
        }
    }
}