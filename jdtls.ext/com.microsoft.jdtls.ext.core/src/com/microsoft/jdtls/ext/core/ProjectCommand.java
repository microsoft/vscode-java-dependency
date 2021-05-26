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
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.jar.Attributes;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.zip.ZipFile;

import org.apache.commons.io.FilenameUtils;
import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.MultiStatus;
import org.eclipse.core.runtime.NullProgressMonitor;
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
import org.eclipse.jdt.ls.core.internal.managers.UpdateClasspathJob;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences.ReferencedLibraries;
import org.eclipse.lsp4j.jsonrpc.json.adapters.CollectionTypeAdapter;
import org.eclipse.lsp4j.jsonrpc.json.adapters.EnumTypeAdapter;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.microsoft.jdtls.ext.core.model.PackageNode;

public final class ProjectCommand {

    private static String COMMAND_EXPORT_JAR_REPORT = "java.view.package.exportJarReport";

    private static enum ExportJarReportType {
        MESSAGE,
        SUCCESS,
        CANCEL,
        ERROR,
        EXIT,
    }

    private static class MainClassInfo {
        public String name;
        public String path;

        public MainClassInfo(String name, String path) {
            this.name = name;
            this.path = path;
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
        String invisibleProjectName = ProjectUtils.getWorkspaceInvisibleProjectName(workspaceFolderPath);

        IProject[] projects = getWorkspaceRoot().getProjects();
        ArrayList<PackageNode> children = new ArrayList<>();
        List<IPath> paths = Collections.singletonList(workspaceFolderPath);
        for (IProject project : projects) {
            if (!project.isAccessible() || !ProjectUtils.isJavaProject(project)) {
                continue;
            }
            // Ignore all the projects that's not contained in the workspace folder, except
            // for the invisible project.
            // This check is needed in multi-root scenario.
            if ((!ResourceUtils.isContainedIn(project.getLocation(), paths)
                    && !Objects.equals(project.getName(), invisibleProjectName))) {
                continue;
            }
            PackageNode projectNode = PackageNode.createNodeForProject(JavaCore.create(project));
            if (Objects.equals(project.getName(), invisibleProjectName)) {
                projectNode.setDisplayName(FilenameUtils.getBaseName(workspaceFolderPath.toOSString()));
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
                        /* areDirectoryEntriesIncluded = */true, /* isCompressed = */true, target, directories, monitor);
                    int severity = resultStatus.getSeverity();
                    if (severity == IStatus.OK) {
                        java.nio.file.Path path = java.nio.file.Paths.get(classpath.source);
                        reportExportJarMessage(terminalId, IStatus.OK, "Successfully extracted the file to the exported jar: " + path.getFileName().toString());
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
                        writeFile(new File(classpath.source), new Path(classpath.destination), /* areDirectoryEntriesIncluded = */true,
                            /* isCompressed = */true, target, directories);
                        reportExportJarMessage(terminalId, IStatus.OK, "Successfully added the file to the exported jar: " + classpath.destination);
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

    public static List<MainClassInfo> getMainClasses(List<Object> arguments, IProgressMonitor monitor) throws Exception {
        List<PackageNode> projectList = listProjects(arguments, monitor);
        final List<MainClassInfo> res = new ArrayList<>();
        List<IJavaElement> searchRoots = new ArrayList<>();
        if (projectList.size() == 0) {
            return res;
        }
        for (PackageNode project : projectList) {
            IJavaProject javaProject = PackageCommand.getJavaProject(project.getUri());
            for (IPackageFragmentRoot packageFragmentRoot : javaProject.getAllPackageFragmentRoots()) {
                if (!packageFragmentRoot.isArchive()) {
                    searchRoots.add(packageFragmentRoot);
                }
            }
        }
        IJavaSearchScope scope = SearchEngine.createJavaSearchScope(searchRoots.toArray(new IJavaElement[0]));
        SearchPattern pattern = SearchPattern.createPattern("main(String[]) void", IJavaSearchConstants.METHOD,
                IJavaSearchConstants.DECLARATIONS, SearchPattern.R_EXACT_MATCH | SearchPattern.R_CASE_SENSITIVE);
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
            searchEngine.search(pattern, new SearchParticipant[] {SearchEngine.getDefaultSearchParticipant()}, scope,
                    requestor, new NullProgressMonitor());
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

    private static void reportExportJarMessage(String terminalId, int severity, String message) {
        if (StringUtils.isNotBlank(message) && StringUtils.isNotBlank(terminalId)) {
            String readableSeverity = getSeverityString(severity);
            JavaLanguageServerPlugin.getInstance().getClientConnection().executeClientCommand(COMMAND_EXPORT_JAR_REPORT, ExportJarReportType.MESSAGE,
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
}
