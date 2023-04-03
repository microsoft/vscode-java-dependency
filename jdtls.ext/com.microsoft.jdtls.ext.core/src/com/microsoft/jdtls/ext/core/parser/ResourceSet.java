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

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.NullProgressMonitor;
import org.eclipse.jdt.core.IClassFile;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.IJarEntryResource;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

import com.microsoft.jdtls.ext.core.JdtlsExtActivator;
import com.microsoft.jdtls.ext.core.PackageCommand;

// TODO: progress monitor
public class ResourceSet {

    private List<Object> resources;

    public ResourceSet(List<Object> resources) {
        this.resources = resources;
    }

    public void accept(ResourceVisitor visitor) {
        ListIterator<Object> iterator = resources.listIterator();
        // the resources list may be modified during the iteration
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

                if (!ProjectUtils.isVisibleProject(pkgRoot.getJavaProject().getProject()) &&
                        Objects.equals(ProjectUtils.WORKSPACE_LINK, pkgRoot.getElementName())) {
                    // skip display invisible linked folder
                    try {
                        List<Object> nextObjs = PackageCommand.getPackageFragmentRootContent(
                            pkgRoot, false, new NullProgressMonitor());
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
                if (fragment.isDefaultPackage()) {
                    List<Object> nextObjs = PackageCommand.getChildrenForPackage(fragment);
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
            } else if (resource instanceof IFile) {
                visitor.visit((IFile) resource);
            } else if (resource instanceof IFolder) {
                visitor.visit((IFolder) resource);
            } else if (resource instanceof IJarEntryResource) {
                visitor.visit((IJarEntryResource) resource);
            }
        }
    }
}
