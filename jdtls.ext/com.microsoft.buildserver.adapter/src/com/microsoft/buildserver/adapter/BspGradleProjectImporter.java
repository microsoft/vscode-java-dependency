package com.microsoft.buildserver.adapter;

import static org.eclipse.jdt.ls.core.internal.handlers.MapFlattener.getValue;

import java.io.File;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Map.Entry;
import java.util.Optional;

import org.eclipse.core.resources.ICommand;
import org.eclipse.core.resources.IProject;
import org.eclipse.core.resources.IProjectDescription;
import org.eclipse.core.resources.IResource;
import org.eclipse.core.resources.IWorkspace;
import org.eclipse.core.resources.ResourcesPlugin;
import org.eclipse.core.runtime.CoreException;
import org.eclipse.core.runtime.IProgressMonitor;
import org.eclipse.core.runtime.SubMonitor;
import org.eclipse.jdt.core.JavaCore;
import org.eclipse.jdt.ls.core.internal.AbstractProjectImporter;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProjectUtils;
import org.eclipse.jdt.ls.core.internal.managers.BasicFileDetector;
import org.eclipse.jdt.ls.core.internal.preferences.Preferences;

import org.eclipse.lsp4j.Command;
import org.eclipse.lsp4j.ExecuteCommandParams;
import org.eclipse.lsp4j.MessageType;

import com.microsoft.buildserver.adapter.builder.BspBuilder;

import ch.epfl.scala.bsp4j.BuildClientCapabilities;
import ch.epfl.scala.bsp4j.BuildServer;
import ch.epfl.scala.bsp4j.BuildTarget;
import ch.epfl.scala.bsp4j.InitializeBuildParams;
import ch.epfl.scala.bsp4j.InitializeBuildResult;
import ch.epfl.scala.bsp4j.WorkspaceBuildTargetsResult;

@SuppressWarnings("restriction")
public class BspGradleProjectImporter extends AbstractProjectImporter {

    private static final String JAVA_BUILD_SERVER_GRADLE_ENABLED = "java.buildServer.gradle.enabled";
    public static final String BUILD_GRADLE_DESCRIPTOR = "build.gradle";
    public static final String BUILD_GRADLE_KTS_DESCRIPTOR = "build.gradle.kts";
    public static final String SETTINGS_GRADLE_DESCRIPTOR = "settings.gradle";
    public static final String SETTINGS_GRADLE_KTS_DESCRIPTOR = "settings.gradle.kts";

    /* (non-Javadoc)
     * @see org.eclipse.jdt.ls.core.internal.managers.IProjectImporter#applies(org.eclipse.core.runtime.IProgressMonitor)
     */
    @Override
    public boolean applies(IProgressMonitor monitor) throws CoreException {
        if (rootFolder == null) {
            return false;
        }

        Preferences preferences = getPreferences();
        if (!preferences.isImportGradleEnabled()) {
            return false;
        }

        Object bspImporterEnabled = getValue(preferences.asMap(), JAVA_BUILD_SERVER_GRADLE_ENABLED);
        if (bspImporterEnabled == null) {
            return false;
        }

        if (!(boolean) bspImporterEnabled) {
            return false;
        }

        if (directories == null) {
            BasicFileDetector gradleDetector = new BasicFileDetector(rootFolder.toPath(), BUILD_GRADLE_DESCRIPTOR,
                    SETTINGS_GRADLE_DESCRIPTOR, BUILD_GRADLE_KTS_DESCRIPTOR, SETTINGS_GRADLE_KTS_DESCRIPTOR)
                    .includeNested(false)
                    .addExclusions("**/build") //default gradle build dir
                    .addExclusions("**/bin");
            directories = gradleDetector.scan(monitor);
        }

        for (Path directory : directories) {
            IProject project = ProjectUtils.getProjectFromUri(directory.toUri().toString());
            if (project == null) {
                return true;
            }

            if (BspUtils.isBspGradleProject(project)) {
                return true;
            }
        }
        return false;
    }

