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

package com.microsoft.jdtls.ext.core;

import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IStatus;
import org.eclipse.core.runtime.Platform;
import org.eclipse.core.runtime.Status;
import org.eclipse.core.runtime.jobs.IJobChangeEvent;
import org.eclipse.core.runtime.jobs.IJobChangeListener;
import org.eclipse.core.runtime.jobs.JobChangeAdapter;
import org.eclipse.jdt.ls.core.internal.JavaClientConnection;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.managers.UpdateClasspathJob;
import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;
import org.osgi.framework.ServiceReference;

public class JdtlsExtActivator implements BundleActivator {

    public static final String PLUGIN_ID = "org.eclipse.jdtls.ext.core";

    private static BundleContext context;

    private static IJobChangeListener updateClasspathListener = new JobChangeAdapter() {
        @Override
        public void done(IJobChangeEvent event) {
            if (event.getJob() instanceof UpdateClasspathJob) {
                JavaClientConnection connection = JavaLanguageServerPlugin.getInstance().getClientConnection();
                connection.executeClientCommand("java.view.package.refresh", /* debounce = */true);
            }
        }
    };

    static BundleContext getContext() {
        return context;
    }

    @Override
    public void start(BundleContext bundleContext) throws Exception {
        JdtlsExtActivator.context = bundleContext;
        UpdateClasspathJob.getInstance().addJobChangeListener(JdtlsExtActivator.updateClasspathListener);
    }

    @Override
    public void stop(BundleContext bundleContext) throws Exception {
        JdtlsExtActivator.context = null;
        UpdateClasspathJob.getInstance().removeJobChangeListener(JdtlsExtActivator.updateClasspathListener);
    }

    @SuppressWarnings("unchecked")
    public static <T> T acquireService(Class<T> serviceInterface) {
        ServiceReference<T> reference = (ServiceReference<T>) context.getServiceReference(serviceInterface.getName());
        if (reference == null) {
            return null;
        }
        T service = context.getService(reference);
        if (service != null) {
            context.ungetService(reference);
        }
        return service;
    }

    public static void log(IStatus status) {
        if (context != null) {
            Platform.getLog(context.getBundle()).log(status);
        }
    }

    public static void log(CoreException e) {
        log(e.getStatus());
    }

    public static void logError(String message) {
        if (context != null) {
            log(new Status(IStatus.ERROR, context.getBundle().getSymbolicName(), message));
        }
    }

    public static void logInfo(String message) {
        if (context != null) {
            log(new Status(IStatus.INFO, context.getBundle().getSymbolicName(), message));
        }
    }

    public static void logException(String message, Throwable ex) {
        if (context != null) {
            log(new Status(IStatus.ERROR, context.getBundle().getSymbolicName(), message, ex));
        }
    }
}
