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
import java.util.List;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IWorkspaceRoot;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.ls.core.internal.ResourceUtils;

import com.microsoft.jdtls.ext.core.model.NodeKind;
import com.microsoft.jdtls.ext.core.model.PackageNode;

public final class ProjectCommand {

    public static List<PackageNode> execute(List<Object> arguments, IProgressMonitor monitor) {
        String workspaceUri = (String) arguments.get(0);

        IProject[] projects = getWorkspaceRoot().getProjects();
        ArrayList<PackageNode> children = new ArrayList<>();
        List<IPath> paths = Arrays.asList(ResourceUtils.filePathFromURI(workspaceUri));
        for (IProject project : projects) {
            if (project.exists() && ResourceUtils.isContainedIn(project.getLocation(), paths)) {
                PackageNode projectNode = new PackageNode(project.getName(), project.getFullPath().toPortableString(), NodeKind.PROJECT);
                projectNode.setUri(project.getLocationURI().toString());
                children.add(projectNode);

            }
        }

        return children;
    }

    private static IWorkspaceRoot getWorkspaceRoot() {
        return ResourcesPlugin.getWorkspace().getRoot();
    }
}
