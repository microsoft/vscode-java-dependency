package com.microsoft.buildserver.adapter.builder;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IncrementalProjectBuilder;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;

import com.microsoft.buildserver.adapter.BuildServerAdapter;
import com.microsoft.buildserver.adapter.BuildServerTargetsManager;

import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.BuildTargetIdentifier;
import ch.epfl.scala.bsp4j.CleanCacheParams;
import ch.epfl.scala.bsp4j.CompileParams;
import ch.epfl.scala.bsp4j.CompileResult;
import ch.epfl.scala.bsp4j.StatusCode;

/**
 * BspBuilder
 */
public class BspBuilder extends IncrementalProjectBuilder {

    public static final String BUILDER_ID = "com.microsoft.buildserver.adapter.builder.bspBuilder";

    @Override
    protected IProject[] build(int kind, Map<String, String> args, IProgressMonitor monitor) throws CoreException {
        // TODO: how to avoid build from the root project when the root project does not contain java files.
        // building root project will cause all sub-modules being built.
        BuildServer buildServer = BuildServerAdapter.getBuildServer();
        if (buildServer != null) {
            List<BuildTarget> targets = BuildServerTargetsManager.getInstance().getBuildTargets(this.getProject());
            List<BuildTargetIdentifier> ids = targets.stream().map(BuildTarget::getId).collect(Collectors.toList());
            if (ids != null) {
                if (requiresClean(kind)) {
                    buildServer.buildTargetCleanCache(new CleanCacheParams(ids)).join();
                }

                if (requiresBuild(kind)) {
                    CompileResult result = buildServer.buildTargetCompile(new CompileParams(ids)).join();
                    if (Objects.equals(result.getStatusCode(), StatusCode.ERROR)) {
                        // TODO: how to report the error
                    }
                }
            }
        }
        return null;
    }

    private boolean requiresClean(int kind) {
        return false;
        // currently we don't support clean, user needs to manually clean the project.
        // return kind == FULL_BUILD || kind == CLEAN_BUILD;
    }

    private boolean requiresBuild(int kind) {
        return kind == FULL_BUILD || kind == INCREMENTAL_BUILD;
    }
}
