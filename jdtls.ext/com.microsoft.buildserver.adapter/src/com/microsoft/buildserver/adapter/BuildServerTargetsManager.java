package com.microsoft.buildserver.adapter;

import java.io.File;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.eclipse.core.resources.IProject;

import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.InitializeBuildResult;

public class BuildServerTargetsManager {
    private BuildServerTargetsManager() {
    }

    private static class BuildServerTargetsManagerHolder {
        private static final BuildServerTargetsManager INSTANCE = new BuildServerTargetsManager();
    }

    public static BuildServerTargetsManager getInstance() {
        return BuildServerTargetsManagerHolder.INSTANCE;
    }

    private Map<IProject, List<BuildTarget>> cache = new HashMap<>();
    private Map<File, InitializeBuildResult> initializeBuildResultCache = new HashMap<>();

    public void reset() {
        cache.clear();
    }

    public List<BuildTarget> getBuildTargets(IProject project) {
        return cache.get(project);
    }

    public void setBuildTargets(IProject project, List<BuildTarget> targets) {
        cache.put(project, targets);
    }

    public InitializeBuildResult getInitializeBuildResult(File path) {
        return initializeBuildResultCache.get(path);
    }

    public void setInitializeBuildResult(File path, InitializeBuildResult result) {
        initializeBuildResultCache.put(path, result);
    }
}
