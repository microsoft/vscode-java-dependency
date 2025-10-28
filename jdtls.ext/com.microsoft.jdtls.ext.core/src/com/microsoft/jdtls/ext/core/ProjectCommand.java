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
import com.microsoft.jdtls.ext.core.parser.ContextResolver;
import com.microsoft.jdtls.ext.core.parser.ContextResolver.ImportClassInfo;
import com.microsoft.jdtls.ext.core.parser.ProjectResolver;
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

    private static class DependencyInfo {
        public String key;
        public String value;

        public DependencyInfo(String key, String value) {
            this.key = key;
            this.value = value;
        }
    }

    /**
     * Error reasons for ImportClassContent operation
     */
    public enum ImportClassContentErrorReason {
        NULL_ARGUMENTS("Arguments null or empty"),
        INVALID_URI("URI invalid or empty"),
        URI_PARSE_FAILED("URI parse failed"),
        FILE_NOT_FOUND("File not found"),
        FILE_NOT_EXISTS("File does not exist"),
        NOT_JAVA_PROJECT("Not in Java project"),
        PROJECT_NOT_EXISTS("Java project not exists"),
        NOT_COMPILATION_UNIT("Not Java compilation unit"),
        NO_IMPORTS("No import declarations"),
        OPERATION_CANCELLED("Operation cancelled"),
        TIME_LIMIT_EXCEEDED("Time limit exceeded"),
        NO_RESULTS("No classes resolved"),
        PROCESSING_EXCEPTION("Processing exception");

        private final String message;

        ImportClassContentErrorReason(String message) {
            this.message = message;
        }

        public String getMessage() {
            return message;
        }
    }

    /**
     * Error reasons for ProjectDependencies operation
     */
    public enum ProjectDependenciesErrorReason {
        NULL_ARGUMENTS("Arguments null or empty"),
        INVALID_URI("URI invalid or empty"),
        URI_PARSE_FAILED("URI parse failed"),
        MALFORMED_URI("Malformed URI syntax"),
        OPERATION_CANCELLED("Operation cancelled"),
        RESOLVER_NULL_RESULT("Resolver returned null"),
        NO_DEPENDENCIES("No dependencies resolved"),
        PROCESSING_EXCEPTION("Processing exception");

        private final String message;

        ProjectDependenciesErrorReason(String message) {
            this.message = message;
        }

        public String getMessage() {
            return message;
        }
    }

    /**
     * Result wrapper for getImportClassContent method
     */
    public static class ImportClassContentResult {
        public List<ImportClassInfo> classInfoList;
        public String errorReason;  // Use String for JSON serialization compatibility
        public boolean hasError;

        public ImportClassContentResult(List<ImportClassInfo> classInfoList) {
            this.classInfoList = classInfoList;
            this.errorReason = null;
            this.hasError = false;
        }

        public ImportClassContentResult(ImportClassContentErrorReason errorReason) {
            this.classInfoList = Collections.emptyList();
            this.errorReason = errorReason.getMessage();  // Use enum message
            this.hasError = true;
        }
    }

    /**
     * Result wrapper for getProjectDependencies method
     */
    public static class ProjectDependenciesResult {
        public List<DependencyInfo> dependencyInfoList;
        public String errorReason;  // Use String for JSON serialization compatibility
        public boolean hasError;

        public ProjectDependenciesResult(List<DependencyInfo> dependencyInfoList) {
            this.dependencyInfoList = dependencyInfoList;
            this.errorReason = null;
            this.hasError = false;
        }

        public ProjectDependenciesResult(ProjectDependenciesErrorReason errorReason) {
            this.dependencyInfoList = new ArrayList<>();
            this.errorReason = errorReason.getMessage();  // Use enum message
            this.hasError = true;
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

    /**
     * Get import class content for Copilot integration (backward compatibility wrapper).
     * This method maintains compatibility with the original return type.
     * 
     * @param arguments List containing the file URI as the first element
     * @param monitor Progress monitor for cancellation support
     * @return List of ImportClassInfo containing class information and JavaDoc
     */
    public static List<ImportClassInfo> getImportClassContent(List<Object> arguments, IProgressMonitor monitor) {
        ImportClassContentResult result = getImportClassContentWithReason(arguments, monitor);
        if (result.hasError) {
            // Log the error reason for debugging
            JdtlsExtActivator.logError("getImportClassContent failed: " + result.errorReason);
        }
        return result.classInfoList;
    }

    /**
     * Get import class content for Copilot integration with detailed error reporting.
     * This method extracts information about imported classes from a Java file.
     * Uses a time-controlled strategy: prioritizes internal classes, adds external classes only if time permits.
     * 
     * @param arguments List containing the file URI as the first element
     * @param monitor Progress monitor for cancellation support
     * @return ImportClassContentResult containing class information and error reason if applicable
     */
    public static ImportClassContentResult getImportClassContentWithReason(List<Object> arguments, IProgressMonitor monitor) {
        if (arguments == null || arguments.isEmpty()) {
            return new ImportClassContentResult(ImportClassContentErrorReason.NULL_ARGUMENTS);
        }

        // Time control: total budget 80ms, early return at 75ms
        long startTime = System.currentTimeMillis();
        final long TIME_BUDGET_MS = 80;
        final long EARLY_RETURN_MS = 75;

        try {
            String fileUri = (String) arguments.get(0);
            if (fileUri == null || fileUri.trim().isEmpty()) {
                return new ImportClassContentResult(ImportClassContentErrorReason.INVALID_URI);
            }

            // Parse URI manually to avoid restricted API
            java.net.URI uri = new java.net.URI(fileUri);
            String filePath = uri.getPath();
            if (filePath == null) {
                return new ImportClassContentResult(ImportClassContentErrorReason.URI_PARSE_FAILED);
            }

            IPath path = new Path(filePath);

            // Get the file resource
            IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
            IFile file = root.getFileForLocation(path);
            if (file == null) {
                return new ImportClassContentResult(ImportClassContentErrorReason.FILE_NOT_FOUND);
            }
            if (!file.exists()) {
                return new ImportClassContentResult(ImportClassContentErrorReason.FILE_NOT_EXISTS);
            }

            // Get the Java project
            IJavaProject javaProject = JavaCore.create(file.getProject());
            if (javaProject == null) {
                return new ImportClassContentResult(ImportClassContentErrorReason.NOT_JAVA_PROJECT);
            }
            if (!javaProject.exists()) {
                return new ImportClassContentResult(ImportClassContentErrorReason.PROJECT_NOT_EXISTS);
            }

            // Find the compilation unit
            IJavaElement javaElement = JavaCore.create(file);
            if (!(javaElement instanceof org.eclipse.jdt.core.ICompilationUnit)) {
                return new ImportClassContentResult(ImportClassContentErrorReason.NOT_COMPILATION_UNIT);
            }

            org.eclipse.jdt.core.ICompilationUnit compilationUnit = (org.eclipse.jdt.core.ICompilationUnit) javaElement;

            // Parse imports and resolve local project files
            List<ImportClassInfo> classInfoList = new ArrayList<>();

            // Get all imports from the compilation unit
            org.eclipse.jdt.core.IImportDeclaration[] imports = compilationUnit.getImports();
            Set<String> processedTypes = new HashSet<>();

            // Check if file has no imports
            if (imports == null || imports.length == 0) {
                return new ImportClassContentResult(ImportClassContentErrorReason.NO_IMPORTS);
            }

            // Phase 1: Priority - Resolve project source classes (internal)
            for (org.eclipse.jdt.core.IImportDeclaration importDecl : imports) {
                // Check time budget before each operation
                long elapsed = System.currentTimeMillis() - startTime;
                if (monitor.isCanceled()) {
                    return new ImportClassContentResult(ImportClassContentErrorReason.OPERATION_CANCELLED);
                }
                if (elapsed >= EARLY_RETURN_MS) {
                    return new ImportClassContentResult(ImportClassContentErrorReason.TIME_LIMIT_EXCEEDED);
                }

                String importName = importDecl.getElementName();
                boolean isStatic = (importDecl.getFlags() & org.eclipse.jdt.core.Flags.AccStatic) != 0;
                
                if (isStatic) {
                    // Handle static imports - delegate to ContextResolver
                    ContextResolver.resolveStaticImport(javaProject, importName, classInfoList, processedTypes, monitor);
                } else if (importName.endsWith(".*")) {
                    // Handle package imports - delegate to ContextResolver
                    String packageName = importName.substring(0, importName.length() - 2);
                    ContextResolver.resolvePackageTypes(javaProject, packageName, classInfoList, processedTypes, monitor);
                } else {
                    // Handle single type imports - delegate to ContextResolver
                    ContextResolver.resolveSingleType(javaProject, importName, classInfoList, processedTypes, monitor);
                }
            }

            // Phase 2: If time permits, resolve external dependencies
            long elapsedAfterInternal = System.currentTimeMillis() - startTime;
            if (elapsedAfterInternal < EARLY_RETURN_MS && !monitor.isCanceled()) {
                // Calculate remaining time budget for external classes
                long remainingTime = TIME_BUDGET_MS - elapsedAfterInternal;
                
                // Only proceed with external if we have reasonable time left (at least 15ms)
                if (remainingTime >= 15) {
                    List<ImportClassInfo> externalClasses = new ArrayList<>();
                    
                    for (org.eclipse.jdt.core.IImportDeclaration importDecl : imports) {
                        // Check time before each external resolution
                        long currentElapsed = System.currentTimeMillis() - startTime;
                        if (monitor.isCanceled() || currentElapsed >= EARLY_RETURN_MS) {
                            break;
                        }

                        String importName = importDecl.getElementName();
                        boolean isStatic = (importDecl.getFlags() & org.eclipse.jdt.core.Flags.AccStatic) != 0;
                        
                        // Skip package imports (*.* ) - too broad for external dependencies
                        if (importName.endsWith(".*")) {
                            continue;
                        }
                        
                        // Resolve external (binary) types with simplified content
                        if (!isStatic) {
                            ContextResolver.resolveBinaryType(javaProject, importName, externalClasses, 
                                    processedTypes, Integer.MAX_VALUE, monitor);
                        }
                    }
                    
                    // Append external classes after project sources
                    classInfoList.addAll(externalClasses);
                }
            }

            // Success case - return the resolved class information
            if (classInfoList.isEmpty()) {
                return new ImportClassContentResult(ImportClassContentErrorReason.NO_RESULTS);
            }
            return new ImportClassContentResult(classInfoList);

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error in getImportClassContent", e);
            return new ImportClassContentResult(ImportClassContentErrorReason.PROCESSING_EXCEPTION);
        }
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


    /**
     * Get project dependencies information with detailed error reporting.
     * This method extracts project dependency information including JDK version, build tool, etc.
     * 
     * @param arguments List containing the project URI as the first element
     * @param monitor Progress monitor for cancellation support
     * @return ProjectDependenciesResult containing dependency information and error reason if applicable
     */
    public static ProjectDependenciesResult getProjectDependencies(List<Object> arguments, IProgressMonitor monitor) {
        if (arguments == null || arguments.isEmpty()) {
            return new ProjectDependenciesResult(ProjectDependenciesErrorReason.NULL_ARGUMENTS);
        }

        try {
            String projectUri = (String) arguments.get(0);
            if (projectUri == null || projectUri.trim().isEmpty()) {
                return new ProjectDependenciesResult(ProjectDependenciesErrorReason.INVALID_URI);
            }

            // Validate URI format
            try {
                java.net.URI uri = new java.net.URI(projectUri);
                if (uri.getPath() == null) {
                    return new ProjectDependenciesResult(ProjectDependenciesErrorReason.URI_PARSE_FAILED);
                }
            } catch (java.net.URISyntaxException e) {
                return new ProjectDependenciesResult(ProjectDependenciesErrorReason.MALFORMED_URI);
            }

            // Check if monitor is cancelled before processing
            if (monitor.isCanceled()) {
                return new ProjectDependenciesResult(ProjectDependenciesErrorReason.OPERATION_CANCELLED);
            }

            List<ProjectResolver.DependencyInfo> resolverResult = ProjectResolver.resolveProjectDependencies(projectUri, monitor);
            
            // Check if resolver returned null (should not happen, but defensive programming)
            if (resolverResult == null) {
                return new ProjectDependenciesResult(ProjectDependenciesErrorReason.RESOLVER_NULL_RESULT);
            }

            // Convert ProjectResolver.DependencyInfo to ProjectCommand.DependencyInfo
            List<DependencyInfo> result = new ArrayList<>();
            for (ProjectResolver.DependencyInfo info : resolverResult) {
                if (info != null) {
                    result.add(new DependencyInfo(info.key, info.value));
                }
            }
            
            // Check if no dependencies were resolved
            if (result.isEmpty()) {
                return new ProjectDependenciesResult(ProjectDependenciesErrorReason.NO_DEPENDENCIES);
            }

            return new ProjectDependenciesResult(result);

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error in getProjectDependenciesWithReason", e);
            return new ProjectDependenciesResult(ProjectDependenciesErrorReason.PROCESSING_EXCEPTION);
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
