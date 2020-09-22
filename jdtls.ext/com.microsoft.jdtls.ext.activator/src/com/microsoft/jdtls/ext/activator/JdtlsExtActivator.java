/*******************************************************************************
 * Copyright (c) 2020 Microsoft Corporation and others.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *    Microsoft Corporation - initial API and implementation
 *******************************************************************************/

package com.microsoft.jdtls.ext.activator;

import org.eclipse.core.runtime.jobs.IJobChangeEvent;
import org.eclipse.core.runtime.jobs.IJobChangeListener;
import org.eclipse.core.runtime.jobs.Job;
import org.eclipse.core.runtime.jobs.JobChangeAdapter;
import org.eclipse.jdt.ls.core.internal.JavaClientConnection;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;

public class JdtlsExtActivator implements BundleActivator {

    private static final String INITIALIZE_WORKSPACE_JOB_NAME = "Initialize workspace";
    private static final String JAVA_PROJECT_ACTIVATE_COMMAND = "java.project.activate";

    private static IJobChangeListener jobChangeListener = new JobChangeAdapter() {
        @Override
        public void done(IJobChangeEvent event) {
            if (!event.getJob().getName().contains(INITIALIZE_WORKSPACE_JOB_NAME)) {
                return;
            }

            JavaClientConnection connection = JavaLanguageServerPlugin.getInstance().getClientConnection();
            connection.executeClientCommand(JAVA_PROJECT_ACTIVATE_COMMAND);
        }
    };

    @Override
    public void start(BundleContext bundleContext) throws Exception {
        Job.getJobManager().addJobChangeListener(jobChangeListener);
    }

    @Override
    public void stop(BundleContext bundleContext) throws Exception {
        Job.getJobManager().removeJobChangeListener(jobChangeListener);
    }
}
