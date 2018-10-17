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

package com.microsoft.jdtls.ext.core.model;

public enum NodeKind {
    WORKSPACE(1),

    PROJECT(2),

    CONTAINER(3),

    PACKAGEROOT(4),

    PACKAGE(5),

    TYPEROOT(6),

    Folder(7),

    FILE(8);

    private final int value;

    NodeKind(int value) {
        this.value = value;
    }

    public int getValue() {
        return value;
    }

    public static NodeKind forValue(int value) {
        NodeKind[] allValues = NodeKind.values();
        if (value < 1 || value > allValues.length) {
            throw new IllegalArgumentException("Illegal enum value: " + value);
        }
        return allValues[value - 1];
    }
}
