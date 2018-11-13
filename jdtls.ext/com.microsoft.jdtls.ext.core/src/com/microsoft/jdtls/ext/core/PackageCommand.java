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
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IContainer;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IClassFile;
import org.eclipse.jdt.core.IClasspathContainer;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IJarEntryResource;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.internal.core.JarEntryDirectory;
import org.eclipse.jdt.internal.core.JarEntryFile;
import org.eclipse.jdt.internal.core.JarEntryResource;
import org.eclipse.jdt.internal.core.JrtPackageFragmentRoot;
import org.eclipse.jdt.ls.core.internal.JDTUtils;
import org.eclipse.lsp4j.jsonrpc.json.adapters.CollectionTypeAdapterFactory;
import org.eclipse.lsp4j.jsonrpc.json.adapters.EnumTypeAdapterFactory;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.microsoft.jdtls.ext.core.model.ContainerNode;
import com.microsoft.jdtls.ext.core.model.NodeKind;
import com.microsoft.jdtls.ext.core.model.PackageNode;
import com.microsoft.jdtls.ext.core.model.PackageRootNode;
import com.microsoft.jdtls.ext.core.model.TypeRootNode;

@SuppressWarnings("deprecation")
public class PackageCommand {

    private static final String DEFAULT_PACKAGE_DISPLAYNAME = "(default package)";

    private static final Gson gson = new GsonBuilder().registerTypeAdapterFactory(new CollectionTypeAdapterFactory())
            .registerTypeAdapterFactory(new EnumTypeAdapterFactory()).create();

    private static final Map<NodeKind, BiFunction<PackageParams, IProgressMonitor, List<PackageNode>>> commands;

    static {
        commands = new HashMap<>();
        commands.put(NodeKind.PROJECT, PackageCommand::getContainers);
        commands.put(NodeKind.CONTAINER, PackageCommand::getPackageFragmentRoots);
        commands.put(NodeKind.PACKAGEROOT, PackageCommand::getPackages);
        commands.put(NodeKind.PACKAGE, PackageCommand::getRootTypes);
		commands.put(NodeKind.FOLDER, PackageCommand::getFolderChildren);
    }

