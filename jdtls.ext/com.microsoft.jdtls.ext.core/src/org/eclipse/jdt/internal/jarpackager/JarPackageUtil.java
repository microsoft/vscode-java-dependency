/*******************************************************************************
 * Copyright (c) 2020 IBM Corporation and others.
 *
 * This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License 2.0
 * which accompanies this distribution, and is available at
 * https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *     IBM Corporation - initial API and implementation
 *     Microsoft Corporation - based this file on JarWriter3, JarWriter4, UnpackFatJarBuilder, JarPackagerUtil and JarBuilder
 *******************************************************************************/
package org.eclipse.jdt.internal.jarpackager;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.Set;
import java.util.jar.JarEntry;
import java.util.jar.JarOutputStream;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipException;
import java.util.zip.ZipFile;

import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IPath;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.MultiStatus;
import org.eclipse.core.runtime.OperationCanceledException;
import org.eclipse.core.runtime.Status;

import com.microsoft.jdtls.ext.core.JdtlsExtActivator;

public class JarPackageUtil {

    private static final int INTERNAL_ERROR = 10001;

    /**
     * Write the given entry describing the given content to the current archive.
     * Extracted from org.eclipse.jdt.ui.jarpackager.JarWriter3
     *
     * @param entry the entry to write
     * @param content the content to write
     * @param fjarOutputStream the destination JarOutputStream
     *
     * @throws IOException If an I/O error occurred
     *
     * @since 1.14
     *
     */
    private static void addEntry(JarEntry entry, InputStream content, JarOutputStream fjarOutputStream) throws IOException {
        byte[] readBuffer = new byte[4096];
        try {
            fjarOutputStream.putNextEntry(entry);
            int count;
            while ((count = content.read(readBuffer, 0, readBuffer.length)) != -1) {
                fjarOutputStream.write(readBuffer, 0, count);
            }
        } finally {
            if (content != null) {
                content.close();
            }
            /*
             * Commented out because some JREs throw an NPE if a stream
             * is closed twice. This works because
             * a) putNextEntry closes the previous entry
             * b) closing the stream closes the last entry
             */
        }
    }

    /**
     * Write the contents of the given zipfile to the JarOutputStream.
     * Extracted from org.eclipse.jdt.internal.ui.jarpackagerfat.UnpackFatJarBuilder
     *
     * @param zipFile the zipfile to extract
     * @param areDirectoryEntriesIncluded the directory entries are included
     * @param isCompressed the jar is compressed
     * @param fjarOutputStream the destination JarOutputStream
     * @param fdirectories the temporary set saves existing directories
     * @param progressMonitor the progressMonitor
     *
     * @return the MultiStatus saving the warnings during the process
     *
     * @since 1.14
     *
     */
    public static MultiStatus writeArchive(ZipFile zipFile, boolean areDirectoryEntriesIncluded,
            boolean isCompressed, JarOutputStream fjarOutputStream,
            Set<String> fdirectories, IProgressMonitor progressMonitor) {
        MultiStatus fstatus = new MultiStatus(JdtlsExtActivator.PLUGIN_ID, IStatus.OK, ""); //$NON-NLS-1$
        Enumeration<? extends ZipEntry> jarEntriesEnum = zipFile.entries();
        File zipFile1 = new File(zipFile.getName());
        try {
            String zipFileCanonical = zipFile1.getCanonicalPath();
            while (jarEntriesEnum.hasMoreElements()) {
                ZipEntry zipEntry = jarEntriesEnum.nextElement();
                if (!zipEntry.isDirectory()) {
                    String entryName = zipEntry.getName();
                    File zipEntryFile = new File(zipFile1, entryName);
                    String zipEntryCanonical = zipEntryFile.getCanonicalPath();
                    if (zipEntryCanonical.startsWith(zipFileCanonical + File.separator)) {
                        addFile(entryName, zipEntry, zipFile, areDirectoryEntriesIncluded, isCompressed, fjarOutputStream, fdirectories, fstatus);
                    } else {
                        addWarning("Invalid path" + entryName, null, fstatus); //$NON-NLS-1$
                    }
                }
                progressMonitor.worked(1);
                if (progressMonitor.isCanceled()) {
                    throw new OperationCanceledException();
                }
            }
        } catch (IOException e) {
            addWarning("ZipFile error" + zipFile.getName(), null, fstatus); //$NON-NLS-1$
            e.printStackTrace();
        }
        return fstatus;
    }

