package com.microsoft.buildserver.adapter;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.prefs.Preferences;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IProject;
import org.eclipse.jdt.launching.IVMInstall;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

import ch.epfl.scala.bsp4j.BuildTarget;

public class BspUtils {
    private BspUtils() {}

    public static Map<String, List<BuildTarget>> mapBuildTargetsByBaseDir(List<BuildTarget> buildTargets) {
        // we assume all build targets will have a non-null base directory.
        return buildTargets.stream().collect(Collectors.groupingBy(BuildTarget::getBaseDirectory));
    }

    public static boolean isBspGradleProject(IProject project) {
        return ProjectUtils.hasNature(project, BspGradleProjectNature.NATURE_ID);
    }
}
