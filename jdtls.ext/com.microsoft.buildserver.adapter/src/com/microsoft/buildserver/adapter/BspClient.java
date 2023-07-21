package com.microsoft.buildserver.adapter;

import java.util.Arrays;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

import org.eclipse.buildship.core.internal.util.gradle.GradleVersion;
import org.eclipse.jdt.ls.core.internal.EventNotification;
import org.eclipse.jdt.ls.core.internal.EventType;
import org.eclipse.jdt.ls.core.internal.JavaLanguageServerPlugin;
import org.eclipse.jdt.ls.core.internal.ProgressReport;
import org.eclipse.lsp4j.ExecuteCommandParams;

import ch.epfl.scala.bsp4j.BuildClient;
import ch.epfl.scala.bsp4j.DidChangeBuildTarget;
import ch.epfl.scala.bsp4j.LogMessageParams;
import ch.epfl.scala.bsp4j.PublishDiagnosticsParams;
import ch.epfl.scala.bsp4j.ShowMessageParams;
import ch.epfl.scala.bsp4j.TaskDataKind;
import ch.epfl.scala.bsp4j.TaskFinishParams;
import ch.epfl.scala.bsp4j.TaskProgressParams;
import ch.epfl.scala.bsp4j.TaskStartParams;

public class BspClient implements BuildClient {

	private ConcurrentHashMap<String, ProgressReport> taskMap = new ConcurrentHashMap<>();

	@Override
	public void onBuildShowMessage(ShowMessageParams params) {
		// TODO: BSP does not support additional data in ShowMessageParams,
		// as a workaround, we put [Error Code] as a suffix in the message.
		if (params.getMessage().endsWith("[-1]")) {
			String argString = params.getMessage().substring(0, params.getMessage().length() - 5);
			String[] args = argString.split(",");
			String projectUri = args[0];
			String highestJdk = args[1];
			GradleCompatibilityInfo info = new GradleCompatibilityInfo(
					projectUri,
					"Gradle version is not compatible with JDK version. Please update the Gradle wrapper.",
					highestJdk,
					GradleVersion.current().getVersion()
			);
			EventNotification notification = new EventNotification().withType(EventType.IncompatibleGradleJdkIssue).withData(info);
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendEventNotification(notification);
		}
	}

	@Override
	public void onBuildLogMessage(LogMessageParams params) {
	}

	@Override
	public void onBuildTaskStart(TaskStartParams params) {
		if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_TASK)) {
			ExecuteCommandParams clientCommand = new ExecuteCommandParams("_java.buildServer.gradle.buildStart", Arrays.asList(params.getMessage()));
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendNotification(clientCommand);
		} else {
			ProgressReport progressReport = new ProgressReport(params.getTaskId().getId());
			progressReport.setTask("Build Server Task");
			progressReport.setStatus(params.getMessage());
			progressReport.setComplete(false);
			taskMap.put(params.getTaskId().getId(), progressReport);
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendProgressReport(progressReport);
		}
	}

	@Override
	public void onBuildTaskProgress(TaskProgressParams params) {
		if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_TASK)) {
			ExecuteCommandParams clientCommand = new ExecuteCommandParams("_java.buildServer.gradle.buildProgress", Arrays.asList(params.getMessage()));
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendNotification(clientCommand);
		} else {
			ProgressReport progressReport = taskMap.get(params.getTaskId().getId());
			if (progressReport == null) {
				return;
			}
			progressReport.setStatus(params.getMessage());
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendProgressReport(progressReport);
		}
	}

	@Override
	public void onBuildTaskFinish(TaskFinishParams params) {
		if (Objects.equals(params.getDataKind(), TaskDataKind.COMPILE_REPORT)) {
			ExecuteCommandParams clientCommand = new ExecuteCommandParams("_java.buildServer.gradle.buildComplete", Arrays.asList(params.getMessage()));
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendNotification(clientCommand);
		} else {
			ProgressReport progressReport = taskMap.get(params.getTaskId().getId());
			if (progressReport == null) {
				return;
			}
			progressReport.setComplete(true);
			progressReport.setStatus(params.getMessage());
			JavaLanguageServerPlugin.getProjectsManager().getConnection().sendProgressReport(progressReport);
	
			taskMap.remove(params.getTaskId().getId());
		}
	}

	@Override
	public void onBuildPublishDiagnostics(PublishDiagnosticsParams params) {
	}

	@Override
	public void onBuildTargetDidChange(DidChangeBuildTarget params) {
	}

	private class GradleCompatibilityInfo {

		private String projectUri;
		private String message;
		private String highestJavaVersion;
		private String recommendedGradleVersion;

		public GradleCompatibilityInfo(String projectPath, String message, String highestJavaVersion, String recommendedGradleVersion) {
			this.projectUri = projectPath;
			this.message = message;
			this.highestJavaVersion = highestJavaVersion;
			this.recommendedGradleVersion = recommendedGradleVersion;
		}
	}
}
