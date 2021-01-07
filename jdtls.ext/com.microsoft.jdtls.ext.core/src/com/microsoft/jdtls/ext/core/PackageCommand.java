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

import java.net.URI;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
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
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.core.runtime.Path;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IClassFile;
import org.eclipse.jdt.core.IClasspathAttribute;
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
import org.eclipse.jdt.internal.core.JrtPackageFragmentRoot;
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

public class PackageCommand {

    private static final Gson gson = new GsonBuilder()
            .registerTypeAdapterFactory(new CollectionTypeAdapter.Factory())
            .registerTypeAdapterFactory(new EnumTypeAdapter.Factory())
            .create();

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
        List<PackageNode> nodeList = new ArrayList<>();
        while (element != null) {
            IJavaElement javaElement = JavaCore.create(element);
            if (javaElement instanceof IPackageFragmentRoot) {
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

            } else if (javaElement == null) {
                PackageNode entry = PackageNode.createNodeForResource(element);
                if (entry != null) {
                    nodeList.add(0, entry);
                }
            }
            element = element.getParent();
        }

        return nodeList;
    }

    /**
     * Get the class path container list.
     */
    private static List<PackageNode> getContainers(PackageParams query, IProgressMonitor pm) {
        IJavaProject javaProject = getJavaProject(query.getProjectUri());
        if (javaProject != null) {
            try {
                IClasspathEntry[] references = javaProject.getRawClasspath();
                List<PackageNode> result = Arrays.stream(references)
                        .filter(entry -> entry.getEntryKind() != IClasspathEntry.CPE_LIBRARY && entry.getEntryKind() != IClasspathEntry.CPE_VARIABLE)
                        .map(entry -> PackageNode.createNodeForClasspathEntry(entry, javaProject, NodeKind.CONTAINER))
                        .filter(containerNode -> containerNode != null)
                        .collect(Collectors.toList());
                boolean isReferencedLibrariesExist = Arrays.stream(references)
                        .anyMatch(entry -> entry.getEntryKind() == IClasspathEntry.CPE_LIBRARY || entry.getEntryKind() == IClasspathEntry.CPE_VARIABLE);
                // Invisble project will always have the referenced libraries entry
                if (!ProjectUtils.isVisibleProject(javaProject.getProject())) {
                    result.add(PackageNode.REFERENCED_LIBRARIES_CONTAINER);
                } else if (isReferencedLibrariesExist) {
                    result.add(PackageNode.IMMUTABLE_REFERENCED_LIBRARIES_CONTAINER);
                }
                return result;
            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project library ", e);
            }
        }
        return Collections.emptyList();
    }

    private static List<PackageNode> getPackageFragmentRoots(PackageParams query, IProgressMonitor pm) {
        ArrayList<PackageNode> children = new ArrayList<>();
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
                    IPackageFragmentRoot[] packageFragmentRoots = javaProject.findPackageFragmentRoots(containerEntry);
                    for (IPackageFragmentRoot fragmentRoot : packageFragmentRoots) {
                        PackageRootNode node = PackageNode.createNodeForPackageFragmentRoot(fragmentRoot);
                        if (StringUtils.isNotBlank(node.getName())) {
                            node.setHandlerIdentifier(fragmentRoot.getHandleIdentifier());
                            if (fragmentRoot instanceof JrtPackageFragmentRoot) {
                                node.setModuleName(fragmentRoot.getModuleDescription().getElementName());
                            }

                            IClasspathEntry resolvedClasspathEntry = fragmentRoot.getResolvedClasspathEntry();
                            if (resolvedClasspathEntry != null) {
                                Map<String, String> attributes = new HashMap<>();
                                for (IClasspathAttribute attribute : resolvedClasspathEntry.getExtraAttributes()) {
                                    attributes.put(attribute.getName(), attribute.getValue());
                                }
                                node.setAttributes(attributes);
                            }

                            children.add(node);
                        } else {
                            // for invisible project, the package root name may become empty after removing the '_',
                            // in this case, we skip this root node from showing in the explorer and keep finding its children.
                            PackageParams subQuery = new PackageParams(NodeKind.PACKAGEROOT, query.getProjectUri(),
                                    query.getPath(), fragmentRoot.getHandleIdentifier());
                            List<PackageNode> packageNodes = getPackages(subQuery, pm);
                            children.addAll(packageNodes);
                        }
                    }
                    return children;
                } else if (query.getPath().equals(PackageNode.REFERENCED_LIBRARIES_PATH)) {
                    // Process referenced libraries
                    List<PackageNode> referLibs = Arrays.stream(references).filter(entry -> entry.getEntryKind() == IClasspathEntry.CPE_LIBRARY)
                            .map(classpath -> PackageNode.createNodeForClasspathEntry(classpath, javaProject, NodeKind.PACKAGEROOT))
                            .filter(entry -> entry != null)
                            .collect(Collectors.toList());
                    List<PackageNode> referVariables = Arrays.stream(references).filter(entry -> entry.getEntryKind() == IClasspathEntry.CPE_VARIABLE)
                            .map(classpath -> PackageNode.createNodeForClasspathVariable(classpath)).filter(entry -> entry != null)
                            .collect(Collectors.toList());
                    children.addAll(referLibs);
                    children.addAll(referVariables);
                    return children;
                }
            } catch (CoreException e) {
                JdtlsExtActivator.logException("Problem load project JAR entries ", e);
            }
        }

        return Collections.emptyList();
    }

    private static List<PackageNode> getPackages(PackageParams query, IProgressMonitor pm) {
        try {
            IPackageFragmentRoot packageRoot = getPackageFragmentRootFromQuery(query);
            if (packageRoot == null) {
                throw new CoreException(
                        new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", query.getPath())));
            }
            Object[] result = getPackageFragmentRootContent(packageRoot, query.isHierarchicalView(), pm);
            return convertToPackageNode(result, packageRoot, pm);
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

        // jar in Referenced Libraries must be constructed from path
        IJavaProject javaProject = getJavaProject(query.getProjectUri());
        if (javaProject != null) {
            try {
                packageRoot = javaProject.findPackageFragmentRoot(Path.fromPortableString(query.getRootPath()));
            } catch (JavaModelException e) {
                return null;
            }
        }

        return packageRoot;
    }

    private static List<PackageNode> getRootTypes(PackageParams query, IProgressMonitor pm) {
        try {
            IPackageFragment packageFragment = (IPackageFragment) JavaCore.create(query.getHandlerIdentifier());
            if (packageFragment != null) {
                List<IType> primaryTypes = new ArrayList<>();
                for (IJavaElement element : packageFragment.getChildren()) {
                    if (element instanceof ITypeRoot) {
                        // Filter out the inner class files
                        if (element instanceof IClassFile && element.getElementName().contains("$")) {
                            continue;
                        }
                        IType primaryType = ((ITypeRoot) element).findPrimaryType();
                        if (primaryType != null) {
                            primaryTypes.add(primaryType);
                        }
                    }
                }
                Object[] nonJavaResources = packageFragment.getNonJavaResources();
                List<PackageNode> rootTypeNodes = primaryTypes.stream()
                    .map(PackageNode::createNodeForPrimaryType)
                    .collect(Collectors.toList());
                if (nonJavaResources.length == 0) {
                    return rootTypeNodes;
                }
                // when .java files and other .properties files are mixed up
                rootTypeNodes.addAll(
                        Arrays.stream(nonJavaResources).filter(resource -> resource instanceof IFile || resource instanceof JarEntryFile).map(resource -> {
                            if (resource instanceof IFile) {
                                IFile file = (IFile) resource;
                                PackageNode item = new PackageNode(file.getName(), file.getFullPath().toPortableString(), NodeKind.FILE);
                                item.setUri(JDTUtils.getFileURI(file));
                                return item;
                            } else {
                                JarEntryFile file = (JarEntryFile) resource;
                                PackageNode entry = new PackageNode(file.getName(), file.getFullPath().toPortableString(), NodeKind.FILE);
                                entry.setUri(ExtUtils.toUri((JarEntryFile) resource));
                                return entry;
                            }

                        }).collect(Collectors.toList()));
                return rootTypeNodes;
            }
        } catch (CoreException e) {
            JdtlsExtActivator.logException("Problem load project classfile list ", e);
        }
        return Collections.emptyList();
    }

    private static List<PackageNode> getFolderChildren(PackageParams query, IProgressMonitor pm) {
        try {
            IPackageFragmentRoot packageRoot = (IPackageFragmentRoot) JavaCore.create(query.getHandlerIdentifier());
            if (packageRoot == null) {
                throw new CoreException(
                        new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", query.getPath())));
            }
            if (packageRoot.getKind() == IPackageFragmentRoot.K_BINARY) {
                Object[] resources = packageRoot.getNonJavaResources();
                for (Object resource : resources) {
                    if (pm.isCanceled()) {
                        throw new OperationCanceledException();
                    }
                    if (resource instanceof JarEntryDirectory) {
                        JarEntryDirectory directory = (JarEntryDirectory) resource;
                        Object[] children = findJarDirectoryChildren(directory, query.getPath());
                        if (children != null) {
                            return convertToPackageNode(children, null, pm);
                        }
                    }
                }
            } else {
                IJavaProject javaProject = packageRoot.getJavaProject();
                IFolder folder = javaProject.getProject().getFolder(new Path(query.getPath()).makeRelativeTo(javaProject.getProject().getFullPath()));
                if (folder != null && folder.exists()) {
                    Object[] children = JavaCore.create(folder) != null ? Arrays.stream(folder.members()).filter(t -> t instanceof IFile).toArray()
                            : folder.members();
                    if (children != null) {
                        return convertToPackageNode(children, null, pm);
                    }
                }
            }

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
    private static Object[] getPackageFragmentRootContent(IPackageFragmentRoot root, boolean isHierarchicalView, IProgressMonitor pm) throws CoreException {
        ArrayList<Object> result = new ArrayList<>();
        if (isHierarchicalView) {
            Map<String, IJavaElement> map = new HashMap<>();
            for (IJavaElement child : root.getChildren()) {
                map.put(child.getElementName(), child);
            }
            Trie<IJavaElement> trie = new Trie<>(map);
            for (TrieNode<IJavaElement> node : trie.getAllNodes()) {
                IPackageFragment fragment = (IPackageFragment) node.value;
                if (fragment != null && fragment.hasChildren() || fragment.getNonJavaResources().length > 0
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
        return result.toArray();
    }

    private static List<PackageNode> convertToPackageNode(Object[] rootContent, IPackageFragmentRoot packageRoot,
            IProgressMonitor pm) throws JavaModelException {
        List<PackageNode> result = new ArrayList<>();
        for (Object root : rootContent) {
            if (root instanceof IPackageFragment) {
                IPackageFragment fragment = (IPackageFragment) root;
                if (fragment.isDefaultPackage()) {
                    // directly show root types under default package
                    PackageParams subQuery = new PackageParams(NodeKind.PACKAGE, packageRoot.getJavaProject().getProject().getLocationURI().toString(),
                            fragment.getPath().toPortableString(), fragment.getHandleIdentifier());
                    List<PackageNode> packageNodes = getRootTypes(subQuery, pm);
                    result.addAll(packageNodes);
                } else {
                    PackageNode entry = PackageNode.createNodeForPackageFragment(fragment);
                    if (fragment.getResource() != null) {
                        entry.setUri(fragment.getResource().getLocationURI().toString());
                    } else {
                        entry.setUri(fragment.getPath().toFile().toURI().toString());
                    }
                    result.add(entry);
                }
            } else if (root instanceof IClassFile) {
                IClassFile classFile = (IClassFile) root;
                PackageNode entry = new PackageNode(classFile.getElementName(), null, NodeKind.FILE);
                entry.setUri(JDTUtils.toUri(classFile));
                result.add(entry);
            } else if (root instanceof JarEntryResource) {
                PackageNode jarNode = getJarEntryResource((JarEntryResource) root);
                if (jarNode != null) {
                    result.add(jarNode);
                }
            } else if (root instanceof IFile) {
                IFile file = (IFile) root;
                PackageNode entry = new PackageNode(file.getName(), file.getFullPath().toPortableString(), NodeKind.FILE);
                entry.setUri(JDTUtils.getFileURI(file));
                result.add(entry);
            } else if (root instanceof IFolder) {
                IFolder folder = (IFolder) root;
                String displayName = folder.getName();
                if (packageRoot != null) {
                    // together with package list, we need to provide full folder name relative to
                    // package root
                    IPath path = folder.getFullPath().makeRelativeTo(packageRoot.getPath());
                    displayName = StringUtils.replace(path.toPortableString(), "/", ".");
                }

                PackageNode entry = new PackageNode(displayName, folder.getFullPath().toPortableString(), NodeKind.FOLDER);
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
        // need put the result from the nearest project in front.
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
}
