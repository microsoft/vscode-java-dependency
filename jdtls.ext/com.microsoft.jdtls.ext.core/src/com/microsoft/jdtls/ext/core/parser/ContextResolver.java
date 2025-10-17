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

package com.microsoft.jdtls.ext.core.parser;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.jdt.core.IMethod;
import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.IJavaProject;
import org.eclipse.jdt.core.JavaModelException;

import com.microsoft.jdtls.ext.core.JdtlsExtActivator;

/**
 * Parser for extracting Java class content information for Copilot integration.
 * Handles import resolution, JavaDoc extraction, and class description generation.
 */
public class ContextResolver {

    // Pre-compiled regex patterns for performance
    private static final Pattern MARKDOWN_CODE_PATTERN = Pattern.compile("(?s)```(?:java)?\\n?(.*?)```");
    private static final Pattern HTML_PRE_PATTERN = Pattern.compile("(?is)<pre[^>]*>(.*?)</pre>");
    private static final Pattern HTML_CODE_PATTERN = Pattern.compile("(?is)<code[^>]*>(.*?)</code>");
    
    // Constants for limiting displayed members
    private static final int MAX_METHODS_TO_DISPLAY = 10;
    private static final int MAX_FIELDS_TO_DISPLAY = 10;
    private static final int MAX_STATIC_METHODS_TO_DISPLAY = 10;
    private static final int MAX_STATIC_FIELDS_TO_DISPLAY = 10;

    /**
     * ImportClassInfo - Conforms to Copilot CodeSnippet format
     * Used to provide Java class context information and JavaDoc to Copilot
     */
    public static class ImportClassInfo {
        public String uri;           // File URI (required)
        public String className;     // Human-readable class description with JavaDoc appended (required)

        public ImportClassInfo(String uri, String className) {
            this.uri = uri;
            this.className = className;
        }
    }

