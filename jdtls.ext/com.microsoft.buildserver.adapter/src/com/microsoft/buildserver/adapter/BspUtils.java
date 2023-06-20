package com.microsoft.buildserver.adapter;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.eclipse.core.resources.IProject;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;

import ch.epfl.scala.bsp4j.BuildTarget;

public class BspUtils {
    private BspUtils() {}

    public static Map<String, List<BuildTarget>> mapBuildTargetsByUri(List<BuildTarget> buildTargets) {
        return buildTargets.stream().collect(Collectors.groupingBy(target -> {
            String uri = target.getId().getUri();
            int indexOfQuery = uri.indexOf("?");
            if (indexOfQuery != -1) {
                uri = uri.substring(0, indexOfQuery);
            }
            return uri;
        }));
    }

    public static boolean isBspGradleProject(IProject project) {
        return ProjectUtils.hasNature(project, BspGradleProjectNature.NATURE_ID);
    }
}
