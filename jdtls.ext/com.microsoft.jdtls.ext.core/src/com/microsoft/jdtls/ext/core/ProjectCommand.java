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

    private static class ImportClassInfo {
        public String uri;
        public String className;

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

    public static ImportClassInfo[] getImportClassContent(List<Object> arguments, IProgressMonitor monitor) {
        if (arguments == null || arguments.isEmpty()) {
            return new ImportClassInfo[0];
        }

        try {
            String fileUri = (String) arguments.get(0);

            // Parse URI manually to avoid restricted API
            java.net.URI uri = new java.net.URI(fileUri);
            String filePath = uri.getPath();
            if (filePath == null) {
                return new ImportClassInfo[0];
            }

            IPath path = new Path(filePath);

            // Get the file resource
            IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
            IFile file = root.getFileForLocation(path);
            if (file == null || !file.exists()) {
                return new ImportClassInfo[0];
            }

            // Get the Java project
            IJavaProject javaProject = JavaCore.create(file.getProject());
            if (javaProject == null || !javaProject.exists()) {
                return new ImportClassInfo[0];
            }

            // Find the compilation unit
            IJavaElement javaElement = JavaCore.create(file);
            if (!(javaElement instanceof org.eclipse.jdt.core.ICompilationUnit)) {
                return new ImportClassInfo[0];
            }

            org.eclipse.jdt.core.ICompilationUnit compilationUnit = (org.eclipse.jdt.core.ICompilationUnit) javaElement;

            // Parse imports and resolve local project files
            List<ImportClassInfo> result = new ArrayList<>();

            // Get all imports from the compilation unit
            org.eclipse.jdt.core.IImportDeclaration[] imports = compilationUnit.getImports();
            Set<String> processedTypes = new HashSet<>();

            for (org.eclipse.jdt.core.IImportDeclaration importDecl : imports) {
                if (monitor.isCanceled()) {
                    break;
                }

                String importName = importDecl.getElementName();
                if (importName.endsWith(".*")) {
                    // Handle package imports
                    String packageName = importName.substring(0, importName.length() - 2);
                    resolvePackageTypes(javaProject, packageName, result, processedTypes);
                } else {
                    // Handle single type imports
                    resolveSingleType(javaProject, importName, result, processedTypes);
                }
            }

            return result.toArray(new ImportClassInfo[0]);

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error in resolveCopilotRequest", e);
            return new ImportClassInfo[0];
        }
    }

    private static void resolveSingleType(IJavaProject javaProject, String typeName, List<ImportClassInfo> result,
            Set<String> processedTypes) {
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
            
            // Strategy: First search in local source packages (fast), then fallback to global search (slow)
            // This optimizes for the common case where imports reference local project types
            
            // Fast path: Search for the type in source package fragments directly
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
                                // Found local project source type - fast path success
                                extractTypeInfo(primaryType, result);
                                return;
                            }
                            
                            // Also check for inner types in the compilation unit
                            org.eclipse.jdt.core.IType[] allTypes = cu.getAllTypes();
                            for (org.eclipse.jdt.core.IType type : allTypes) {
                                if (typeName.equals(type.getFullyQualifiedName())) {
                                    extractTypeInfo(type, result);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
            
            // Slow path: Use JDT's global type resolution as fallback for external dependencies
            // This is only needed if the type is not found in local source packages
            try {
                org.eclipse.jdt.core.IType type = javaProject.findType(typeName);
                if (type != null && type.exists()) {
                    // Found type in dependencies/JRE, but we only process local source types
                    // for this specific use case (Copilot context)
                    if (!type.isBinary()) {
                        extractTypeInfo(type, result);
                    }
                    // Note: Binary types (from JARs) are intentionally ignored
                    // as they don't provide useful context for code completion
                }
            } catch (JavaModelException e) {
                JdtlsExtActivator.logException("Error finding type in global search: " + typeName, e);
            }
        } catch (JavaModelException e) {
            // Log but continue processing other types
            JdtlsExtActivator.logException("Error resolving type: " + typeName, e);
        }
    }

    private static void resolvePackageTypes(IJavaProject javaProject, String packageName, List<ImportClassInfo> result,
            Set<String> processedTypes) {
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
                                    extractTypeInfo(type, result);
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

    private static void extractTypeInfo(org.eclipse.jdt.core.IType type, List<ImportClassInfo> result) {
        try {
            String typeName = type.getFullyQualifiedName();
            String typeInfo = "";

            // Determine type kind
            if (type.isInterface()) {
                typeInfo = "interface:" + typeName;
            } else if (type.isClass()) {
                extractDetailedClassInfo(type, result);
                return; // extractDetailedClassInfo handles adding to result
            } else if (type.isEnum()) {
                typeInfo = "enum:" + typeName;
            } else if (type.isAnnotation()) {
                typeInfo = "annotation:" + typeName;
            } else {
                typeInfo = "type:" + typeName;
            }

            // Get URI for this type
            String uri = getTypeUri(type);
            if (uri != null) {
                result.add(new ImportClassInfo(uri, typeInfo));
            }

            // Also add nested types
            org.eclipse.jdt.core.IType[] nestedTypes = type.getTypes();
            for (org.eclipse.jdt.core.IType nestedType : nestedTypes) {
                extractTypeInfo(nestedType, result);
            }

        } catch (JavaModelException e) {
            // Log but continue processing other types
            JdtlsExtActivator.logException("Error extracting type info for: " + type.getElementName(), e);
        }
    }

    private static void extractDetailedClassInfo(org.eclipse.jdt.core.IType type, List<ImportClassInfo> result) {
        try {
            if (!type.isClass()) {
                return; // Only process classes
            }

            String className = type.getFullyQualifiedName();
            List<String> classDetails = new ArrayList<>();

            // 1. Class declaration information
            classDetails.add("class:" + className);

            // 2. Modifiers
            int flags = type.getFlags();
            List<String> modifiers = new ArrayList<>();
            if (org.eclipse.jdt.core.Flags.isPublic(flags))
                modifiers.add("public");
            if (org.eclipse.jdt.core.Flags.isAbstract(flags))
                modifiers.add("abstract");
            if (org.eclipse.jdt.core.Flags.isFinal(flags))
                modifiers.add("final");
            if (org.eclipse.jdt.core.Flags.isStatic(flags))
                modifiers.add("static");
            if (!modifiers.isEmpty()) {
                classDetails.add("modifiers:" + String.join(",", modifiers));
            }

            // 3. Inheritance
            String superclass = type.getSuperclassName();
            if (superclass != null && !"Object".equals(superclass)) {
                classDetails.add("extends:" + superclass);
            }

            // 4. Implemented interfaces
            String[] interfaces = type.getSuperInterfaceNames();
            if (interfaces.length > 0) {
                classDetails.add("implements:" + String.join(",", interfaces));
            }

            // 5. Constructors
            IMethod[] methods = type.getMethods();
            List<String> constructors = new ArrayList<>();
            List<String> publicMethods = new ArrayList<>();

            for (IMethod method : methods) {
                if (method.isConstructor()) {
                    constructors.add(method.getElementName() + getParameterTypes(method));
                } else if (org.eclipse.jdt.core.Flags.isPublic(method.getFlags())) {
                    publicMethods.add(method.getElementName() + getParameterTypes(method));
                }
            }

            if (!constructors.isEmpty()) {
                classDetails.add("constructors:" + String.join(",", constructors));
            }

            if (!publicMethods.isEmpty()) {
                classDetails.add("publicMethods:"
                        + String.join(",", publicMethods.subList(0, Math.min(publicMethods.size(), 10))));
            }

            // 6. Public fields
            org.eclipse.jdt.core.IField[] fields = type.getFields();
            List<String> publicFields = new ArrayList<>();
            for (org.eclipse.jdt.core.IField field : fields) {
                if (org.eclipse.jdt.core.Flags.isPublic(field.getFlags())) {
                    publicFields.add(field.getElementName());
                }
            }

            if (!publicFields.isEmpty()) {
                classDetails.add("publicFields:" + String.join(",", publicFields));
            }

            // Get URI for this type
            String uri = getTypeUri(type);
            if (uri != null) {
                // Combine all information into one string
                String classInfo = String.join("|", classDetails);
                result.add(new ImportClassInfo(uri, classInfo));
            }

        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error extracting detailed class info", e);
        }
    }

    // Helper method: Get fully qualified class name (used as identifier instead of file URI)
    private static String getTypeUri(org.eclipse.jdt.core.IType type) {
        try {
            // Return the fully qualified class name instead of file URI
            // This matches the import statement format like "com.acme.user.UserService"
            return type.getFullyQualifiedName();
        } catch (Exception e) {
            JdtlsExtActivator.logException("Error getting type name for: " + type.getElementName(), e);
            return null;
        }
    }

    // Helper method: Get method parameter types
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