    /**
     * Write the entry to the destinationPath of the given JarOutputStream.
     * Extracted from org.eclipse.jdt.internal.ui.jarpackagerfat.UnpackFatJarBuilder
     *
     * @param destinationPath the destinationPath in the jar file
     * @param jarEntry the jar entry to write
     * @param zipFile the zipfile to extract
     * @param areDirectoryEntriesIncluded the directory entries are included
     * @param isCompressed the jar is compressed
     * @param fjarOutputStream the destination JarOutputStream
     * @param fdirectories the temporary set saves existing directories
     * @param fstatus the <code>MultiStatus</code> saving the warnings during the process
     *
     * @since 1.14
     *
     */
    private static void addFile(String destinationPath, ZipEntry jarEntry, ZipFile zipFile,
            boolean areDirectoryEntriesIncluded, boolean isCompressed,
            JarOutputStream fjarOutputStream, Set<String> fdirectories, MultiStatus fstatus) {
        // Handle META-INF/MANIFEST.MF
        if (destinationPath.equalsIgnoreCase("META-INF/MANIFEST.MF") //$NON-NLS-1$
                || (destinationPath.startsWith("META-INF/") && destinationPath.endsWith(".SF"))) { //$NON-NLS-1$//$NON-NLS-2$
            return;
        }
        try {
            addZipEntry(jarEntry, zipFile, destinationPath, areDirectoryEntriesIncluded, isCompressed, fjarOutputStream, fdirectories);
        } catch (IOException ex) {
            if (ex instanceof ZipException && ex.getMessage() != null && ex.getMessage().startsWith("duplicate entry:")) { //$NON-NLS-1$
                // ignore duplicates in META-INF (*.SF, *.RSA)
                if (!destinationPath.startsWith("META-INF/")) { //$NON-NLS-1$
                    addWarning(ex.getMessage(), ex, fstatus);
                }
            }
        }
    }

    /**
     * Add the single file to the JarOutputStream.
     * Extracted from org.eclipse.jdt.internal.ui.jarpackagerfat.JarWriter4
     *
     * @param file the file to write
     * @param path the destinationPath in the jar file
     * @param areDirectoryEntriesIncluded the directory entries are included
     * @param isCompressed the jar is compressed
     * @param fjarOutputStream the destination JarOutputStream
     * @param fdirectories the temporary set saves existing directories
     *
     * @throws IOException if an I/O error has occurred
     *
     * @since 1.14
     *
     */
    private static void addFile(File file, IPath path, boolean areDirectoryEntriesIncluded,
            boolean isCompressed, JarOutputStream fjarOutputStream, Set<String> fdirectories) throws IOException {
        if (areDirectoryEntriesIncluded) {
            addDirectories(path, fjarOutputStream, fdirectories);
        }
        JarEntry newEntry = new JarEntry(path.toString().replace(File.separatorChar, '/'));
        if (isCompressed) {
            newEntry.setMethod(ZipEntry.DEFLATED);
            // Entry is filled automatically.
        } else {
            newEntry.setMethod(ZipEntry.STORED);
            calculateCrcAndSize(newEntry, new FileInputStream(file), new byte[4096]);
        }
        newEntry.setTime(file.lastModified());
        addEntry(newEntry, new FileInputStream(file), fjarOutputStream);
    }

    /**
     * Write the entry to the destinationPath of the given JarOutputStream.
     * Extracted from org.eclipse.jdt.internal.ui.jarpackagerfat.JarWriter4
     *
     * @param zipEntry the jar entry to write
     * @param zipFile the zipfile to extract
     * @param path the destinationPath in the jar file
     * @param areDirectoryEntriesIncluded the directory entries are included
     * @param isCompressed the jar is compressed
     * @param fjarOutputStream the destination JarOutputStream
     * @param fdirectories the temporary set saves existing directories
     *
     * @throws IOException If an I/O error occurred
     *
     * @since 1.14
     *
     */
    private static void addZipEntry(ZipEntry zipEntry, ZipFile zipFile, String path,
            boolean areDirectoryEntriesIncluded, boolean isCompressed,
            JarOutputStream fjarOutputStream, Set<String> fdirectories) throws IOException {
        if (areDirectoryEntriesIncluded) {
            addDirectories(path, fjarOutputStream, fdirectories);
        }
        JarEntry newEntry = new JarEntry(path.replace(File.separatorChar, '/'));
        if (isCompressed) {
            newEntry.setMethod(ZipEntry.DEFLATED);
            // Entry is filled automatically.
        } else {
            newEntry.setMethod(ZipEntry.STORED);
            newEntry.setSize(zipEntry.getSize());
            newEntry.setCrc(zipEntry.getCrc());
        }
        long lastModified = System.currentTimeMillis();
        // Set modification time
        newEntry.setTime(lastModified);
        addEntry(newEntry, zipFile.getInputStream(zipEntry), fjarOutputStream);
    }