    /* (non-Javadoc)
     * @see org.eclipse.jdt.ls.core.internal.managers.IProjectImporter#importToWorkspace(org.eclipse.core.runtime.IProgressMonitor)
     */
    @Override
    public void importToWorkspace(IProgressMonitor monitor) throws CoreException {
        BuildServer buildServer = BuildServerAdapter.getBuildServer();
        if (buildServer == null) {
            return;
        }

        if (BuildServerTargetsManager.getInstance().getInitializeBuildResult(rootFolder) == null) {
            InitializeBuildParams params = new InitializeBuildParams(
                    Constant.CLIENT_NAME,
                    Constant.CLIENT_VERSION,
                    Constant.BSP_VERSION,
                    rootFolder.toPath().toUri().toString(),
                    new BuildClientCapabilities(java.util.Collections.singletonList("java"))
            );
            BuildServerPreferences data = getBuildServerPreferences();
            params.setData(data);
            try {
                InitializeBuildResult initializeResult = buildServer.buildInitialize(params).join();
                buildServer.onBuildInitialized();
                BuildServerTargetsManager.getInstance().setInitializeBuildResult(rootFolder, initializeResult);
            } catch (Exception e) {
                JavaLanguageServerPlugin.getInstance().getClientConnection().sendActionableNotification(
                    MessageType.Error,
                    "Failed to initialize the build server: " + e.getMessage(),
                    null,
                    Arrays.asList(new Command("Open Log", "java.buildServer.openLogs"))
                );
            }
        }

        WorkspaceBuildTargetsResult workspaceBuildTargetsResult = buildServer.workspaceBuildTargets().join();
        List<BuildTarget> buildTargets = workspaceBuildTargetsResult.getTargets();

        List<IProject> projects = createProjectsIfNotExist(buildTargets, monitor);
        if (projects.isEmpty()) {
            return;
        }

        // store the digest for the imported gradle projects.
        ProjectUtils.getGradleProjects().forEach(p -> {
            File buildFile = p.getFile(BUILD_GRADLE_DESCRIPTOR).getLocation().toFile();
            File settingsFile = p.getFile(SETTINGS_GRADLE_DESCRIPTOR).getLocation().toFile();
            File buildKtsFile = p.getFile(BUILD_GRADLE_KTS_DESCRIPTOR).getLocation().toFile();
            File settingsKtsFile = p.getFile(SETTINGS_GRADLE_KTS_DESCRIPTOR).getLocation().toFile();
            try {
                if (buildFile.exists()) {
                    BuildServerAdapter.getDigestStore().updateDigest(buildFile.toPath());
                } else if (buildKtsFile.exists()) {
                    BuildServerAdapter.getDigestStore().updateDigest(buildKtsFile.toPath());
                }
                if (settingsFile.exists()) {
                    BuildServerAdapter.getDigestStore().updateDigest(settingsFile.toPath());
                } else if (settingsKtsFile.exists()) {
                    BuildServerAdapter.getDigestStore().updateDigest(settingsKtsFile.toPath());
                }
            } catch (CoreException e) {
                JavaLanguageServerPlugin.logException("Failed to update digest for gradle build file", e);
            }
        });

        BspGradleBuildSupport bs = new BspGradleBuildSupport();


        if (!projects.isEmpty()) {
            Preferences preferences = getPreferences();
            if (preferences.isAutobuildEnabled()) {
                JavaLanguageServerPlugin.getInstance().getClientConnection().sendNotification("_java.buildServer.configAutoBuild", Collections.emptyList());
            }
        }

        for (IProject project : projects) {
            // separate the classpath update and project dependency update to avoid
            // having Java project 'xxx' does not exists.
            // TODO: consider to use a better way to handle this: i.e.
            // add java nature for all java projects first.
            bs.updateClassPath(project, false, monitor);
        }
        for (IProject project : projects) {
            bs.addProjectDependencies(project, monitor);
        }
    }

