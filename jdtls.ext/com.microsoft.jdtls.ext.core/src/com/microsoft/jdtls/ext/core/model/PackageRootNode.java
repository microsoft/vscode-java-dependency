/*******************************************************************************
 * Copyright (c) 2018 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core.model;

import java.util.Map;

import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.core.JavaModelException;

public class PackageRootNode extends PackageNode {

    private int entryKind;

    private Map<String, String> attributes;

    public PackageRootNode(String name, String path, String uri, NodeKind kind, int entryKind) {
        super(name, path, kind);
        this.setUri(uri);
        this.entryKind = entryKind;
    }

    public PackageRootNode(IPackageFragmentRoot pkgRoot, String name, NodeKind kind) throws JavaModelException {
        this(name, pkgRoot.getPath().toPortableString(), null, kind, pkgRoot.getKind());
        if (pkgRoot.getResource() != null) {
            this.setUri(pkgRoot.getResource().getLocationURI().toString());
        } else {
            this.setUri(pkgRoot.getPath().toFile().toURI().toString());
        }
    }

    public int getEntryType() {
        return this.entryKind;
    }

    public void setAttributes(Map<String, String> attributes) {
        this.attributes = attributes;
    }

    public Map<String, String> getAttributes() {
        return this.attributes;
    }
}
