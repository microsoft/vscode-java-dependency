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
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.Flags;
import org.eclipse.jdt.core.ICompilationUnit;
import org.eclipse.jdt.core.IImportDeclaration;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.ls.core.internal.JDTUtils;

import com.microsoft.jdtls.ext.core.model.FileImportsResult;
import com.microsoft.jdtls.ext.core.model.FileImportsResult.ImportEntry;
import com.microsoft.jdtls.ext.core.model.FileImportsResult.StaticImportEntry;

/**
 * Lightweight command handler for AI context tools.
 * All methods in this class are designed to be non-blocking and fast (< 10ms).
 * They only read AST-level information and do NOT trigger classpath resolution,
 * type resolution, or any expensive JDT operations.
 */
public class AiContextCommand {

    // Well-known JDK package prefixes
    private static final Set<String> JDK_PREFIXES = new HashSet<>();
    static {
        JDK_PREFIXES.add("java.");
        JDK_PREFIXES.add("javax.");
        JDK_PREFIXES.add("jdk.");
        JDK_PREFIXES.add("sun.");
        JDK_PREFIXES.add("com.sun.");
        JDK_PREFIXES.add("org.xml.");
        JDK_PREFIXES.add("org.w3c.");
        JDK_PREFIXES.add("jakarta.");  // Jakarta EE (post Java EE)
    }

    /**
     * Get the classified import list of a Java file.
     * This is a lightweight AST-only operation — it reads import declarations
     * without doing any type resolution (findType) or classpath resolution.
     *
     * Typical response time: < 5ms
     *
     * @param arguments List containing the file URI as the first element
     * @param monitor   Progress monitor for cancellation support
     * @return FileImportsResult with classified imports
     */
    public static FileImportsResult getFileImports(List<Object> arguments, IProgressMonitor monitor) {
        FileImportsResult result = new FileImportsResult();
        result.imports = new ArrayList<>();
        result.staticImports = new ArrayList<>();

        if (arguments == null || arguments.isEmpty()) {
            result.error = "No arguments provided";
            return result;
        }

        try {
            String fileUri = (String) arguments.get(0);
            if (fileUri == null || fileUri.trim().isEmpty()) {
                result.error = "Invalid file URI";
                return result;
            }

            // Resolve compilation unit from URI — this is fast, just a model lookup
            java.net.URI uri = JDTUtils.toURI(fileUri);
            ICompilationUnit compilationUnit = JDTUtils.resolveCompilationUnit(uri);

            if (compilationUnit == null || !compilationUnit.exists()) {
                result.error = "File not found or not a Java file: " + fileUri;
                return result;
            }

            // Get relative file path
            IJavaProject javaProject = compilationUnit.getJavaProject();
            result.file = compilationUnit.getPath().toString();

            // Collect project source package names for classification
            Set<String> projectPackages = collectProjectPackages(javaProject);

            // Read import declarations — pure AST operation, no type resolution
            IImportDeclaration[] imports = compilationUnit.getImports();
            if (imports == null || imports.length == 0) {
                return result; // No imports, return empty (not an error)
            }

            for (IImportDeclaration imp : imports) {
                if (monitor.isCanceled()) {
                    break;
                }

                String name = imp.getElementName();
                boolean isStatic = Flags.isStatic(imp.getFlags());
                boolean isOnDemand = name.endsWith(".*");

                if (isStatic) {
                    StaticImportEntry entry = new StaticImportEntry();
                    entry.name = name;
                    entry.memberKind = "unknown"; // Would need findType to know — skip
                    entry.source = classifyByPackageName(name, projectPackages);
                    result.staticImports.add(entry);
                } else {
                    ImportEntry entry = new ImportEntry();
                    entry.name = name;
                    entry.kind = isOnDemand ? "package" : "unknown"; // Would need findType to know — skip
                    entry.source = classifyByPackageName(name, projectPackages);
                    entry.artifact = null; // Would need classpath attributes — skip for now
                    result.imports.add(entry);
                }
            }

            return result;

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error in getFileImports", e);
            result.error = "Exception: " + e.getMessage();
            return result;
        }
    }

    /**
     * Classify an import by its package name prefix.
     * This is a heuristic — no type resolution involved.
     *
     * @param qualifiedName the fully qualified name of the import
     * @param projectPackages set of package names found in the project's source roots
     * @return "jdk", "project", or "external"
     */
    private static String classifyByPackageName(String qualifiedName, Set<String> projectPackages) {
        // Check JDK
        for (String prefix : JDK_PREFIXES) {
            if (qualifiedName.startsWith(prefix)) {
                return "jdk";
            }
        }

        // Check project packages
        String packageName = getPackageName(qualifiedName);
        if (packageName != null && projectPackages.contains(packageName)) {
            return "project";
        }

        // Check if any project package is a prefix of this import
        for (String projPkg : projectPackages) {
            if (qualifiedName.startsWith(projPkg + ".")) {
                return "project";
            }
        }

        return "external";
    }

    /**
     * Get the package name from a fully qualified name.
     * e.g., "com.example.model.Order" → "com.example.model"
     *       "com.example.model.*" → "com.example.model"
     */
    private static String getPackageName(String qualifiedName) {
        if (qualifiedName == null) {
            return null;
        }
        // Handle wildcard imports
        if (qualifiedName.endsWith(".*")) {
            return qualifiedName.substring(0, qualifiedName.length() - 2);
        }
        int lastDot = qualifiedName.lastIndexOf('.');
        if (lastDot > 0) {
            return qualifiedName.substring(0, lastDot);
        }
        return null;
    }

    /**
     * Collect all package names that exist in the project's source roots.
     * This uses getPackageFragmentRoots(K_SOURCE) which is fast — it reads
     * the project model, not the filesystem.
     */
    private static Set<String> collectProjectPackages(IJavaProject javaProject) {
        Set<String> packages = new HashSet<>();
        if (javaProject == null) {
            return packages;
        }

        try {
            IPackageFragmentRoot[] roots = javaProject.getPackageFragmentRoots();
            for (IPackageFragmentRoot root : roots) {
                if (root.getKind() == IPackageFragmentRoot.K_SOURCE) {
                    org.eclipse.jdt.core.IJavaElement[] children = root.getChildren();
                    for (org.eclipse.jdt.core.IJavaElement child : children) {
                        if (child instanceof org.eclipse.jdt.core.IPackageFragment) {
                            String pkgName = child.getElementName();
                            if (pkgName != null && !pkgName.isEmpty()) {
                                packages.add(pkgName);
                            }
                        }
                    }
                }
            }
        } catch (Exception e) {
            // Non-critical — fall back to treating everything as external
            JdtlsExtActivator.logException("Error collecting project packages", e);
        }

        return packages;
    }
}
