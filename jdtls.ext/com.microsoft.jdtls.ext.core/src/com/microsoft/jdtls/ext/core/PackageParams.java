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

import com.microsoft.jdtls.ext.core.model.NodeKind;

/**
 * The query object to get the project dependency information from the language
 * server.
 */
public class PackageParams {

    private NodeKind kind;

    private String projectUri;

    private String path;

    private String handlerIdentifier;

    private String rootPath;

    public PackageParams() {
    }

    public String getHandlerIdentifier() {
        return handlerIdentifier;
    }

    public void setHandlerIdentifier(String handlerIdentifier) {
        this.handlerIdentifier = handlerIdentifier;
    }

    public PackageParams(NodeKind kind, String projectUri) {
        this.kind = kind;
        this.projectUri = projectUri;
    }

    public PackageParams(NodeKind kind, String projectUri, String path) {
        this.kind = kind;
        this.projectUri = projectUri;
        this.path = path;
    }

    public PackageParams(NodeKind kind, String projectUri, String path, String rootPath) {
        this.kind = kind;
        this.projectUri = projectUri;
        this.path = path;
        this.rootPath = rootPath;
    }

    public NodeKind getKind() {
        return kind;
    }

    public void setKind(NodeKind kind) {
        this.kind = kind;
    }

    public String getProjectUri() {
        return projectUri;
    }

    public void setProjectUri(String projectUri) {
        this.projectUri = projectUri;
    }

    public String getPath() {
        return path;
    }

    public void setPath(String nodePath) {
        this.path = nodePath;
    }

    public String getRootPath() {
        return rootPath;
    }

    public void setRootPath(String rootPath) {
        this.rootPath = rootPath;
    }
}
