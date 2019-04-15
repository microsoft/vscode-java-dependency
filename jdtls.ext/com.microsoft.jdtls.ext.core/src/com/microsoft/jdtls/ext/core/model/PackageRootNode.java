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

public class PackageRootNode extends PackageNode {

    private int entryKind;

    private Map<String, String> attributes;

    public PackageRootNode(String name, String path, NodeKind kind, int entryKind) {
        super(name, path, kind);
        this.entryKind = entryKind;
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
