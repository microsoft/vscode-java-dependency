/*******************************************************************************
 * Copyright (c) 2018 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core.model;

import java.net.URI;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.jdt.core.IClasspathContainer;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJavaElement;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.ls.core.internal.JDTUtils;

import com.microsoft.jdtls.ext.core.ExtUtils;
import com.microsoft.jdtls.ext.core.JdtlsExtActivator;

/**
 * Represent a PackageNode in the project view.
 */
public class PackageNode {

    public final static String K_TYPE_KIND = "TypeKind";

    /**
     * Kind constant for a class.
     */
    public final static int K_CLASS = 1;

    /**
     * Kind constant for an interface.
     */
    public final static int K_INTERFACE = 2;

    /**
     * Kind constant for an enum.
     */
    public final static int K_ENUM = 3;

    private static final String REFERENCED_LIBRARIES_CONTAINER_NAME = "Referenced Libraries";
    private static final String IMMUTABLE_REFERENCED_LIBRARIES_CONTAINER_NAME = "Referenced Libraries (Read-only)";

    public static final String REFERENCED_LIBRARIES_PATH = "REFERENCED_LIBRARIES_PATH";
    public static final String DEFAULT_PACKAGE_DISPLAYNAME = "(default package)";
    public static final ContainerNode REFERENCED_LIBRARIES_CONTAINER = new ContainerNode(REFERENCED_LIBRARIES_CONTAINER_NAME, REFERENCED_LIBRARIES_PATH,
            NodeKind.CONTAINER, IClasspathEntry.CPE_CONTAINER);
    public static final ContainerNode IMMUTABLE_REFERENCED_LIBRARIES_CONTAINER = new ContainerNode(IMMUTABLE_REFERENCED_LIBRARIES_CONTAINER_NAME,
            REFERENCED_LIBRARIES_PATH, NodeKind.CONTAINER, IClasspathEntry.CPE_CONTAINER);

    /**
     * The name of the PackageNode
     */
    private String name;

    /**
     * The module name of the PackageNode for Java 9 and above
     */
    private String moduleName;

    /**
     * The type of {@link IPath} portable string value
     */
    private String path;

    /**
     * The handlerIdentifier
     */
    private String handlerIdentifier;

    /**
     * The URI value of the PackageNode
     */
    private String uri;

    /**
     * PackageNode kind
     */
    private NodeKind kind;

    /**
     * PackageNode metaData
     */
    private Map<String, Object> metaData;

    /**
     * PackageNode children list
     */
    private List<PackageNode> children;

    public PackageNode() {

    }

    public PackageNode(String name, String path, NodeKind kind) {
        this.name = name;
        this.path = path;
        this.kind = kind;
    }

    public String getHandlerIdentifier() {
        return handlerIdentifier;
    }

    public void setHandlerIdentifier(String handlerIdentifier) {
        this.handlerIdentifier = handlerIdentifier;
    }

    public Map<String, Object> getMetaData() {
        return metaData;
    }

    public void setMetaDataValue(String key, Object value) {
        if (this.metaData == null) {
            this.metaData = new HashMap<>();
        }
        this.metaData.put(key, value);
    }

    public static PackageNode createNodeForProject(IJavaElement javaElement) {
        IProject proj = javaElement.getJavaProject().getProject();
        PackageNode projectNode = new PackageNode(proj.getName(), proj.getFullPath().toPortableString(), NodeKind.PROJECT);
        projectNode.setUri(proj.getLocationURI().toString());
        return projectNode;
    }

    public static PackageNode createNodeForResource(IResource resource) {
        if (resource instanceof IFile) {
            IFile file = (IFile) resource;
            PackageNode entry = new PackageNode(file.getName(), file.getFullPath().toPortableString(), NodeKind.FILE);
            entry.setUri(JDTUtils.getFileURI(file));
            return entry;
        } else if (resource instanceof IFolder) {
            IFolder folder = (IFolder) resource;
            PackageNode entry = new PackageNode(folder.getName(), folder.getFullPath().toPortableString(), NodeKind.FOLDER);
            entry.setUri(JDTUtils.getFileURI(folder));
            return entry;
        }
        return null;
    }

    public static PackageNode createNodeForPackageFragment(IPackageFragment packageFragment) {
        String packageName = packageFragment.isDefaultPackage() ? DEFAULT_PACKAGE_DISPLAYNAME : packageFragment.getElementName();
        PackageNode fragmentNode = new PackageNode(packageName, packageFragment.getPath().toPortableString(), NodeKind.PACKAGE);
        fragmentNode.setHandlerIdentifier(packageFragment.getHandleIdentifier());
        return fragmentNode;
    }

    public static PackageNode createNodeForVirtualContainer(IPackageFragmentRoot pkgRoot) throws JavaModelException {
        IClasspathEntry entry = pkgRoot.getRawClasspathEntry();
        IClasspathContainer container = JavaCore.getClasspathContainer(entry.getPath(), pkgRoot.getJavaProject());
        PackageNode containerNode = null;
        if (entry.getEntryKind() == IClasspathEntry.CPE_LIBRARY || entry.getEntryKind() == IClasspathEntry.CPE_VARIABLE) {
            containerNode = REFERENCED_LIBRARIES_CONTAINER;
        } else {
            containerNode = new ContainerNode(container.getDescription(), container.getPath().toPortableString(), NodeKind.CONTAINER, entry.getEntryKind());
        }
        return containerNode;

    }

