/*******************************************************************************
 * Copyright (c) 2021 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core.model;

import java.util.LinkedHashMap;
import java.util.Map;

public class TrieNode<T> {
    public String name;
    public Map<String, TrieNode<T>> children = new LinkedHashMap<>();
    public T value;

    public TrieNode() {
    }

    public TrieNode(String name, T value) {
        this.name = name;
        this.value = value;
    }
}
