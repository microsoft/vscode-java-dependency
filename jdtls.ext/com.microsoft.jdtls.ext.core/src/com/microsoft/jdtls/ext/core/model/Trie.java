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

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

import org.apache.commons.lang3.StringUtils;

public class Trie<T> {
    private TrieNode<T> root = new TrieNode<>();
    private Set<TrieNode<T>> allNodes = new HashSet<>();

    public Trie(Map<String, T> entries) {
        for (Map.Entry<String, T> entry : entries.entrySet()) {
            insert(entry.getKey(), entry.getValue());
        }
    }

    public Set<TrieNode<T>> getAllNodes() {
        return allNodes;
    }

    public void insert(String name, T value) {
        if (StringUtils.isBlank(name)) {
            // default package
            root.value = value;
            allNodes.add(root);
            return;
        }

        String[] names = name.split("\\.");
        TrieNode<T> currentNode = this.root;
        for (int i = 0; i < names.length; i++) {
            TrieNode<T> node;
            if (currentNode.children.containsKey(names[i])) {
                node = currentNode.children.get(names[i]);
            } else {
                node = new TrieNode<T>(names[i], null);
                currentNode.children.put(names[i], node);
                allNodes.add(node);
            }
            if (i == names.length - 1) {
                node.value = value;
            }

            currentNode = node;
        }
    }
}
