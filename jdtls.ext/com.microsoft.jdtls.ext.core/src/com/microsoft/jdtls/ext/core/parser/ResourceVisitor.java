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

import org.eclipse.core.resources.IFile;
import org.eclipse.core.resources.IFolder;
import org.eclipse.jdt.core.IClassFile;
import org.eclipse.jdt.core.IClasspathEntry;
import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IJarEntryResource;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.IType;

import com.microsoft.jdtls.ext.core.model.PackageNode;

/**
 * A visitor to iterate through resources in a project and parse them to
 * nodes in the UI.
 */
public interface ResourceVisitor {

    void visit(IClasspathEntry entry);

    void visit(IPackageFragmentRoot packageFragmentRoot);

    void visit(IPackageFragment fragment);

    void visit(IType type);

    void visit(IClassFile classFile);

    void visit(ICompilationUnit compilationUnit);

    void visit(IFile file);

    void visit(IFolder folder);

    void visit(IJarEntryResource jarEntryResource);

    List<PackageNode> getNodes();
}
