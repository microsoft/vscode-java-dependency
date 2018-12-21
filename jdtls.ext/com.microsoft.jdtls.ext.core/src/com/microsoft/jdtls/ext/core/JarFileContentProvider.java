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

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;

import org.apache.commons.io.IOUtils;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.internal.core.JarEntryFile;
import org.eclipse.jdt.internal.core.JarPackageFragmentRoot;
import org.eclipse.jdt.ls.core.internal.IContentProvider;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;

/**
 * Get file content from the JarEntryFile contained inside a .jar file.
 */
public class JarFileContentProvider implements IContentProvider {

    @Override
    public String getContent(URI uri, IProgressMonitor monitor) throws CoreException {
        return getContent(uri.getQuery(), uri.getPath().toString(), monitor);
    }

    private String getContent(String rootId, String path, IProgressMonitor pm) {
        try {
            IPackageFragmentRoot packageRoot = (IPackageFragmentRoot) JavaCore.create(rootId);
            if (packageRoot == null) {
                throw new CoreException(new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", rootId)));
            }


            if (packageRoot instanceof JarPackageFragmentRoot) {
                JarEntryFile fileEntry = ExtUtils.findJarEntryFile(packageRoot, path);
                if (fileEntry != null) {
                    return readFileContent(fileEntry);
                }

            }
        } catch (CoreException e) {
            JavaLanguageServerPlugin.logException("Problem get JarEntryFile content ", e);
        }
        return null;
    }



    private static String readFileContent(JarEntryFile file) throws CoreException {
        try (InputStream stream = (file.getContents())) {
            return convertStreamToString(stream);
        } catch (IOException e) {
            throw new CoreException(new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, "Can't read file content: " + file.getFullPath()));
        }
    }

    private static String convertStreamToString(InputStream inputStream) throws IOException {
        return IOUtils.toString(inputStream, StandardCharsets.UTF_8);
    }
}
