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

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.jar.Attributes;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.zip.ZipFile;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.reflect.TypeToken;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.resources.IFile;
import org.eclipse.jdt.core.search.IJavaSearchScope;
import org.eclipse.jdt.core.search.SearchEngine;
import org.eclipse.jdt.core.search.SearchPattern;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.IModuleDescription;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
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
import org.eclipse.lsp4j.jsonrpc.json.adapters.CollectionTypeAdapter;
import org.eclipse.lsp4j.jsonrpc.json.adapters.EnumTypeAdapter;

import static org.eclipse.jdt.internal.jarpackager.JarPackageUtil.write;
import static org.eclipse.jdt.internal.jarpackager.JarPackageUtil.writeArchive;

public final class ProjectCommand {

    public static class MainClassInfo {

        public String name;

        public String path;

        public MainClassInfo(String name, String path) {
            this.name = name;
            this.path = path;
        }
    }

    private static final Gson gson = new GsonBuilder()
            .registerTypeAdapterFactory(new CollectionTypeAdapter.Factory())
            .registerTypeAdapterFactory(new EnumTypeAdapter.Factory())
            .create();

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

    public static boolean exportJar(List<Object> arguments, IProgressMonitor monitor) {
        if(arguments.size() < 3) {
            return false;
        }
        String mainMethod = gson.fromJson(gson.toJson(arguments.get(0)), String.class);
        List<String> classpaths = gson.fromJson(gson.toJson(arguments.get(1)), new TypeToken<List<String>>(){}.getType());
        String destination = gson.fromJson(gson.toJson(arguments.get(2)), String.class);
        Manifest manifest = new Manifest();
        manifest.getMainAttributes().put(Attributes.Name.MANIFEST_VERSION, "1.0");
        if(mainMethod.length() > 0) {
            manifest.getMainAttributes().put(Attributes.Name.MAIN_CLASS,mainMethod);
        }
        try (JarOutputStream target = new JarOutputStream(new FileOutputStream(destination), manifest)){
            Set<String> fDirectories = new HashSet<>();
            for(String classpath : classpaths){
                if (classpath != null){
                    if(classpath.endsWith(".jar")){
                        ZipFile zip = new ZipFile(classpath);
                        writeArchive(zip, true, true, target, fDirectories,monitor);
                    }
                    else {
                        File folder = new File(classpath);
                        recursiveFolder(folder, target, fDirectories, folder.getAbsolutePath().length() + 1);
                    }
                }
            }
        } catch (Exception e){
            return false;
        }
        return true;
    }

    private static void recursiveFolder(File folder, JarOutputStream fJarOutputStream, Set<String> fDirectories, int len){
        File[] files = folder.listFiles();
        for(File file : files){
            if(file.isDirectory()) {
                recursiveFolder(file, fJarOutputStream, fDirectories, len);
            } else if(file.isFile()) {
                try {
                    write(file, new Path(file.getAbsolutePath().substring(len)), true, true, fJarOutputStream, fDirectories);
                }
                catch (Exception e){
                    // do nothing
                }
            }
        }
    }

    public static List<MainClassInfo> getMainMethod(IProgressMonitor monitor) throws Exception{
        final List<MainClassInfo> res = new ArrayList<>();
        IJavaSearchScope scope = SearchEngine.createWorkspaceScope();
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
            searchEngine.search(pattern, new SearchParticipant[] {SearchEngine.getDefaultSearchParticipant()},
                    scope, requestor, new NullProgressMonitor());
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

}
