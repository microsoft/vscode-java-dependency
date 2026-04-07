package com.microsoft.jdtls.ext.core.model;

import java.util.List;

/**
 * L1: Detailed class information.
 * AI calls this for specific classes it needs to understand, not for all imports.
 */
public class ClassDetailResult {

    public String qualifiedName;         // "com.example.model.Order"
    public String kind;                  // "class" | "interface" | "enum" | "annotation"
    public String uri;                   // file URI (for project source) or jar URI
    public String source;                // "project" | "external" | "jdk"
    public String artifact;              // GAV for external: "com.google.code.gson:gson:2.10.1"

    public String signature;             // "public class Order implements Serializable"
    public String superClass;            // "java.lang.Object" (null if Object)
    public List<String> interfaces;      // ["java.io.Serializable"]
    public List<String> annotations;     // ["@Entity", "@Table(name = \"orders\")"]

    public String javadocSummary;        // First sentence only, null if none

    public List<String> constructors;    // ["Order()", "Order(String orderId, Customer customer)"]
    public List<String> methods;         // ["String getOrderId()", "void setStatus(OrderStatus)"]
    public List<String> fields;          // ["private String orderId", "private List<OrderItem> items"]

    public int totalMethodCount;         // actual total (methods list may be truncated)
    public int totalFieldCount;          // actual total

    public String error;                 // null if success

    /**
     * Builder-style static factories for common cases
     */
    public static ClassDetailResult notFound(String qualifiedName) {
        ClassDetailResult r = new ClassDetailResult();
        r.qualifiedName = qualifiedName;
        r.error = "Type not found: " + qualifiedName;
        return r;
    }

    public static ClassDetailResult error(String qualifiedName, String message) {
        ClassDetailResult r = new ClassDetailResult();
        r.qualifiedName = qualifiedName;
        r.error = message;
        return r;
    }
}