    private List<IProject> createProjectsIfNotExist(List<BuildTarget> buildTargets, IProgressMonitor monitor) throws CoreException {
        List<IProject> projects = new LinkedList<>();
        Map<String, List<BuildTarget>> buildTargetMap = BspUtils.mapBuildTargetsByUri(buildTargets);
        for (Entry<String, List<BuildTarget>> entrySet : buildTargetMap.entrySet()) {
            String baseDir = entrySet.getKey();
            if (baseDir == null) {
                JavaLanguageServerPlugin.logError("The base directory of the build target is null.");
                continue;
            }
            File projectDirectory;
            try {
                projectDirectory = new File(new URI(baseDir));
            } catch (URISyntaxException e) {
                JavaLanguageServerPlugin.logException(e);
                continue;
            }
            IProject[] allProjects = ProjectUtils.getAllProjects();
            Optional<IProject> projectOrNull = Arrays.stream(allProjects).filter(p -> {
                File loc = p.getLocation().toFile();
                return loc.equals(projectDirectory);
            }).findFirst();

            IProject project;
            if (projectOrNull.isPresent()) {
                project = projectOrNull.get();
            } else {
                String projectName = findFreeProjectName(projectDirectory.getName());
                IWorkspace workspace = ResourcesPlugin.getWorkspace();
                IProjectDescription projectDescription = workspace.newProjectDescription(projectName);
                projectDescription.setLocation(org.eclipse.core.runtime.Path.fromOSString(projectDirectory.getPath()));
                projectDescription.setNatureIds(new String[]{BspGradleProjectNature.NATURE_ID});
                ICommand buildSpec = projectDescription.newCommand();
                buildSpec.setBuilderName(BspBuilder.BUILDER_ID);
                projectDescription.setBuildSpec(new ICommand[]{buildSpec});

                project = workspace.getRoot().getProject(projectName);
                project.create(projectDescription, monitor);

                // open the project
                project.open(IResource.NONE, monitor);

            }

            if (project == null || !project.isAccessible()) {
                continue;
            }

            project.refreshLocal(IResource.DEPTH_INFINITE, monitor);
            projects.add(project);
            BuildServerTargetsManager.getInstance().setBuildTargets(project, entrySet.getValue());
        }
        return projects;
    }

    @Override
    public void reset() {
        // do nothing.
    }

    private BuildServerPreferences getBuildServerPreferences() {
        BuildServerPreferences data = new BuildServerPreferences();
        Preferences jdtlsPreferences = getPreferences();
        data.setGradleArguments(jdtlsPreferences.getGradleArguments());
        data.setGradleHome(jdtlsPreferences.getGradleHome());
        data.setGradleJavaHome(jdtlsPreferences.getGradleJavaHome());
        data.setGradleJvmArguments(jdtlsPreferences.getGradleJvmArguments());
        data.setGradleUserHome(jdtlsPreferences.getGradleUserHome());
        data.setGradleVersion(jdtlsPreferences.getGradleVersion());
        data.setGradleWrapperEnabled(jdtlsPreferences.isGradleWrapperEnabled());
        return data;
    }

    private String findFreeProjectName(String baseName) {
        IProject project = Arrays.stream(ProjectUtils.getAllProjects())
                .filter(p -> p.getName().equals(baseName)).findFirst().orElse(null);
        return project != null ? findFreeProjectName(baseName + "_") : baseName;
    }

    private void addJavaNature(IProject project, IProgressMonitor monitor) throws CoreException {
        SubMonitor progress = SubMonitor.convert(monitor, 1);
        // get the description
        IProjectDescription description = project.getDescription();

        // abort if the project already has the nature applied or the nature is not defined
        List<String> currentNatureIds = Arrays.asList(description.getNatureIds());
        if (currentNatureIds.contains(JavaCore.NATURE_ID)) {
            return;
        }

        // add the nature to the project
        List<String> newIds = new LinkedList<>();
        newIds.addAll(currentNatureIds);
        newIds.add(0, JavaCore.NATURE_ID);
        description.setNatureIds(newIds.toArray(new String[newIds.size()]));

        // save the updated description
        project.setDescription(description, IResource.AVOID_NATURE_CONFIG, progress.newChild(1));
    }
}