    /**
     * Creates the directory entries for the given path and writes it to the current archive.
     * Extracted from org.eclipse.jdt.ui.jarpackager.JarWriter3
     *
     * @param destPath the path to add
     * @param fjarOutputStream the destination JarOutputStream
     * @param fdirectories the temporary set saves existing directories
     *
     * @throws IOException if an I/O error has occurred
     *
     * @since 1.14
     */
    private static void addDirectories(String destPath, JarOutputStream fjarOutputStream, Set<String> fdirectories) throws IOException {
        String path = destPath.replace(File.separatorChar, '/');
        int lastSlash = path.lastIndexOf('/');
        List<JarEntry> directories = new ArrayList<>(2);
        while (lastSlash != -1) {
            path = path.substring(0, lastSlash + 1);
            if (!fdirectories.add(path)) {
                break;
            }
            JarEntry newEntry = new JarEntry(path);
            newEntry.setMethod(ZipEntry.STORED);
            newEntry.setSize(0);
            newEntry.setCrc(0);
            newEntry.setTime(System.currentTimeMillis());
            directories.add(newEntry);
            lastSlash = path.lastIndexOf('/', lastSlash - 1);
        }
        for (int i = directories.size() - 1; i >= 0; --i) {
            fjarOutputStream.putNextEntry(directories.get(i));
        }
    }

    /**
     * Creates the directory entries for the given path and writes it to the current archive.
     * Extracted from org.eclipse.jdt.ui.jarpackager.JarWriter3
     *
     * @param destinationPath the path to add
     * @param fjarOutputStream the destination JarOutputStream
     * @param fdirectories the temporary set saves existing directories
     *
     * @throws IOException if an I/O error has occurred
     *
     * @since 1.14
     */
    private static void addDirectories(IPath destinationPath, JarOutputStream fjarOutputStream, Set<String> fdirectories) throws IOException {
        addDirectories(destinationPath.toString(), fjarOutputStream, fdirectories);
    }

    /**
     * Write the single file to the JarOutputStream.
     * Extracted from org.eclipse.jdt.internal.ui.jarpackagerfat.JarWriter4
     *
     * @param file the file to write
     * @param destinationPath the destinationPath in the jar file
     * @param areDirectoryEntriesIncluded the directory entries are included
     * @param isCompressed the jar is compressed
     * @param fjarOutputStream the destination JarOutputStream
     * @param fdirectories the temporary set saves existing directories
     *
     * @throws CoreException if an error has occurred
     *
     * @since 1.14
     *
     */
    public static void writeFile(File file, IPath destinationPath, boolean areDirectoryEntriesIncluded,
            boolean isCompressed, JarOutputStream fjarOutputStream, Set<String> fdirectories) throws CoreException {
        try {
            addFile(file, destinationPath, areDirectoryEntriesIncluded, isCompressed, fjarOutputStream, fdirectories);
        } catch (IOException ex) {
            throw new CoreException(new Status(IStatus.ERROR, JdtlsExtActivator.PLUGIN_ID, INTERNAL_ERROR, ex.getLocalizedMessage(), ex));
        }
    }

    /**
     * Calculates the crc and size of the resource and updates the entry.
     * Extracted from org.eclipse.jdt.internal.ui.jarpackager.JarPackagerUtil
     *
     * @param entry the jar entry to update
     * @param stream the input stream
     * @param buffer a shared buffer to store temporary data
     *
     * @throws IOException if an input/output error occurs
     *
     * @since 1.14
     */
    private static void calculateCrcAndSize(final ZipEntry entry, final InputStream stream, final byte[] buffer) throws IOException {
        int size = 0;
        final CRC32 crc = new CRC32();
        int count;
        try {
            while ((count = stream.read(buffer, 0, buffer.length)) != -1) {
                crc.update(buffer, 0, count);
                size += count;
            }
        } finally {
            if (stream != null) {
                try {
                    stream.close();
                } catch (IOException exception) {
                    // Do nothing
                }
            }
        }
        entry.setSize(size);
        entry.setCrc(crc.getValue());
    }

    /**
     * add a warning message into the MultiStatus.
     *
     * @param message the message to add
     * @param error the reason of the message
     * @param fstatus the <code>MultiStatus</code> to write
     *
     * @since 1.14
     */
    private static final void addWarning(String message, Throwable error, MultiStatus fstatus) {
        fstatus.add(new Status(IStatus.WARNING, JdtlsExtActivator.PLUGIN_ID, INTERNAL_ERROR, message, error));
    }

}
