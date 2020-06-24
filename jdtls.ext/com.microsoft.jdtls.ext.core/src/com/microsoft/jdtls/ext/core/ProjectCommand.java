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

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Objects;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IModuleDescription;
import org.eclipse.jdt.core.search.IJavaSearchScope;
import org.eclipse.jdt.core.search.SearchEngine;
import org.eclipse.jdt.core.search.SearchPattern;
import org.eclipse.jdt.core.search.IJavaSearchConstants;
import org.eclipse.jdt.core.search.SearchRequestor;
import org.eclipse.jdt.core.search.SearchMatch;
import org.eclipse.jdt.core.search.SearchParticipant;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;
import org.eclipse.jdt.ls.core.internal.managers.UpdateClasspathJob;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences.ReferencedLibraries;

import com.microsoft.jdtls.ext.core.model.NodeKind;
import com.microsoft.jdtls.ext.core.model.PackageNode;

public final class ProjectCommand {

    public static class MainClassInfo {

        public String name;

        public String path;

        public MainClassInfo(String name, String path) {
            this.name = name;
            this.path = path;
        }
    }

    public static List<PackageNode> listProjects(List<Object> arguments, IProgressMonitor monitor) {
        String workspaceUri = (String) arguments.get(0);
        IPath workspacePath = ResourceUtils.canonicalFilePathFromURI(workspaceUri);
        String invisibleProjectName = getWorkspaceInvisibleProjectName(workspacePath);

        IProject[] projects = getWorkspaceRoot().getProjects();
        ArrayList<PackageNode> children = new ArrayList<>();
        List<IPath> paths = Arrays.asList(workspacePath);
        for (IProject project : projects) {
            if (!ProjectUtils.isJavaProject(project)) {
                continue;
            }
            if (project.exists() && (ResourceUtils.isContainedIn(project.getLocation(), paths) || Objects.equals(project.getName(), invisibleProjectName))) {
                PackageNode projectNode = new PackageNode(project.getName(), project.getFullPath().toPortableString(), NodeKind.PROJECT);
                projectNode.setUri(project.getLocationURI().toString());
                children.add(projectNode);
            }
        }

        return children;
    }

    public static boolean refreshLibraries(List<Object> arguments, IProgressMonitor monitor) {
        String workspaceUri = (String) arguments.get(0);
        IPath workspacePath = ResourceUtils.canonicalFilePathFromURI(workspaceUri);
        String projectName = ProjectUtils.getWorkspaceInvisibleProjectName(workspacePath);
        IProject project = getWorkspaceRoot().getProject(projectName);
        try {
            ReferencedLibraries libraries = JavaLanguageServerPlugin.getPreferencesManager().getPreferences().getReferencedLibraries();
            UpdateClasspathJob.getInstance().updateClasspath(JavaCore.create(project), libraries);
            return true;
        } catch (Exception e) {
            JavaLanguageServerPlugin.logException("Exception occured during waiting for classpath to be updated", e);
            return false;
        }
    }

    private static IWorkspaceRoot getWorkspaceRoot() {
        return ResourcesPlugin.getWorkspace().getRoot();
    }

    // TODO Use ProjectUtils.getWorkspaceInvisibleProjectName directly when the language server is released.
    private static String getWorkspaceInvisibleProjectName(IPath workspacePath) {
        String fileName = workspacePath.toFile().getName();
        return fileName + "_" + Integer.toHexString(workspacePath.toPortableString().hashCode());
    }

    public static List<MainClassInfo> getMainMethod(IProgressMonitor monitor) {
        final List<MainClassInfo> res = new ArrayList<>();
        IJavaSearchScope scope = SearchEngine.createWorkspaceScope();
        SearchPattern pattern = SearchPattern.createPattern("main(String[]) void", IJavaSearchConstants.METHOD,
                IJavaSearchConstants.DECLARATIONS, SearchPattern.R_EXACT_MATCH | SearchPattern.R_CASE_SENSITIVE);
        SearchRequestor requestor = new SearchRequestor() {
            @Override
            public void acceptSearchMatch(SearchMatch match) {
                Object element = match.getElement();
                if (element instanceof IMethod) {
                    IMethod method = (IMethod) element;
                    try {
                        if (method.isMainMethod()) {
                            IResource resource = method.getResource();
                            if (resource == null) {
                                return;
                            }
                            String mainClass = method.getDeclaringType().getFullyQualifiedName();
                            IJavaProject javaProject = method.getJavaProject();
                            if (javaProject != null) {
                                String moduleName = getModuleName(javaProject);
                                if (moduleName != null) {
                                    mainClass = moduleName + "/" + mainClass;
                                }
                            }
                            String filePath = null;
                            if (match.getResource() instanceof IFile) {
                                try {
                                    filePath = match.getResource().getLocation().toOSString();
                                } catch (Exception ex) {
                                    // ignore
                                }
                            }
                            res.add(new MainClassInfo(mainClass, filePath));
                        }
                    } catch (JavaModelException e) {
                        // ignore
                    }
                }
            }
        };
        SearchEngine searchEngine = new SearchEngine();
        try {
            searchEngine.search(pattern, new SearchParticipant[] {SearchEngine.getDefaultSearchParticipant()},
                    scope, requestor, new NullProgressMonitor());
        } catch (Exception e) {
            // ignore
        }
        return res;
    }

    public static String getModuleName(IJavaProject project) {
        if (project == null || !JavaRuntime.isModularProject(project)) {
            return null;
        }
        IModuleDescription module;
        try {
            module = project.getModuleDescription();
        } catch (CoreException e) {
            return null;
        }
        return module == null ? null : module.getElementName();
    }

}
