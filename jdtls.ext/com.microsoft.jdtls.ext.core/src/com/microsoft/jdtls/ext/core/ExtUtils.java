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
import java.net.URISyntaxException;
import java.util.Arrays;

import org.apache.commons.lang3.StringUtils;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
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
import org.eclipse.jdt.ls.core.internal.JDTUtils;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;

import com.microsoft.jdtls.ext.core.model.ContainerNode;
import com.microsoft.jdtls.ext.core.model.NodeKind;
import com.microsoft.jdtls.ext.core.model.PackageNode;
import com.microsoft.jdtls.ext.core.model.PackageRootNode;
import com.microsoft.jdtls.ext.core.model.TypeRootNode;

public final class ExtUtils {
    private static final String REFERENCED_LIBRARIES_CONTAINER_NAME = "Referenced Libraries";

    public static final String REFERENCED_LIBRARIES_PATH = "REFERENCED_LIBRARIES_PATH";
    public static final String DEFAULT_PACKAGE_DISPLAYNAME = "(default package)";
    public static final ContainerNode REFERENCED_LIBRARIES_CONTAINER = new ContainerNode(REFERENCED_LIBRARIES_CONTAINER_NAME, REFERENCED_LIBRARIES_PATH,
            NodeKind.CONTAINER, IClasspathEntry.CPE_CONTAINER);

    private static final String JDT_SCHEME = "jdt";
    private static final String CONTENTS_AUTHORITY = "jarentry";

    public static String toUri(IJarEntryResource jarEntryFile) {
        IPackageFragmentRoot fragmentRoot = jarEntryFile.getPackageFragmentRoot();
        try {
            return new URI(JDT_SCHEME, CONTENTS_AUTHORITY, jarEntryFile.getFullPath().toPortableString(), fragmentRoot.getHandleIdentifier(), null).toASCIIString();
        } catch (URISyntaxException e) {
            JavaLanguageServerPlugin.logException("Error generating URI for jarentryfile ", e);
            return null;
        }
    }

    public static boolean isJarResourceUri(URI uri) {
        return uri != null && JDT_SCHEME.equals(uri.getScheme()) && CONTENTS_AUTHORITY.equals(uri.getAuthority());
    }

    public static IJarEntryResource createJarResource(URI uri) throws JavaModelException {
        String handleId = uri.getQuery();
        IPackageFragmentRoot packageRoot = (IPackageFragmentRoot) JavaCore.create(handleId);
        String path = uri.getPath();

        // if the file exists in the java packages
        String[] segments = StringUtils.split(path, "/");
        String packageName = StringUtils.join(Arrays.asList(segments).subList(0, segments.length - 1), '.');
        IPackageFragment packageFragment = packageRoot.getPackageFragment(packageName);
        if (packageFragment != null && packageFragment.exists()) {
            Object[] objs = packageFragment.getNonJavaResources();
            for (Object obj : objs) {
                if (obj instanceof IJarEntryResource) {
                    IJarEntryResource child = (IJarEntryResource) obj;
                    if (child instanceof JarEntryFile && child.getFullPath().toPortableString().equals(path)) {
                        return child;
                    }
                }

            }
        }
        Object[] resources = packageRoot.getNonJavaResources();

        for (Object resource : resources) {
            if (resource instanceof JarEntryFile) {
                JarEntryFile file = (JarEntryFile) resource;
                if (file.getFullPath().toPortableString().equals(path)) {
                    return file;
                }
            }
            if (resource instanceof JarEntryDirectory) {
                JarEntryDirectory directory = (JarEntryDirectory) resource;
                return findFileInJar(directory, path);
            }
        }
        return null;
    }

    public static JarEntryFile findFileInJar(JarEntryDirectory directory, String path) {
        for (IJarEntryResource child : directory.getChildren()) {
            if (child instanceof JarEntryFile && child.getFullPath().toPortableString().equals(path)) {
                return (JarEntryFile) child;
            }
            if (child instanceof JarEntryDirectory) {
                JarEntryFile file = findFileInJar((JarEntryDirectory) child, path);
                if (file != null) {
                    return file;
                }
            }
        }
        return null;
    }

    public static IPath removeProjectSegment(String projectElementName, IPath path) {
        if (projectElementName.equals(path.segment(0))) {
            return path.removeFirstSegments(1).makeRelative();
        }
        return path;
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
        return new PackageNode(packageName, packageFragment.getPath().toPortableString(), NodeKind.PACKAGE);
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
                return getNodeFromClasspathVariable(entry);
            } else {
                return new PackageRootNode(pkgRoot.getElementName(), pkgRoot.getPath().toPortableString(), NodeKind.PACKAGEROOT, pkgRoot.getKind());
            }
        } else {
            return new PackageRootNode(ExtUtils.removeProjectSegment(pkgRoot.getJavaProject().getElementName(), pkgRoot.getPath()).toPortableString(),
                    pkgRoot.getPath().toPortableString(), NodeKind.PACKAGEROOT, pkgRoot.getKind());
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
    public static PackageNode getNodeFromClasspathEntry(IClasspathEntry classpathEntry, IJavaProject javaProject, NodeKind nodeKind) {
        try {
            IClasspathEntry entry = JavaCore.getResolvedClasspathEntry(classpathEntry);
            IClasspathContainer container = JavaCore.getClasspathContainer(entry.getPath(), javaProject);
            // HACK: There is an initialization issue for the first container.
            if (container == null) {
                container = JavaCore.getClasspathContainer(entry.getPath(), javaProject);
            }
            if (container != null) {
                switch (nodeKind) {
                case CONTAINER:
                    return new ContainerNode(container.getDescription(), container.getPath().toPortableString(), nodeKind, entry.getEntryKind());
                case PACKAGEROOT:
                    // Use package name as package root name
                    String[] pathSegments = container.getPath().segments();
                    return new PackageRootNode(pathSegments[pathSegments.length - 1], container.getPath().toPortableString(), nodeKind,
                            IPackageFragmentRoot.K_BINARY);
                default:
                    return null;
                }
            }
        } catch (CoreException e) {
            JdtlsExtActivator.logException("Problems when convert classpath entry to package node ", e);
        }
        return null;
    }

    public static PackageNode createNodeForTypeRoot(IJavaElement typeRoot) {
        PackageNode typeRootNode = new TypeRootNode(typeRoot.getElementName(), typeRoot.getPath().toPortableString(), NodeKind.TYPEROOT,
                typeRoot instanceof IClassFile ? TypeRootNode.K_BINARY : TypeRootNode.K_SOURCE);
        if (typeRoot instanceof ICompilationUnit) {
            typeRootNode.setUri(JDTUtils.toURI((ICompilationUnit) typeRoot));
        } else if (typeRoot instanceof IClassFile) {
            typeRootNode.setUri(JDTUtils.toUri((IClassFile) typeRoot));
        }
        return typeRootNode;
    }

    /**
     * Get correspond node of referenced variable
     *
     * @param classpathEntry
     *            referenced cariable's classpath entry
     * @return correspond package node
     */
    public static PackageNode getNodeFromClasspathVariable(IClasspathEntry classpathEntry) {
        IClasspathEntry entry = JavaCore.getResolvedClasspathEntry(classpathEntry);
        String name = classpathEntry.getPath().toPortableString();
        String path = entry.getPath().toPortableString();
        return new PackageRootNode(name, path, NodeKind.PACKAGEROOT, IPackageFragmentRoot.K_BINARY);
    }
}
