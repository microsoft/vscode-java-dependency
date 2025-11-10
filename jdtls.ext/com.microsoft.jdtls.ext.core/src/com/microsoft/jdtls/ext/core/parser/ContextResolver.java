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

    // Common JDK packages to skip (Copilot already has good understanding of these)
    // These are well-known packages whose classes don't need to be extracted from JARs
    private static final Set<String> SKIP_COMMON_JDK_PACKAGES = new HashSet<>();
    static {
        // Core Java packages - Copilot has excellent understanding of these
        SKIP_COMMON_JDK_PACKAGES.add("java.lang");           // Object, String, Integer, etc.
        SKIP_COMMON_JDK_PACKAGES.add("java.util");           // Collections, List, Map, Set, etc.
        SKIP_COMMON_JDK_PACKAGES.add("java.io");             // File, InputStream, Reader, etc.
        SKIP_COMMON_JDK_PACKAGES.add("java.nio");            // ByteBuffer, etc.
        SKIP_COMMON_JDK_PACKAGES.add("java.nio.file");       // Path, Paths, Files
        SKIP_COMMON_JDK_PACKAGES.add("java.time");           // LocalDate, LocalDateTime, Instant, etc.
        SKIP_COMMON_JDK_PACKAGES.add("java.util.concurrent"); // ExecutorService, Future, CompletableFuture, etc.
        SKIP_COMMON_JDK_PACKAGES.add("java.util.stream");    // Stream, Collectors
        SKIP_COMMON_JDK_PACKAGES.add("java.util.function");  // Function, Consumer, Supplier, Predicate
        SKIP_COMMON_JDK_PACKAGES.add("java.net");            // URL, URI, HttpURLConnection
        SKIP_COMMON_JDK_PACKAGES.add("java.util.regex");     // Pattern, Matcher
        SKIP_COMMON_JDK_PACKAGES.add("java.math");           // BigDecimal, BigInteger
        SKIP_COMMON_JDK_PACKAGES.add("java.text");           // DateFormat, SimpleDateFormat, etc.
        SKIP_COMMON_JDK_PACKAGES.add("java.sql");            // Connection, ResultSet, etc.
        SKIP_COMMON_JDK_PACKAGES.add("javax.sql");           // DataSource, etc.
        
        // Java EE / Jakarta EE - Well-known enterprise packages
        SKIP_COMMON_JDK_PACKAGES.add("javax.servlet");       // Servlet API
        SKIP_COMMON_JDK_PACKAGES.add("javax.annotation");    // @PostConstruct, @PreDestroy, etc.
        SKIP_COMMON_JDK_PACKAGES.add("javax.persistence");   // JPA annotations
        SKIP_COMMON_JDK_PACKAGES.add("javax.inject");        // @Inject
        SKIP_COMMON_JDK_PACKAGES.add("javax.validation");    // Bean Validation
        SKIP_COMMON_JDK_PACKAGES.add("jakarta.servlet");     // Jakarta Servlet
        SKIP_COMMON_JDK_PACKAGES.add("jakarta.persistence"); // Jakarta JPA
        
        // Spring Framework - Extremely common and well-documented
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.stereotype");    // @Component, @Service, @Repository, @Controller
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.beans");         // @Autowired, BeanFactory
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.context");       // ApplicationContext, @Configuration
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.web.bind");      // @RequestMapping, @PathVariable, etc.
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.boot");          // SpringApplication, @SpringBootApplication
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.data.jpa");      // JpaRepository
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.data.repository"); // CrudRepository
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.transaction");   // @Transactional
        SKIP_COMMON_JDK_PACKAGES.add("org.springframework.security");      // Spring Security annotations
        
        // Testing frameworks - Very common and well-documented
        SKIP_COMMON_JDK_PACKAGES.add("org.junit");           // JUnit 4/5 - @Test, assertions
        SKIP_COMMON_JDK_PACKAGES.add("org.junit.jupiter");   // JUnit 5 specific
        SKIP_COMMON_JDK_PACKAGES.add("org.testng");          // TestNG
        SKIP_COMMON_JDK_PACKAGES.add("org.mockito");         // Mockito - mock(), when(), verify()
        SKIP_COMMON_JDK_PACKAGES.add("org.assertj");         // AssertJ fluent assertions
        SKIP_COMMON_JDK_PACKAGES.add("org.hamcrest");        // Hamcrest matchers
        
        // Lombok - Code generation library (Copilot understands these annotations very well)
        SKIP_COMMON_JDK_PACKAGES.add("lombok");              // @Data, @Getter, @Setter, @Builder, etc.
        
        // Logging frameworks - Very standard APIs
        SKIP_COMMON_JDK_PACKAGES.add("org.slf4j");           // SLF4J - Logger, LoggerFactory
        SKIP_COMMON_JDK_PACKAGES.add("org.apache.logging.log4j"); // Log4j 2
        SKIP_COMMON_JDK_PACKAGES.add("org.apache.log4j");    // Log4j 1.x
        SKIP_COMMON_JDK_PACKAGES.add("java.util.logging");   // JUL - java.util.logging
        
        // Jackson - JSON processing (very common)
        SKIP_COMMON_JDK_PACKAGES.add("com.fasterxml.jackson.annotation"); // @JsonProperty, @JsonIgnore
        SKIP_COMMON_JDK_PACKAGES.add("com.fasterxml.jackson.core");       // JsonParser, JsonGenerator
        SKIP_COMMON_JDK_PACKAGES.add("com.fasterxml.jackson.databind");   // ObjectMapper
        
        // Google Guava - Well-known utility library
        SKIP_COMMON_JDK_PACKAGES.add("com.google.common.collect"); // ImmutableList, ImmutableMap, etc.
        SKIP_COMMON_JDK_PACKAGES.add("com.google.common.base");    // Preconditions, Strings, etc.
        
        // Apache Commons - Well-known utility libraries
        SKIP_COMMON_JDK_PACKAGES.add("org.apache.commons.lang3");  // StringUtils, etc.
        SKIP_COMMON_JDK_PACKAGES.add("org.apache.commons.collections4"); // CollectionUtils
        SKIP_COMMON_JDK_PACKAGES.add("org.apache.commons.io");     // IOUtils, FileUtils
    }

    /**
     * ImportClassInfo - Conforms to Copilot CodeSnippet format
     * Used to provide Java class context information and JavaDoc to Copilot
     */
    public static class ImportClassInfo {
        public String uri;           // File URI (required)
        public String value;     // Human-readable class description with JavaDoc appended (required)

        public ImportClassInfo(String uri, String value) {
            this.uri = uri;
            this.value = value;
        }
    }

    /**
     * Resolve a single type import and extract its information
     */
    public static void resolveSingleType(IJavaProject javaProject, String typeName, List<ImportClassInfo> classInfoList,
            Set<String> processedTypes, IProgressMonitor monitor) {
        try {
            // Check if already processed to avoid duplicates
            if (processedTypes.contains(typeName)) {
                return;
            }

            // Extract package and simple name from the fully qualified type name
            int lastDotIndex = typeName.lastIndexOf('.');
            if (lastDotIndex == -1) {
                // Default package or invalid type name - mark as processed to avoid retry
                processedTypes.add(typeName);
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
                        // Source type found - mark as processed and extract information
                        processedTypes.add(typeName);
                        extractTypeInfo(type, classInfoList, monitor);
                        return;
                    }
                    // Binary types (from JARs/JRE) found but not processed in Phase 1
                    // Do NOT mark as processed - let Phase 2 handle them if triggered
                    return;
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
                                processedTypes.add(typeName);
                                extractTypeInfo(primaryType, classInfoList, monitor);
                                return;
                            }
                            
                            // Also check for inner types in the compilation unit
                            org.eclipse.jdt.core.IType[] allTypes = cu.getAllTypes();
                            for (org.eclipse.jdt.core.IType type : allTypes) {
                                if (typeName.equals(type.getFullyQualifiedName())) {
                                    processedTypes.add(typeName);
                                    extractTypeInfo(type, classInfoList, monitor);
                                    return;
                                }
                            }
                        }
                    }
                }
            }
            
            // Type not found - mark as processed to avoid repeated failed lookups
            processedTypes.add(typeName);
            
        } catch (JavaModelException e) {
            // Log and mark as processed even on error to avoid repeated failures
            JdtlsExtActivator.logException("Error resolving type: " + typeName, e);
            processedTypes.add(typeName);
        }
    }

    /**
     * Check if a type belongs to a common JDK package that should be skipped.
     * Uses package-level matching for efficient filtering.
     * 
     * @param typeName Fully qualified type name (e.g., "java.lang.String")
     * @return true if the type is from a common JDK package
     */
    private static boolean isCommonJdkType(String typeName) {
        if (typeName == null || typeName.isEmpty()) {
            return false;
        }
        
        int lastDotIndex = typeName.lastIndexOf('.');
        if (lastDotIndex == -1) {
            return false;
        }
        
        String packageName = typeName.substring(0, lastDotIndex);
        
        // Check exact match or sub-package match
        return SKIP_COMMON_JDK_PACKAGES.contains(packageName) || 
               SKIP_COMMON_JDK_PACKAGES.stream().anyMatch(pkg -> packageName.startsWith(pkg + "."));
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
     * Resolve a binary type (from external JAR/JRE) with simplified content.
     * This method is used for external dependencies when project sources are sparse.
     * 
     * @param javaProject The Java project context
     * @param typeName Fully qualified type name (e.g., "java.util.ArrayList")
     * @param classInfoList List to append resolved class information
     * @param processedTypes Set tracking already processed types to avoid duplicates
     * @param maxMethods Maximum number of methods to include (to limit token usage)
     * @param monitor Progress monitor for cancellation
     */
    public static void resolveBinaryType(IJavaProject javaProject, String typeName, 
            List<ImportClassInfo> classInfoList, Set<String> processedTypes, 
            int maxMethods, IProgressMonitor monitor) {
        try {
            if (processedTypes.contains(typeName)) {
                return;
            }
            
            // Performance optimization: Skip common JDK packages that Copilot already understands well
            // This significantly reduces processing time for external dependencies
            if (isCommonJdkType(typeName)) {
                processedTypes.add(typeName);
                return;
            }
            
            // Use JDT's findType which searches all sources and dependencies
            org.eclipse.jdt.core.IType type = javaProject.findType(typeName);
            if (type == null || !type.exists()) {
                return;
            }
            
            // Only process binary types (from JARs/JRE)
            if (!type.isBinary()) {
                return; // Skip source types - they should be handled by resolveSingleType
            }
            
            processedTypes.add(typeName);
            
            // Extract simplified information for binary types
            extractBinaryTypeInfo(type, classInfoList, maxMethods, monitor);
            
        } catch (JavaModelException e) {
            // Log but continue processing other types
            JdtlsExtActivator.logException("Error resolving binary type: " + typeName, e);
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
     * Extract simplified information for binary types (external dependencies).
     * This method extracts only essential information to reduce token usage:
     * - Class signature (modifiers, name, generics, extends/implements)
     * - Limited number of public methods (no implementation details)
     * - Public fields (if any)
     * - Basic class-level JavaDoc if available
     * 
     * @param type Binary type from JAR/JRE
     * @param classInfoList List to append resolved class information
     * @param maxMethods Maximum number of methods to include
     * @param monitor Progress monitor for cancellation
     */
    public static void extractBinaryTypeInfo(org.eclipse.jdt.core.IType type, 
            List<ImportClassInfo> classInfoList, int maxMethods, IProgressMonitor monitor) {
        try {
            // Use a placeholder URI for binary types (they don't have local file paths)
            String uri = "jar://" + type.getFullyQualifiedName().replace('.', '/') + ".class";
            
            // Generate simplified class description for binary types
            StringBuilder sb = new StringBuilder();
            
            // 1. Extract class-level JavaDoc (brief summary only)
            String javadoc = extractBriefJavaDoc(type);
            if (javadoc != null && !javadoc.isEmpty()) {
                sb.append("/**\n * ").append(javadoc).append("\n */\n");
            }
            
            // 2. Class signature (modifiers, name, generics, inheritance)
            sb.append(generateClassSignature(type));
            sb.append(" {\n\n");
            
            // 3. Public fields (limit to first 5)
            org.eclipse.jdt.core.IField[] fields = type.getFields();
            int fieldCount = 0;
            for (org.eclipse.jdt.core.IField field : fields) {
                if (fieldCount >= 5) break;
                if (org.eclipse.jdt.core.Flags.isPublic(field.getFlags())) {
                    sb.append("    ").append(generateBinaryFieldSignature(field)).append("\n");
                    fieldCount++;
                }
            }
            if (fieldCount > 0) {
                sb.append("\n");
            }
            
            // 4. Public methods (limited by maxMethods parameter)
            org.eclipse.jdt.core.IMethod[] methods = type.getMethods();
            int methodCount = 0;
            for (org.eclipse.jdt.core.IMethod method : methods) {
                if (methodCount >= maxMethods) break;
                if (org.eclipse.jdt.core.Flags.isPublic(method.getFlags())) {
                    sb.append("    ").append(generateBinaryMethodSignature(method)).append("\n");
                    methodCount++;
                }
            }
            
            sb.append("}\n");
            
            // Add note indicating this is simplified external dependency info
            sb.append("// Note: External dependency - showing simplified signature only\n");
            
            // Create ImportClassInfo
            ImportClassInfo info = new ImportClassInfo(uri, sb.toString());
            classInfoList.add(info);
            
        } catch (JavaModelException e) {
            JdtlsExtActivator.logException("Error extracting binary type info for: " + type.getElementName(), e);
        }
    }

    /**
     * Generate class signature with modifiers, name, generics, and inheritance
     */
    private static String generateClassSignature(org.eclipse.jdt.core.IType type) throws JavaModelException {
        StringBuilder sb = new StringBuilder();
        
        // Modifiers
        int flags = type.getFlags();
        if (org.eclipse.jdt.core.Flags.isPublic(flags)) sb.append("public ");
        if (org.eclipse.jdt.core.Flags.isAbstract(flags) && !type.isInterface()) sb.append("abstract ");
        if (org.eclipse.jdt.core.Flags.isFinal(flags)) sb.append("final ");
        
        // Type kind
        if (type.isInterface()) {
            sb.append("interface ");
        } else if (type.isEnum()) {
            sb.append("enum ");
        } else if (type.isAnnotation()) {
            sb.append("@interface ");
        } else {
            sb.append("class ");
        }
        
        // Simple name
        sb.append(type.getElementName());
        
        // Type parameters
        org.eclipse.jdt.core.ITypeParameter[] typeParams = type.getTypeParameters();
        if (typeParams != null && typeParams.length > 0) {
            sb.append("<");
            for (int i = 0; i < typeParams.length; i++) {
                if (i > 0) sb.append(", ");
                sb.append(typeParams[i].getElementName());
            }
            sb.append(">");
        }
        
        // Superclass
        String superclass = type.getSuperclassName();
        if (superclass != null && !superclass.equals("Object") && !type.isInterface()) {
            sb.append(" extends ").append(simplifyTypeName(superclass));
        }
        
        // Interfaces
        String[] interfaces = type.getSuperInterfaceNames();
        if (interfaces != null && interfaces.length > 0) {
            if (type.isInterface()) {
                sb.append(" extends ");
            } else {
                sb.append(" implements ");
            }
            for (int i = 0; i < interfaces.length; i++) {
                if (i > 0) sb.append(", ");
                sb.append(simplifyTypeName(interfaces[i]));
            }
        }
        
        return sb.toString();
    }
    
    /**
     * Extract brief JavaDoc summary for binary types (first sentence only)
     * Performance optimization: Skip JavaDoc extraction for binary types to avoid expensive I/O
     */
    private static String extractBriefJavaDoc(org.eclipse.jdt.core.IType type) {
        // Performance optimization: Skip JavaDoc extraction for binary types
        // getAttachedJavadoc() is expensive - may involve JAR reading, network downloads, HTML parsing
        if (type.isBinary()) {
            return null;
        }
        
        try {
            String javadoc = type.getAttachedJavadoc(null);
            if (javadoc == null || javadoc.isEmpty()) {
                return null;
            }
            return getFirstSentenceOrLimit(javadoc, 120);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Generate simplified field signature for binary types
     */
    private static String generateBinaryFieldSignature(org.eclipse.jdt.core.IField field) {
        return generateFieldSignatureInternal(field, true);
    }

    /**
     * Generate simplified method signature for binary types (no implementation)
     */
    private static String generateBinaryMethodSignature(org.eclipse.jdt.core.IMethod method) {
        return generateMethodSignatureInternal(method, true, false);
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
     * Extracts relevant JavaDoc content including description text and code snippets.
     * This method extracts:
     * 1. Class description (first paragraph of text)
     * 2. Code snippets from <code>, <pre>, and ``` blocks
     * 3. @deprecated tag if present
     *
     * @param type the type to extract Javadoc from.
     * @param monitor the progress monitor.
     * @return A string containing description and code snippets in LLM-readable format.
     */
    private static String extractRelevantJavaDocContent(org.eclipse.jdt.core.IType type, IProgressMonitor monitor) {
        try {
            // Performance optimization: Skip JavaDoc extraction for binary types
            // getAttachedJavadoc() is EXTREMELY expensive for binary types:
            // - Requires reading from JAR files (I/O overhead)
            // - May trigger Maven artifact download from remote repositories (network)
            // - Involves HTML parsing and DOM manipulation (CPU intensive)
            // Binary types from JARs are typically well-known libraries that Copilot already understands
            if (type.isBinary()) {
                return ""; // Skip expensive JavaDoc extraction for external dependencies
            }
            
            String rawJavadoc;

            // Extract JavaDoc from source code (fast - no I/O, no network, no HTML parsing)
            org.eclipse.jdt.core.ISourceRange javadocRange = type.getJavadocRange();
            if (javadocRange == null) {
                return "";
            }
            rawJavadoc = type.getCompilationUnit().getSource().substring(javadocRange.getOffset(), javadocRange.getOffset() + javadocRange.getLength());

            if (!isNotEmpty(rawJavadoc)) {
                return "";
            }

            StringBuilder result = new StringBuilder();
            Set<String> seenCodeSnippets = new HashSet<>();
            
            // Clean Javadoc comment for processing
            String cleanedJavadoc = cleanJavadocComment(rawJavadoc);
            cleanedJavadoc = convertHtmlEntities(cleanedJavadoc);

            // === High Priority: Extract class description text (first paragraph) ===
            String description = extractClassDescription(cleanedJavadoc);
            if (isNotEmpty(description)) {
                result.append("Description:\n").append(description).append("\n\n");
            }
            
            // === High Priority: Check for @deprecated tag ===
            if (isDeprecated(cleanedJavadoc)) {
                result.append("⚠️ DEPRECATED: This class is deprecated and should not be used in new code.\n\n");
            }

            // === Extract code snippets ===
            // 1. Extract markdown code blocks (```...```)
            Matcher markdownMatcher = MARKDOWN_CODE_PATTERN.matcher(rawJavadoc);
            while (markdownMatcher.find()) {
                String code = markdownMatcher.group(1).trim();
                if (isNotEmpty(code) && seenCodeSnippets.add(code)) {
                    result.append("Example:\n```java\n").append(code).append("\n```\n\n");
                }
            }

            // 2. Extract HTML <pre> and <code> blocks
            // Priority 1: <pre> blocks (often contain well-formatted code)
            Matcher preMatcher = HTML_PRE_PATTERN.matcher(cleanedJavadoc);
            while (preMatcher.find()) {
                String code = preMatcher.group(1).replaceAll("(?i)<code[^>]*>", "").replaceAll("(?i)</code>", "").trim();
                if (isNotEmpty(code) && seenCodeSnippets.add(code)) {
                    result.append("Example:\n```java\n").append(code).append("\n```\n\n");
                }
            }

            // Priority 2: <code> blocks (for inline snippets)
            Matcher codeMatcher = HTML_CODE_PATTERN.matcher(cleanedJavadoc);
            while (codeMatcher.find()) {
                String code = codeMatcher.group(1).trim();
                // Use HashSet for O(1) duplicate checking
                if (isNotEmpty(code) && seenCodeSnippets.add(code)) {
                    result.append("Example:\n```java\n").append(code).append("\n```\n\n");
                }
            }

            return result.toString().trim();

        } catch (Exception e) {
            JdtlsExtActivator.logException("Error extracting relevant JavaDoc content for: " + type.getElementName(), e);
            return "";
        }
    }
    
    /**
     * Extract the main description paragraph from class JavaDoc (before @tags and code blocks).
     * Returns the first paragraph of descriptive text, limited to reasonable length.
     */
    private static String extractClassDescription(String cleanedJavadoc) {
        if (cleanedJavadoc == null || cleanedJavadoc.isEmpty()) {
            return "";
        }
        
        // Remove code blocks first to get pure text
        String textOnly = cleanedJavadoc;
        textOnly = MARKDOWN_CODE_PATTERN.matcher(textOnly).replaceAll("");
        textOnly = HTML_PRE_PATTERN.matcher(textOnly).replaceAll("");
        textOnly = HTML_CODE_PATTERN.matcher(textOnly).replaceAll("");
        
        // Extract description before @tags
        String description = extractJavadocDescription(textOnly);
        
        // Limit to first 2-3 sentences or ~200 characters
        if (description.length() > 200) {
            int breakPoint = findBestBreakpoint(description, 100, 250);
            if (breakPoint != -1) {
                description = description.substring(0, breakPoint + 1).trim();
            } else {
                int lastSpace = description.lastIndexOf(' ', 200);
                description = description.substring(0, lastSpace > 100 ? lastSpace : 200).trim() + "...";
            }
        }
        
        return description.trim();
    }
    
    /**
     * Check if the JavaDoc contains @deprecated tag.
     */
    private static boolean isDeprecated(String cleanedJavadoc) {
        return cleanedJavadoc != null && cleanedJavadoc.contains("@deprecated");
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
        return text.replace("&nbsp;", " ")
                   .replace("&lt;", "<")
                   .replace("&gt;", ">")
                   .replace("&amp;", "&")
                   .replace("&quot;", "\"")
                   .replace("&#39;", "'")
                   .replace("&apos;", "'")
                   .replace("&mdash;", "-")
                   .replace("&ndash;", "-");
    }

    /**
     * Extract detailed JavaDoc summary from method including @param, @return, and @throws tags.
     * Returns a formatted string with the method description and parameter/return information.
     */
    private static String extractMethodJavaDocSummary(IMethod method) {
        try {
            org.eclipse.jdt.core.ISourceRange javadocRange = method.getJavadocRange();
            if (javadocRange == null) {
                return "";
            }
            
            String rawJavadoc = method.getCompilationUnit().getSource()
                .substring(javadocRange.getOffset(), javadocRange.getOffset() + javadocRange.getLength());
            
            if (!isNotEmpty(rawJavadoc)) {
                return "";
            }
            
            String cleaned = cleanJavadocComment(rawJavadoc);
            StringBuilder result = new StringBuilder();
            
            // Extract main description (first sentence)
            String description = extractJavadocDescription(cleaned);
            String firstSentence = getFirstSentenceOrLimit(description, 120);
            if (isNotEmpty(firstSentence)) {
                result.append(firstSentence);
            }
            
            // === Medium Priority: Parse @param tags ===
            List<String> params = extractJavadocTag(cleaned, "@param");
            if (!params.isEmpty()) {
                result.append(" | Params: ");
                for (int i = 0; i < params.size() && i < 3; i++) { // Limit to 3 params
                    if (i > 0) result.append(", ");
                    result.append(params.get(i));
                }
                if (params.size() > 3) {
                    result.append("...");
                }
            }
            
            // === Medium Priority: Parse @return tag ===
            List<String> returns = extractJavadocTag(cleaned, "@return");
            if (!returns.isEmpty()) {
                String returnDesc = returns.get(0);
                // Limit return description to 60 chars
                if (returnDesc.length() > 60) {
                    returnDesc = returnDesc.substring(0, 57) + "...";
                }
                result.append(" | Returns: ").append(returnDesc);
            }
            
            // === Medium Priority: Parse @throws tags ===
            List<String> throwsTags = extractJavadocTag(cleaned, "@throws");
            if (throwsTags.isEmpty()) {
                throwsTags = extractJavadocTag(cleaned, "@exception");
            }
            if (!throwsTags.isEmpty()) {
                result.append(" | Throws: ");
                for (int i = 0; i < Math.min(throwsTags.size(), 2); i++) {
                    if (i > 0) result.append(", ");
                    String exceptionInfo = throwsTags.get(i);
                    int spaceIndex = exceptionInfo.indexOf(' ');
                    result.append(spaceIndex != -1 ? exceptionInfo.substring(0, spaceIndex) : exceptionInfo);
                }
                if (throwsTags.size() > 2) {
                    result.append("...");
                }
            }
            
            // === High Priority: Mark deprecated methods ===
            if (cleaned.contains("@deprecated")) {
                result.append(result.length() > 0 ? " " : "").append("[DEPRECATED]");
            }
            
            return result.toString();
            
        } catch (Exception e) {
            return "";
        }
    }
    
    /**
     * Extract JavaDoc tags of a specific type (e.g., @param, @return, @throws).
     * Returns a list of tag values (without the tag name itself).
     * 
     * @param cleanedJavadoc Cleaned JavaDoc text
     * @param tagName Tag name to search for (e.g., "@param")
     * @return List of tag values
     */
    private static List<String> extractJavadocTag(String cleanedJavadoc, String tagName) {
        List<String> results = new ArrayList<>();
        
        if (cleanedJavadoc == null || cleanedJavadoc.isEmpty()) {
            return results;
        }
        
        String[] lines = cleanedJavadoc.split("\\n");
        StringBuilder currentTag = null;
        
        for (String line : lines) {
            String trimmed = line.trim();
            
            // Check if this line starts with the target tag
            if (trimmed.startsWith(tagName + " ")) {
                // Save previous tag if exists
                if (currentTag != null) {
                    results.add(currentTag.toString().trim());
                }
                // Start new tag (remove tag name)
                currentTag = new StringBuilder(trimmed.substring(tagName.length() + 1).trim());
            }
            // Check if this line starts with any other tag
            else if (trimmed.startsWith("@")) {
                // Save previous tag if exists
                if (currentTag != null) {
                    results.add(currentTag.toString().trim());
                    currentTag = null;
                }
            }
            // Continuation of current tag
            else if (currentTag != null && isNotEmpty(trimmed)) {
                currentTag.append(" ").append(trimmed);
            }
        }
        
        // Don't forget the last tag
        if (currentTag != null) {
            results.add(currentTag.toString().trim());
        }
        
        return results;
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
        
        // Find first sentence boundary (., !, ?)
        int firstSentenceEnd = findFirstSentenceBoundary(text);
        
        // Return first sentence if within reasonable length
        if (firstSentenceEnd != -1 && firstSentenceEnd < maxLength) {
            return text.substring(0, firstSentenceEnd + 1).trim();
        }
        
        // Otherwise truncate at maxLength with word boundary
        if (text.length() > maxLength) {
            int lastSpace = text.lastIndexOf(' ', maxLength);
            int cutPoint = (lastSpace > maxLength / 2) ? lastSpace : maxLength;
            return text.substring(0, cutPoint).trim() + "...";
        }
        
        return text.trim();
    }
    
    /**
     * Find the first sentence boundary in text
     */
    private static int findFirstSentenceBoundary(String text) {
        int[] boundaries = {text.indexOf(". "), text.indexOf(".\n"), text.indexOf("! "), text.indexOf("? ")};
        int result = -1;
        for (int boundary : boundaries) {
            if (boundary != -1 && (result == -1 || boundary < result)) {
                result = boundary;
            }
        }
        return result;
    }
    
    /**
     * Find the best breakpoint for truncating text within a range
     */
    private static int findBestBreakpoint(String text, int minPos, int maxPos) {
        int[] boundaries = {
            text.indexOf(". ", minPos),
            text.indexOf(".\n", minPos),
            text.indexOf("! ", minPos),
            text.indexOf("? ", minPos)
        };
        
        int result = -1;
        for (int boundary : boundaries) {
            if (boundary != -1 && boundary < maxPos && (result == -1 || boundary < result)) {
                result = boundary;
            }
        }
        return result;
    }

    /**
     * Extract summary description from field JavaDoc, including @deprecated marking.
     */
    private static String extractFieldJavaDocSummary(org.eclipse.jdt.core.IField field) {
        try {
            org.eclipse.jdt.core.ISourceRange javadocRange = field.getJavadocRange();
            if (javadocRange == null) {
                return "";
            }
            
            String rawJavadoc = field.getCompilationUnit().getSource()
                .substring(javadocRange.getOffset(), javadocRange.getOffset() + javadocRange.getLength());
            
            if (!isNotEmpty(rawJavadoc)) {
                return "";
            }
            
            String cleaned = cleanJavadocComment(rawJavadoc);
            String description = extractJavadocDescription(cleaned);
            String summary = getFirstSentenceOrLimit(description, 120);
            
            // === High Priority: Mark deprecated fields ===
            if (cleaned.contains("@deprecated")) {
                summary = summary.isEmpty() ? "[DEPRECATED]" : summary + " [DEPRECATED]";  
            }
            
            return summary;
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Generate human-readable method signature with JavaDoc description
     */
    public static String generateMethodSignature(IMethod method) {
        return generateMethodSignatureInternal(method, false, true);
    }

    /**
     * Generate human-readable field signature with JavaDoc description
     */
    public static String generateFieldSignature(org.eclipse.jdt.core.IField field) {
        return generateFieldSignatureInternal(field, false);
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
     * Unified method signature generator (handles both source and binary types)
     * @param simplified true for binary types (no parameter names, no JavaDoc)
     * @param includeJavadoc true to include JavaDoc comments
     */
    private static String generateMethodSignatureInternal(IMethod method, boolean simplified, boolean includeJavadoc) {
        try {
            StringBuilder sb = new StringBuilder();
            int flags = method.getFlags();
            
            // Modifiers
            if (org.eclipse.jdt.core.Flags.isPublic(flags)) sb.append("public ");
            if (!simplified) {
                if (org.eclipse.jdt.core.Flags.isProtected(flags)) sb.append("protected ");
                if (org.eclipse.jdt.core.Flags.isPrivate(flags)) sb.append("private ");
            }
            if (org.eclipse.jdt.core.Flags.isStatic(flags)) sb.append("static ");
            if (org.eclipse.jdt.core.Flags.isFinal(flags)) sb.append("final ");
            if (org.eclipse.jdt.core.Flags.isAbstract(flags)) sb.append("abstract ");
            
            // Type parameters (only for non-simplified)
            if (!simplified) {
                @SuppressWarnings("deprecation")
                String[] typeParameters = method.getTypeParameterSignatures();
                if (typeParameters != null && typeParameters.length > 0) {
                    sb.append("<");
                    for (int i = 0; i < typeParameters.length; i++) {
                        if (i > 0) sb.append(", ");
                        sb.append(convertTypeSignature(typeParameters[i]));
                    }
                    sb.append("> ");
                }
            }
            
            // Return type (skip for constructors)
            if (!method.isConstructor()) {
                String returnType = simplified ? 
                    simplifyTypeName(org.eclipse.jdt.core.Signature.toString(method.getReturnType())) :
                    convertTypeSignature(method.getReturnType());
                sb.append(returnType).append(" ");
            }
            
            // Method name and parameters
            sb.append(method.getElementName()).append("(");
            String[] paramTypes = method.getParameterTypes();
            String[] paramNames = simplified ? null : method.getParameterNames();
            
            for (int i = 0; i < paramTypes.length; i++) {
                if (i > 0) sb.append(", ");
                String paramType = simplified ? 
                    simplifyTypeName(org.eclipse.jdt.core.Signature.toString(paramTypes[i])) :
                    convertTypeSignature(paramTypes[i]);
                sb.append(paramType);
                if (paramNames != null && i < paramNames.length) {
                    sb.append(" ").append(paramNames[i]);
                }
            }
            sb.append(")");
            
            // Exception declarations (only for non-simplified)
            if (!simplified) {
                String[] exceptionTypes = method.getExceptionTypes();
                if (exceptionTypes != null && exceptionTypes.length > 0) {
                    sb.append(" throws ");
                    for (int i = 0; i < exceptionTypes.length; i++) {
                        if (i > 0) sb.append(", ");
                        sb.append(convertTypeSignature(exceptionTypes[i]));
                    }
                }
            } else {
                sb.append(";");
            }
            
            // Add JavaDoc if requested
            if (includeJavadoc) {
                String javadocSummary = extractMethodJavaDocSummary(method);
                if (javadocSummary != null && !javadocSummary.isEmpty()) {
                    return "// " + javadocSummary + "\n      " + sb.toString();
                }
            }
            
            return sb.toString();
        } catch (JavaModelException e) {
            return simplified ? "// Error generating method signature" : method.getElementName() + "(...)";
        }
    }

    /**
     * Unified field signature generator (handles both source and binary types)
     * @param simplified true for binary types (no constant values, no JavaDoc)
     */
    private static String generateFieldSignatureInternal(org.eclipse.jdt.core.IField field, boolean simplified) {
        try {
            StringBuilder sb = new StringBuilder();
            int flags = field.getFlags();
            
            // Modifiers
            if (org.eclipse.jdt.core.Flags.isPublic(flags)) sb.append("public ");
            if (!simplified) {
                if (org.eclipse.jdt.core.Flags.isProtected(flags)) sb.append("protected ");
                if (org.eclipse.jdt.core.Flags.isPrivate(flags)) sb.append("private ");
            }
            if (org.eclipse.jdt.core.Flags.isStatic(flags)) sb.append("static ");
            if (org.eclipse.jdt.core.Flags.isFinal(flags)) sb.append("final ");
            
            // Type and name
            String fieldType = simplified ?
                simplifyTypeName(org.eclipse.jdt.core.Signature.toString(field.getTypeSignature())) :
                convertTypeSignature(field.getTypeSignature());
            sb.append(fieldType).append(" ").append(field.getElementName());
            
            // Constant value (only for non-simplified)
            if (!simplified && org.eclipse.jdt.core.Flags.isStatic(flags) && org.eclipse.jdt.core.Flags.isFinal(flags)) {
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
            
            if (simplified) {
                sb.append(";");
            }
            
            // Add JavaDoc if not simplified
            if (!simplified) {
                String javadocSummary = extractFieldJavaDocSummary(field);
                if (javadocSummary != null && !javadocSummary.isEmpty()) {
                    return "// " + javadocSummary + "\n      " + sb.toString();
                }
            }
            
            return sb.toString();
        } catch (JavaModelException e) {
            return simplified ? "// Error generating field signature" : field.getElementName();
        }
    }

    /**
     * Utility method to check if a string is not empty or null
     */
    private static boolean isNotEmpty(String value) {
        return value != null && !value.isEmpty();
    }
}
