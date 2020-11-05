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
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Status;
import org.eclipse.jdt.core.IClasspathContainer;
import org.eclipse.jdt.core.IJarEntryResource;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragment;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.core.JavaModelException;
import org.eclipse.jdt.internal.core.JarEntryDirectory;
import org.eclipse.jdt.internal.core.JarEntryFile;
import org.eclipse.jdt.launching.JavaRuntime;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;

public final class ExtUtils {
    public static final String JDT_SCHEME = "jdt";
    private static final String CONTENTS_AUTHORITY = "jarentry";

    public static String toUri(IJarEntryResource jarEntryFile) {
        IPackageFragmentRoot fragmentRoot = jarEntryFile.getPackageFragmentRoot();
        try {
            return new URI(JDT_SCHEME, CONTENTS_AUTHORITY, jarEntryFile.getFullPath().toPortableString(), fragmentRoot.getHandleIdentifier(), null)
                        .toASCIIString();
        } catch (URISyntaxException e) {
            JavaLanguageServerPlugin.logException("Error generating URI for jarentryfile ", e);
            return null;
        }
    }

    public static boolean isJarResourceUri(URI uri) {
        return uri != null && JDT_SCHEME.equals(uri.getScheme()) && CONTENTS_AUTHORITY.equals(uri.getAuthority());
    }

    public static JarEntryFile findJarEntryFile(IPackageFragmentRoot packageRoot, String path) throws JavaModelException {
        String[] segments = StringUtils.split(path, "/");
        String packageName = StringUtils.join(Arrays.asList(segments).subList(0, segments.length - 1), '.');
        IPackageFragment packageFragment = packageRoot.getPackageFragment(packageName);
        if (packageFragment != null && packageFragment.exists()) {
            Object[] objs = packageFragment.getNonJavaResources();
            for (Object obj : objs) {
                if (obj instanceof IJarEntryResource) {
                    IJarEntryResource child = (IJarEntryResource) obj;
                    if (child instanceof JarEntryFile && child.getFullPath().toPortableString().equals(path)) {
                        return (JarEntryFile) child;
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
                JarEntryFile file = findFileInJar(directory, path);
                if (file != null) {
                    return file;
                }
            }
        }
        return null;
    }

    public static IJarEntryResource getJarEntryResource(URI uri) throws CoreException {
        if (uri == null) {
            throw new NullPointerException("Cannot get jar resource from null URI.");
        }
        String handleId = uri.getQuery();
        if (handleId == null) {
            throw new NullPointerException("Invalid uri for a jar entry.");
        }
        IPackageFragmentRoot packageRoot = (IPackageFragmentRoot) JavaCore.create(handleId);
        if (packageRoot == null) {
            throw new CoreException(new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, String.format("No package root found for %s", handleId)));
        }
        return findJarEntryFile(packageRoot, uri.getPath());
    }

    public static IPath removeProjectSegment(String projectElementName, IPath path) {
        if (projectElementName.equals(path.segment(0))) {
            return path.removeFirstSegments(1).makeRelative();
        }
        return path;
    }

    public static URI getContainerURI(IJavaProject javaProject, IClasspathContainer container) throws CoreException {
        switch (container.getKind()) {
            case IClasspathContainer.K_DEFAULT_SYSTEM: // JRE Container
            case IClasspathContainer.K_SYSTEM:
                return JavaRuntime.getVMInstall(javaProject).getInstallLocation().toURI();
            case IClasspathContainer.K_APPLICATION: // Plugin Container, Maven Container, etc
                return null; // TODO: find out a good way to detect these containers' uri
            default: // Persistent container (e.g. /src/main/java)
                return container.getPath().toFile().toURI();
        }
    }

    private static JarEntryFile findFileInJar(JarEntryDirectory directory, String path) {
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
}