    /**
     * Resolve a single type import and extract its information
     */
    public static void resolveSingleType(IJavaProject javaProject, String typeName, List<ImportClassInfo> classInfoList,
            Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            if (processedTypes.contains(typeName)) {
                return;
            }
            processedTypes.add(typeName);

            // Extract package and simple name from the fully qualified type name
            int lastDotIndex = typeName.lastIndexOf('.');
            if (lastDotIndex == -1) {
                // Default package or invalid type name
                return;
            }
            
            String packageName = typeName.substring(0, lastDotIndex);
            String simpleName = typeName.substring(lastDotIndex + 1);
            
            // Strategy: Use JDT's global type resolution first (comprehensive), 
            // then fallback to manual package fragment traversal if needed
            
            // Primary path: Use JDT's findType which searches all sources and dependencies
            try {
                org.eclipse.jdt.core.IType type = javaProject.findType(typeName);
                if (type != null && type.exists()) {
                    // Found type - check if it's a source type we want to process
                    if (!type.isBinary()) {
                        // Source type found - extract information and return
                        extractTypeInfo(type, classInfoList, monitor);
                        return;
                    }
                    // Note: Binary types (from JARs/JRE) are intentionally ignored
                    // as they don't provide useful context for code completion
                }
            } catch (JavaModelException e) {
                JdtlsExtActivator.logException("Error in primary type search: " + typeName, e);
                // Continue to fallback method
            }
            
            // Fallback path: Manual search in local source package fragments
            // This is used when findType() doesn't return results or fails
            IPackageFragmentRoot[] packageRoots = javaProject.getPackageFragmentRoots();
            for (IPackageFragmentRoot packageRoot : packageRoots) {
                if (packageRoot.getKind() == IPackageFragmentRoot.K_SOURCE) {
                    org.eclipse.jdt.core.IPackageFragment packageFragment = packageRoot.getPackageFragment(packageName);
                    if (packageFragment != null && packageFragment.exists()) {
                        // Look for compilation unit with matching name
                        org.eclipse.jdt.core.ICompilationUnit cu = packageFragment.getCompilationUnit(simpleName + ".java");
                        if (cu != null && cu.exists() && cu.getResource() != null && cu.getResource().exists()) {
                            // Get primary type from compilation unit
                            org.eclipse.jdt.core.IType primaryType = cu.findPrimaryType();
                            if (primaryType != null && primaryType.exists() && 
                                typeName.equals(primaryType.getFullyQualifiedName())) {
                                // Found local project source type via fallback method
                                extractTypeInfo(primaryType, classInfoList, monitor);
                                return;
                            }
                            
                            // Also check for inner types in the compilation unit
                            org.eclipse.jdt.core.IType[] allTypes = cu.getAllTypes();
                            for (org.eclipse.jdt.core.IType type : allTypes) {
                                if (typeName.equals(type.getFullyQualifiedName())) {
                                    extractTypeInfo(type, classInfoList, monitor);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
        } catch (JavaModelException e) {
            // Log but continue processing other types
            JdtlsExtActivator.logException("Error resolving type: " + typeName, e);
        }
    }

    /**
     * Resolve a static import statement
     */
    public static void resolveStaticImport(IJavaProject javaProject, String staticImportName, List<ImportClassInfo> classInfoList,
            Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            if (staticImportName.endsWith(".*")) {
                // Static import of all static members from a class: import static MyClass.*;
                String className = staticImportName.substring(0, staticImportName.length() - 2);
                resolveStaticMembersFromClass(javaProject, className, classInfoList, processedTypes, monitor);
            } else {
                // Static import of specific member: import static MyClass.myMethod;
                int lastDotIndex = staticImportName.lastIndexOf('.');
                if (lastDotIndex > 0) {
                    String className = staticImportName.substring(0, lastDotIndex);
                    String memberName = staticImportName.substring(lastDotIndex + 1);
                    resolveStaticMemberFromClass(javaProject, className, memberName, classInfoList, processedTypes, monitor);
                }
            }
        } catch (Exception e) {
            JdtlsExtActivator.logException("Error resolving static import: " + staticImportName, e);
        }
    }

    /**
     * Resolve all static members from a class
     */
    public static void resolveStaticMembersFromClass(IJavaProject javaProject, String className, 
            List<ImportClassInfo> classInfoList, Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            // First resolve the class itself to get context information
            resolveSingleType(javaProject, className, classInfoList, processedTypes, monitor);
            
            // Find the type and extract its static members
            org.eclipse.jdt.core.IType type = javaProject.findType(className);
            if (type != null && type.exists() && !type.isBinary()) {
                StringBuilder description = new StringBuilder();
                description.append("Static Import: ").append(className).append(".*\n");
                description.append("All static members from ").append(className).append("\n\n");
                
                // Get static methods
                IMethod[] methods = type.getMethods();
                List<String> staticMethodSigs = new ArrayList<>();
                for (IMethod method : methods) {
                    int flags = method.getFlags();
                    if (org.eclipse.jdt.core.Flags.isStatic(flags) && org.eclipse.jdt.core.Flags.isPublic(flags)) {
                        if (staticMethodSigs.size() < MAX_STATIC_METHODS_TO_DISPLAY) {
                            staticMethodSigs.add(generateMethodSignature(method));
                        }
                    }
                }
                
                // Get static fields
                org.eclipse.jdt.core.IField[] fields = type.getFields();
                List<String> staticFieldSigs = new ArrayList<>();
                for (org.eclipse.jdt.core.IField field : fields) {
                    int flags = field.getFlags();
                    if (org.eclipse.jdt.core.Flags.isStatic(flags) && org.eclipse.jdt.core.Flags.isPublic(flags)) {
                        if (staticFieldSigs.size() < MAX_STATIC_FIELDS_TO_DISPLAY) {
                            staticFieldSigs.add(generateFieldSignature(field));
                        }
                    }
                }
                
                if (!staticMethodSigs.isEmpty()) {
                    description.append("Static Methods:\n");
                    for (String sig : staticMethodSigs) {
                        description.append("  - ").append(sig).append("\n");
                    }
                    description.append("\n");
                }
                
                if (!staticFieldSigs.isEmpty()) {
                    description.append("Static Fields:\n");
                    for (String sig : staticFieldSigs) {
                        description.append("  - ").append(sig).append("\n");
                    }
                }
                
                String uri = getTypeUri(type);
                if (uri != null) {
                    classInfoList.add(new ImportClassInfo(uri, description.toString()));
                }
            }
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error resolving static members from: " + className, e);
        }
    }

    /**
     * Resolve a specific static member from a class
     */
    public static void resolveStaticMemberFromClass(IJavaProject javaProject, String className, String memberName,
            List<ImportClassInfo> classInfoList, Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            // First resolve the class itself
            resolveSingleType(javaProject, className, classInfoList, processedTypes, monitor);
            
            // Find the specific static member
            org.eclipse.jdt.core.IType type = javaProject.findType(className);
            if (type != null && type.exists() && !type.isBinary()) {
                StringBuilder description = new StringBuilder();
                description.append("Static Import: ").append(className).append(".").append(memberName).append("\n\n");
                
                boolean found = false;
                
                // Check if it's a method
                IMethod[] methods = type.getMethods();
                for (IMethod method : methods) {
                    if (method.getElementName().equals(memberName)) {
                        int flags = method.getFlags();
                        if (org.eclipse.jdt.core.Flags.isStatic(flags)) {
                            description.append("Static Method:\n");
                            description.append("  - ").append(generateMethodSignature(method)).append("\n");
                            found = true;
                            break;
                        }
                    }
                }
                
                // Check if it's a field
                if (!found) {
                    org.eclipse.jdt.core.IField[] fields = type.getFields();
                    for (org.eclipse.jdt.core.IField field : fields) {
                        if (field.getElementName().equals(memberName)) {
                            int flags = field.getFlags();
                            if (org.eclipse.jdt.core.Flags.isStatic(flags)) {
                                description.append("Static Field:\n");
                                description.append("  - ").append(generateFieldSignature(field)).append("\n");
                                found = true;
                                break;
                            }
                        }
                    }
                }
                
                if (found) {
                    String uri = getTypeUri(type);
                    if (uri != null) {
                        classInfoList.add(new ImportClassInfo(uri, description.toString()));
                    }
                }
            }
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error resolving static member: " + className + "." + memberName, e);
        }
    }

    /**
     * Resolve all types in a package (for wildcard imports)
     */
    public static void resolvePackageTypes(IJavaProject javaProject, String packageName, List<ImportClassInfo> classInfoList,
            Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            // Find all package fragments with this name
            IPackageFragmentRoot[] packageRoots = javaProject.getPackageFragmentRoots();
            for (IPackageFragmentRoot packageRoot : packageRoots) {
                if (packageRoot.getKind() == IPackageFragmentRoot.K_SOURCE) {
                    org.eclipse.jdt.core.IPackageFragment packageFragment = packageRoot.getPackageFragment(packageName);
                    if (packageFragment != null && packageFragment.exists()) {
                        // Get all compilation units in this package
                        org.eclipse.jdt.core.ICompilationUnit[] compilationUnits = packageFragment
                                .getCompilationUnits();
                        for (org.eclipse.jdt.core.ICompilationUnit cu : compilationUnits) {
                            // Get all types in the compilation unit
                            org.eclipse.jdt.core.IType[] types = cu.getAllTypes();
                            for (org.eclipse.jdt.core.IType type : types) {
                                String fullTypeName = type.getFullyQualifiedName();
                                if (!processedTypes.contains(fullTypeName)) {
                                    processedTypes.add(fullTypeName);
                                    extractTypeInfo(type, classInfoList, monitor);
                                }
                            }
                        }
                    }
                }
            }
        } catch (JavaModelException e) {
            // Log but continue processing
            JdtlsExtActivator.logException("Error resolving package: " + packageName, e);
        }
    }

    /**
     * Extract type information and generate ImportClassInfo conforming to Copilot CodeSnippet format
     * Also extracts JavaDoc if available and appends it to the class description
     * Improved version: generates human-readable class descriptions with integrated JavaDoc
     */
    public static void extractTypeInfo(org.eclipse.jdt.core.IType type, List<ImportClassInfo> classInfoList, 
            IProgressMonitor monitor) {
        try {
            // Get file URI
            String uri = getTypeUri(type);
            if (uri == null) {
                return;
            }
            
            // Extract relevant JavaDoc content first (code snippets with fallback strategy)
            // This uses a hybrid approach: AST extraction -> HTML extraction -> Markdown extraction -> fallback
            String relevantJavadoc = extractRelevantJavaDocContent(type, monitor);
            
            // Generate human-readable class description with JavaDoc inserted after signature
            String description = generateClassDescription(type, relevantJavadoc);
            
            // Create ImportClassInfo (conforms to Copilot CodeSnippet format)
            ImportClassInfo info = new ImportClassInfo(uri, description);
            classInfoList.add(info);
            
            // Recursively process nested types
            org.eclipse.jdt.core.IType[] nestedTypes = type.getTypes();
            for (org.eclipse.jdt.core.IType nestedType : nestedTypes) {
                extractTypeInfo(nestedType, classInfoList, monitor);
            }
            
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error extracting type info for: " + type.getElementName(), e);
        }
    }

    /**
     * Get file URI/path for the type (instead of fully qualified class name)
     */
    public static String getTypeUri(org.eclipse.jdt.core.IType type) {
        try {
            // Get the compilation unit that contains this type
            org.eclipse.jdt.core.ICompilationUnit compilationUnit = type.getCompilationUnit();
            if (compilationUnit != null) {
                // Get the underlying resource (file)
                org.eclipse.core.resources.IResource resource = compilationUnit.getUnderlyingResource();
                if (resource != null && resource instanceof org.eclipse.core.resources.IFile) {
                    org.eclipse.core.resources.IFile file = (org.eclipse.core.resources.IFile) resource;
                    // Get the file location as a file URI
                    java.net.URI fileUri = file.getLocationURI();
                    if (fileUri != null) {
                        return fileUri.toString();
                    }
                    
                    // Fallback: use workspace-relative path as URI
                    return file.getFullPath().toString();
                }
            }
            
            // Fallback: if we can't get file URI, return the fully qualified class name
            // This should rarely happen for source types
            return type.getFullyQualifiedName();
        } catch (Exception e) {
            JdtlsExtActivator.logException("Error getting file URI for type: " + type.getElementName(), e);
            // Fallback to class name in case of error
            try {
                return type.getFullyQualifiedName();
            } catch (Exception e2) {
                return null;
            }
        }
    }

    /**
     * Generate complete class description (natural language format, similar to JavaDoc)
     * @param type the Java type to describe
     * @param javadoc optional JavaDoc content to insert after signature (can be null or empty)
     */
    public static String generateClassDescription(org.eclipse.jdt.core.IType type, String javadoc) {
        StringBuilder description = new StringBuilder();
        
        try {
            String qualifiedName = type.getFullyQualifiedName();
            String simpleName = type.getElementName();
            
            // === 1. Title and signature ===
            description.append("Class: ").append(qualifiedName).append("\n");
            
            // Generate class signature
            StringBuilder signature = new StringBuilder();
            int flags = type.getFlags();
            
            if (org.eclipse.jdt.core.Flags.isPublic(flags)) signature.append("public ");
            if (org.eclipse.jdt.core.Flags.isAbstract(flags)) signature.append("abstract ");
            if (org.eclipse.jdt.core.Flags.isFinal(flags)) signature.append("final ");
            
            if (type.isInterface()) {
                signature.append("interface ");
            } else if (type.isEnum()) {
                signature.append("enum ");
            } else if (type.isAnnotation()) {
                signature.append("@interface ");
            } else {
                signature.append("class ");
            }
            
            signature.append(simpleName);
            
            // Type parameters
            String[] typeParams = type.getTypeParameterSignatures();
            if (typeParams != null && typeParams.length > 0) {
                signature.append("<");
                for (int i = 0; i < typeParams.length; i++) {
                    if (i > 0) signature.append(", ");
                    signature.append(convertTypeSignature(typeParams[i]));
                }
                signature.append(">");
            }
            
            // Inheritance relationship
            String superclass = type.getSuperclassName();
            if (superclass != null && !superclass.equals("Object") && !type.isInterface()) {
                signature.append(" extends ").append(superclass);
            }
            
            // Implemented interfaces
            String[] interfaces = type.getSuperInterfaceNames();
            if (interfaces != null && interfaces.length > 0) {
                if (type.isInterface()) {
                    signature.append(" extends ");
                } else {
                    signature.append(" implements ");
                }
                for (int i = 0; i < interfaces.length; i++) {
                    if (i > 0) signature.append(", ");
                    signature.append(interfaces[i]);
                }
            }
            
            description.append("Signature: ").append(signature).append("\n\n");
            
            // === 2. JavaDoc (inserted after signature) ===
            if (isNotEmpty(javadoc)) {
                description.append("JavaDoc:\n").append(javadoc).append("\n\n");
            }
            
            // === 3. Constructors ===
            IMethod[] methods = type.getMethods();
            List<String> constructorSigs = new ArrayList<>();
            
            for (IMethod method : methods) {
                if (method.isConstructor()) {
                    constructorSigs.add(generateMethodSignature(method));
                }
            }
            
            if (!constructorSigs.isEmpty()) {
                description.append("Constructors:\n");
                for (String sig : constructorSigs) {
                    description.append("  - ").append(sig).append("\n");
                }
                description.append("\n");
            }
            
            // === 4. Public methods (limited to first 10) ===
            List<String> methodSigs = new ArrayList<>();
            int methodCount = 0;
            
            for (IMethod method : methods) {
                if (!method.isConstructor() && org.eclipse.jdt.core.Flags.isPublic(method.getFlags())) {
                    if (methodCount < MAX_METHODS_TO_DISPLAY) {
                        methodSigs.add(generateMethodSignature(method));
                        methodCount++;
                    } else {
                        break;
                    }
                }
            }
            
            if (!methodSigs.isEmpty()) {
                description.append("Methods:\n");
                for (String sig : methodSigs) {
                    description.append("  - ").append(sig).append("\n");
                }
                if (methodCount == MAX_METHODS_TO_DISPLAY && methods.length > methodCount) {
                    description.append("  - ... (more methods available)\n");
                }
                description.append("\n");
            }
            
            // === 5. Public fields (limited to first 10) ===
            org.eclipse.jdt.core.IField[] fields = type.getFields();
            List<String> fieldSigs = new ArrayList<>();
            int fieldCount = 0;
            
            for (org.eclipse.jdt.core.IField field : fields) {
                if (org.eclipse.jdt.core.Flags.isPublic(field.getFlags()) && fieldCount < MAX_FIELDS_TO_DISPLAY) {
                    fieldSigs.add(generateFieldSignature(field));
                    fieldCount++;
                }
            }
            
            if (!fieldSigs.isEmpty()) {
                description.append("Fields:\n");
                for (String sig : fieldSigs) {
                    description.append("  - ").append(sig).append("\n");
                }
            }
            
        } catch (JavaModelException e) {
            return "Error generating description for type: " + e.getMessage();
        }
        
        return description.toString();
    }

    // ================ JavaDoc Extraction Methods ================

    /**
     * Extracts relevant code snippets from Javadoc.
     * This method is optimized to extract code from `<code>` tags and markdown code fences,
     * and formats them in an LLM-readable format.
     *
     * @param type the type to extract Javadoc from.
     * @param monitor the progress monitor.
     * @return A string containing all found code snippets, formatted as markdown code blocks.
     */
    private static String extractRelevantJavaDocContent(org.eclipse.jdt.core.IType type, IProgressMonitor monitor) {
        try {
            String rawJavadoc;
            boolean isHtml;

            if (type.isBinary()) {
                rawJavadoc = type.getAttachedJavadoc(monitor);
                isHtml = true;
            } else {
                org.eclipse.jdt.core.ISourceRange javadocRange = type.getJavadocRange();
                if (javadocRange == null) {
                    return "";
                }
                rawJavadoc = type.getCompilationUnit().getSource().substring(javadocRange.getOffset(), javadocRange.getOffset() + javadocRange.getLength());
                isHtml = false; // Javadoc comment from source is not HTML
            }

            if (!isNotEmpty(rawJavadoc)) {
                return "";
            }

            StringBuilder allCodeSnippets = new StringBuilder();
            Set<String> seenCodeSnippets = new HashSet<>();

            // 1. Extract markdown code blocks (```...```)
            Matcher markdownMatcher = MARKDOWN_CODE_PATTERN.matcher(rawJavadoc);
            while (markdownMatcher.find()) {
                String code = markdownMatcher.group(1).trim();
                if (isNotEmpty(code) && seenCodeSnippets.add(code)) {
                    allCodeSnippets.append("```java\n").append(code).append("\n```\n\n");
                }
            }

            // 2. Extract HTML <pre> and <code> blocks
            // Clean Javadoc comment for HTML extraction
            String cleanedForHtml = isHtml ? rawJavadoc : cleanJavadocComment(rawJavadoc);
            cleanedForHtml = convertHtmlEntities(cleanedForHtml);

            // Priority 1: <pre> blocks (often contain well-formatted code)
            Matcher preMatcher = HTML_PRE_PATTERN.matcher(cleanedForHtml);
            while (preMatcher.find()) {
                String code = preMatcher.group(1).replaceAll("(?i)<code[^>]*>", "").replaceAll("(?i)</code>", "").trim();
                if (isNotEmpty(code) && seenCodeSnippets.add(code)) {
                    allCodeSnippets.append("```java\n").append(code).append("\n```\n\n");
                }
            }

            // Priority 2: <code> blocks (for inline snippets)
            Matcher codeMatcher = HTML_CODE_PATTERN.matcher(cleanedForHtml);
            while (codeMatcher.find()) {
                String code = codeMatcher.group(1).trim();
                // Use HashSet for O(1) duplicate checking
                if (isNotEmpty(code) && seenCodeSnippets.add(code)) {
                    allCodeSnippets.append("```java\n").append(code).append("\n```\n\n");
                }
            }

            return allCodeSnippets.toString().trim();

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error extracting relevant JavaDoc content for: " + type.getElementName(), e);
            return "";
        }
    }

    /**
     * Clean up raw JavaDoc comment by removing comment markers and asterisks
     */
    private static String cleanJavadocComment(String rawJavadoc) {
        if (rawJavadoc == null || rawJavadoc.isEmpty()) {
            return "";
        }
        
        // Remove opening /** and closing */
        String cleaned = rawJavadoc;
        cleaned = cleaned.replaceFirst("^/\\*\\*", "");
        cleaned = cleaned.replaceFirst("\\*/$", "");
        
        // Split into lines and clean each line
        String[] lines = cleaned.split("\\r?\\n");
        StringBuilder result = new StringBuilder();
        
        for (String line : lines) {
            // Remove leading whitespace and asterisk
            String trimmed = line.trim();
            if (trimmed.startsWith("*")) {
                trimmed = trimmed.substring(1).trim();
            }
            
            // Skip empty lines at the beginning
            if (result.length() == 0 && trimmed.isEmpty()) {
                continue;
            }
            
            // Add line to result
            if (result.length() > 0 && !trimmed.isEmpty()) {
                result.append("\n");
            }
            result.append(trimmed);
        }
        
        return result.toString();
    }


    /**
     * Convert HTML entities to their plain text equivalents
     */
    private static String convertHtmlEntities(String text) {
        if (text == null || text.isEmpty()) {
            return text;
        }
        String result = text;
        result = result.replace("&nbsp;", " ");
        result = result.replace("&lt;", "<");
        result = result.replace("&gt;", ">");
        result = result.replace("&amp;", "&");
        result = result.replace("&quot;", "\"");
        result = result.replace("&#39;", "'");
        result = result.replace("&apos;", "'");
        result = result.replace("&mdash;", "-");
        result = result.replace("&ndash;", "-");
        return result;
    }

    /**
     * Extract summary description from method JavaDoc
     * Returns the first sentence or paragraph of the JavaDoc as a brief description
     */
    private static String extractMethodJavaDocSummary(IMethod method) {
        try {
            // Try to get JavaDoc from source
            org.eclipse.jdt.core.ISourceRange javadocRange = method.getJavadocRange();
            if (javadocRange == null) {
                return "";
            }
            
            String rawJavadoc = method.getCompilationUnit().getSource()
                .substring(javadocRange.getOffset(), javadocRange.getOffset() + javadocRange.getLength());
            
            if (!isNotEmpty(rawJavadoc)) {
                return "";
            }
            
            // Clean the JavaDoc comment
            String cleaned = cleanJavadocComment(rawJavadoc);
            
            // Extract the description (before any @param, @return, @throws tags)
            String description = extractJavadocDescription(cleaned);
            
            // Get first sentence or limit length
            String summary = getFirstSentenceOrLimit(description, 120);
            
            return summary;
            
        } catch (Exception e) {
            // Silently fail and return empty string
            return "";
        }
    }

    /**
     * Extract the main description part from JavaDoc (before @tags)
     */
    private static String extractJavadocDescription(String cleanedJavadoc) {
        if (cleanedJavadoc == null || cleanedJavadoc.isEmpty()) {
            return "";
        }
        
        // Split into lines and extract description before @tags
        String[] lines = cleanedJavadoc.split("\\n");
        StringBuilder description = new StringBuilder();
        
        for (String line : lines) {
            String trimmedLine = line.trim();
            // Check if line starts with @tag
            if (trimmedLine.startsWith("@")) {
                break; // Stop at first tag
            }
            
            // Skip empty lines at the beginning
            if (description.length() == 0 && trimmedLine.isEmpty()) {
                continue;
            }
            
            if (description.length() > 0) {
                description.append(" ");
            }
            description.append(trimmedLine);
        }
        
        return description.toString().trim();
    }

    /**
     * Get the first sentence or limit the text to maxLength characters
     */
    private static String getFirstSentenceOrLimit(String text, int maxLength) {
        if (text == null || text.isEmpty()) {
            return "";
        }
        
        // Try to find the first sentence (ending with ., !, or ?)
        int firstPeriod = text.indexOf(". ");
        int firstExclamation = text.indexOf("! ");
        int firstQuestion = text.indexOf("? ");
        
        int firstSentenceEnd = -1;
        if (firstPeriod != -1) firstSentenceEnd = firstPeriod;
        if (firstExclamation != -1 && (firstSentenceEnd == -1 || firstExclamation < firstSentenceEnd)) {
            firstSentenceEnd = firstExclamation;
        }
        if (firstQuestion != -1 && (firstSentenceEnd == -1 || firstQuestion < firstSentenceEnd)) {
            firstSentenceEnd = firstQuestion;
        }
        
        // If we found a sentence ending and it's within reasonable length
        if (firstSentenceEnd != -1 && firstSentenceEnd < maxLength) {
            return text.substring(0, firstSentenceEnd + 1).trim();
        }
        
        // Otherwise, limit to maxLength
        if (text.length() > maxLength) {
            // Try to cut at a word boundary
            int lastSpace = text.lastIndexOf(' ', maxLength);
            if (lastSpace > maxLength / 2) {
                return text.substring(0, lastSpace).trim() + "...";
            }
            return text.substring(0, maxLength).trim() + "...";
        }
        
        return text.trim();
    }

    /**
     * Extract summary description from field JavaDoc
     */
    private static String extractFieldJavaDocSummary(org.eclipse.jdt.core.IField field) {
        try {
            // Try to get JavaDoc from source
            org.eclipse.jdt.core.ISourceRange javadocRange = field.getJavadocRange();
            if (javadocRange == null) {
                return "";
            }
            
            String rawJavadoc = field.getCompilationUnit().getSource()
                .substring(javadocRange.getOffset(), javadocRange.getOffset() + javadocRange.getLength());
            
            if (!isNotEmpty(rawJavadoc)) {
                return "";
            }
            
            // Clean the JavaDoc comment
            String cleaned = cleanJavadocComment(rawJavadoc);
            
            // Extract the description (before any @tags)
            String description = extractJavadocDescription(cleaned);
            
            // Get first sentence or limit length
            String summary = getFirstSentenceOrLimit(description, 120);
            
            return summary;
            
        } catch (Exception e) {
            // Silently fail and return empty string
            return "";
        }
    }

    /**
     * Generate human-readable method signature with JavaDoc description
     */
    public static String generateMethodSignature(IMethod method) {
        StringBuilder sb = new StringBuilder();
        
        try {
            int flags = method.getFlags();
            appendAccessModifiers(sb, flags);
            appendOtherModifiers(sb, flags, true);
            
            // Type parameters (if any)
            String[] typeParameters = method.getTypeParameterSignatures();
            if (typeParameters != null && typeParameters.length > 0) {
                sb.append("<");
                for (int i = 0; i < typeParameters.length; i++) {
                    if (i > 0) sb.append(", ");
                    sb.append(convertTypeSignature(typeParameters[i]));
                }
                sb.append("> ");
            }
            
            // Return type (constructors don't have return type)
            if (!method.isConstructor()) {
                String returnType = convertTypeSignature(method.getReturnType());
                sb.append(returnType).append(" ");
            }
            
            // Method name
            sb.append(method.getElementName()).append("(");
            
            // Parameter list
            String[] paramTypes = method.getParameterTypes();
            String[] paramNames = method.getParameterNames();
            for (int i = 0; i < paramTypes.length; i++) {
                if (i > 0) {
                    sb.append(", ");
                }
                sb.append(convertTypeSignature(paramTypes[i]));
                if (paramNames != null && i < paramNames.length) {
                    sb.append(" ").append(paramNames[i]);
                }
            }
            
            sb.append(")");
            
            // Exception declarations
            String[] exceptionTypes = method.getExceptionTypes();
            if (exceptionTypes != null && exceptionTypes.length > 0) {
                sb.append(" throws ");
                for (int i = 0; i < exceptionTypes.length; i++) {
                    if (i > 0) sb.append(", ");
                    sb.append(convertTypeSignature(exceptionTypes[i]));
                }
            }
            
        } catch (JavaModelException e) {
            return method.getElementName() + "(...)";
        }
        
        // Extract JavaDoc description and prepend if exists
        String javadocSummary = extractMethodJavaDocSummary(method);
        if (isNotEmpty(javadocSummary)) {
            return "// " + javadocSummary + "\n      " + sb.toString();
        }
        
        return sb.toString();
    }

    /**
     * Generate human-readable field signature with JavaDoc description
     */
    public static String generateFieldSignature(org.eclipse.jdt.core.IField field) {
        StringBuilder sb = new StringBuilder();
        
        try {
            int flags = field.getFlags();
            appendAccessModifiers(sb, flags);
            appendOtherModifiers(sb, flags, false);
            
            // Type and name
            String fieldType = convertTypeSignature(field.getTypeSignature());
            sb.append(fieldType).append(" ").append(field.getElementName());
            
            // If it's a constant, try to get the initial value
            if (org.eclipse.jdt.core.Flags.isStatic(flags) && org.eclipse.jdt.core.Flags.isFinal(flags)) {
                Object constant = field.getConstant();
                if (constant != null) {
                    sb.append(" = ");
                    if (constant instanceof String) {
                        sb.append("\"").append(constant).append("\"");
                    } else {
                        sb.append(constant);
                    }
                }
            }
            
        } catch (JavaModelException e) {
            return field.getElementName();
        }
        
        // Extract JavaDoc description and prepend if exists
        String javadocSummary = extractFieldJavaDocSummary(field);
        if (isNotEmpty(javadocSummary)) {
            return "// " + javadocSummary + "\n      " + sb.toString();
        }
        
        return sb.toString();
    }

    /**
     * Append access modifiers (public/protected/private) to StringBuilder
     */
    private static void appendAccessModifiers(StringBuilder sb, int flags) {
        if (org.eclipse.jdt.core.Flags.isPublic(flags)) {
            sb.append("public ");
        } else if (org.eclipse.jdt.core.Flags.isProtected(flags)) {
            sb.append("protected ");
        } else if (org.eclipse.jdt.core.Flags.isPrivate(flags)) {
            sb.append("private ");
        }
    }

    /**
     * Append other modifiers (static/final/abstract) to StringBuilder
     */
    private static void appendOtherModifiers(StringBuilder sb, int flags, boolean isMethod) {
        if (org.eclipse.jdt.core.Flags.isStatic(flags)) {
            sb.append("static ");
        }
        if (org.eclipse.jdt.core.Flags.isFinal(flags)) {
            sb.append("final ");
        }
        if (isMethod && org.eclipse.jdt.core.Flags.isAbstract(flags)) {
            sb.append("abstract ");
        }
    }

    /**
     * Convert JDT type signature to human-readable format
     */
    public static String convertTypeSignature(String jdtSignature) {
        if (jdtSignature == null || jdtSignature.isEmpty()) {
            return "void";
        }

        // Handle array types
        int arrayDimensions = 0;
        while (jdtSignature.startsWith("[")) {
            arrayDimensions++;
            jdtSignature = jdtSignature.substring(1);
        }

        String baseType;

        // Handle type parameters and reference types (starts with Q)
        if (jdtSignature.startsWith("Q") && jdtSignature.endsWith(";")) {
            baseType = jdtSignature.substring(1, jdtSignature.length() - 1);
            baseType = baseType.replace('/', '.');
            
            // Handle generic type parameters (e.g., "QResult<QUser;>;")
            baseType = processGenericTypes(baseType);
            baseType = simplifyTypeName(baseType);
        }
        // Handle fully qualified types (starts with L)
        else if (jdtSignature.startsWith("L") && jdtSignature.endsWith(";")) {
            baseType = jdtSignature.substring(1, jdtSignature.length() - 1);
            baseType = baseType.replace('/', '.');
            
            // Handle generic type parameters
            baseType = processGenericTypes(baseType);
            baseType = simplifyTypeName(baseType);
        }
        // Handle primitive types
        else {
            switch (jdtSignature.charAt(0)) {
                case 'I': baseType = "int"; break;
                case 'Z': baseType = "boolean"; break;
                case 'V': baseType = "void"; break;
                case 'J': baseType = "long"; break;
                case 'F': baseType = "float"; break;
                case 'D': baseType = "double"; break;
                case 'B': baseType = "byte"; break;
                case 'C': baseType = "char"; break;
                case 'S': baseType = "short"; break;
                default: baseType = jdtSignature;
            }
        }

        // Add array markers
        for (int i = 0; i < arrayDimensions; i++) {
            baseType += "[]";
        }

        return baseType;
    }
    
    /**
     * Process generic type parameters in a type name
     * Example: "Result<QUser;>" -> "Result<User>"
     */
    private static String processGenericTypes(String typeName) {
        if (typeName == null || !typeName.contains("<")) {
            return typeName;
        }
        
        StringBuilder result = new StringBuilder();
        int i = 0;
        
        while (i < typeName.length()) {
            char c = typeName.charAt(i);
            
            if (c == '<' || c == ',' || c == ' ') {
                // Keep angle brackets, commas, and spaces
                result.append(c);
                i++;
                
                // Skip whitespace after comma or opening bracket
                while (i < typeName.length() && typeName.charAt(i) == ' ') {
                    result.append(' ');
                    i++;
                }
                
                // Check if next is a type parameter (Q or L prefix)
                if (i < typeName.length()) {
                    char next = typeName.charAt(i);
                    
                    if (next == 'Q' || next == 'L') {
                        // Find the end of this type parameter (marked by ;)
                        int endIndex = typeName.indexOf(';', i);
                        if (endIndex != -1) {
                            // Extract the type parameter and convert it
                            String typeParam = typeName.substring(i + 1, endIndex);
                            
                            // Recursively process nested generics
                            typeParam = processGenericTypes(typeParam);
                            typeParam = simplifyTypeName(typeParam);
                            
                            result.append(typeParam);
                            i = endIndex + 1; // Skip past the semicolon
                        } else {
                            result.append(next);
                            i++;
                        }
                    } else {
                        // Not a type parameter, just append
                        result.append(next);
                        i++;
                    }
                }
            } else {
                result.append(c);
                i++;
            }
        }
        
        return result.toString();
    }

    /**
     * Simplify fully qualified type name to just the simple name
     */
    private static String simplifyTypeName(String qualifiedName) {
        if (qualifiedName == null) {
            return qualifiedName;
        }
        int lastDot = qualifiedName.lastIndexOf('.');
        return lastDot == -1 ? qualifiedName : qualifiedName.substring(lastDot + 1);
    }

    /**
     * Utility method to check if a string is not empty or null
     */
    private static boolean isNotEmpty(String value) {
        return value != null && !value.isEmpty();
    }
}
