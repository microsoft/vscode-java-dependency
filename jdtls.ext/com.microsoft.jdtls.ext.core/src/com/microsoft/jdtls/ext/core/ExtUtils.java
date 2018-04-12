/*******************************************************************************
 * Copyright (c) 2017 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *     Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.core;

import java.net.URI;
import java.net.URISyntaxException;

import org.eclipse.jdt.core.IPackageFragmentRoot;
import org.eclipse.jdt.internal.core.JarEntryFile;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;

public final class ExtUtils {

	private static final String JDT_SCHEME = "jdt";

	private static final String CONTENTS_AUTHORITY = "jarentry";

	public static String toUri(JarEntryFile jarEntryFile) {
		IPackageFragmentRoot fragmentRoot = jarEntryFile.getPackageFragmentRoot();
		try {
			return new URI(JDT_SCHEME, CONTENTS_AUTHORITY, jarEntryFile.getFullPath().toPortableString(), fragmentRoot.getHandleIdentifier(), null).toASCIIString();
		} catch (URISyntaxException e) {
			JavaLanguageServerPlugin.logException("Error generating URI for jarentryfile ", e);
			return null;
		}
	}

}