    /**
     * Get the child list of ClasspathNode for the project dependency node.
     *
     * @param arguments
     *            List of the arguments which contain two entries to get class path
     *            children: the first entry is the query target node type
     *            {@link NodeKind} and the second one is the query instance of type
     *            {@link PackageParams}
     * @return the found ClasspathNode list
     * @throws CoreException
     */
    public static List<PackageNode> getChildren(List<Object> arguments, IProgressMonitor pm) throws CoreException {
        if (arguments == null || arguments.size() < 1) {
            throw new IllegalArgumentException("Should have at least one arugment for getChildren");
        }
        PackageParams params = gson.fromJson(gson.toJson(arguments.get(0)), PackageParams.class);

        BiFunction<PackageParams, IProgressMonitor, List<PackageNode>> loader = commands.get(params.getKind());
        if (loader == null) {
            throw new CoreException(new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("Unknown classpath item type: %s", params.getKind())));
        }
        List<PackageNode> result = loader.apply(params, pm);
        return result;
    }

    /**
     * Resolve the path for Java file URI
     *
     * @param arguments
     *            List of the arguments which contain one entry of the target
     *            compilation unit URI.
     *
     * @return the list of the path
     * @throws CoreException
     */
    public static List<PackageNode> resolvePath(List<Object> arguments, IProgressMonitor pm) throws CoreException {
        if (arguments == null || arguments.size() < 1) {
            throw new IllegalArgumentException("Should have one arugment for resolvePath");
        }
        String typeRootUri = (String) arguments.get(0);

        List<PackageNode> result = new ArrayList<>();

        ICompilationUnit cu = JDTUtils.resolveCompilationUnit(typeRootUri);
        if (cu != null) {
            // Add project node:
            IProject proj = cu.getJavaProject().getProject();
            PackageNode projectNode = new PackageNode(proj.getName(), proj.getFullPath().toPortableString(), NodeKind.PROJECT);
            projectNode.setUri(proj.getLocationURI().toString());
            result.add(projectNode);

            IPackageFragment packageFragment = (IPackageFragment) cu.getParent();
            String packageName = packageFragment.isDefaultPackage() ? DEFAULT_PACKAGE_DISPLAYNAME : packageFragment.getElementName();
            PackageNode packageNode = new PackageNode(packageName, packageFragment.getPath().toPortableString(), NodeKind.PACKAGE);
            IPackageFragmentRoot pkgRoot = (IPackageFragmentRoot) packageFragment.getParent();
            PackageNode rootNode = new PackageRootNode(
                    ExtUtils.removeProjectSegment(cu.getJavaProject().getElementName(), pkgRoot.getPath()).toPortableString(),
                    pkgRoot.getPath().toPortableString(), NodeKind.PACKAGEROOT, pkgRoot.getKind());
            result.add(rootNode);
            result.add(packageNode);

            PackageNode item = new TypeRootNode(cu.getElementName(), cu.getPath().toPortableString(), NodeKind.TYPEROOT, TypeRootNode.K_SOURCE);
            item.setUri(JDTUtils.toURI(cu));
            result.add(item);
        }

        return result;
    }

    /**
     * Get the class path container list.
     */
    private static List<PackageNode> getContainers(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());

        if (javaProject != null) {
            try {
                IClasspathEntry[] references = javaProject.getRawClasspath();
                return Arrays.stream(references).map(entry -> {
                    try {
                        entry = JavaCore.getResolvedClasspathEntry(entry);
                        IClasspathContainer container = JavaCore.getClasspathContainer(entry.getPath(), javaProject);
                        // HACK: There is an initialization issue for the first container.
                        if (container == null) {
                            container = JavaCore.getClasspathContainer(entry.getPath(), javaProject);
                        }

                        if (container != null) {
                            return new ContainerNode(container.getDescription(), container.getPath().toPortableString(), NodeKind.CONTAINER,
                                    entry.getEntryKind());
                        }
                    } catch (CoreException e) {
                        // Ignore it
                    }
                    return null;
                }).filter(containerNode -> containerNode != null).collect(Collectors.toList());
            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project library ", e);
            }
        }
        return Collections.emptyList();
    }

    private static List<PackageNode> getPackageFragmentRoots(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());

        if (javaProject != null) {
            try {
                IClasspathEntry[] references = javaProject.getRawClasspath();
                IClasspathEntry containerEntry = null;
                for (IClasspathEntry reference : references) {
                    if (reference.getPath().equals(Path.fromPortableString(query.getPath()))) {
                        containerEntry = reference;
                        break;
                    }
                }
                if (containerEntry != null) {
                    ArrayList<PackageNode> children = new ArrayList<>();
                    IPackageFragmentRoot[] packageFragmentRoots = javaProject.findPackageFragmentRoots(containerEntry);
                    for (IPackageFragmentRoot fragmentRoot : packageFragmentRoots) {
                        String displayName = fragmentRoot.getElementName();
                        if (fragmentRoot.getKind() == IPackageFragmentRoot.K_SOURCE) {
                            displayName = ExtUtils.removeProjectSegment(javaProject.getElementName(), fragmentRoot.getPath()).toPortableString();
                        }
                        PackageNode node = new PackageRootNode(displayName, fragmentRoot.getPath().toPortableString(), NodeKind.PACKAGEROOT,
                                fragmentRoot.getKind());
                        children.add(node);
                        if (fragmentRoot instanceof JrtPackageFragmentRoot) {
                            node.setModuleName(fragmentRoot.getModuleDescription().getElementName());
                        }
                    }
                    return children;
                }
            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project JAR entries ", e);
            }
        }

        return Collections.emptyList();
    }

    private static List<PackageNode> getPackages(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());

        if (javaProject != null) {

            try {
                IPackageFragmentRoot packageRoot = javaProject.findPackageFragmentRoot(Path.fromPortableString(query.getRootPath()));
                if (packageRoot == null) {
                    throw new CoreException(
                            new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", query.getPath())));
                }
                Object[] result = getPackageFragmentRootContent(packageRoot, pm);
                return convertToPackageNode(result);
            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project package ", e);
            }
        }
        return Collections.emptyList();
    }

    private static List<PackageNode> getRootTypes(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());
        if (javaProject != null) {
            try {
                IPackageFragmentRoot packageRoot = javaProject.findPackageFragmentRoot(Path.fromPortableString(query.getRootPath()));
                if (packageRoot == null) {
                    throw new CoreException(
                            new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", query.getPath())));
                }
                IPackageFragment packageFragment = packageRoot.getPackageFragment(DEFAULT_PACKAGE_DISPLAYNAME.equals(query.getPath()) ? "" : query.getPath());
                if (packageFragment != null) {
                    IJavaElement[] types = packageFragment.getChildren();
                    return Arrays.stream(types).filter(typeRoot -> !typeRoot.getElementName().contains("$")).map(typeRoot -> {
                        PackageNode item = new TypeRootNode(typeRoot.getElementName(), typeRoot.getPath().toPortableString(), NodeKind.TYPEROOT,
                                typeRoot instanceof IClassFile ? TypeRootNode.K_BINARY : TypeRootNode.K_SOURCE);
                        if (typeRoot instanceof ICompilationUnit) {
                            item.setUri(JDTUtils.toURI((ICompilationUnit) typeRoot));
                        } else if (typeRoot instanceof IClassFile) {
                            item.setUri(JDTUtils.toUri((IClassFile) typeRoot));
                        }
                        return item;
                    }).collect(Collectors.toList());

                }
            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project classfile list ", e);
            }
        }
        return Collections.emptyList();
    }

    private static List<PackageNode> getFolderChildren(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());
        if (javaProject != null) {
            try {
                IPackageFragmentRoot packageRoot = javaProject.findPackageFragmentRoot(Path.fromPortableString(query.getRootPath()));
                if (packageRoot == null) {
                    throw new CoreException(
                            new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", query.getPath())));
                }
                // jar file and folders
                Object[] resources = packageRoot.getNonJavaResources();
                for (Object resource : resources) {
                    if (pm.isCanceled()) {
                        throw new OperationCanceledException();
                    }
                    if (resource instanceof JarEntryDirectory) {
                        JarEntryDirectory directory = (JarEntryDirectory) resource;
                        Object[] children = findJarDirectoryChildren(directory, query.getPath());
                        if (children != null) {
                            return convertToPackageNode(children);
                        }
                    } else if (resource instanceof IFolder) {
                        IFolder directory = (IFolder) resource;
                        Object[] children = directory.members();
                        if (children != null) {
                            return convertToPackageNode(children);
                        }
                    }
                }

            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project classfile list ", e);
            }
        }
        return Collections.emptyList();
    }

    private static Object[] getPackageFragmentRootContent(IPackageFragmentRoot root, IProgressMonitor pm) throws CoreException {
        ArrayList<Object> result = new ArrayList<>();
        for (IJavaElement child : root.getChildren()) {
            IPackageFragment fragment = (IPackageFragment) child;
            if (fragment.hasChildren()) {
                result.add(child);
            }
        }
        Object[] nonJavaResources = root.getNonJavaResources();
        Collections.addAll(result, nonJavaResources);
        return result.toArray();
    }

    private static List<PackageNode> convertToPackageNode(Object[] rootContent) throws JavaModelException {
        List<PackageNode> result = new ArrayList<>();
        for (Object root : rootContent) {
            if (root instanceof IPackageFragment) {
                IPackageFragment packageFragment = (IPackageFragment) root;
                String packageName = packageFragment.isDefaultPackage() ? DEFAULT_PACKAGE_DISPLAYNAME : packageFragment.getElementName();
                PackageNode entry = new PackageNode(packageName, packageFragment.getPath().toPortableString(), NodeKind.PACKAGE);
                result.add(entry);
            } else if (root instanceof IClassFile) {
                IClassFile classFile = (IClassFile) root;
                PackageNode entry = new PackageNode(classFile.getElementName(), null, NodeKind.TYPEROOT);
                entry.setUri(JDTUtils.toUri(classFile));
                result.add(entry);
            } else if (root instanceof JarEntryResource) {
                PackageNode jarNode = getJarEntryResource((JarEntryResource) root);
                if (jarNode != null) {
                    result.add(jarNode);
                }
            } else if (root instanceof IFile) {
                IFile file = (IFile) root;
                PackageNode entry = new PackageNode(file.getName(), null, NodeKind.FILE);
                entry.setUri(JDTUtils.getFileURI(file));
                result.add(entry);
            } else if (root instanceof IFolder) {
                IFolder folder = (IFolder) root;
                PackageNode entry = new PackageNode(folder.getName(), null, NodeKind.FOLDER);
                entry.setUri(JDTUtils.getFileURI(folder));
                result.add(entry);
            }
        }

        return result;
    }

    private static PackageNode getJarEntryResource(JarEntryResource resource) {
        if (resource instanceof JarEntryDirectory) {
			return new PackageNode(resource.getName(), resource.getFullPath().toPortableString(), NodeKind.FOLDER);
        } else if (resource instanceof JarEntryFile) {
            PackageNode entry = new PackageNode(resource.getName(), resource.getFullPath().toPortableString(), NodeKind.FILE);
            entry.setUri(ExtUtils.toUri((JarEntryFile) resource));
            return entry;
        }
        return null;
    }

    private static Object[] findJarDirectoryChildren(JarEntryDirectory directory, String path) {
        String directoryPath = directory.getFullPath().toPortableString();
        if (directoryPath.equals(path)) {
            return directory.getChildren();
        }
        if (path.startsWith(directoryPath)) {
            for (IJarEntryResource resource : directory.getChildren()) {
                String childrenPath = resource.getFullPath().toPortableString();
                if (childrenPath.equals(path)) {
                    return resource.getChildren();
                }
                if (path.startsWith(childrenPath) && resource instanceof JarEntryDirectory) {
                    Object[] result = findJarDirectoryChildren((JarEntryDirectory) resource, path);
                    if (result != null) {
                        return result;
                    }
                }
            }
        }
        return null;
    }

    private static IJavaProject getJavaProject(String projectUri) {
        IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
        IContainer[] containers = root.findContainersForLocationURI(JDTUtils.toURI(projectUri));

        if (containers.length == 0) {
            return null;
        }

        for (IContainer container : containers) {
            if (!(container instanceof IProject)) {
                continue;
            }
            IProject project = container.getProject();
            if (!project.exists()) {
                return null;
            }
            return JavaCore.create(project);
        }
        return null;
    }
}
