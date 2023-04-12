/*******************************************************************************
 * Copyright (c) 2023 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core.parser;

import java.util.List;
import java.util.ListIterator;
import java.util.Objects;

import org.eclipse.core.internal.utils.FileUtil;
import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.jdt.core.IClassFile;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IJarEntryResource;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

import com.microsoft.jdtls.ext.core.JdtlsExtActivator;
import com.microsoft.jdtls.ext.core.PackageCommand;

// TODO: progress monitor
public class ResourceSet {

    private List<Object> resources;
    private boolean isHierarchicalView;

    public ResourceSet(List<Object> resources) {
        this(resources, false);
    }

    public ResourceSet(List<Object> resources, boolean isHierarchicalView) {
        this.resources = resources;
        this.isHierarchicalView = isHierarchicalView;
    }

    public void accept(ResourceVisitor visitor) {
        ListIterator<Object> iterator = resources.listIterator();
        while (iterator.hasNext()) {
            Object resource = iterator.next();
            if (resource == null) {
                continue;
            }

            if (resource instanceof IClasspathEntry) {
                visitor.visit((IClasspathEntry) resource);
            } else if (resource instanceof IPackageFragmentRoot) {
                IPackageFragmentRoot pkgRoot = (IPackageFragmentRoot) resource;
                IJavaProject javaProject = pkgRoot.getJavaProject();
                if (javaProject == null) {
                    continue;
                }

                // skip invisible project's linked folder and add its children to the iterator.
                if (ProjectUtils.isUnmanagedFolder(javaProject.getProject()) &&
                        Objects.equals(ProjectUtils.WORKSPACE_LINK, pkgRoot.getElementName())) {
                    try {
                        List<Object> nextObjs = PackageCommand.getPackageFragmentRootContent(
                            pkgRoot, isHierarchicalView, new NullProgressMonitor());
                        for (Object nextObj : nextObjs) {
                            iterator.add(nextObj);
                            iterator.previous();
                        }
                    } catch (CoreException e) {
                        JdtlsExtActivator.logException("Failed to get package fragment root content", e);
                        continue;
                    }
                } else {
                    visitor.visit(pkgRoot);
                }
            } else if (resource instanceof IPackageFragment) {
                IPackageFragment fragment = (IPackageFragment) resource;
                // skip default package and add its children to the iterator.
                if (fragment.isDefaultPackage()) {
                    List<Object> nextObjs = PackageCommand.getChildrenForPackage(fragment, new NullProgressMonitor());
                    for (Object nextObj : nextObjs) {
                        iterator.add(nextObj);
                        iterator.previous();
                    }
                } else {
                    visitor.visit(fragment);
                }
            } else if (resource instanceof IType) {
                visitor.visit((IType) resource);
            } else if (resource instanceof IClassFile) {
                visitor.visit((IClassFile) resource);
            } else if (resource instanceof ICompilationUnit) {
                visitor.visit((ICompilationUnit) resource);
            } else if (resource instanceof IFile) {
                if (shouldVisit((IFile) resource)) {
                    visitor.visit((IFile) resource);
                }
            } else if (resource instanceof IFolder) {
                if (shouldVisit((IFolder) resource)) {
                    visitor.visit((IFolder) resource);
                }
            } else if (resource instanceof IJarEntryResource) {
                visitor.visit((IJarEntryResource) resource);
            }
        }
    }

    /**
     * Check if the IFolder or IFile should be visited. The following conditions will skip visit:
     * <ul>
     * <li>the resource is null.</li>
     * <li>the resource does not belong to any project.</li>
     * <li>the resource is not in the project's real location.</li>
     * <li>the resource is a java element.</li>
     * </ul>
     */
    private boolean shouldVisit(IResource resource) {
        if (resource == null) {
            return false;
        }

        IProject project = resource.getProject();
        if (project == null) {
            return false;
        }

        IPath projectRealFolder = ProjectUtils.getProjectRealFolder(project.getProject());
        IPath resourcePath = FileUtil.toPath(resource.getLocationURI());
        // check if the resource stores in the project's real location.
        if (!projectRealFolder.isPrefixOf(resourcePath)) {
            return false;
        }

        // skip linked folder.
        if (Objects.equals(projectRealFolder, resourcePath) &&
                Objects.equals(ProjectUtils.WORKSPACE_LINK, resource.getName())) {
            return false;
        }

        return JavaCore.create(resource) == null;
    }
}
