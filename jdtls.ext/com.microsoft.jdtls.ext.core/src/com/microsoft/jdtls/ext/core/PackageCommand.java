/*******************************************************************************
 * Copyright (c) 2018-2023 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/
package com.microsoft.jdtls.ext.core;

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.stream.Collectors;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IContainer;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IClassFile;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJarEntryResource;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IModuleDescription;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.ITypeRoot;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.internal.core.JarEntryDirectory;
import org.eclipse.jdt.internal.core.JarEntryFile;
import org.eclipse.jdt.internal.core.JarEntryResource;
import org.eclipse.jdt.ls.core.internal.JDTUtils;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.lsp4j.jsonrpc.json.adapters.CollectionTypeAdapter;
import org.eclipse.lsp4j.jsonrpc.json.adapters.EnumTypeAdapter;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.microsoft.jdtls.ext.core.model.NodeKind;
import com.microsoft.jdtls.ext.core.model.PackageNode;
import com.microsoft.jdtls.ext.core.model.PackageRootNode;
import com.microsoft.jdtls.ext.core.model.Trie;
import com.microsoft.jdtls.ext.core.model.TrieNode;
import com.microsoft.jdtls.ext.core.parser.JavaResourceVisitor;
import com.microsoft.jdtls.ext.core.parser.ResourceSet;
import com.microsoft.jdtls.ext.core.parser.ResourceVisitor;

public class PackageCommand {

    private static final Gson gson = new GsonBuilder()
            .registerTypeAdapterFactory(new CollectionTypeAdapter.Factory())
            .registerTypeAdapterFactory(new EnumTypeAdapter.Factory())
            .create();

    private static final Map<NodeKind, BiFunction<PackageParams, IProgressMonitor, List<PackageNode>>> commands;

    static {
        commands = new HashMap<>();
        commands.put(NodeKind.PROJECT, PackageCommand::getProjectChildren);
        commands.put(NodeKind.CONTAINER, PackageCommand::getContainerChildren);
        commands.put(NodeKind.PACKAGEROOT, PackageCommand::getPackageRootChildren);
        commands.put(NodeKind.PACKAGE, PackageCommand::getPackageChildren);
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
     * @throws CoreException when loader is null
     */
    public static List<PackageNode> getChildren(List<Object> arguments, IProgressMonitor pm) throws CoreException {
        if (arguments == null || arguments.size() < 1) {
            throw new IllegalArgumentException("Should have at least one argument for getChildren");
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
     * Resolve the path for Java file URI.
     *
     * @param arguments
     *            List of the arguments which contain one entry of the target
     *            compilation unit URI.
     * @return the list of the path
     * @throws CoreException when fails to create node or get resource
     */
    public static List<PackageNode> resolvePath(List<Object> arguments, IProgressMonitor pm) throws CoreException {
        if (arguments == null || arguments.size() < 1) {
            throw new IllegalArgumentException("Should have one argument for resolvePath");
        }
        String typeRootUri = (String) arguments.get(0);
        List<PackageNode> result = new ArrayList<>();
        URI uri = JDTUtils.toURI(typeRootUri);
        ITypeRoot typeRoot = ExtUtils.JDT_SCHEME.equals(uri.getScheme()) ? JDTUtils.resolveClassFile(uri) : JDTUtils.resolveCompilationUnit(uri);
        if (typeRoot != null && typeRoot.findPrimaryType() != null) {
            // Add project node:
            result.add(PackageNode.createNodeForProject(typeRoot));
            IPackageFragment packageFragment = (IPackageFragment) typeRoot.getAncestor(IJavaElement.PACKAGE_FRAGMENT);
            if (!packageFragment.exists()) {
                return Collections.emptyList();
            }
            IPackageFragmentRoot pkgRoot = (IPackageFragmentRoot) packageFragment.getAncestor(IJavaElement.PACKAGE_FRAGMENT_ROOT);
            // TODO: Let the client handle the display instead. Server side should always
            // provide the container node.
            boolean isClassFile = typeRoot instanceof IClassFile;
            if (isClassFile) {
                result.add(PackageNode.createNodeForVirtualContainer(pkgRoot));
            }
            // for invisible project, removing the '_' link name may cause an empty named package root
            // in this case, we will avoid that 'empty' node from displaying
            PackageNode pkgRootNode = PackageNode.createNodeForPackageFragmentRoot(pkgRoot);
            if (StringUtils.isNotBlank(pkgRootNode.getName())) {
                result.add(pkgRootNode);
            }
            if (!packageFragment.isDefaultPackage()) {
                result.add(PackageNode.createNodeForPackageFragment(packageFragment));
            }
            result.add(PackageNode.createNodeForPrimaryType(typeRoot.findPrimaryType()));
        } else if (ExtUtils.isJarResourceUri(uri)) {
            IJarEntryResource resource = ExtUtils.getJarEntryResource(uri);
            IPackageFragmentRoot pkgRoot = resource.getPackageFragmentRoot();
            result.add(PackageNode.createNodeForProject(pkgRoot));
            result.add(PackageNode.createNodeForVirtualContainer(resource.getPackageFragmentRoot()));
            result.add(PackageNode.createNodeForPackageFragmentRoot(pkgRoot));
            if (resource.getParent() instanceof IPackageFragment) {
                IPackageFragment packageFragment = (IPackageFragment) resource.getParent();
                if (!packageFragment.isDefaultPackage()) {
                    result.add(PackageNode.createNodeForPackageFragment(packageFragment));
                }
            } else {
                int currentSize = result.size();
                // visit back from file to the top folder
                Object currentNode = resource.getParent();
                while (currentNode instanceof JarEntryDirectory) {
                    JarEntryDirectory jarEntryDirectory = (JarEntryDirectory) currentNode;
                    PackageNode jarNode = getJarEntryResource(jarEntryDirectory);
                    if (jarNode != null) {
                        result.add(currentSize, jarNode);
                    }
                    currentNode = jarEntryDirectory.getParent();
                }
            }

            PackageNode item = new PackageNode(resource.getName(), resource.getFullPath().toPortableString(), NodeKind.FILE);
            item.setUri(ExtUtils.toUri(resource));
            result.add(item);
        } else {
            // this is not a .java/.class file
            IResource resource = JDTUtils.findResource(uri, ResourcesPlugin.getWorkspace().getRoot()::findFilesForLocationURI);
            if (resource != null) {
                IResource parent = resource.getParent();
                IJavaElement parentJavaElement = JavaCore.create(parent);
                if (parent instanceof IFolder && parentJavaElement instanceof IPackageFragment) {
                    IPackageFragment packageFragment = (IPackageFragment) parentJavaElement;

                    result.add(PackageNode.createNodeForProject(packageFragment));

                    IPackageFragmentRoot pkgRoot = (IPackageFragmentRoot) packageFragment.getAncestor(IJavaElement.PACKAGE_FRAGMENT_ROOT);
                    // for invisible project, removing the '_' link name may cause an empty named package root
                    // in this case, we will avoid that 'empty' node from displaying
                    PackageNode pkgRootNode = PackageNode.createNodeForPackageFragmentRoot(pkgRoot);
                    if (StringUtils.isNotBlank(pkgRootNode.getName())) {
                        result.add(pkgRootNode);
                    }
                    if (!packageFragment.isDefaultPackage()) {
                        result.add(PackageNode.createNodeForPackageFragment(packageFragment));
                    }

                    PackageNode item = new PackageNode(resource.getName(), resource.getFullPath().toPortableString(), NodeKind.FILE);
                    item.setUri(JDTUtils.getFileURI(resource));
                    result.add(item);
                } else {
                    return getParentAncestorNodes(resource);
                }
            } else {
                IContainer container = JDTUtils.findFolder(typeRootUri);
                IJavaElement element = JavaCore.create(container);
                result.add(PackageNode.createNodeForProject(element));
            }
        }

        return result;
    }

    /**
     * Get the node list from bottom to top until project.
     *
     * @param element
     *          resource to be searched from
     * @return parent node list of element
     * @throws JavaModelException when fails to get path or resource
     */
    private static List<PackageNode> getParentAncestorNodes(IResource element) throws JavaModelException {
        List<PackageNode> nodeList = new LinkedList<>();
        while (element != null && !(element instanceof IWorkspaceRoot)) {
            IJavaElement javaElement = JavaCore.create(element);
            if (javaElement == null) {
                PackageNode entry = PackageNode.createNodeForResource(element);
                if (entry != null) {
                    nodeList.add(0, entry);
                }
            } else if (javaElement instanceof IJavaProject) {
                nodeList.add(0, PackageNode.createNodeForProject(javaElement));
            } else if (javaElement instanceof IPackageFragmentRoot) {
                IPackageFragmentRoot pkgRoot = (IPackageFragmentRoot) javaElement;
                nodeList.add(0, new PackageRootNode(pkgRoot,
                        element.getProjectRelativePath().toPortableString(), NodeKind.PACKAGEROOT));
                nodeList.add(0, PackageNode.createNodeForProject(javaElement));
                return nodeList;
            } else if (javaElement instanceof IPackageFragment) {
                IPackageFragment packageFragment = (IPackageFragment) javaElement;
                if (packageFragment.containsJavaResources() || packageFragment.getNonJavaResources().length > 0) {
                    nodeList.add(0, PackageNode.createNodeForPackageFragment(packageFragment));
                }
            }
            element = element.getParent();
        }

        return nodeList;
    }

    /**
     * Get the class path container list.
     */
    private static List<PackageNode> getProjectChildren(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());
        if (javaProject != null) {
            refreshLocal(javaProject.getProject(), pm);
            List<Object> children = new LinkedList<>();
            boolean hasReferencedLibraries = false;
            try {
                IClasspathEntry[] references = javaProject.getRawClasspath();
                for (IClasspathEntry entry : references) {
                    int entryKind = entry.getEntryKind();
                    if (entryKind == IClasspathEntry.CPE_SOURCE) {
                        IPackageFragmentRoot[] packageFragmentRoots = javaProject.findPackageFragmentRoots(entry);
                        children.addAll(Arrays.asList(packageFragmentRoots));
                    } else if (entryKind == IClasspathEntry.CPE_CONTAINER) {
                        children.add(entry);
                    } else if (entry.getEntryKind() == IClasspathEntry.CPE_LIBRARY || entry.getEntryKind() == IClasspathEntry.CPE_VARIABLE) {
                        hasReferencedLibraries = true;
                    } else {
                        // TODO: handle IClasspathEntry.CPE_PROJECT
                    }
                }
                Collections.addAll(children, javaProject.getNonJavaResources());
            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project library ", e);
            }

            ResourceSet resourceSet = new ResourceSet(children);
            ResourceVisitor visitor = new JavaResourceVisitor(javaProject);
            resourceSet.accept(visitor);
            List<PackageNode> result = visitor.getNodes();

            // Invisible project will always have the referenced libraries entry
            if (!ProjectUtils.isVisibleProject(javaProject.getProject())) {
                result.add(PackageNode.REFERENCED_LIBRARIES_CONTAINER);
            } else if (hasReferencedLibraries) {
                result.add(PackageNode.IMMUTABLE_REFERENCED_LIBRARIES_CONTAINER);
            }
            return result;
        }
        return Collections.emptyList();
    }

    private static List<PackageNode> getContainerChildren(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());
        if (javaProject == null) {
            return Collections.emptyList();
        }

        List<Object> children = new LinkedList<>();
        try {
            IClasspathEntry[] references = javaProject.getRawClasspath();
            if (query.getPath().equals(PackageNode.REFERENCED_LIBRARIES_PATH)) {
                // Process referenced libraries
                children.addAll(Arrays.stream(references)
                    .filter(entry -> entry.getEntryKind() == IClasspathEntry.CPE_LIBRARY || entry.getEntryKind() == IClasspathEntry.CPE_VARIABLE)
                    .collect(Collectors.toList()));
            } else {
                IPackageFragmentRoot[] packageFragmentRoots = findPackageFragmentRoots(javaProject, query);
                if (packageFragmentRoots == null) {
                    return Collections.emptyList();
                }

                for (IPackageFragmentRoot fragmentRoot : packageFragmentRoots) {
                    children.add(fragmentRoot);
                    children.addAll(Arrays.asList(fragmentRoot.getNonJavaResources()));
                }
            }
        } catch (CoreException e) {
            JdtlsExtActivator.logException("Problem load project JAR entries ", e);
        }

        ResourceSet resourceSet = new ResourceSet(children);
        ResourceVisitor visitor = new JavaResourceVisitor(javaProject);
        resourceSet.accept(visitor);
        return visitor.getNodes();
    }

    private static IPackageFragmentRoot[] findPackageFragmentRoots(IJavaProject javaProject, PackageParams query) {
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
                return javaProject.findPackageFragmentRoots(containerEntry);
            }
        } catch (CoreException e) {
            JdtlsExtActivator.log(e);
        }

        return null;
    }

    private static List<PackageNode> getPackageRootChildren(PackageParams query, IProgressMonitor pm) {
        try {
            IPackageFragmentRoot packageRoot = getPackageFragmentRootFromQuery(query);
            if (packageRoot == null) {
                throw new CoreException(
                        new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", query.getPath())));
            }
            List<Object> result = getPackageFragmentRootContent(packageRoot, query.isHierarchicalView(), pm);
            ResourceSet resourceSet = new ResourceSet(result, query.isHierarchicalView());
            ResourceVisitor visitor = new JavaResourceVisitor(packageRoot.getJavaProject());
            resourceSet.accept(visitor);
            return visitor.getNodes();
        } catch (CoreException e) {
            JdtlsExtActivator.logException("Problem load project package ", e);
        }
        return Collections.emptyList();
    }

    private static IPackageFragmentRoot getPackageFragmentRootFromQuery(PackageParams query) {
        IPackageFragmentRoot packageRoot = (IPackageFragmentRoot) JavaCore.create(query.getHandlerIdentifier());
        if (packageRoot != null) {
            return packageRoot;
        }

        if (query.getProjectUri() != null && query.getRootPath() != null) {
            // jar in Referenced Libraries must be constructed from path
            IJavaProject javaProject = getJavaProject(query.getProjectUri());
            if (javaProject != null) {
                try {
                    return javaProject.findPackageFragmentRoot(Path.fromPortableString(query.getRootPath()));
                } catch (JavaModelException e) {
                    JdtlsExtActivator.log(e);
                }
            }
        }

        return null;
    }

    private static List<PackageNode> getPackageChildren(PackageParams query, IProgressMonitor pm) {
        IPackageFragment packageFragment = (IPackageFragment) JavaCore.create(query.getHandlerIdentifier());
        List<Object> children = getChildrenForPackage(packageFragment, pm);
        ResourceSet resourceSet = new ResourceSet(children);
        ResourceVisitor visitor = new JavaResourceVisitor(packageFragment.getJavaProject());
        resourceSet.accept(visitor);
        return visitor.getNodes();
    }

    public static List<Object> getChildrenForPackage(IPackageFragment packageFragment, IProgressMonitor pm) {
        if (packageFragment == null) {
            return Collections.emptyList();
        }

        refreshLocal(packageFragment.getResource(), pm);
        List<Object> children = new LinkedList<>();
        try {
            for (IJavaElement element : packageFragment.getChildren()) {
                if (element instanceof ITypeRoot) {
                    // Filter out the inner class files
                    if (element instanceof IClassFile && element.getElementName().contains("$")) {
                        continue;
                    }
                    IType primaryType = ((ITypeRoot) element).findPrimaryType();
                    if (primaryType != null) {
                        children.add(primaryType);
                    }
                }
            }

            Collections.addAll(children, packageFragment.getNonJavaResources());
        } catch (JavaModelException e) {
            JdtlsExtActivator.log(e);
        }

        return children;
    }

    private static List<PackageNode> getFolderChildren(PackageParams query, IProgressMonitor pm) {
        List<Object> children = new LinkedList<>();
        IJavaProject javaProject = null;
        try {
            IPackageFragmentRoot packageRoot = getPackageFragmentRootFromQuery(query);
            if (packageRoot != null) {
                if (packageRoot.getKind() == IPackageFragmentRoot.K_BINARY) {
                    Object[] resources = packageRoot.getNonJavaResources();
                    for (Object resource : resources) {
                        if (pm.isCanceled()) {
                            throw new OperationCanceledException();
                        }
                        if (resource instanceof JarEntryDirectory) {
                            JarEntryDirectory directory = (JarEntryDirectory) resource;
                            Object[] directoryChildren = findJarDirectoryChildren(directory, query.getPath());
                            if (children != null) {
                                children.addAll(Arrays.asList(directoryChildren));
                            }
                        }
                    }
                } else {
                    javaProject = packageRoot.getJavaProject();
                    IFolder folder = ResourcesPlugin.getWorkspace().getRoot().getFolder(Path.fromPortableString(query.getPath()));
                    if (folder.exists()) {
                        boolean isJavaElement = JavaCore.create(folder) != null;
                        children.addAll(Arrays.stream(folder.members())
                            .filter(f -> isJavaElement ? f instanceof IFile : true)
                            .collect(Collectors.toList())
                        );
                    }
                }
            } else {
                // general resource folder.
                IFolder folder = ResourcesPlugin.getWorkspace().getRoot().getFolder(Path.fromPortableString(query.getPath()));
                if (folder.exists()) {
                    refreshLocal(folder, pm);
                    children.addAll(Arrays.asList(folder.members()));
                    javaProject = JavaCore.create(folder.getProject());
                }
            }

            ResourceSet resourceSet = new ResourceSet(children);
            ResourceVisitor visitor = new JavaResourceVisitor(javaProject);
            resourceSet.accept(visitor);
            return visitor.getNodes();

        } catch (CoreException e) {
            JdtlsExtActivator.logException("Problem load project classfile list ", e);
        }
        return Collections.emptyList();
    }

    /**
     * Return the packages of the package root. Note that when the explorer is in hierarchical mode,
     * We also need to return the deepest common parent packages, for example:
     * - com.microsoft.example <-- this common parent package should be returned.
     *   +-- model
     *   +-- handler
     * Here we use a Trie to find all these packages.
     *
     * @param root the package fragment root
     * @param isHierarchicalView whether the explorer is in hierarchical mode or not
     * @param pm the progress monitor
     */
    public static List<Object> getPackageFragmentRootContent(IPackageFragmentRoot root, boolean isHierarchicalView, IProgressMonitor pm) throws CoreException {
        ArrayList<Object> result = new ArrayList<>();
        refreshLocal(root.getResource(), pm);
        if (isHierarchicalView) {
            Map<String, IJavaElement> map = new HashMap<>();
            for (IJavaElement child : root.getChildren()) {
                map.put(child.getElementName(), child);
            }
            Trie<IJavaElement> trie = new Trie<>(map);
            for (TrieNode<IJavaElement> node : trie.getAllNodes()) {
                if (node.value == null) {
                    continue;
                }
                IPackageFragment fragment = (IPackageFragment) node.value;
                if (fragment.hasChildren() || fragment.getNonJavaResources().length > 0
                        || !fragment.hasSubpackages() || node.children.size() > 1) {
                    result.add(fragment);
                }
            }
        } else {
            for (IJavaElement child : root.getChildren()) {
                IPackageFragment fragment = (IPackageFragment) child;
                if (fragment.hasChildren() || fragment.getNonJavaResources().length > 0 || !fragment.hasSubpackages()) {
                    result.add(fragment);
                }
            }
        }

        Object[] nonJavaResources = root.getNonJavaResources();
        Collections.addAll(result, nonJavaResources);

        IModuleDescription moduleDescription = root.getModuleDescription();
        if (moduleDescription != null) {
            IClassFile moduleInfo = moduleDescription.getClassFile();
            if (moduleInfo != null) {
                result.add(moduleDescription.getClassFile());
            }
        }
        return result;
    }

    private static PackageNode getJarEntryResource(JarEntryResource resource) {
        if (resource instanceof JarEntryDirectory) {
            return new PackageNode(resource.getName(), resource.getFullPath().toPortableString(), NodeKind.FOLDER);
        } else if (resource instanceof JarEntryFile) {
            PackageNode entry = new PackageNode(resource.getName(), resource.getFullPath().toPortableString(), NodeKind.FILE);
            entry.setUri(ExtUtils.toUri(resource));
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

    public static IJavaProject getJavaProject(String projectUri) {
        IWorkspaceRoot root = ResourcesPlugin.getWorkspace().getRoot();
        IContainer[] containers = root.findContainersForLocationURI(JDTUtils.toURI(projectUri));

        if (containers.length == 0) {
            return null;
        }

        // For multi-module scenario, findContainersForLocationURI API may return a container array,
        // need filter out non-Java project and put the result from the nearest project in front.
        containers = Arrays.stream(containers).filter(c -> ProjectUtils.isJavaProject(c.getProject())).toArray(IContainer[]::new);
        Arrays.sort(containers, (Comparator<IContainer>) (IContainer a, IContainer b) -> {
            return a.getFullPath().toPortableString().length() - b.getFullPath().toPortableString().length();
        });

        for (IContainer container : containers) {
            IProject project = container.getProject();
            if (!project.exists()) {
                return null;
            }
            return JavaCore.create(project);
        }
        return null;
    }

    private static void refreshLocal(IResource resource, IProgressMonitor monitor) {
        if (resource == null || !resource.exists()) {
            return;
        }
        try {
            resource.refreshLocal(IResource.DEPTH_ONE, monitor);
        } catch (CoreException e) {
            JdtlsExtActivator.log(e);
        }
    }
}
