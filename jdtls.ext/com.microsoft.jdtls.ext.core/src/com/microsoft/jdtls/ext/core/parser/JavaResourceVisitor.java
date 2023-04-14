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

import java.util.LinkedList;
import java.util.List;

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.core.resources.IResource;
import org.eclipse.jdt.core.IClassFile;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IJarEntryResource;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.IType;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.ls.core.internal.JDTUtils;

import com.microsoft.jdtls.ext.core.ExtUtils;
import com.microsoft.jdtls.ext.core.JdtlsExtActivator;
import com.microsoft.jdtls.ext.core.model.NodeKind;
import com.microsoft.jdtls.ext.core.model.PackageNode;

public class JavaResourceVisitor implements ResourceVisitor {

    private IJavaProject project;
    private List<PackageNode> nodes;

    public JavaResourceVisitor(IJavaProject project) {
        this.project = project;
        this.nodes = new LinkedList<>();
    }

    @Override
    public void visit(IPackageFragment fragment) {
        this.nodes.add(PackageNode.createNodeForPackageFragment(fragment));
    }

    @Override
    public void visit(IType type) {
        this.nodes.add(PackageNode.createNodeForPrimaryType(type));
    }

    @Override
    public void visit(IClassFile classFile) {
        PackageNode node = new PackageNode(classFile.getElementName(), null, NodeKind.CLASSFILE);
        node.setUri(JDTUtils.toUri(classFile));
        IResource resource = classFile.getResource();
        if (resource != null) {
            node.setPath(resource.getFullPath().toPortableString());
        }
        this.nodes.add(node);
    }

    @Override
    public void visit(ICompilationUnit compilationUnit) {
        PackageNode node = new PackageNode(compilationUnit.getElementName(), null, NodeKind.COMPILATIONUNIT);
        node.setUri(JDTUtils.toUri(compilationUnit));
        IResource resource = compilationUnit.getResource();
        if (resource != null) {
            node.setPath(resource.getFullPath().toPortableString());
        }
        this.nodes.add(node);
    }

    @Override
    public void visit(IFile file) {
        this.nodes.add(PackageNode.createNodeForFile(file));
    }

    @Override
    public void visit(IFolder folder) {
        this.nodes.add(PackageNode.createNodeForFolder(folder));
    }

    @Override
    public void visit(IJarEntryResource jarEntryResource) {
        NodeKind kind = jarEntryResource.isFile() ? NodeKind.FILE : NodeKind.FOLDER;
        PackageNode node = new PackageNode(jarEntryResource.getName(),
            jarEntryResource.getFullPath().toPortableString(), kind);
        node.setUri(ExtUtils.toUri(jarEntryResource));
        this.nodes.add(node);
    }

    @Override
    public void visit(IClasspathEntry entry) {
        PackageNode node = null;
        if (entry.getEntryKind() == IClasspathEntry.CPE_VARIABLE) {
            node = PackageNode.createNodeForClasspathVariable(entry);
        } else if (entry.getEntryKind() == IClasspathEntry.CPE_LIBRARY) {
            node = PackageNode.createNodeForClasspathEntry(entry, this.project, NodeKind.PACKAGEROOT);
        } else {
            node = PackageNode.createNodeForClasspathEntry(entry, this.project, NodeKind.CONTAINER);
        }

        if (node != null) {
            this.nodes.add(node);
        }
    }

    @Override
    public void visit(IPackageFragmentRoot packageFragmentRoot) {
        try {
            this.nodes.add(PackageNode.createNodeForPackageFragmentRoot(packageFragmentRoot));
        } catch (JavaModelException e) {
            JdtlsExtActivator.log(e);
        }
    }

    @Override
    public List<PackageNode> getNodes() {
        return nodes;
    }
}