    public static PackageNode createNodeForPackageFragmentRoot(IPackageFragmentRoot pkgRoot) throws JavaModelException {
        boolean isSourcePath = pkgRoot.getKind() == IPackageFragmentRoot.K_SOURCE;
        if (!isSourcePath) {
            IClasspathEntry entry = pkgRoot.getRawClasspathEntry();
            // Process Referenced Variable
            if (entry.getEntryKind() == IClasspathEntry.CPE_VARIABLE) {
                return createNodeForClasspathVariable(entry);
            } else {
                return new PackageRootNode(pkgRoot, pkgRoot.getElementName(), NodeKind.PACKAGEROOT);
            }
        } else {
            return new PackageRootNode(pkgRoot,
                    ExtUtils.removeProjectSegment(pkgRoot.getJavaProject().getElementName(), pkgRoot.getPath()).toPortableString(), NodeKind.PACKAGEROOT);
        }
    }

    /**
     * Get the correspond node of classpath, it may be container or a package root
     *
     * @param classpathEntry
     *            classpath entry
     * @param javaProject
     *            correspond java project
     * @param nodeKind
     *            could be CONTAINER or PACKAGEROOT(for referenced libraries)
     * @return correspond PackageNode of classpath entry
     */
    public static PackageNode createNodeForClasspathEntry(IClasspathEntry classpathEntry, IJavaProject javaProject, NodeKind nodeKind) {
        try {
            IClasspathEntry entry = JavaCore.getResolvedClasspathEntry(classpathEntry);
            IClasspathContainer container = JavaCore.getClasspathContainer(entry.getPath(), javaProject);
            // HACK: There is an initialization issue for the first container.
            if (container == null) {
                container = JavaCore.getClasspathContainer(entry.getPath(), javaProject);
            }
            if (container != null) {
                PackageNode node = null;
                if (nodeKind == NodeKind.CONTAINER) {
                    node = new ContainerNode(container.getDescription(), container.getPath().toPortableString(), nodeKind, entry.getEntryKind());
                    final URI containerURI = ExtUtils.getContainerURI(javaProject, container);
                    node.setUri(containerURI != null ? containerURI.toString() : null);
                } else if (nodeKind == NodeKind.PACKAGEROOT) { // ClasspathEntry for referenced jar files
                    // Use package name as package root name
                    String[] pathSegments = container.getPath().segments();
                    node = new PackageRootNode(
                        pathSegments[pathSegments.length - 1],
                        container.getPath().toPortableString(),
                        container.getPath().toFile().toURI().toString(),
                        nodeKind, IPackageFragmentRoot.K_BINARY);
                }
                return node;
            }
        } catch (CoreException e) {
            JdtlsExtActivator.logException("Problems when convert classpath entry to package node ", e);
        }
        return null;
    }

    public static PackageNode createNodeForPrimaryType(IType type) {
        PackageNode primaryTypeNode = new PackageNode(type.getElementName(), type.getPath().toPortableString(), NodeKind.PRIMARYTYPE);

        try {
            if (type.isEnum()) {
                primaryTypeNode.setMetaDataValue(K_TYPE_KIND, K_ENUM);
            } else if (type.isInterface()) {
                primaryTypeNode.setMetaDataValue(K_TYPE_KIND, K_INTERFACE);
            } else {
                primaryTypeNode.setMetaDataValue(K_TYPE_KIND, K_CLASS);
            }
        } catch (JavaModelException e) {
            primaryTypeNode.setMetaDataValue(K_TYPE_KIND, K_CLASS);
        }

        primaryTypeNode.setUri(JDTUtils.toUri(type.getTypeRoot()));
        return primaryTypeNode;
    }

    /**
     * Get correspond node of referenced variable
     *
     * @param classpathEntry
     *            referenced variable's classpath entry
     * @return correspond package node
     */
    public static PackageNode createNodeForClasspathVariable(IClasspathEntry classpathEntry) {
        IClasspathEntry entry = JavaCore.getResolvedClasspathEntry(classpathEntry);
        String name = classpathEntry.getPath().toPortableString();
        String path = entry.getPath().toPortableString();
        String uri = entry.getPath().toFile().toURI().toString();
        return new PackageRootNode(name, path, uri, NodeKind.PACKAGEROOT, IPackageFragmentRoot.K_BINARY);
    }

    public String getName() {
        return name;
    }

    public void setModuleName(String moduleName) {
        this.moduleName = moduleName;
    }

    public String getModuleName() {
        return moduleName;
    }

    public String getPath() {
        return path;
    }

    public NodeKind getKind() {
        return kind;
    }

    public String getUri() {
        return this.uri;
    }

    public void setUri(String uri) {
        this.uri = uri;
    }

    public List<PackageNode> getChildren() {
        return this.children;
    }

    public void setChildren(List<PackageNode> children) {
        this.children = children;
    }
}
